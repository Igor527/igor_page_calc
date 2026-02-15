
import { useCalcStore } from '@/lib/store';
import type { Block, BlockType } from '@/types/blocks';
import React, { useState, useMemo, ChangeEvent, MouseEvent } from 'react';

interface BlueprintPanelProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const blockTypeLabels: Record<BlockType, string> = {
  input: 'Ввод',
  formula: 'Формула',
  text: 'Текст',
  constant: 'Константа',
  table_lookup: 'Поиск в таблице',
  data_table: 'Таблица',
  chart: 'График',
  select_from_table: 'Выбор из таблицы',
  select_from_object: 'Выбор из объекта',
  condition: 'Условие',
  group: 'Группа',
  output: 'Вывод',
  image: 'Изображение',
  button: 'Кнопка',
};

const defaultBlockTemplates: Record<BlockType, Partial<Block>> = {
  input: { type: 'input', label: 'Новый ввод', inputType: 'number', id: '' },
  formula: { type: 'formula', label: 'Формула', formula: '', dependencies: [], id: '' },
  text: { type: 'text', content: '', style: 'p', id: '' },
  constant: { type: 'constant', value: 0, id: '' },
  table_lookup: { type: 'table_lookup', data: [], key_col: '', target_col: '', selected_key: '', id: '' },
  data_table: { type: 'data_table', name: '', columns: [], rows: [], id: '' },
  chart: { type: 'chart', chartType: 'line', dataSource: '', xKey: '', yKey: '', id: '' },
  select_from_table: { type: 'select_from_table', label: '', dataSource: '', column: '', id: '' },
  select_from_object: { type: 'select_from_object', label: '', objectSource: '', id: '' },
  condition: { type: 'condition', if_exp: '', then_id: '', else_id: '', id: '' },
  group: { type: 'group', title: 'Группа', children: [], id: '' },
  output: { type: 'output', sourceId: '', id: '' },
  image: { type: 'image', url: '', id: '' },
  button: { type: 'button', action: 'calculate', label: 'Кнопка', id: '' },
};


