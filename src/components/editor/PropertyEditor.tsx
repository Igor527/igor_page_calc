import { useCalcStore } from '@/lib/store';
import { isValidFormula, isValidBlockId } from '@/lib/security';
import { extractFormulaDependencies } from '@/lib/formula';
import { normalizeTableData } from '@/lib/tableData';
import DependencyGraph from './DependencyGraph';
import type { Block, TableLookupBlock, DataTableBlock, BlockType } from '@/types/blocks';
import React, { useState, useRef, useEffect } from 'react';

// === UI COMPONENTS ===

const PropertyCard: React.FC<{ title: string; icon?: string; children: React.ReactNode; isOpen?: boolean }> = ({ title, icon, children, isOpen = true }) => {
  const [open, setOpen] = useState(isOpen);
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-[var(--pico-border-color)] bg-[var(--pico-card-background-color)] shadow-sm">
      <div 
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer bg-[var(--pico-form-element-background-color)] border-b border-[var(--pico-border-color)]"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="opacity-80">{icon}</span>}
          <span className="text-xs font-bold uppercase tracking-wide opacity-70">{title}</span>
        </div>
        <span className="text-[10px] opacity-40">{open ? '▼' : '▶'}</span>
      </div>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
};

const GroupLabel: React.FC<{ label: string; sub?: string }> = ({ label, sub }) => (
  <div className="mb-1.5">
    <span className="block text-[11px] font-semibold text-[var(--pico-muted-color)]">{label}</span>
    {sub && <span className="block text-[10px] opacity-50 leading-tight">{sub}</span>}
  </div>
);

const InputField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <input {...props} ref={ref} className={`w-full p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)] transition-all focus:border-[var(--pico-primary)] outline-none ${props.className || ''}`} />
));

const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} className="w-full p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)] transition-all focus:border-[var(--pico-primary)] outline-none" />
);

// === UTILS ===

const useClickOutside = (ref: React.RefObject<HTMLElement>, handler: () => void) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) handler();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
};

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

const blockTypeIcons: Record<string, string> = {
  input: '🔵', formula: '🟣', constant: '🟠', data_table: '📅', chart: '📈', condition: '🔀', output: '🟢', text: '📄', image: '🖼️', button: '🖱️', select_from_table: '🔘'
};

// === MAIN COMPONENT ===

interface PropertyEditorProps {
  selectedId: string | null;
  onSelect?: (id: string) => void;
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const values = useCalcStore((s) => s.values);
  const block = blocks.find((b) => b.id === selectedId) || null;

