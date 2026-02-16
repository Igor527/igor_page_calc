// Визуальный редактор блоков в стиле Dynamo
// Блоки отображаются как карточки с возможностью перетаскивания
// Правая кнопка мыши открывает контекстное меню для создания блоков
// Клик на блок открывает всплывающее окно со свойствами

import React, { useState, useRef, useEffect } from 'react';
import { useCalcStore } from '@/lib/store';
import type { Block, BlockType } from '@/types/blocks';
import PropertyEditor from './PropertyEditor';

interface NodePosition {
  x: number;
  y: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
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
  table_viewer: 'Просмотр таблицы',
};

const defaultBlockTemplates: Record<BlockType, Partial<Block>> = {
  input: { type: 'input', label: 'Новый ввод', inputType: 'number', defaultValue: 0, id: '' },
  formula: { type: 'formula', label: 'Формула', formula: '', dependencies: [], id: '' },
  text: { type: 'text', content: 'Текст', style: 'p', id: '' },
  constant: { type: 'constant', value: 0, id: '' },
  table_lookup: { type: 'table_lookup', data: [], key_col: '', target_col: '', selected_key: '', id: '' },
  data_table: { type: 'data_table', name: 'Таблица', columns: [], rows: [], id: '' },
  chart: { type: 'chart', chartType: 'line', dataSource: '', xKey: '', yKey: '', id: '' },
  select_from_table: { type: 'select_from_table', label: 'Выбор', dataSource: '', column: '', id: '' },
  select_from_object: { type: 'select_from_object', label: 'Выбор', objectSource: '', id: '' },
  condition: { type: 'condition', if_exp: '', then_id: '', else_id: '', id: '' },
  group: { type: 'group', title: 'Группа', children: [], id: '' },
  output: { type: 'output', sourceId: '', id: '' },
  image: { type: 'image', url: '', id: '' },
  button: { type: 'button', action: 'calculate', label: 'Кнопка', id: '' },
  table_viewer: { type: 'table_viewer', label: 'Просмотр таблицы', dataSource: '', id: '' },
};

const blockTypeColors: Record<BlockType, string> = {
  input: '#4a9eff',
  formula: '#ff9f43',
  text: '#26de81',
  constant: '#a55eea',
  table_lookup: '#45aaf2',
  data_table: '#fd79a8',
  chart: '#feca57',
  select_from_table: '#48dbfb',
  select_from_object: '#0abde3',
  condition: '#ee5a6f',
  group: '#778ca3',
  output: '#2ed573',
  image: '#f368e0',
  button: '#ff6348',
  table_viewer: '#20bf6b',
};

