import React, { useState, useMemo } from 'react';
import { useCalcStore } from '@/lib/store';
import { recalculateValues } from '@/lib/engine';
import type { Block, BlockType } from '@/types/blocks';

interface NodesListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const blockTypeMeta: Record<BlockType, { label: string; icon: string; color: string }> = {
  input: { label: 'Ввод', icon: '🔵', color: '#3b82f6' },
  formula: { label: 'Формула', icon: '🟣', color: '#a855f7' },
  text: { label: 'Текст', icon: '📄', color: '#64748b' },
  constant: { label: 'Константа', icon: '🟠', color: '#f97316' },
  table_lookup: { label: 'Поиск', icon: '🔍', color: '#06b6d4' },
  table_range: { label: 'Диапазон', icon: '📊', color: '#8b5cf6' },
  data_table: { label: 'Таблица', icon: '📅', color: '#f59e0b' },
  chart: { label: 'График', icon: '📈', color: '#ec4899' },
  select_from_table: { label: 'Выбор', icon: '🔘', color: '#10b981' },
  select_from_object: { label: 'Объект', icon: '📦', color: '#6366f1' },
  condition: { label: 'Условие', icon: '🔀', color: '#ef4444' },
  group: { label: 'Группа', icon: '📁', color: '#a855f7' },
  output: { label: 'Вывод', icon: '🟢', color: '#22c55e' },
  image: { label: 'Имидж', icon: '🖼️', color: '#64748b' },
  button: { label: 'Кнопка', icon: '🖱️', color: '#3b82f6' },
  table_viewer: { label: 'Просмотр', icon: '📑', color: '#10b981' },
};

const blockTypeGroups: { title: string; types: BlockType[] }[] = [
  { title: 'Ввод и логика', types: ['input', 'constant', 'formula', 'condition', 'output'] },
  { title: 'Таблицы и выбор', types: ['data_table', 'table_lookup', 'table_range', 'select_from_table', 'select_from_object', 'table_viewer'] },
  { title: 'Контент и декор', types: ['chart', 'text', 'image', 'group', 'button'] },
];

const defaultBlockTemplates: Record<BlockType, Partial<Block>> = {
  input: { type: 'input', label: 'Новый ввод', inputType: 'number', id: '' },
  formula: { type: 'formula', label: 'Формула', formula: '', dependencies: [], id: '' },
  text: { type: 'text', content: '', style: 'p', id: '' },
  constant: { type: 'constant', value: 0, id: '' },
  table_lookup: { type: 'table_lookup', data: [], key_col: '', target_col: '', selected_key: '', id: '' },
  table_range: { type: 'table_range', dataSource: '', inputId: '', maxColumn: '', valueColumn: '', id: '' },
  data_table: { type: 'data_table', name: '', rows: [['Col1', 'Col2']], id: '' },
  chart: { type: 'chart', chartType: 'line', dataSource: '', xKey: '', yKey: '', id: '' },
  select_from_table: { type: 'select_from_table', label: '', dataSource: '', column: '', id: '' },
  select_from_object: { type: 'select_from_object', label: '', objectSource: '', id: '' },
  condition: { type: 'condition', if_exp: '', then_id: '', else_id: '', id: '' },
  group: { type: 'group', title: 'Группа', children: [], id: '' },
  output: { type: 'output', sourceId: '', id: '' },
  image: { type: 'image', url: '', id: '' },
  button: { type: 'button', action: 'calculate', label: 'Кнопка', id: '' },
  table_viewer: { type: 'table_viewer', label: 'Просмотр таблицы', dataSource: '', id: '' },
};

