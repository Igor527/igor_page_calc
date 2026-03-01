import { useCalcStore } from '@/lib/store';
import { isValidFormula, isValidBlockId } from '@/lib/security';
import { extractFormulaDependencies } from '@/lib/formula';
import { normalizeTableData } from '@/lib/tableData';
import DependencyGraph from './DependencyGraph';
import type { Block, TableLookupBlock, DataTableBlock } from '@/types/blocks';
import React, { useState, useRef, useEffect } from 'react';

// Закрытие автодополнения при клике вне
const useClickOutside = (ref: React.RefObject<HTMLElement>, handler: () => void) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, handler]);
};

interface PropertyEditorProps {
  selectedId: string | null;
  onSelect?: (id: string) => void;
}

// Замена ссылок на старый id в блоке при переименовании
function replaceBlockIdRefs<T extends Record<string, any>>(obj: T, oldId: string, newId: string): T {
  const next = { ...obj };
  if ('then_id' in next && next.then_id === oldId) next.then_id = newId;
  if ('else_id' in next && next.else_id === oldId) next.else_id = newId;
  if ('sourceId' in next && next.sourceId === oldId) next.sourceId = newId;
  if ('dataSource' in next && next.dataSource === oldId) next.dataSource = newId;
  if ('objectSource' in next && next.objectSource === oldId) next.objectSource = newId;
  if ('inputId' in next && next.inputId === oldId) next.inputId = newId;
  if ('dependencies' in next && Array.isArray(next.dependencies))
    next.dependencies = next.dependencies.map((id: string) => (id === oldId ? newId : id));
  if ('children' in next && Array.isArray(next.children))
    next.children = next.children.map((c: any) =>
      typeof c === 'object' && c && c.id === oldId ? { ...c, id: newId } : c
    );
  if ('formula' in next && typeof next.formula === 'string')
    next.formula = next.formula.replace(new RegExp('\\b' + oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), newId);
  return next;
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const values = useCalcStore((s) => s.values);
  const block = blocks.find((b) => b.id === selectedId) || null;

  // State для UI
  const [showDependencies, setShowDependencies] = useState<boolean>(false);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [autocompletePosition, setAutocompletePosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [selectedTableColumn, setSelectedTableColumn] = useState<string | null>(null);
  const [selectedTableRow, setSelectedTableRow] = useState<number | null>(null);
  const [idDraft, setIdDraft] = useState<string>('');
  const formulaInputRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (block) setIdDraft(block.id);
  }, [block?.id]);

  // Закрытие автодополнения при клике вне
  useClickOutside(autocompleteRef, () => setShowAutocomplete(false));

  function handleChange<K extends keyof Block>(key: K, value: any) {
    if (!block) return;
    const updated = blocks.map((b) => b.id === block.id ? { ...b, [key]: value } : b);
    setBlocks(updated);
  }

  function handleFormulaChange(value: string) {
    if (!block || block.type !== 'formula') return;
    const deps = extractFormulaDependencies(value, blocks, block.id);
    const updated = blocks.map((b) =>
      b.id === block.id ? { ...b, formula: value, dependencies: deps } : b
    );
    setBlocks(updated);
  }

  // Автодополнение для формул
  const getAvailableBlocks = () => {
    return blocks
      .filter(b => b.id !== selectedId && (b.type === 'input' || b.type === 'constant' || b.type === 'formula' || b.type === 'data_table'))
      .map(b => ({ id: b.id, label: b.label || b.id, type: b.type }));
  };

  const handleFormulaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '{' || e.key === '[') {
      setShowAutocomplete(true);
      if (formulaInputRef.current) {
        const rect = formulaInputRef.current.getBoundingClientRect();
        setAutocompletePosition({ top: rect.bottom + 4, left: rect.left });
      }
    }
  };

  function applyIdChange(newId: string) {
    if (!block) return;
    const trimmed = newId.trim();
    if (!trimmed || trimmed === block.id) {
      setIdDraft(block.id);
      return;
    }
    if (!isValidBlockId(trimmed)) {
      setIdDraft(block.id);
      return;
    }
    if (blocks.some((b) => b.id !== block.id && b.id === trimmed)) {
      setIdDraft(block.id);
      return;
    }
    const oldId = block.id;
    const updatedBlocks = blocks.map((b) =>
      b.id === oldId ? replaceBlockIdRefs({ ...b, id: trimmed }, oldId, trimmed) : replaceBlockIdRefs(b, oldId, trimmed)
    );
    setBlocks(updatedBlocks);
    const newValues = { ...values };
    if (oldId in newValues) {
      newValues[trimmed] = newValues[oldId];
      delete newValues[oldId];
    }
    setValues(newValues);
    setIdDraft(trimmed);
    onSelect?.(trimmed);
  }

  return (
    <aside style={{ padding: 12, borderLeft: '1px solid var(--pico-border-color)', minWidth: 220, background: 'var(--pico-card-background-color)', color: 'var(--pico-color)', height: '100%', overflowY: 'auto' }}>
      <h3 style={{ fontSize: 14, marginBottom: 8, color: 'var(--pico-color)', fontWeight: 600 }}>Свойства</h3>
      {!block && <div style={{ color: 'var(--pico-muted-color)', fontSize: 12 }}>Выберите блок</div>}
      {block && (
        <button
          type="button"
          onClick={() => setShowDependencies(!showDependencies)}
            style={{
              marginBottom: 8,
              padding: '3px 6px',
              fontSize: 11,
              background: showDependencies ? 'var(--pico-primary-background)' : 'var(--pico-card-background-color)',
              color: showDependencies ? 'var(--pico-primary-color)' : 'var(--pico-color)',
              border: '1px solid var(--pico-border-color)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
        >
          {showDependencies ? '▼' : '▶'} Зависимости
        </button>
      )}
      {block && showDependencies && (
        <div style={{ marginBottom: 12, borderTop: '1px solid var(--pico-border-color)', paddingTop: 8 }}>
          <DependencyGraph
            blocks={blocks}
            selectedId={selectedId}
            onSelect={onSelect || (() => {})}
          />
        </div>
      )}
      {block && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ marginBottom: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>ID</span>
            <input
              value={idDraft}
              onChange={e => setIdDraft(e.target.value)}
              onBlur={e => applyIdChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={{ fontSize: 12, padding: '4px 6px', height: 'auto', fontFamily: 'monospace' }}
              placeholder="уникальный id"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--pico-muted-color)', marginBottom: 4 }}>
            <span>{block.type}</span>
          </div>
          {block.type !== 'formula' && (
          <label style={{ marginBottom: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Заголовок</span>
            <input 
              value={block.label || ''} 
              onChange={e => handleChange('label', e.target.value)} 
              style={{ fontSize: 12, padding: '4px 6px', height: 'auto' }}
            />
          </label>
          )}

          {/* Для input */}
          {block.type === 'input' && (
            <>
              <label style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Тип ввода</span>
                <select 
                  value={block.inputType} 
                  onChange={e => handleChange('inputType', e.target.value)}
                  style={{ fontSize: 12, padding: '4px 6px', height: 'auto' }}
                >
                  <option value="number">number</option>
                  <option value="text">text</option>
                  <option value="select">select</option>
                </select>
              </label>
              <label style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Значение по умолчанию</span>
                <input
                  type="text"
                  value={block.defaultValue !== undefined && block.defaultValue !== null ? String(block.defaultValue) : ''}
                  onChange={e => {
                    const v = e.target.value;
                    const num = Number(v);
                    handleChange('defaultValue', block.inputType === 'number' && v !== '' && !Number.isNaN(num) ? num : v);
                  }}
                  style={{ fontSize: 12, padding: '4px 6px', height: 'auto' }}
                />
              </label>
              <label style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Фиксировать столбец</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!block.lockColumn}
                    onChange={e => handleChange('lockColumn', e.target.checked)}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <span style={{ fontSize: 16, color: block.lockColumn ? 'var(--pico-color-green-500)' : 'var(--pico-muted-color)' }}>
                    {block.lockColumn ? '🔒' : '🔓'}
                  </span>
                </div>
              </label>
              <label style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Фиксировать значение</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!block.lockValue}
                    onChange={e => handleChange('lockValue', e.target.checked)}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <span style={{ fontSize: 16, color: block.lockValue ? 'var(--pico-color-green-500)' : 'var(--pico-muted-color)' }}>
                    {block.lockValue ? '🔒' : '🔓'}
                  </span>
                </div>
              </label>
              {block.inputType === 'select' && (
                <label style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Опции (через запятую)</span>
                  <input 
                    value={Array.isArray(block.options) ? block.options.join(',') : ''} 
                    onChange={e => handleChange('options', e.target.value.split(','))} 
                    style={{ fontSize: 12, padding: '4px 6px', height: 'auto' }}
                  />
                </label>
              )}
            </>
          )}

          {/* Для select_from_table */}
          {block.type === 'select_from_table' && (
            <>
              <label style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Источник (таблица)</span>
                <select 
                  value={block.dataSource || ''} 
                  onChange={e => {
                    handleChange('dataSource', e.target.value);
                  }}
                  style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '100%' }}
                >
                  <option value="">— Выберите таблицу —</option>
                  {blocks.filter(b => b.type === 'data_table').map(tbl => (
                    <option key={tbl.id} value={tbl.id}>{tbl.label || tbl.id}</option>
                  ))}
                </select>
              </label>
              {block.dataSource && (
                <label style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Столбец</span>
                  <select 
                    value={block.column || ''} 
                    onChange={e => handleChange('column', e.target.value)}
                    style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '100%' }}
                  >
                    <option value="">— Выберите столбец —</option>
                    {(() => {
                      const table = blocks.find(b => b.id === block.dataSource && b.type === 'data_table');
                      const columns = table ? normalizeTableData(table as any).columns : [];
                      return columns.map((col: string) => (
                        <option key={col} value={col}>{col}</option>
                      ));
                    })()}
                  </select>
                </label>
              )}
              {block.dataSource && (
                <>
                  <label style={{ marginBottom: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Значение по умолчанию</span>
                    <input
                      type="text"
                      value={block.defaultValue !== undefined && block.defaultValue !== null ? String(block.defaultValue) : ''}
                      onChange={e => handleChange('defaultValue', e.target.value)}
                      style={{ fontSize: 12, padding: '4px 6px', height: 'auto' }}
                    />
                  </label>
                  <label style={{ marginBottom: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Диапазон (min/max)</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input 
                        type="number" 
                        placeholder="min" 
                        value={block.range?.min ?? ''} 
                        onChange={e => handleChange('range', { ...block.range, min: e.target.value ? Number(e.target.value) : undefined })} 
                        style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '50%' }} 
                      />
                      <input 
                        type="number" 
                        placeholder="max" 
                        value={block.range?.max ?? ''} 
                        onChange={e => handleChange('range', { ...block.range, max: e.target.value ? Number(e.target.value) : undefined })} 
                        style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '50%' }} 
                      />
                    </div>
                  </label>
                  <label style={{ marginBottom: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Фильтр (столбец:значение, через запятую)</span>
                    <input 
                      list={`select-filter-cols-${block.id}`}
                      value={block.filter ? Object.entries(block.filter).map(([k, v]) => `${k}:${v}`).join(',') : ''} 
                      onChange={e => {
                        const obj: Record<string, string|number> = {};
                        e.target.value.split(',').forEach(pair => {
                          const [k, v] = pair.split(':');
                          if (k && v !== undefined) obj[k.trim()] = isNaN(Number(v)) ? v.trim() : Number(v);
                        });
                        handleChange('filter', obj);
                      }} 
                      style={{ fontSize: 12, padding: '4px 6px', height: 'auto' }}
                    />
                  </label>
                </>
              )}
              <datalist id={`select-filter-cols-${block.id}`}>
                {(() => {
                  const table = blocks.find(b => b.id === block.dataSource && b.type === 'data_table');
                  const columns = table ? normalizeTableData(table as any).columns : [];
                  return columns.map((col: string) => (
                    <option key={col} value={col} />
                  ));
                })()}
              </datalist>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Опции из нескольких столбцов (через запятую)</span>
                <input 
                  list={`select-multiple-cols-${block.id}`}
                  value={Array.isArray(block.multipleColumns) ? block.multipleColumns.join(',') : ''} 
                  onChange={e => handleChange('multipleColumns', e.target.value.split(',').map(s => s.trim()))} 
                />
                <datalist id={`select-multiple-cols-${block.id}`}>
                  {(() => {
                    const table = blocks.find(b => b.id === block.dataSource && b.type === 'data_table');
                    const columns = table ? normalizeTableData(table as any).columns : [];
                    return columns.map((col: string) => (
                      <option key={col} value={col} />
                    ));
                  })()}
                </datalist>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Фильтр (столбец:значение, через запятую)</span>
                <input 
                  list={`select-filter-cols-${block.id}`}
                  value={block.filter ? Object.entries(block.filter).map(([k, v]) => `${k}:${v}`).join(',') : ''} 
                  onChange={e => {
                    const obj: Record<string, string|number> = {};
                    e.target.value.split(',').forEach(pair => {
                      const [k, v] = pair.split(':');
                      if (k && v !== undefined) obj[k.trim()] = isNaN(Number(v)) ? v.trim() : Number(v);
                    });
                    handleChange('filter', obj);
                  }} 
                />
                <datalist id={`select-filter-cols-${block.id}`}>
                  {(() => {
                    const table = blocks.find(b => b.id === block.dataSource && b.type === 'data_table');
                    const columns = table ? normalizeTableData(table as any).columns : [];
                    return columns.map((col: string) => (
                      <option key={col} value={col} />
                    ));
                  })()}
                </datalist>
              </label>
            </>
          )}

          {/* Для select_from_object */}
          {block.type === 'select_from_object' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Источник (object)</span>
                <select value={block.objectSource} onChange={e => handleChange('objectSource', e.target.value)}>
                  <option value="">—</option>
                  {blocks.filter(b => b.type === 'constant' || b.type === 'data_table').map(obj => (
                    <option key={obj.id} value={obj.id}>{obj.label || obj.id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Значение по умолчанию</span>
                <input
                  type="text"
                  value={block.defaultValue !== undefined && block.defaultValue !== null ? String(block.defaultValue) : ''}
                  onChange={e => handleChange('defaultValue', e.target.value)}
                />
              </label>
            </>
          )}

          {/* Для constant */}
          {block.type === 'constant' && (
            <label>
              <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Значение</span>
              <input
                type="text"
                value={block.value !== undefined && block.value !== null ? String(block.value) : ''}
                onChange={e => {
                  const v = e.target.value;
                  const num = Number(v);
                  handleChange('value', v !== '' && !Number.isNaN(num) ? num : v);
                }}
              />
            </label>
          )}

          {/* Для table_lookup */}
          {block.type === 'table_lookup' && (
            <>
              <label style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Источник (таблица)</span>
                <select 
                  value={block.dataSource || ''} 
                  onChange={e => {
                    handleChange('dataSource', e.target.value);
                    setSelectedTableColumn(null);
                    setSelectedTableRow(null);
                  }}
                  style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '100%' }}
                >
                  <option value="">— Выберите таблицу —</option>
                  {blocks.filter(b => b.type === 'data_table').map(tbl => (
                    <option key={tbl.id} value={tbl.id}>{tbl.label || tbl.id}</option>
                  ))}
                </select>
              </label>
              {block.dataSource && (() => {
                const table = blocks.find(b => b.id === block.dataSource && b.type === 'data_table') as DataTableBlock | undefined;
                const columns = table ? normalizeTableData(table).columns : [];
                const lookupBlock = block as TableLookupBlock;
                
                // Получаем значение ключа для подсветки строки
                let keyValue: string | number | null = null;
                if (lookupBlock.selected_key) {
                  if (values[lookupBlock.selected_key] !== undefined) {
                    keyValue = values[lookupBlock.selected_key] as string | number;
                  } else {
                    keyValue = lookupBlock.selected_key;
                  }
                }
                
                return (
                  <>
                    <div style={{ marginTop: 8, marginBottom: 6, fontSize: 10, color: 'var(--pico-muted-color)' }}>
                      💡 Таблица отображается внизу. Выберите столбцы:
                    </div>
                    
                    <label style={{ marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Ключевой столбец</span>
                      <select 
                        value={block.key_col || ''} 
                        onChange={e => {
                          handleChange('key_col', e.target.value);
                          setSelectedTableColumn(e.target.value);
                        }}
                        style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '100%' }}
                      >
                        <option value="">— Выберите столбец —</option>
                        {columns.map((col: string) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Целевой столбец</span>
                      <select 
                        value={block.target_col || ''} 
                        onChange={e => {
                          handleChange('target_col', e.target.value);
                          setSelectedTableColumn(e.target.value);
                        }}
                        style={{ fontSize: 12, padding: '4px 6px', height: 'auto', width: '100%' }}
                      >
                        <option value="">— Выберите столбец —</option>
                        {columns.map((col: string) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </label>
                    
                    <label style={{ marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Выбранный ключ</span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input 
                          list={`lookup-key-${block.id}`}
                          value={String(block.selected_key || '')} 
                          onChange={e => handleChange('selected_key', e.target.value)}
                          style={{ flex: 1, fontSize: 12, padding: '4px 6px', height: 'auto' }}
                          placeholder="Значение или ID блока"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const currentLock = lookupBlock.lockSelectedKey || false;
                            handleChange('lockSelectedKey', !currentLock);
                          }}
                          title={lookupBlock.lockSelectedKey ? 'Разблокировать' : 'Заблокировать'}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 3,
                            border: '1px solid var(--pico-border-color)',
                            background: lookupBlock.lockSelectedKey ? 'var(--pico-color-green-500)' : 'var(--pico-card-background-color)',
                            color: lookupBlock.lockSelectedKey ? '#fff' : 'var(--pico-color)',
                            cursor: 'pointer',
                            fontSize: 14,
                            lineHeight: 1,
                            minWidth: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {lookupBlock.lockSelectedKey ? '🔒' : '🔓'}
                        </button>
                      </div>
                      <datalist id={`lookup-key-${block.id}`}>
                        {/* Показываем значения из ключевого столбца выбранной таблицы */}
                        {table && block.key_col && (() => {
                          const normalized = normalizeTableData(table);
                          const keyValues = new Set<string>();
                          normalized.rows.forEach((row: any) => {
                            const val = row[block.key_col];
                            if (val !== undefined && val !== null) {
                              keyValues.add(String(val));
                            }
                          });
                          return Array.from(keyValues).map((val) => (
                            <option key={val} value={val} />
                          ));
                        })()}
                        {/* Также показываем id блоков для динамического выбора */}
                        {blocks.filter(b => b.id !== block.id).map(b => (
                          <option key={b.id} value={b.id} />
                        ))}
                      </datalist>
                      {lookupBlock.lockSelectedKey && (
                        <div style={{ fontSize: 11, color: 'var(--pico-color-green-500)', marginTop: 4 }}>
                          ✓ Значение заблокировано - пользователь не сможет изменить его после публикации
                        </div>
                      )}
                      {!lookupBlock.lockSelectedKey && (
                        <div style={{ fontSize: 11, color: 'var(--pico-muted-color)', marginTop: 4 }}>
                          Значение можно изменить после публикации
                        </div>
                      )}
              </label>
                  </>
                );
              })()}
            </>
          )}

          {/* Для condition */}
          {block.type === 'condition' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Условие (if)</span>
                <input value={block.if_exp} onChange={e => handleChange('if_exp', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>then_id</span>
                <select value={block.then_id} onChange={e => handleChange('then_id', e.target.value)}>
                  <option value="">—</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>else_id</span>
                <select value={block.else_id} onChange={e => handleChange('else_id', e.target.value)}>
                  <option value="">—</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                </select>
              </label>
            </>
          )}

          {/* Для group */}
          {block.type === 'group' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Заголовок группы</span>
                <input value={block.title} onChange={e => handleChange('title', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Дочерние блоки (id через запятую)</span>
                <input value={Array.isArray(block.children) ? block.children.map((b: any) => b.id || b).join(',') : ''} onChange={e => {
                  const ids = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean);
                  const children = ids.map(id => blocks.find(b => b.id === id)).filter(Boolean);
                  handleChange('children', children);
                }} />
              </label>
            </>
          )}

          {/* Для output */}
          {block.type === 'output' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Источник (id)</span>
                <select value={block.sourceId} onChange={e => handleChange('sourceId', e.target.value)}>
                  <option value="">—</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Формат</span>
                <input value={block.format || ''} onChange={e => handleChange('format', e.target.value)} />
              </label>
            </>
          )}

          {/* Для image */}
          {block.type === 'image' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>URL</span>
                <input value={block.url} onChange={e => handleChange('url', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Alt</span>
                <input value={block.alt || ''} onChange={e => handleChange('alt', e.target.value)} />
              </label>
            </>
          )}

          {/* Для button */}
          {block.type === 'button' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Действие</span>
                <input value={block.action} onChange={e => handleChange('action', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Текст кнопки</span>
                <input value={block.label} onChange={e => handleChange('label', e.target.value)} />
              </label>
            </>
          )}

          {/* Для formula */}
          {block.type === 'formula' && (
            <>
              <label style={{ position: 'relative', marginBottom: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginBottom: 2 }}>Формула (math.js)</span>
                <div style={{ position: 'relative' }}>
                  <textarea
                    ref={formulaInputRef}
                    value={block.formula || ''} 
                    onChange={e => {
                      const newFormula = e.target.value;
                      handleFormulaChange(newFormula);
                      
                      // Скрываем автодополнение при изменении
                      if (showAutocomplete) {
                        setShowAutocomplete(false);
                      }
                    }}
                    onKeyDown={handleFormulaKeyDown}
                    rows={3}
                    placeholder="Например: inputArea * constRate"
                    style={{
                      width: '100%',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      padding: '6px 8px',
                      borderRadius: 4,
                      border: `1px solid ${block.formula && !isValidFormula(block.formula).valid ? 'var(--pico-color-yellow-500)' : 'var(--pico-border-color)'}`,
                      background: 'var(--pico-form-element-background-color)',
                      color: 'var(--pico-color)',
                      resize: 'vertical',
                      lineHeight: 1.4,
                    }}
                  />
                  {showAutocomplete && (
                    <div
                      ref={autocompleteRef}
                      style={{
                        position: 'fixed',
                        top: autocompletePosition.top,
                        left: autocompletePosition.left,
                        background: 'var(--pico-card-background-color)',
                        border: '1px solid var(--pico-border-color)',
                        borderRadius: 4,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        maxHeight: 200,
                        overflowY: 'auto',
                        minWidth: 200,
                        color: 'var(--pico-color)',
                      }}
                    >
                      <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--pico-muted-color)', borderBottom: '1px solid var(--pico-border-color)' }}>
                        Доступные блоки (нажмите для вставки):
                      </div>
                      {getAvailableBlocks().map(b => (
                        <div
                          key={b.id}
                          onClick={() => {
                            if (formulaInputRef.current) {
                              const currentValue = block.formula || '';
                              const newValue = currentValue + b.id;
                              handleFormulaChange(newValue);
                              setShowAutocomplete(false);
                              formulaInputRef.current.focus();
                            }
                          }}
                          style={{
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontSize: 12,
                            borderBottom: '1px solid var(--pico-border-color)',
                            color: 'var(--pico-color)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--pico-card-background-color)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{b.label}</span>
                          <span style={{ color: 'var(--pico-muted-color)', marginLeft: 8, fontSize: 11 }}>({b.id})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {block.formula && !isValidFormula(block.formula).valid && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--pico-color-yellow-700)', background: 'var(--pico-background-warning)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-color-yellow-500)' }}>
                    ⚠️ {isValidFormula(block.formula).error}
                  </div>
                )}
                <div style={{ marginTop: 6, padding: '6px', background: 'var(--pico-code-background-color)', borderRadius: 3, fontSize: 10, color: 'var(--pico-muted-color)', border: '1px solid var(--pico-border-color)' }}>
                  Синтаксис: + - * / ^, функции sin, cos, sqrt, log, exp, abs, ceil, floor, round, константы pi, e. Используйте ID блоков. Нажмите {'`\u007B'} для автодополнения.
                </div>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Зависимости (авто)</span>
                <input value={Array.isArray(block.dependencies) ? block.dependencies.join(',') : ''} disabled style={{ background: 'var(--pico-card-background-color)', color: 'var(--pico-muted-color)' }} />
              </label>
            </>
          )}

          {/* Для text */}
          {block.type === 'text' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Текст</span>
                <textarea value={block.content} onChange={e => handleChange('content', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Стиль</span>
                <select value={block.style || 'p'} onChange={e => handleChange('style', e.target.value)}>
                  <option value="h1">h1</option>
                  <option value="p">p</option>
                </select>
              </label>
            </>
          )}

          {/* Для data_table */}
          {block.type === 'data_table' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Имя таблицы</span>
                <input value={block.name} onChange={e => handleChange('name', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>
                  Строки (JSON)
                  {(() => {
                    const normalized = normalizeTableData(block as any);
                    const matrixRows = normalized.columns.length
                      ? [normalized.columns, ...normalized.rows.map(row => normalized.columns.map(col => row[col] ?? ''))]
                      : [];
                    const rowCount = matrixRows.length > 0 ? Math.max(0, matrixRows.length - 1) : 0;
                    return rowCount > 0 ? (
                      <span style={{ marginLeft: 8, color: rowCount > 500 ? '#c00' : '#666' }}>
                        ({rowCount} строк{rowCount > 500 ? ' — превышен лимит!' : ''})
                      </span>
                    ) : null;
                  })()}
                </span>
                {(() => {
                  const normalized = normalizeTableData(block as any);
                  const matrixRows = normalized.columns.length
                    ? [normalized.columns, ...normalized.rows.map(row => normalized.columns.map(col => row[col] ?? ''))]
                    : [];
                  const rowCount = matrixRows.length > 0 ? Math.max(0, matrixRows.length - 1) : 0;
                  return (
                    <>
                      {rowCount > 500 && (
                        <div style={{ marginBottom: 4, padding: '6px 8px', background: 'var(--pico-background-warning)', border: '1px solid var(--pico-color-yellow-500)', borderRadius: 4, fontSize: 12, color: 'var(--pico-color-yellow-700)' }}>
                          ⚠️ Таблица содержит {rowCount} строк. Максимально допустимо 500 строк.
                          <br />
                          Для работы с большими таблицами обратитесь к разработчику.
                        </div>
                      )}
                      <textarea
                        value={JSON.stringify(matrixRows, null, 2)}
                        onChange={e => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            if (!Array.isArray(parsed)) return;
                            let matrix = parsed as Array<any>;
                            const isMatrix = matrix.length > 0 && matrix.every(row => Array.isArray(row));
                            if (!isMatrix && matrix.length > 0 && typeof matrix[0] === 'object') {
                              const cols = Object.keys(matrix[0] || {});
                              matrix = cols.length ? [cols, ...matrix.map((row) => cols.map((col) => row[col] ?? ''))] : [];
                            }
                            const rowCount = matrix.length > 0 ? Math.max(0, matrix.length - 1) : 0;
                            if (rowCount > 500) {
                              alert('Таблица ограничена 500 строками. Текущее количество: ' + rowCount + '. Будут сохранены только первые 500 строк.');
                              const sliced = matrix.slice(0, 501);
                              handleChange('rows', sliced);
                              return;
                            }
                            handleChange('rows', matrix);
                        } catch {}
                        }}
                        style={{
                          borderColor: rowCount > 500 ? 'var(--pico-color-yellow-500)' : undefined
                        }}
                      />
                      <div style={{ fontSize: 11, color: 'var(--pico-muted-color)' }}>
                        Формат: первая строка — заголовки, далее строки значений
                      </div>
                    </>
                  );
                })()}
              </label>
            </>
          )}

          {/* Для chart */}
          {block.type === 'chart' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Тип графика</span>
                <input value={block.chartType} onChange={e => handleChange('chartType', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Источник данных (id)</span>
                <input value={block.dataSource} onChange={e => handleChange('dataSource', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>X-ось (столбец)</span>
                <input value={block.xKey} onChange={e => handleChange('xKey', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Y-ось (столбец)</span>
                <input value={block.yKey} onChange={e => handleChange('yKey', e.target.value)} />
              </label>
            </>
          )}

          {/* Для table_range */}
          {block.type === 'table_range' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Источник таблицы</span>
                <select value={block.dataSource} onChange={e => handleChange('dataSource', e.target.value)}>
                  <option value="">Выберите таблицу...</option>
                  {blocks.filter(b => b.type === 'data_table').map(tbl => (
                    <option key={tbl.id} value={tbl.id}>{tbl.label || tbl.id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>ID блока для сравнения</span>
                <select value={block.inputId} onChange={e => handleChange('inputId', e.target.value)}>
                  <option value="">Выберите блок...</option>
                  {blocks.filter(b => b.id !== block.id).map(b => (
                    <option key={b.id} value={b.id}>{b.label || b.id}</option>
                  ))}
                </select>
              </label>
              {block.dataSource && (() => {
                const table = blocks.find(b => b.id === block.dataSource && b.type === 'data_table');
                const columns = table ? normalizeTableData(table as any).columns : [];
                return (
                  <>
                    <label>
                      <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Столбец Min (опционально)</span>
                      <select value={block.minColumn || ''} onChange={e => handleChange('minColumn', e.target.value)}>
                        <option value="">—</option>
                        {columns.map((col: string) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Столбец Max</span>
                      <select value={block.maxColumn} onChange={e => handleChange('maxColumn', e.target.value)}>
                        <option value="">—</option>
                        {columns.map((col: string) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Столбец результата</span>
                      <select value={block.valueColumn} onChange={e => handleChange('valueColumn', e.target.value)}>
                        <option value="">—</option>
                        {columns.map((col: string) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </label>
                  </>
                );
              })()}
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Значение по умолчанию</span>
                <input
                  type="text"
                  value={block.fallbackValue !== undefined && block.fallbackValue !== null ? String(block.fallbackValue) : ''}
                  onChange={e => {
                    const v = e.target.value;
                    const num = Number(v);
                    handleChange('fallbackValue', v === '' ? undefined : !Number.isNaN(num) ? num : v);
                  }}
                />
              </label>
            </>
          )}

          {/* Для table_viewer */}
          {block.type === 'table_viewer' && (
            <>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Источник таблицы</span>
                <select value={block.dataSource} onChange={e => handleChange('dataSource', e.target.value)}>
                  <option value="">Выберите таблицу...</option>
                  {blocks.filter(b => b.type === 'data_table').map(tbl => (
                    <option key={tbl.id} value={tbl.id}>{tbl.label || tbl.id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Выбранный столбец</span>
                <input value={block.selectedColumn || ''} onChange={e => handleChange('selectedColumn', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Выбранная строка (индекс)</span>
                <input type="number" value={block.selectedRow || ''} onChange={e => handleChange('selectedRow', e.target.value ? Number(e.target.value) : undefined)} />
              </label>
              <label>
                <span style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Тип вывода</span>
                <select value={block.outputType || 'cell'} onChange={e => handleChange('outputType', e.target.value)}>
                  <option value="column">Столбец</option>
                  <option value="row">Строка</option>
                  <option value="cell">Ячейка</option>
                </select>
              </label>
            </>
          )}
        </form>
      )}
    </aside>
  );
};

export default PropertyEditor;