  const [showDependencies, setShowDependencies] = useState<boolean>(false);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [autocompletePosition, setAutocompletePosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [idDraft, setIdDraft] = useState<string>('');
  const formulaInputRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (block) setIdDraft(block.id);
  }, [block?.id]);

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
    if (!trimmed || trimmed === block.id || !isValidBlockId(trimmed)) {
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

  if (!block) {
    return (
      <aside className="p-8 border-l border-[var(--pico-border-color)] bg-[var(--pico-card-background-color)] h-full w-full max-w-[420px] flex flex-col items-center justify-center opacity-30 text-center grayscale">
        <div className="text-6xl mb-4">⚙️</div>
        <p className="text-sm font-medium">Выберите блок в списке слева,<br/>чтобы настроить его свойства</p>
      </aside>
    );
  }

  return (
    <aside className="p-4 border-l border-[var(--pico-border-color)] bg-[var(--pico-card-background-color)] h-full overflow-y-auto w-full max-w-[420px] custom-scrollbar">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-[var(--pico-border-color)]">
        <h3 className="text-[15px] font-bold flex items-center gap-2">
          {blockTypeIcons[block.type] || '📦'} Блок
        </h3>
        <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full bg-[var(--pico-primary-background)] text-[var(--pico-primary-color)]">
          {block.type.toUpperCase()}
        </span>
      </div>

      <div className="space-y-2">
        {/* SECTION: IDENTIFICATION */}
        <PropertyCard title="Идентификация" icon="🆔">
          <div>
            <GroupLabel label="Уникальный ID" sub="Только латиница, цифры и _" />
            <input
              value={idDraft}
              onChange={e => setIdDraft(e.target.value)}
              onBlur={e => applyIdChange(e.target.value)}
              className="w-full p-2 text-xs font-mono rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)] focus:border-blue-500 outline-none"
            />
          </div>
          {block.type !== 'formula' && block.type !== 'constant' && (
            <div>
              <GroupLabel label="Заголовок" sub="Название блока для пользователя" />
              <input 
                value={block.label || ''} 
                onChange={e => handleChange('label', e.target.value)} 
                className="w-full p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)]"
              />
            </div>
          )}
        </PropertyCard>

        {/* SECTION: CONFIGURATION */}
        {block.type === 'input' && (
          <PropertyCard title="Параметры ввода" icon="🔘">
            <div>
              <GroupLabel label="Тип поля" />
              <SelectField value={block.inputType} onChange={e => handleChange('inputType', e.target.value)}>
                <option value="number">Числовой ввод</option>
                <option value="text">Текстовое поле</option>
                <option value="select">Выбор из списка</option>
              </SelectField>
            </div>
            <div>
              <GroupLabel label="Значение по умолчанию" />
              <input
                type="text"
                value={block.defaultValue ?? ''}
                onChange={e => handleChange('defaultValue', block.inputType === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
                className="w-full p-2 text-xs font-mono rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)]"
              />
            </div>
            {block.inputType === 'select' && (
              <div>
                <GroupLabel label="Варианты выбора" sub="Через запятую" />
                <textarea 
                  value={Array.isArray(block.options) ? block.options.join(', ') : ''} 
                  onChange={e => handleChange('options', e.target.value.split(',').map(s => s.trim()))} 
                  className="w-full p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)]"
                  rows={2}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-blue-500 bg-opacity-5 border border-blue-500 border-opacity-20 mt-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={!!block.lockColumn} onChange={e => handleChange('lockColumn', e.target.checked)} className="w-auto m-0" />
                <span className="text-[10px] font-bold group-hover:text-blue-500 transition-colors">Фикс колонки {block.lockColumn ? '🔒' : '🔓'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={!!block.lockValue} onChange={e => handleChange('lockValue', e.target.checked)} className="w-auto m-0" />
                <span className="text-[10px] font-bold group-hover:text-blue-500 transition-colors">Фикс знач {block.lockValue ? '🔒' : '🔓'}</span>
              </label>
            </div>
          </PropertyCard>
        )}

        {block.type === 'formula' && (
          <PropertyCard title="Логика вычислений" icon="🧮">
            <div className="relative">
              <GroupLabel label="Формула" sub="Используйте ID других блоков" />
              <textarea
                ref={formulaInputRef}
                value={block.formula || ''} 
                onChange={e => handleFormulaChange(e.target.value)}
                onKeyDown={handleFormulaKeyDown}
                rows={4}
                className={`w-full p-2 text-[14px] font-mono leading-tight rounded border transition-all ${block.formula && !isValidFormula(block.formula).valid ? 'border-red-500 bg-red-500/5 shadow-inner shadow-red-500/10' : 'border-[var(--pico-border-color)] bg-gray-900 bg-opacity-5'}`}
                placeholder="Пример: base_val * multiplier"
              />
              {showAutocomplete && (
                <div ref={autocompleteRef} className="fixed shadow-2xl rounded-xl border border-[var(--pico-border-color)] bg-[var(--pico-card-background-color)] z-[2000] min-w-[260px] max-h-[250px] overflow-y-auto animate-in fade-in zoom-in duration-150"
                     style={{ top: autocompletePosition.top, left: autocompletePosition.left }}>
                  <div className="p-2 text-[9px] uppercase font-bold border-b border-[var(--pico-border-color)] opacity-40 tracking-tighter">Вставить переменную</div>
                  {blocks.filter(b => b.id !== selectedId && ['input', 'constant', 'formula', 'output'].includes(b.type)).map(b => (
                    <div key={b.id} onClick={() => { handleFormulaChange((block.formula || '') + b.id); setShowAutocomplete(false); }}
                      className="px-3 py-2 text-xs cursor-pointer hover:bg-blue-500 hover:text-white flex justify-between items-center group"
                    >
                      <span className="font-medium">{b.label || b.id}</span>
                      <code className="text-[10px] opacity-50 group-hover:text-white group-hover:opacity-80">@{b.id}</code>
                    </div>
                  ))}
                </div>
              )}
              {block.formula && !isValidFormula(block.formula).valid && (
                <div className="mt-2 text-[10px] p-2 rounded bg-red-500 bg-opacity-10 text-red-600 dark:text-red-400 font-medium">
                  Ошибка: {isValidFormula(block.formula).error}
                </div>
              )}
            </div>
            <div className="p-2 rounded bg-[var(--pico-form-element-background-color)] opacity-60 text-[10px] space-y-1">
              <p>• Нажмите <b>{'{'}</b> для вставки переменных</p>
              <p>• Поддержка: <b>sqrt()</b>, <b>abs()</b>, <b> round()</b>, <b>min()</b>, <b>max()</b></p>
            </div>
          </PropertyCard>
        )}

        {block.type === 'data_table' && (
          <PropertyCard title="Данные таблицы" icon="📊">
            <div>
              <GroupLabel label="Название JSON" />
              <input value={(block as any).name} onChange={e => handleChange('name', e.target.value)} className="w-full p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)]" />
            </div>
            <div>
              <GroupLabel label="Матрица строк" sub="Первая строка — заголовки" />
              {(() => {
                const norm = normalizeTableData(block as any);
                const tableData = [norm.columns, ...norm.rows.map(r => norm.columns.map(c => r[c] ?? ''))];
                return (
                  <textarea
                    value={JSON.stringify(tableData, null, 2)}
                    onChange={e => { try { const p = JSON.parse(e.target.value); if (Array.isArray(p)) handleChange('rows', p.slice(0, 501)); } catch {} }}
                    rows={10}
                    className="w-full p-2 text-[10px] font-mono rounded bg-gray-900 bg-opacity-5 dark:bg-black dark:bg-opacity-20 border border-[var(--pico-border-color)]"
                  />
                );
              })()}
            </div>
          </PropertyCard>
        )}

        {block.type === 'select_from_table' && (
          <PropertyCard title="Выбор из таблицы" icon="🔘">
             <div>
               <GroupLabel label="Справочник" />
               <SelectField value={(block as any).dataSource || ''} onChange={e => handleChange('dataSource', e.target.value)}>
                 <option value="">— Выберите таблицу —</option>
                 {blocks.filter(t => t.type === 'data_table').map(t => <option key={t.id} value={t.id}>{t.label || t.id}</option>)}
               </SelectField>
             </div>
             {(block as any).dataSource && (
               <div className="space-y-3">
                 <div>
                   <GroupLabel label="Столбец со значениями" />
                   <SelectField value={(block as any).column || ''} onChange={e => handleChange('column', e.target.value)}>
                     <option value="">— Выберите столбец —</option>
                     {normalizeTableData(blocks.find(t => t.id === (block as any).dataSource) as any).columns.map(c => <option key={c} value={c}>{c}</option>)}
                   </SelectField>
                 </div>
                 <div>
                   <GroupLabel label="Фильтр записей" sub="формат столбец:значение" />
                   <input 
                      value={(block as any).filter ? Object.entries((block as any).filter).map(([k,v]) => `${k}:${v}`).join(', ') : ''}
                      onChange={e => {
                        const obj: any = {};
                        e.target.value.split(',').forEach(p => { 
                          const [k, v] = p.split(':'); 
                          if (k && v) obj[k.trim()] = isNaN(Number(v)) ? v.trim() : Number(v);
                        });
                        handleChange('filter', obj);
                      }}
                      className="w-full p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)]"
                   />
                 </div>
               </div>
             )}
          </PropertyCard>
        )}

        {/* SECTION: VISUALIZATION */}
        <PropertyCard title="Зависимости" icon="🔗" isOpen={false}>
          <button
            onClick={() => setShowDependencies(!showDependencies)}
            className="w-full p-2 text-[10px] font-bold tracking-wide uppercase rounded bg-gray-500 bg-opacity-10 hover:bg-opacity-20 border border-[var(--pico-border-color)] transition-all"
          >
            {showDependencies ? 'Скрыть визуализатор' : 'Показать дерево связей'}
          </button>
          {showDependencies && (
            <div className="pt-3 h-[200px] border-t border-[var(--pico-border-color)] mt-3">
              <DependencyGraph blocks={blocks} selectedId={selectedId} onSelect={onSelect || (() => {})} />
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-[var(--pico-border-color)]">
            <GroupLabel label="Входящие зависимости" />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(block as any).dependencies?.length > 0 ? (block as any).dependencies.map((d: string) => (
                <span key={d} className="px-2 py-0.5 rounded-full bg-blue-500 bg-opacity-10 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-500 border-opacity-20">
                  {d}
                </span>
              )) : <span className="text-[10px] italic opacity-40">Нет зависимостей</span>}
            </div>
          </div>
        </PropertyCard>
      </div>

      <div className="mt-10 py-6 border-t border-[var(--pico-border-color)] text-[10px] text-center opacity-30 font-mono tracking-widest">
        CALCULATOR ENGINE v4.2 • INSPECTOR READY
      </div>
    </aside>
  );
};

export default PropertyEditor;