const NodesList: React.FC<NodesListProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const [search, setSearch] = useState<string>('');
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleAddBlock = (type: BlockType) => {
    const id = (type + '_' + Math.random().toString(36).slice(2, 8)).toLowerCase();
    const template = { ...defaultBlockTemplates[type], id } as Block;
    setBlocks([...blocks, template]);
    onSelect(id);
    setShowAddMenu(false);
  };

  const handleDeleteBlock = (e: React.MouseEvent, blockId: string) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить блок ${blockId}?`)) return;
    const newBlocks = blocks.filter((b) => b.id !== blockId);
    setBlocks(newBlocks);
    setValues(recalculateValues(newBlocks, {}));
    if (selectedId === blockId) onSelect(null);
  };

  const handleCloneBlock = (e: React.MouseEvent, block: Block) => {
    e.stopPropagation();
    const id = (block.type + '_' + Math.random().toString(36).slice(2, 8)).toLowerCase();
    const clone = { ...JSON.parse(JSON.stringify(block)), id };
    setBlocks([...blocks, clone]);
    onSelect(id);
  };

  const filteredBlocks = useMemo(() => {
    if (!search) return blocks;
    const lowerSearch = search.toLowerCase();
    return blocks.filter(
      (b) =>
        (b.label || b.id).toLowerCase().includes(lowerSearch) ||
        b.type.toLowerCase().includes(lowerSearch)
    );
  }, [blocks, search]);

  const grouped = useMemo(() => {
    const categories: Record<string, Block[]> = {
      'Ввод и логика': [],
      'Таблицы и выбор': [],
      'Контент и декор': [],
      'Прочее': []
    };
    
    filteredBlocks.forEach(b => {
      const group = blockTypeGroups.find(g => g.types.includes(b.type));
      if (group) categories[group.title].push(b);
      else categories['Прочее'].push(b);
    });
    return categories;
  }, [filteredBlocks]);

  return (
    <div className="flex flex-col h-full bg-[var(--pico-card-background-color)] border-r border-[var(--pico-border-color)]">
      {/* Search & Add */}
      <div className="p-3 border-b border-[var(--pico-border-color)]">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="Поиск блоков..."
            className="flex-1 p-2 text-xs rounded border border-[var(--pico-border-color)] bg-[var(--pico-form-element-background-color)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="p-2 text-xs rounded bg-[var(--pico-primary-background)] text-[var(--pico-primary-color)] transition-opacity hover:opacity-90"
            >
              + Добавить
            </button>
            {showAddMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-[var(--pico-card-background-color)] border border-[var(--pico-border-color)] rounded shadow-lg z-[1000] max-h-[400px] overflow-y-auto">
                {blockTypeGroups.map(group => (
                  <div key={group.title} className="py-1">
                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-[var(--pico-muted-color)] opacity-70">
                      {group.title}
                    </div>
                    {group.types.map(type => (
                      <div
                        key={type}
                        onClick={() => handleAddBlock(type)}
                        className="px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer hover:bg-[var(--pico-primary-background)] hover:text-[var(--pico-primary-color)]"
                      >
                        <span className="w-4 text-center">{blockTypeMeta[type].icon}</span>
                        {blockTypeMeta[type].label}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {Object.entries(grouped).map(([category, items]) => items.length > 0 && (
          <div key={category}>
            <div className="px-2 mb-1 text-[10px] font-bold text-[var(--pico-muted-color)] uppercase tracking-wider opacity-60">
              {category}
            </div>
            {items.map((block) => {
              const selected = selectedId === block.id;
              const meta = blockTypeMeta[block.type];
              return (
                <div
                  key={block.id}
                  onMouseEnter={() => setHoveredId(block.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect(block.id)}
                  className={`
                    relative group flex items-start gap-3 p-2.5 mb-1 rounded-lg cursor-pointer transition-all
                    ${selected 
                      ? 'bg-blue-50/10 border-l-4 border-l-blue-500 shadow-sm' 
                      : 'border-l-4 border-l-transparent hover:bg-[var(--pico-form-element-background-color)]'}
                  `}
                  style={{ 
                    borderLeftColor: selected ? meta.color : 'transparent',
                    backgroundColor: selected ? `${meta.color}15` : undefined 
                  }}
                >
                  <span className="text-lg leading-none mt-0.5 opacity-90">{meta.icon}</span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-medium truncate ${selected ? 'text-[var(--pico-primary-color)]' : ''}`}>
                        {block.label || block.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-[10px] px-1 rounded bg-[var(--pico-code-background-color)] opacity-60">
                        @{block.id}
                      </code>
                    </div>
                  </div>

                  {/* Actions (visible on hover or if selected) */}
                  <div className={`
                    flex gap-1 absolute right-2 top-2 transition-opacity
                    ${hoveredId === block.id || selected ? 'opacity-100' : 'opacity-0'}
                  `}>
                    <button
                      onClick={(e) => handleCloneBlock(e, block)}
                      className="p-1 text-[10px] bg-[var(--pico-card-background-color)] border border-[var(--pico-border-color)] rounded hover:bg-[var(--pico-primary-background)] hover:text-white"
                      title="Копировать"
                    >
                      📑
                    </button>
                    <button
                      onClick={(e) => handleDeleteBlock(e, block.id)}
                      className="p-1 text-[10px] bg-[var(--pico-card-background-color)] border border-[var(--pico-border-color)] rounded hover:bg-red-500 hover:text-white"
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NodesList;
