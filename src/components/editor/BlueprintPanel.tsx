
import { useCalcStore } from '@/lib/store';
import { validateImportedBlocks } from '@/lib/validation';
import { saveCalculator, generateCalculatorId, getPublicUrl } from '@/lib/calculatorStorage';
import ValidationErrors from './ValidationErrors';
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
  const values = useCalcStore((s: any) => s.values);
  const [search, setSearch] = useState<string>('');
  const [addType, setAddType] = useState<BlockType>('input');
  const [savedCalcId, setSavedCalcId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  const [calcTitle, setCalcTitle] = useState<string>('Мой калькулятор');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
    // Валидация импортируемых блоков
    const validation = validateImportedBlocks(jsonInput);
    if (!validation.valid) {
      alert(`Ошибка валидации: ${validation.error}`);
      return;
    }
    
    const parsed = validation.blocks!;
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
      <ValidationErrors blocks={blocks} />
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
        <label style={{ padding: '4px 10px', borderRadius: 4, background: '#06a', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-block' }}>
          Импорт
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (event) => {
                const text = event.target?.result as string;
                if (text) {
                  setJsonInput(text);
                  setShowPaste(true);
                }
              };
              reader.readAsText(file);
              // Сброс input для возможности повторной загрузки того же файла
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" onClick={() => {
          const json = JSON.stringify(blocks, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'calculator-schema.json';
          a.click();
          URL.revokeObjectURL(url);
        }} style={{ padding: '4px 10px', borderRadius: 4, background: '#06a', color: '#fff', border: 'none' }}>Экспорт</button>
        <button type="button" onClick={() => setShowSaveDialog(true)} style={{ padding: '4px 10px', borderRadius: 4, background: '#0a6', color: '#fff', border: 'none' }}>Сохранить</button>
        {savedCalcId && (
          <button type="button" onClick={() => {
            const url = getPublicUrl(savedCalcId);
            window.open(url, '_blank');
          }} style={{ padding: '4px 10px', borderRadius: 4, background: '#880', color: '#fff', border: 'none' }}>Просмотр</button>
        )}
      </div>
      {showSaveDialog && (
        <div style={{ marginBottom: 12, background: '#f6f6f6', padding: 10, borderRadius: 6 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Название калькулятора:</label>
            <input
              type="text"
              value={calcTitle}
              onChange={(e) => setCalcTitle(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
              placeholder="Название калькулятора"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                const id = savedCalcId || generateCalculatorId();
                const result = saveCalculator(id, calcTitle, blocks, values, 'draft');
                if (result.success) {
                  setSavedCalcId(id);
                  setShowSaveDialog(false);
                  const url = getPublicUrl(id);
                  alert(`Калькулятор сохранён как черновик!\nПубличная ссылка: ${url}\n\nИспользуйте кнопку "Отправить на ревью" для публикации.`);
                } else {
                  alert(`Ошибка сохранения: ${result.error}`);
                }
              }}
              style={{ background: '#0a6', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}
            >
              Сохранить как черновик
            </button>
            <button
              type="button"
              onClick={() => {
                const id = savedCalcId || generateCalculatorId();
                const result = saveCalculator(id, calcTitle, blocks, values, 'review');
                if (result.success) {
                  setSavedCalcId(id);
                  setShowSaveDialog(false);
                  alert(`Калькулятор отправлен на ревью!\nАдминистратор проверит его и опубликует.`);
                } else {
                  alert(`Ошибка сохранения: ${result.error}`);
                }
              }}
              style={{ background: '#880', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}
            >
              Отправить на ревью
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSaveDialog(false);
                setCalcTitle('Мой калькулятор');
              }}
              style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px' }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
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
                  draggable
                  onDragStart={(e) => handleDragStart(e, b.id)}
                  onDragOver={(e) => handleDragOver(e, b.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, b.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    cursor: 'move',
                    fontWeight: selectedId === b.id ? 'bold' : undefined,
                    background: selectedId === b.id ? '#222' : dragOverId === b.id ? '#e3f2fd' : draggedId === b.id ? '#f0f0f0' : undefined,
                    color: selectedId === b.id ? '#fff' : undefined,
                    borderRadius: 6,
                    padding: '4px 8px',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: draggedId === b.id ? 0.5 : 1,
                    border: dragOverId === b.id ? '2px dashed #2196f3' : '2px solid transparent',
                    transition: 'all 0.2s',
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