interface VisualNodeEditorProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const VisualNodeEditor: React.FC<VisualNodeEditorProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const values = useCalcStore((s) => s.values);

  // Позиции блоков на канвасе
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  
  // Контекстное меню
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  
  // Drag & drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<NodePosition>({ x: 0, y: 0 });
  
  // Панорамирование канваса
  const [canvasOffset, setCanvasOffset] = useState<NodePosition>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<NodePosition>({ x: 0, y: 0 });
  
  // Всплывающее окно свойств
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // Инициализация позиций для новых блоков
  useEffect(() => {
    const newPositions: Record<string, NodePosition> = { ...positions };
    let needsUpdate = false;
    
    blocks.forEach((block, index) => {
      if (!newPositions[block.id]) {
        // Размещаем новые блоки в сетке
        const col = index % 4;
        const row = Math.floor(index / 4);
        newPositions[block.id] = {
          x: 50 + col * 280,
          y: 50 + row * 150,
        };
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      setPositions(newPositions);
    }
  }, [blocks.length]);

  // Обработка правого клика для контекстного меню
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Закрытие контекстного меню при клике
  useEffect(() => {
    const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0 });
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  // Создание блока из контекстного меню
  const createBlock = (type: BlockType) => {
    const id = (type + '_' + Math.random().toString(36).slice(2, 8)).toLowerCase();
    const template = { ...defaultBlockTemplates[type], id } as Block;
    
    // Позиция относительно канваса (где был клик)
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const x = contextMenu.x - (canvasRect?.left || 0) - canvasOffset.x;
    const y = contextMenu.y - (canvasRect?.top || 0) - canvasOffset.y;
    
    setBlocks([...blocks, template]);
    setPositions({ ...positions, [id]: { x, y } });
    onSelect(id);
    setShowPropertyPanel(true);
  };

  // Drag & drop блока
  const handleMouseDown = (e: React.MouseEvent, blockId: string) => {
    if (e.button !== 0) return; // Только левая кнопка
    
    e.stopPropagation();
    setDraggingId(blockId);
    
    const blockPos = positions[blockId] || { x: 0, y: 0 };
    setDragOffset({
      x: e.clientX - blockPos.x - canvasOffset.x,
      y: e.clientY - blockPos.y - canvasOffset.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingId) {
      const newX = e.clientX - dragOffset.x - canvasOffset.x;
      const newY = e.clientY - dragOffset.y - canvasOffset.y;
      
      setPositions({
        ...positions,
        [draggingId]: { x: newX, y: newY },
      });
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      
      setCanvasOffset({
        x: canvasOffset.x + dx,
        y: canvasOffset.y + dy,
      });
      
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setDraggingId(null);
    setIsPanning(false);
  };

  // Панорамирование средней кнопкой или пробелом
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Клик на блок
  const handleBlockClick = (blockId: string) => {
    onSelect(blockId);
    setShowPropertyPanel(true);
  };

  // Удаление блока
  const handleDeleteBlock = (blockId: string) => {
    if (!window.confirm('Удалить блок?')) return;
    setBlocks(blocks.filter((b) => b.id !== blockId));
    const newPositions = { ...positions };
    delete newPositions[blockId];
    setPositions(newPositions);
    if (selectedId === blockId) {
      onSelect(null);
      setShowPropertyPanel(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Канвас с блоками */}
      <div
        ref={canvasRef}
        onContextMenu={handleContextMenu}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, #f0f0f0 1px, transparent 1px), linear-gradient(#f0f0f0 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundColor: '#fafafa',
          cursor: isPanning ? 'grabbing' : draggingId ? 'move' : 'default',
          position: 'relative',
        }}
      >
        {/* Контейнер с блоками */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
            transition: draggingId || isPanning ? 'none' : 'transform 0.1s',
          }}
        >
          {blocks.map((block) => {
            const pos = positions[block.id] || { x: 0, y: 0 };
            const color = blockTypeColors[block.type];
            const isSelected = selectedId === block.id;
            const value = values[block.id];

            return (
              <div
                key={block.id}
                onMouseDown={(e) => handleMouseDown(e, block.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBlockClick(block.id);
                }}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: 240,
                  minHeight: 80,
                  background: '#fff',
                  border: `3px solid ${color}`,
                  borderRadius: 8,
                  boxShadow: isSelected ? `0 0 0 3px ${color}40, 0 4px 12px rgba(0,0,0,0.2)` : '0 2px 8px rgba(0,0,0,0.1)',
                  cursor: 'move',
                  userSelect: 'none',
                  transition: 'box-shadow 0.2s, transform 0.1s',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  zIndex: isSelected ? 1000 : 1,
                }}
              >
                {/* Заголовок блока */}
                <div
                  style={{
                    background: color,
                    color: '#fff',
                    padding: '8px 12px',
                    fontWeight: 600,
                    fontSize: 13,
                    borderRadius: '5px 5px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{blockTypeLabels[block.type]}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBlock(block.id);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 3,
                      padding: '2px 6px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 'bold',
                    }}
                    title="Удалить"
                  >
                    ×
                  </button>
                </div>

                {/* Содержимое блока */}
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#333' }}>
                    {block.label || block.id}
                  </div>

                  {/* Тип блока */}
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                    ID: {block.id}
                  </div>

                  {/* Дополнительная информация */}
                  {block.type === 'formula' && 'formula' in block && (
                    <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', background: '#f5f5f5', padding: 4, borderRadius: 3, marginBottom: 4 }}>
                      {block.formula || '(пусто)'}
                    </div>
                  )}

                  {block.type === 'input' && 'defaultValue' in block && (
                    <div style={{ fontSize: 11, color: '#666' }}>
                      По умолчанию: {block.defaultValue}
                    </div>
                  )}

                  {block.type === 'constant' && 'value' in block && (
                    <div style={{ fontSize: 11, color: '#666' }}>
                      Значение: {block.value}
                    </div>
                  )}

                  {/* Результат вычисления */}
                  {value !== undefined && (
                    <div style={{ marginTop: 8, padding: 6, background: '#e8f5e9', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>
                      Результат: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Контекстное меню */}
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px 0',
            minWidth: 180,
            zIndex: 10000,
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#666', borderBottom: '1px solid #eee' }}>
            Создать блок
          </div>
          {(Object.keys(blockTypeLabels) as BlockType[]).map((type) => (
            <div
              key={type}
              onClick={() => createBlock(type)}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: blockTypeColors[type],
                }}
              />
              {blockTypeLabels[type]}
            </div>
          ))}
        </div>
      )}

      {/* Всплывающее окно свойств */}
      {showPropertyPanel && selectedId && (
        <div
          style={{
            position: 'fixed',
            right: 20,
            top: 80,
            width: 320,
            maxHeight: 'calc(100vh - 100px)',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            zIndex: 10001,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Заголовок панели */}
          <div
            style={{
              padding: '12px 16px',
              background: '#f5f5f5',
              borderBottom: '1px solid #ddd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>Свойства блока</span>
            <button
              onClick={() => {
                setShowPropertyPanel(false);
                onSelect(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 18,
                cursor: 'pointer',
                color: '#666',
              }}
            >
              ×
            </button>
          </div>

          {/* Содержимое панели */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
            <PropertyEditor selectedId={selectedId} onSelect={onSelect} />
          </div>
        </div>
      )}

      {/* Подсказка */}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          zIndex: 100,
        }}
      >
        💡 ПКМ — создать блок | ЛКМ — выбрать | Shift+ЛКМ — панорамирование
      </div>
    </div>
  );
};

export default VisualNodeEditor;