const BlueprintPanel: React.FC<BlueprintPanelProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s: any) => s.blocks);
  const setBlocks = useCalcStore((s: any) => s.setBlocks);
  const [search, setSearch] = useState<string>('');
  const [addType, setAddType] = useState<BlockType>('input');

  // Группировка по типу
  const grouped = useMemo<Record<BlockType, Block[]>>(() => {
    const filtered = search
      ? blocks.filter((b: Block) => (b.label || b.id).toLowerCase().includes(search.toLowerCase()))
      : blocks;
    const byType: Record<BlockType, Block[]> = {
      input: [], formula: [], text: [], constant: [], table_lookup: [], data_table: [], chart: [], select_from_table: [], select_from_object: [], condition: [], group: [], output: [], image: [], button: [],
    };
    filtered.forEach((b: Block) => { byType[b.type].push(b); });
    return byType;
  }, [blocks, search]);

  // Добавление блока
  function handleAdd() {
    const id = (addType + '_' + Math.random().toString(36).slice(2, 8)).toLowerCase();
    const template = { ...defaultBlockTemplates[addType], id } as Block;
    setBlocks([...blocks, template]);
    onSelect(id);
  }

  // Удаление блока
  function handleRemove(id: string) {
    if (!window.confirm('Удалить блок?')) return;
    setBlocks(blocks.filter((b: Block) => b.id !== id));
    if (selectedId === id) onSelect(null);
  }

  // Вставка JSON-блоков через textarea
  const [jsonInput, setJsonInput] = useState<string>('');
  const [showPaste, setShowPaste] = useState<boolean>(false);
  const [conflictMode, setConflictMode] = useState<'ask'|'replace'|'rename'>('ask');
  const [conflicts, setConflicts] = useState<string[]>([]);

  function handlePasteBlocks() {
    let parsed: Block[] = [];
    try {
      parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) parsed = [parsed];
    } catch {
      alert('Некорректный JSON');
      return;
    }
    // Проверка конфликтов id
    const existingIds = new Set(blocks.map((b: Block) => b.id));
    const pastedIds = new Set(parsed.map((b: Block) => b.id));
    const intersect = [...pastedIds].filter(id => existingIds.has(id));
    setConflicts(intersect);
    if (intersect.length > 0 && conflictMode === 'ask') {
      // Показать выбор пользователю
      return;
    }
    let toAdd = parsed;
    if (intersect.length > 0) {
      if (conflictMode === 'replace') {
        // Перезаписать существующие
        toAdd = [
          ...blocks.filter((b: Block) => !intersect.includes(b.id)),
          ...parsed
        ];
      } else if (conflictMode === 'rename') {
        // Сгенерировать новые id для конфликтующих и их зависимостей
        const idMap: Record<string, string> = {};
        parsed.forEach((b: Block) => {
          if (intersect.includes(b.id)) {
            const newId = b.id + '_' + Math.random().toString(36).slice(2, 6);
            idMap[b.id] = newId;
            b.id = newId;
          }
        });
        // Обновить зависимости внутри вставляемых блоков
        parsed.forEach((b: Block) => {
          for (const key in b) {
            if (typeof (b as any)[key] === 'string' && idMap[(b as any)[key]]) (b as any)[key] = idMap[(b as any)[key]];
            if (Array.isArray((b as any)[key])) (b as any)[key] = (b as any)[key].map((v: any) => idMap[v] || v);
          }
        });
        toAdd = [...blocks, ...parsed];
      }
    } else {
      toAdd = [...blocks, ...parsed];
    }
    setBlocks(toAdd);
    setShowPaste(false);
    setJsonInput('');
    setConflicts([]);
  }

  return (
    <section style={{ padding: 16 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Блоки калькулятора</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <select value={addType} onChange={e => setAddType(e.target.value as BlockType)} style={{ padding: 4, borderRadius: 4 }}>
          {Object.entries(blockTypeLabels).map(([type, label]) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>
        <button type="button" onClick={handleAdd} style={{ padding: '4px 10px', borderRadius: 4, background: '#222', color: '#fff', border: 'none' }}>+</button>
        <button type="button" onClick={() => setShowPaste(v => !v)} style={{ padding: '4px 10px', borderRadius: 4, background: '#0a6', color: '#fff', border: 'none' }}>Вставить JSON</button>
      </div>
      {showPaste && (
        <div style={{ marginBottom: 12, background: '#f6f6f6', padding: 10, borderRadius: 6 }}>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder="Вставьте JSON блоков..."
            rows={5}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, marginBottom: 6 }}
          />
          {conflicts.length > 0 && conflictMode === 'ask' && (
            <div style={{ color: '#c00', marginBottom: 6 }}>
              Конфликт id: {conflicts.join(', ')}<br />
              <button type="button" onClick={() => { setConflictMode('replace'); handlePasteBlocks(); }}>Перезаписать</button>
              <button type="button" onClick={() => { setConflictMode('rename'); handlePasteBlocks(); }} style={{ marginLeft: 8 }}>Переименовать</button>
              <button type="button" onClick={() => { setShowPaste(false); setConflicts([]); setConflictMode('ask'); setJsonInput(''); }} style={{ marginLeft: 8 }}>Отмена</button>
            </div>
          )}
          {(!conflicts.length || conflictMode !== 'ask') && (
            <button type="button" onClick={handlePasteBlocks} style={{ background: '#222', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}>Вставить</button>
          )}
        </div>
      )}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {Object.entries(grouped).map(([type, arr]) => arr.length > 0 && (
          <div key={type} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, color: '#888', fontSize: 13, margin: '8px 0 4px' }}>{blockTypeLabels[type as BlockType]}</div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {arr.map(b => (
                <li
                  key={b.id}
                  style={{
                    cursor: 'pointer',
                    fontWeight: selectedId === b.id ? 'bold' : undefined,
                    background: selectedId === b.id ? '#222' : undefined,
                    color: selectedId === b.id ? '#fff' : undefined,
                    borderRadius: 6,
                    padding: '4px 8px',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => onSelect(b.id)}
                >
                  <span>{b.label || b.id} <span style={{ color: '#aaa' }}>({b.type})</span></span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleRemove(b.id); }}
                    style={{ marginLeft: 8, background: 'none', border: 'none', color: '#f44', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}
                    title="Удалить"
                  >×</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BlueprintPanel;
