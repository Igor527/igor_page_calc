import React, { useState, useMemo } from 'react';
import { useCalcStore } from '@/lib/store';
import { recalculateValues } from '@/lib/engine';
import type { Block, BlockType } from '@/types/blocks';

interface NodesListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const blockTypeLabels: Record<string, string> = {
  input: 'Ввод',
  formula: 'Формула',
  text: 'Текст',
  constant: 'Константа',
  table_lookup: 'Поиск в таблице',
  table_range: 'Диапазон таблицы',
  data_table: 'Таблица',
  chart: 'График',
  select_from_table: 'Выбор из таблицы',
  select_from_object: 'Выбор из объекта',
  condition: 'Условие',
  group: 'Группа',
  output: 'Вывод',
  image: 'Изображение',
  button: 'Кнопка',
  table_viewer: 'Просмотр таблицы',
};

// Группы типов для меню "Добавить" — проще ориентироваться
const blockTypeGroups: { title: string; types: BlockType[] }[] = [
  { title: 'Ввод и формулы', types: ['input', 'constant', 'formula', 'output', 'condition'] },
  { title: 'Таблицы и выбор', types: ['data_table', 'table_lookup', 'table_range', 'select_from_table', 'select_from_object', 'table_viewer'] },
  { title: 'Графики и оформление', types: ['chart', 'text', 'image', 'group', 'button'] },
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
  const [addType, setAddType] = useState<BlockType>('input');

  const handleAddBlock = (type?: BlockType) => {
    const blockType = type ?? addType;
    const id = (blockType + '_' + Math.random().toString(36).slice(2, 8)).toLowerCase();
    const template = { ...defaultBlockTemplates[blockType], id } as Block;
    setBlocks([...blocks, template]);
    onSelect(id);
    setShowAddMenu(false);
  };

  const handleDeleteBlock = (e: React.MouseEvent, blockId: string) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить блок «${blocks.find((b) => b.id === blockId)?.label || blockId}»?`)) return;
    const newBlocks = blocks.filter((b) => b.id !== blockId);
    setBlocks(newBlocks);
    setValues(recalculateValues(newBlocks, {}));
    if (selectedId === blockId) onSelect(null);
  };

  const filteredBlocks = useMemo(() => {
    if (!search) return blocks;
    const lowerSearch = search.toLowerCase();
    return blocks.filter(
      (b) =>
        (b.label || b.id).toLowerCase().includes(lowerSearch) ||
        (b.description || '').toLowerCase().includes(lowerSearch) ||
        b.type.toLowerCase().includes(lowerSearch)
    );
  }, [blocks, search]);

  const groupedByType = useMemo(() => {
    const groups: Record<string, Block[]> = {};
    filteredBlocks.forEach((block) => {
      if (!groups[block.type]) {
        groups[block.type] = [];
      }
      groups[block.type].push(block);
    });
    return groups;
  }, [filteredBlocks]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--pico-card-background-color)',
        borderRight: '1px solid var(--pico-border-color)',
      }}
    >
      {/* Поиск и добавление */}
      <div style={{ padding: '12px', borderBottom: '1px solid var(--pico-border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>Поиск по названию или типу</span>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--pico-border-color)',
                background: 'var(--pico-primary-background)',
                color: 'var(--pico-primary-color)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              + Добавить
            </button>
            {showAddMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--pico-card-background-color)',
                  border: '1px solid var(--pico-border-color)',
                  borderRadius: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  minWidth: 220,
                  maxHeight: 340,
                  overflowY: 'auto',
                }}
              >
                {blockTypeGroups.map((group) => (
                  <div key={group.title}>
                    <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--pico-muted-color)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--pico-border-color)' }}>
                      {group.title}
                    </div>
                    {group.types.map((type) => (
                      <div
                        key={type}
                        onClick={() => handleAddBlock(type)}
                        style={{
                          padding: '6px 12px',
                          cursor: 'pointer',
                          fontSize: 13,
                          borderBottom: '1px solid var(--pico-border-color)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--pico-card-background-color)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {blockTypeLabels[type] || type}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 4,
            border: '1px solid var(--pico-border-color)',
            fontSize: 13,
            background: 'var(--pico-form-element-background-color)',
            color: 'var(--pico-color)',
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--pico-muted-color)', marginTop: 4 }}>
          Всего: {blocks.length} | Найдено: {filteredBlocks.length}
        </div>
      </div>

      {/* Список нод */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {Object.entries(groupedByType).map(([type, typeBlocks]) => (
          <div key={type} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--pico-muted-color)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {blockTypeLabels[type] || type} ({typeBlocks.length})
            </div>
            {typeBlocks.map((block) => {
              const isSelected = selectedId === block.id;
              return (
                <div
                  key={block.id}
                  onClick={() => onSelect(block.id)}
                  style={{
                    padding: '8px 10px',
                    marginBottom: 4,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--pico-primary-background)'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid var(--pico-primary-border-color)'
                      : '1px solid transparent',
                    color: isSelected ? 'var(--pico-primary-color)' : 'var(--pico-color)',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--pico-card-background-color)';
                      e.currentTarget.style.borderColor = 'var(--pico-border-color)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 500, marginBottom: 2 }}>
                      {block.label || block.id}
                    </div>
                    {block.description && (
                      <div
                        style={{
                          fontSize: 11,
                          color: isSelected ? 'var(--pico-primary-color)' : 'var(--pico-muted-color)',
                          opacity: 0.8,
                          lineHeight: 1.4,
                        }}
                      >
                        {block.description}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        color: isSelected ? 'var(--pico-primary-color)' : 'var(--pico-muted-color)',
                        opacity: 0.6,
                        marginTop: 2,
                      }}
                    >
                      @{block.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteBlock(e, block.id)}
                    title="Удалить блок"
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      padding: 0,
                      border: 'none',
                      borderRadius: 4,
                      background: 'transparent',
                      color: 'var(--color-muted-text)',
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-error-bg)';
                      e.currentTarget.style.color = 'var(--color-danger)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-muted-text)';
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {filteredBlocks.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--pico-muted-color)' }}>
            Нод не найдено
          </div>
        )}
      </div>
    </div>
  );
};

export default NodesList;
