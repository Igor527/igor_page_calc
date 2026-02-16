// Полноценный Dynamo-style редактор с нодами, портами и визуальными связями
// Inline-редактирование прямо на нодах (без всплывающего окна)
// Drag & Drop для создания соединений между портами

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useCalcStore } from '@/lib/store';
import { extractFormulaDependencies } from '@/lib/formula';
import type { Block, BlockType } from '@/types/blocks';
import type { NodeConnection, NodePosition } from '@/types/nodes';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

interface DragState {
  type: 'node' | 'connection' | null;
  nodeId?: string;
  fromBlockId?: string;
  fromPort?: string;
  offset?: NodePosition;
}

const blockTypeLabels: Record<BlockType, string> = {
  input: 'Input',
  formula: 'Formula',
  constant: 'Constant',
  table_lookup: 'TableLookup',
  table_range: 'TableRange',
  data_table: 'Table',
  select_from_table: 'InputList',
  select_from_object: 'SelectFromObject',
  condition: 'Condition',
  group: 'Group',
  output: 'Output',
  image: 'Image',
  button: 'Button',
  table_viewer: 'TableViewer',
};

const defaultBlockTemplates: Record<BlockType, Partial<Block>> = {
  input: { type: 'input', label: 'Input', inputType: 'number', defaultValue: 0, id: '' },
  formula: { type: 'formula', label: 'Formula', formula: '', dependencies: [], id: '' },
  constant: { type: 'constant', value: 0, id: '' },
  table_lookup: { type: 'table_lookup', data: [], key_col: '', target_col: '', selected_key: '', id: '' },
  table_range: { type: 'table_range', dataSource: '', inputId: '', minColumn: '', maxColumn: '', valueColumn: '', id: '' },
  data_table: { type: 'data_table', name: 'Table', columns: ['A', 'B'], rows: [], id: '' },
  select_from_table: { type: 'select_from_table', label: 'InputList', dataSource: '', column: '', id: '' },
  select_from_object: { type: 'select_from_object', label: 'Select', objectSource: '', id: '' },
  condition: { type: 'condition', if_exp: '', then_id: '', else_id: '', id: '' },
  group: { type: 'group', title: 'Group', children: [], id: '' },
  output: { type: 'output', sourceId: '', id: '' },
  image: { type: 'image', url: '', id: '' },
  button: { type: 'button', action: 'calculate', label: 'Button', id: '' },
  table_viewer: { type: 'table_viewer', label: 'TableViewer', dataSource: '', id: '' },
};

const blockTypeColors: Record<BlockType, string> = {
  input: '#4a9eff',
  formula: '#ff9f43',
  constant: '#a55eea',
  table_lookup: '#45aaf2',
  table_range: '#5f8cff',
  data_table: '#fd79a8',
  select_from_table: '#48dbfb',
  select_from_object: '#0abde3',
  condition: '#ee5a6f',
  group: '#778ca3',
  output: '#2ed573',
  image: '#f368e0',
  table_viewer: '#20bf6b',
  button: '#ff6348',
};

const blockTypeBaseNames: Record<BlockType, { id: string; label: string }> = {
  input: { id: 'input', label: 'Input' },
  formula: { id: 'formula', label: 'Formula' },
  constant: { id: 'constant', label: 'Constant' },
  table_lookup: { id: 'tableLookup', label: 'TableLookup' },
  table_range: { id: 'tableRange', label: 'TableRange' },
  data_table: { id: 'table', label: 'Table' },
  select_from_table: { id: 'inputList', label: 'InputList' },
  select_from_object: { id: 'selectFromObject', label: 'SelectFromObject' },
  condition: { id: 'condition', label: 'Condition' },
  group: { id: 'group', label: 'Group' },
  output: { id: 'output', label: 'Output' },
  image: { id: 'image', label: 'Image' },
  button: { id: 'button', label: 'Button' },
  table_viewer: { id: 'tableViewer', label: 'TableViewer' },
};

function parseCellValue(value: string): string | number {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const num = Number(trimmed.replace(',', '.'));
  return Number.isFinite(num) && trimmed.match(/^[-+]?\d*[\.,]?\d+$/) ? num : trimmed;
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  if (line.includes(',')) return line.split(',');
  return line.split(/\s+/);
}

function parseTableText(columnsText: string, dataText: string) {
  const rawColumns = columnsText
    .split(/[\t,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const lines = dataText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = lines.map((line) => splitRow(line).map(parseCellValue));
  const maxLen = rows.reduce((max, row) => Math.max(max, row.length), rawColumns.length);
  const columns = rawColumns.length > 0
    ? [...rawColumns]
    : Array.from({ length: maxLen }, (_, i) => `Col${i + 1}`);

  while (columns.length < maxLen) {
    columns.push(`Col${columns.length + 1}`);
  }

  const mappedRows = rows.map((row) => {
    const record: Record<string, string | number> = {};
    columns.forEach((col, idx) => {
      record[col] = row[idx] ?? '';
    });
    return record;
  });

  return { columns, rows: mappedRows };
}

function tableToText(columns: string[], rows: Array<Record<string, string | number>>): string {
  if (!columns.length || !rows.length) return '';
  return rows
    .map((row) => columns.map((col) => String(row[col] ?? '')).join('\t'))
    .join('\n');
}

const NEW_INPUT_PORT = '__new__';
const COLUMN_WIDTH = 320;
const ROW_HEIGHT = 180;
const START_X = 100;
const START_Y = 80;

function getFormulaDisplayName(blockId: string): string {
  const normalized = blockId.trim();
  if (normalized.toLowerCase().startsWith('formula')) {
    const suffix = normalized.slice('formula'.length);
    return `Formula${suffix || ''}`;
  }
  return normalized;
}

// Определение портов для каждого типа блока
function getBlockPorts(block: Block): { inputs: string[]; outputs: string[] } {
  const ports = {
    inputs: [] as string[],
    outputs: ['value'] as string[], // По умолчанию у всех есть выход
  };

  switch (block.type) {
    case 'input':
      // Нет входов, только выход
      break;
    case 'formula':
      if ('dependencies' in block && Array.isArray(block.dependencies)) {
        ports.inputs = block.dependencies.map((dep: string) => dep);
      }
      ports.inputs = [...ports.inputs, NEW_INPUT_PORT];
      break;
    case 'constant':
      // Нет входов, только выход
      break;
    case 'select_from_table':
      ports.inputs = ['dataSource'];
      break;
    case 'select_from_object':
      ports.inputs = ['objectSource'];
      break;
    case 'condition':
      ports.inputs = ['condition', 'then', 'else'];
      break;
    case 'output':
      ports.inputs = ['source'];
      ports.outputs = [];
      break;
    case 'data_table':
      // Нет входов, только выход (таблица)
      break;
    case 'table_lookup':
      ports.inputs = ['data', 'key'];
      break;
    case 'table_range':
      if ('inputId' in block && block.inputId) {
        ports.inputs = [block.inputId];
      }
      break;
    case 'table_viewer':
      ports.inputs = ['dataSource'];
      ports.outputs = ['column', 'row', 'cell'];
      break;
      break;
    default:
      break;
  }

  return ports;
}

interface DynamoNodeEditorProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const DynamoNodeEditor: React.FC<DynamoNodeEditorProps> = ({ selectedId, onSelect }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const values = useCalcStore((s) => s.values);

  // Позиции нод
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  
  // Связи между нодами
  const [connections, setConnections] = useState<NodeConnection[]>([]);
  
  // Контекстное меню
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  
  // Drag & drop
  const [dragState, setDragState] = useState<DragState>({ type: null });
  
  // Панорамирование
  const [canvasOffset, setCanvasOffset] = useState<NodePosition>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<NodePosition>({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState<number>(1);
  const dragStartRef = useRef<{ id: string; pos: NodePosition } | null>(null);
  const lastValidRef = useRef<NodePosition | null>(null);
  const [positionHistory, setPositionHistory] = useState<Array<{ id: string; pos: NodePosition }>>([]);
  const [redoHistory, setRedoHistory] = useState<Array<{ id: string; pos: NodePosition }>>([]);
  
  // Inline редактирование
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Черновики для редактирования таблиц
  const [tableDrafts, setTableDrafts] = useState<Record<string, { columnsText: string; dataText: string }>>({});
  
  // Временная линия соединения
  const [tempConnection, setTempConnection] = useState<{ fromBlockId: string; fromPort: string; mouseX: number; mouseY: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const contentBounds = useCallback(() => {
    const padding = ROW_HEIGHT;
    const nodeWidth = 280;
    const nodeHeight = 180;
    const xs = Object.values(positions).map((p) => p.x);
    const ys = Object.values(positions).map((p) => p.y);
    const maxX = START_X + (COLUMN_WIDTH * 2) + nodeWidth + padding;
    const maxY = ys.length ? Math.max(...ys) + nodeHeight + padding : 1000;
    const minX = xs.length ? Math.min(...xs) - padding : 0;
    const minY = ys.length ? Math.min(...ys) - padding : 0;
    return {
      width: Math.max(1200, maxX - Math.min(0, minX)),
      height: Math.max(800, maxY - Math.min(0, minY)),
    };
  }, [positions]);
  
  const contentSize = useMemo(() => contentBounds(), [contentBounds]);

  const getPointerPosition = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: (e.clientX - left) / canvasScale,
      y: (e.clientY - top) / canvasScale,
    };
  }, [canvasScale]);

  const getNextBlockIndex = useCallback((baseId: string) => {
    const used = blocks
      .map((b) => b.id)
      .filter((id) => id.toLowerCase().startsWith(baseId.toLowerCase()))
      .map((id) => {
        const match = id.match(/(\d+)$/);
        return match ? Number(match[1]) : 0;
      });
    const max = used.length ? Math.max(...used) : 0;
    return max + 1;
  }, [blocks]);

  const updateBlockFields = useCallback((blockId: string, updates: Partial<Block>) => {
    setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)));
  }, [blocks, setBlocks]);

  const updateTableDraft = useCallback((blockId: string, patch: Partial<{ columnsText: string; dataText: string }>) => {
    setTableDrafts((prev) => {
      const current = prev[blockId] ?? { columnsText: '', dataText: '' };
      return { ...prev, [blockId]: { ...current, ...patch } };
    });
  }, []);

  // Инициализация позиций
  useEffect(() => {
    const newPositions: Record<string, NodePosition> = { ...positions };
    let needsUpdate = false;
    
    blocks.forEach((block, index) => {
      if (!newPositions[block.id]) {
        const col = index % 3;
        const row = Math.floor(index / 3);
        newPositions[block.id] = {
          x: START_X + col * COLUMN_WIDTH,
          y: START_Y + row * ROW_HEIGHT,
        };
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      setPositions(newPositions);
    }
  }, [blocks.length]);

  const buildConnectionsFromBlocks = useCallback((nextBlocks: Block[]) => {
    const derived: NodeConnection[] = [];
    nextBlocks.forEach((block) => {
      if (block.type === 'formula' && 'dependencies' in block && Array.isArray(block.dependencies)) {
        block.dependencies.forEach((depId: string, index: number) => {
          derived.push({
            id: `${depId}-${block.id}-${index}`,
            fromBlockId: depId,
            fromPort: 'value',
            toBlockId: block.id,
            toPort: depId,
          });
        });
      }
    });
    return derived;
  }, []);

  // Автоматическая синхронизация связей из dependencies
  useEffect(() => {
    setConnections(buildConnectionsFromBlocks(blocks));
  }, [blocks, buildConnectionsFromBlocks]);

  useEffect(() => {
    if (!selectedId) return;
    const nodePos = positions[selectedId];
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!nodePos || !canvas || !scroller) return;
    const rect = canvas.getBoundingClientRect();
    const viewWidth = rect.width / canvasScale;
    const viewHeight = rect.height / canvasScale;
    const nodeWidth = 280;
    const nodeHeight = 180;
    const left = nodePos.x + canvasOffset.x;
    const top = nodePos.y + canvasOffset.y;
    const right = left + nodeWidth;
    const bottom = top + nodeHeight;
    const margin = 80;
    const needsMove = left < margin || right > viewWidth - margin || top < margin || bottom > viewHeight - margin;
    if (!needsMove) return;
    const targetOffsetY = viewHeight / 2 - (nodePos.y + nodeHeight / 2);
    setCanvasOffset({ x: 0, y: targetOffsetY });
    const scrollLeft = Math.max(0, (nodePos.x + nodeWidth / 2 + canvasOffset.x) * canvasScale - scroller.clientWidth / 2);
    const scrollTop = Math.max(0, (nodePos.y + nodeHeight / 2 + canvasOffset.y) * canvasScale - scroller.clientHeight / 2);
    scroller.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'smooth' });
  }, [selectedId, positions, canvasOffset, canvasScale]);

  // Контекстное меню
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0 });
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  // Создание ноды
  const createBlock = (type: BlockType) => {
    const base = blockTypeBaseNames[type];
    const index = getNextBlockIndex(base.id);
    const id = `${base.id}${index}`;
    const label = `${base.label}${index}`;
    const template = { ...defaultBlockTemplates[type], id } as Block;

    if ('label' in template) {
      (template as any).label = label;
    }
    if (template.type === 'data_table') {
      (template as any).name = label;
    }
    
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const x = (contextMenu.x - (canvasRect?.left || 0)) / canvasScale - canvasOffset.x;
    const y = (contextMenu.y - (canvasRect?.top || 0)) / canvasScale - canvasOffset.y;
    
    setBlocks([...blocks, template]);
    setPositions({ ...positions, [id]: { x, y } });
    onSelect(id);
  };

  // Начало перетаскивания ноды
  const handleNodeMouseDown = (e: React.MouseEvent, blockId: string) => {
    if (e.button !== 0) return;
    
    // Двойной клик для редактирования
    if (e.detail === 2) {
      const targetBlock = blocks.find((b) => b.id === blockId);
      if (targetBlock && targetBlock.type !== 'formula') {
        setEditingNode(blockId);
      }
      return;
    }
    
    e.stopPropagation();
    const blockPos = positions[blockId] || { x: 0, y: 0 };
    const pointer = getPointerPosition(e);
    dragStartRef.current = { id: blockId, pos: { ...blockPos } };
    lastValidRef.current = { ...blockPos };
    setDragState({
      type: 'node',
      nodeId: blockId,
      offset: {
        x: pointer.x - blockPos.x - canvasOffset.x,
        y: pointer.y - blockPos.y - canvasOffset.y,
      },
    });
    onSelect(blockId);
  };

  // Начало создания соединения
  const handlePortMouseDown = (e: React.MouseEvent, blockId: string, portId: string, portType: 'input' | 'output') => {
    e.stopPropagation();
    const pointer = getPointerPosition(e);
    if (portType === 'output') {
      setDragState({
        type: 'connection',
        fromBlockId: blockId,
        fromPort: portId,
      });
      setTempConnection({
        fromBlockId: blockId,
        fromPort: portId,
        mouseX: pointer.x,
        mouseY: pointer.y,
      });
    }
  };

  // Завершение создания соединения
  const handlePortMouseUp = (e: React.MouseEvent, blockId: string, portId: string, portType: 'input' | 'output') => {
    e.stopPropagation();
    
    if (dragState.type === 'connection' && portType === 'input' && dragState.fromBlockId) {
      const targetBlock = blocks.find((b) => b.id === blockId);
      const fromId = dragState.fromBlockId;

      if (targetBlock && targetBlock.type === 'formula') {
        const isNewPort = portId === NEW_INPUT_PORT;
        const isMatchingPort = portId === fromId;
        if (!isNewPort && !isMatchingPort) {
          setDragState({ type: null });
          setTempConnection(null);
          return;
        }

        const deps = new Set(targetBlock.dependencies || []);
        if (deps.has(fromId)) {
          setDragState({ type: null });
          setTempConnection(null);
          return;
        }

        deps.add(fromId);
        const updated = blocks.map((b) =>
          b.id === blockId ? { ...b, dependencies: Array.from(deps) } : b
        );
        setBlocks(updated);
        setConnections(buildConnectionsFromBlocks(updated));
      } else {
        // Создаём соединение для неформульных блоков (визуально)
        const newConnection: NodeConnection = {
          id: `${fromId}-${blockId}-${Date.now()}`,
          fromBlockId: fromId,
          fromPort: dragState.fromPort || 'value',
          toBlockId: blockId,
          toPort: portId,
        };
        setConnections([...connections, newConnection]);
      }
    }
    
    setDragState({ type: null });
    setTempConnection(null);
  };

  // Перемещение мыши
  const handleMouseMove = (e: React.MouseEvent) => {
    const pointer = getPointerPosition(e);
    if (dragState.type === 'node' && dragState.nodeId && dragState.offset) {
      const newX = pointer.x - dragState.offset.x - canvasOffset.x;
      const newY = pointer.y - dragState.offset.y - canvasOffset.y;
      const minX = START_X;
      const maxX = START_X + COLUMN_WIDTH * 2;
      const otherYs = Object.entries(positions)
        .filter(([id]) => id !== dragState.nodeId)
        .map(([, pos]) => pos.y);
      const baseY = otherYs.length
        ? { min: Math.min(...otherYs), max: Math.max(...otherYs) }
        : { min: dragStartRef.current?.pos.y ?? START_Y, max: dragStartRef.current?.pos.y ?? START_Y };
      const minY = baseY.min - ROW_HEIGHT;
      const maxY = baseY.max + ROW_HEIGHT;
      const clampedX = Math.min(maxX, Math.max(minX, newX));
      const clampedY = Math.min(maxY, Math.max(minY, newY));
      const col = Math.round((clampedX - START_X) / COLUMN_WIDTH);
      const row = Math.round((clampedY - START_Y) / ROW_HEIGHT);
      const snappedX = START_X + col * COLUMN_WIDTH;
      const snappedY = START_Y + row * ROW_HEIGHT;
      const isOccupied = Object.entries(positions).some(([id, pos]) => {
        if (id === dragState.nodeId) return false;
        return pos.x === snappedX && pos.y === snappedY;
      });
      const nextPos = isOccupied
        ? (lastValidRef.current ?? { x: snappedX, y: snappedY })
        : { x: snappedX, y: snappedY };
      if (!isOccupied) {
        lastValidRef.current = nextPos;
      }

      setPositions({
        ...positions,
        [dragState.nodeId]: nextPos,
      });
    } else if (dragState.type === 'connection' && tempConnection) {
      setTempConnection({
        ...tempConnection,
        mouseX: pointer.x,
        mouseY: pointer.y,
      });
    } else if (isPanning) {
      const dx = pointer.x - panStart.x;
      const dy = pointer.y - panStart.y;
      
      setCanvasOffset({
        x: 0,
        y: canvasOffset.y + dy,
      });
      
      setPanStart({ x: pointer.x, y: pointer.y });
    }
  };

  const handleMouseUp = () => {
    if (dragState.type === 'node' && dragState.nodeId && dragStartRef.current) {
      const start = dragStartRef.current;
      const end = positions[dragState.nodeId];
      if (end && (start.pos.x !== end.x || start.pos.y !== end.y)) {
        setPositionHistory((prev) => [...prev, { id: start.id, pos: { ...start.pos } }]);
        setRedoHistory([]);
      }
      dragStartRef.current = null;
    }
    setDragState({ type: null });
    setTempConnection(null);
    setIsPanning(false);
  };

  // Панорамирование
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      const pointer = getPointerPosition(e);
      setPanStart({ x: pointer.x, y: pointer.y });
    } else if (e.button === 0) {
      // Клик по пустому месту - снять выделение
      onSelect(null);
      setEditingNode(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragState.type === 'node' && dragStartRef.current) {
        const start = dragStartRef.current;
        setPositions((prev) => ({ ...prev, [start.id]: { ...start.pos } }));
        dragStartRef.current = null;
        setDragState({ type: null });
        setTempConnection(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setPositionHistory((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          const currentPos = positions[last.id];
          if (currentPos) {
            setRedoHistory((redo) => [...redo, { id: last.id, pos: { ...currentPos } }]);
            setPositions((current) => ({ ...current, [last.id]: { ...last.pos } }));
          }
          return prev.slice(0, -1);
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setRedoHistory((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          const currentPos = positions[last.id];
          if (currentPos) {
            setPositionHistory((history) => [...history, { id: last.id, pos: { ...currentPos } }]);
            setPositions((current) => ({ ...current, [last.id]: { ...last.pos } }));
          }
          return prev.slice(0, -1);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dragState.type, positions, selectedId]);

  // Удаление ноды
  const handleDeleteNode = (blockId: string) => {
    if (!window.confirm('Удалить ноду?')) return;
    setBlocks(blocks.filter((b) => b.id !== blockId));
    const newPositions = { ...positions };
    delete newPositions[blockId];
    setPositions(newPositions);
    
    // Удалить связи
    setConnections(connections.filter((c) => c.fromBlockId !== blockId && c.toBlockId !== blockId));
    
    if (selectedId === blockId) {
      onSelect(null);
    }
  };

  // Удаление соединения
  const handleDeleteConnection = (connectionId: string) => {
    const connection = connections.find((c) => c.id === connectionId);
    if (!connection) return;
    
    // Удалить из dependencies
    const targetBlock = blocks.find((b) => b.id === connection.toBlockId);
    if (targetBlock && targetBlock.type === 'formula') {
      const deps = (targetBlock.dependencies || []).filter((d: string) => d !== connection.fromBlockId);
      const updated = blocks.map((b) =>
        b.id === connection.toBlockId ? { ...b, dependencies: deps } : b
      );
      setBlocks(updated);
    }
    
    setConnections(connections.filter((c) => c.id !== connectionId));
  };

  // Получение координат порта
  const getPortPosition = (blockId: string, portId: string, portType: 'input' | 'output'): { x: number; y: number } => {
    const pos = positions[blockId];
    if (!pos) return { x: 0, y: 0 };
    
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return { x: 0, y: 0 };
    
    const ports = getBlockPorts(block);
    const portList = portType === 'input' ? ports.inputs : ports.outputs;
    const portIndex = portList.indexOf(portId);
    
    const portY = 60 + portIndex * 28;
    const portX = portType === 'input' ? 0 : 280;
    
    return {
      x: pos.x + portX + canvasOffset.x,
      y: pos.y + portY + canvasOffset.y,
    };
  };

  // Inline-редактирование
  const handleFieldChange = (blockId: string, field: string, value: any) => {
    const updated = blocks.map((b) => {
      if (b.id !== blockId) return b;
      if (field === 'formula' && b.type === 'formula') {
        const deps = extractFormulaDependencies(String(value || ''), blocks, blockId);
        return { ...b, formula: String(value || ''), dependencies: deps };
      }
      return { ...b, [field]: value };
    });
    setBlocks(updated);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        onWheel={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: 'var(--pico-card-background-color)',
          border: '1px solid var(--pico-border-color)',
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>Масштаб</span>
        <input
          type="range"
          min={50}
          max={150}
          value={Math.round(canvasScale * 100)}
          onChange={(e) => setCanvasScale(Number(e.target.value) / 100)}
          style={{ width: 120 }}
        />
      </div>

      <div
        ref={scrollRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'auto',
          overflowX: 'hidden',
          scrollbarGutter: 'stable',
        }}
      >
        <div
          style={{
            width: contentSize.width * canvasScale,
            height: contentSize.height * canvasScale,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: contentSize.width,
              height: contentSize.height,
              transform: `scale(${canvasScale})`,
              transformOrigin: '0 0',
              position: 'relative',
            }}
          >
      {/* SVG для связей */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: contentSize.width,
          height: contentSize.height,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {/* Отрисовка связей */}
        {connections.map((conn) => {
          const fromPos = getPortPosition(conn.fromBlockId, conn.fromPort, 'output');
          const toPos = getPortPosition(conn.toBlockId, conn.toPort, 'input');
          
          const midX = (fromPos.x + toPos.x) / 2;
          
          return (
            <g key={conn.id}>
              <path
                d={`M ${fromPos.x} ${fromPos.y} C ${midX} ${fromPos.y}, ${midX} ${toPos.y}, ${toPos.x} ${toPos.y}`}
                stroke="#888"
                strokeWidth="2"
                fill="none"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Удалить соединение?')) {
                    handleDeleteConnection(conn.id);
                  }
                }}
              />
              <circle cx={fromPos.x} cy={fromPos.y} r="4" fill="#888" />
              <circle cx={toPos.x} cy={toPos.y} r="4" fill="#888" />
            </g>
          );
        })}
        
        {/* Временная линия при создании соединения */}
        {tempConnection && dragState.fromBlockId && (
          <path
            d={`M ${getPortPosition(dragState.fromBlockId, tempConnection.fromPort, 'output').x} ${getPortPosition(dragState.fromBlockId, tempConnection.fromPort, 'output').y} L ${tempConnection.mouseX} ${tempConnection.mouseY}`}
            stroke="#4a9eff"
            strokeWidth="2"
            strokeDasharray="5,5"
            fill="none"
          />
        )}
      </svg>

      {/* Канвас с нодами */}
      <div
        ref={canvasRef}
        onContextMenu={handleContextMenu}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: contentSize.width,
          height: contentSize.height,
          background: 'var(--pico-background-color)',
          backgroundImage: 'linear-gradient(90deg, var(--pico-muted-border-color) 1px, transparent 1px), linear-gradient(var(--pico-muted-border-color) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          cursor: isPanning ? 'grabbing' : dragState.type === 'node' ? 'move' : 'default',
          position: 'relative',
        }}
      >
        {/* Контейнер с нодами */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
            transition: dragState.type || isPanning ? 'none' : 'transform 0.1s',
          }}
        >
          {blocks.map((block) => {
            const pos = positions[block.id] || { x: 0, y: 0 };
            const color = blockTypeColors[block.type];
            const isSelected = selectedId === block.id;
            const canEditLabel = block.type !== 'formula';
            const isEditing = canEditLabel && editingNode === block.id;
            const showDetails = isSelected || hoveredNodeId === block.id;
            const value = values[block.id];
            const ports = getBlockPorts(block);
            const tableDraft =
              block.type === 'data_table' && 'columns' in block && 'rows' in block
                ? (tableDrafts[block.id] ?? {
                    columnsText: (block.columns as string[]).join(', '),
                    dataText: tableToText(block.columns as string[], block.rows as Array<Record<string, string | number>>),
                  })
                : null;

            return (
              <div
                key={block.id}
                data-node-id={block.id}
                onMouseDown={(e) => !isEditing && handleNodeMouseDown(e, block.id)}
                onMouseEnter={() => setHoveredNodeId(block.id)}
                onMouseLeave={() => setHoveredNodeId((current) => (current === block.id ? null : current))}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: 280,
                  minHeight: showDetails ? 100 : 56,
                  background: 'var(--pico-card-background-color)',
                  border: `3px solid ${color}`,
                  borderRadius: 8,
                  boxShadow: isSelected ? `0 0 0 5px ${color}85, 0 8px 20px rgba(0,0,0,0.55)` : '0 2px 8px rgba(0,0,0,0.2)',
                  opacity: selectedId && !isSelected ? 0.6 : 1,
                  cursor: isEditing ? 'default' : 'move',
                  userSelect: 'none',
                  transition: 'box-shadow 0.2s',
                  zIndex: isSelected ? 1000 : 1,
                }}
              >
                {/* Заголовок */}
                <div
                  style={{
                    background: color,
                    color: '#fff',
                    padding: '8px 12px',
                    fontWeight: 600,
                    fontSize: 12,
                    borderRadius: '5px 5px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{block.id}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(block.id);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 3,
                      padding: '2px 6px',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 'bold',
                    }}
                  >
                    ×
                  </button>
                </div>

                {block.type === 'formula' && hoveredNodeId === block.id && 'formula' in block && block.formula && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -8,
                      left: 8,
                      transform: 'translateY(-100%)',
                      background: 'rgba(0,0,0,0.85)',
                      color: '#fff',
                      padding: '6px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      maxWidth: 260,
                      wordBreak: 'break-word',
                      pointerEvents: 'none',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
                    }}
                  >
                    {block.formula}
                  </div>
                )}

                {/* Порты ввода (слева) */}
                {ports.inputs.length > 0 && (
                  <div style={{ position: 'absolute', left: -10, top: 50 }}>
                    {ports.inputs.map((portId, index) => (
                      <div
                        key={portId}
                        onMouseDown={(e) => handlePortMouseDown(e, block.id, portId, 'input')}
                        onMouseUp={(e) => handlePortMouseUp(e, block.id, portId, 'input')}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#4a9eff',
                          border: '2px solid #fff',
                          marginBottom: 8,
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                        title={portId === NEW_INPUT_PORT ? 'Добавить зависимость' : portId}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            right: 26,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: 10,
                            color: 'var(--pico-muted-color)',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            textAlign: 'right',
                          }}
                        >
                          {portId === NEW_INPUT_PORT ? '+' : portId}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Порты вывода (справа) */}
                {ports.outputs.length > 0 && (
                  <div style={{ position: 'absolute', right: -10, top: 50 }}>
                    {ports.outputs.map((portId, index) => (
                      <div
                        key={portId}
                        onMouseDown={(e) => handlePortMouseDown(e, block.id, portId, 'output')}
                        onMouseUp={(e) => handlePortMouseUp(e, block.id, portId, 'output')}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: '#26de81',
                          border: '2px solid #fff',
                          marginBottom: 8,
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                        title={portId}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 26,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: 10,
                            color: 'var(--pico-muted-color)',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                          }}
                        >
                          {portId}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Содержимое ноды */}
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Label (inline-редактирование) */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={block.label || ''}
                      onChange={(e) => handleFieldChange(block.id, 'label', e.target.value)}
                      onBlur={() => setEditingNode(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingNode(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        fontSize: 13,
                        fontWeight: 500,
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        padding: '4px 6px',
                      }}
                    />
                  ) : (
                    <div
                      style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, color: 'var(--pico-color)', cursor: 'text' }}
                      onDoubleClick={() => canEditLabel && setEditingNode(block.id)}
                    >
                      {block.type === 'formula' ? getFormulaDisplayName(block.id) : (block.label || block.id)}
                    </div>
                  )}

                  {value !== undefined && (
                    <div style={{ fontSize: 11, color: 'var(--pico-muted-color)' }}>
                      = {typeof value === 'object' ? '[Объект]' : String(value)}
                    </div>
                  )}

                  {showDetails && (
                    <>

                      {/* Специфичные поля для типов */}
                      {block.type === 'input' && 'defaultValue' in block && (
                        <input
                          type="number"
                          value={block.defaultValue || 0}
                          onChange={(e) => handleFieldChange(block.id, 'defaultValue', Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%',
                            fontSize: 12,
                            padding: '4px 6px',
                            border: '1px solid var(--pico-form-element-border-color)',
                            borderRadius: 6,
                            marginTop: 2,
                            background: 'var(--pico-form-element-background-color)',
                            color: 'var(--pico-color)',
                          }}
                        />
                      )}

                      {block.type === 'formula' && 'formula' in block && (
                        <textarea
                          value={block.formula || ''}
                          onChange={(e) => handleFieldChange(block.id, 'formula', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="inputA + formula1"
                          rows={3}
                          style={{
                            width: '100%',
                            fontSize: 12,
                            fontFamily: 'monospace',
                            padding: '6px 8px',
                            border: '1px solid var(--pico-form-element-border-color)',
                            borderRadius: 6,
                            marginTop: 2,
                            background: 'var(--pico-form-element-background-color)',
                            color: 'var(--pico-color)',
                            resize: 'vertical',
                          }}
                        />
                      )}

                      {block.type === 'constant' && 'value' in block && (
                        <input
                          type="number"
                          value={block.value || 0}
                          onChange={(e) => handleFieldChange(block.id, 'value', Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%',
                            fontSize: 12,
                            padding: '4px 6px',
                            border: '1px solid var(--pico-form-element-border-color)',
                            borderRadius: 6,
                            marginTop: 2,
                            background: 'var(--pico-form-element-background-color)',
                            color: 'var(--pico-color)',
                          }}
                        />
                      )}

                      {/* Select From Table - выбор значения из таблицы */}
                      {block.type === 'select_from_table' && 'dataSource' in block && (
                        <>
                          <select
                            value={block.dataSource || ''}
                            onChange={(e) => handleFieldChange(block.id, 'dataSource', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '100%',
                              fontSize: 11,
                              padding: '4px 6px',
                              border: '1px solid var(--pico-form-element-border-color)',
                              borderRadius: 6,
                              marginTop: 2,
                              background: 'var(--pico-form-element-background-color)',
                              color: 'var(--pico-color)',
                            }}
                          >
                            <option value="">Выберите таблицу...</option>
                            {blocks.filter((b) => b.type === 'data_table').map((tbl) => (
                              <option key={tbl.id} value={tbl.id}>
                                {tbl.label || tbl.id}
                              </option>
                            ))}
                          </select>

                          {block.dataSource && (() => {
                            const sourceTable = blocks.find((b) => b.id === block.dataSource && b.type === 'data_table');
                            if (!sourceTable || !('columns' in sourceTable)) return null;
                            const columns = sourceTable.columns as string[];
                            const rows = 'rows' in sourceTable ? (sourceTable.rows as Array<Record<string, any>>) : [];
                            const currentColumn = block.column || columns[0] || '';
                            const rawOptions = rows.map((row) => row[currentColumn]);
                            return (
                              <>
                                <select
                                  value={block.column || ''}
                                  onChange={(e) => handleFieldChange(block.id, 'column', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    width: '100%',
                                    fontSize: 11,
                                    padding: '4px 6px',
                                    border: '1px solid var(--pico-form-element-border-color)',
                                    borderRadius: 6,
                                    marginTop: 2,
                                    background: 'var(--pico-form-element-background-color)',
                                    color: 'var(--pico-color)',
                                  }}
                                >
                                  <option value="">Выберите столбец...</option>
                                  {columns.map((col) => (
                                    <option key={col} value={col}>
                                      {col}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  value={String(block.defaultValue ?? '')}
                                  onChange={(e) => {
                                    const parsed = parseCellValue(e.target.value);
                                    handleFieldChange(block.id, 'defaultValue', parsed);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    width: '100%',
                                    fontSize: 11,
                                    padding: '4px 6px',
                                    border: '1px solid var(--pico-form-element-border-color)',
                                    borderRadius: 6,
                                    marginTop: 2,
                                    background: 'var(--pico-form-element-background-color)',
                                    color: 'var(--pico-color)',
                                  }}
                                >
                                  <option value="">Выберите значение...</option>
                                  {rawOptions.map((opt, index) => (
                                    <option key={`${String(opt)}-${index}`} value={String(opt ?? '')}>
                                      {String(opt ?? '')}
                                    </option>
                                  ))}
                                </select>
                              </>
                            );
                          })()}
                        </>
                      )}

                      {/* Table Viewer - просмотр и выбор столбцов таблицы */}
                      {block.type === 'table_viewer' && 'dataSource' in block && (
                        <>
                          <select
                            value={block.dataSource || ''}
                            onChange={(e) => handleFieldChange(block.id, 'dataSource', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '100%',
                              fontSize: 11,
                              padding: '4px 6px',
                              border: '1px solid var(--pico-form-element-border-color)',
                              borderRadius: 6,
                              marginTop: 2,
                              background: 'var(--pico-form-element-background-color)',
                              color: 'var(--pico-color)',
                            }}
                          >
                            <option value="">Выберите таблицу...</option>
                            {blocks.filter((b) => b.type === 'data_table').map((tbl) => (
                              <option key={tbl.id} value={tbl.id}>
                                {tbl.label || tbl.id}
                              </option>
                            ))}
                          </select>
                          
                          {block.dataSource && (() => {
                            const sourceTable = blocks.find((b) => b.id === block.dataSource && b.type === 'data_table');
                            return sourceTable && 'columns' in sourceTable ? (
                              <>
                                <select
                                  value={block.selectedColumn || ''}
                                  onChange={(e) => handleFieldChange(block.id, 'selectedColumn', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    width: '100%',
                                    fontSize: 11,
                                    padding: '4px 6px',
                                    border: '1px solid var(--pico-form-element-border-color)',
                                    borderRadius: 6,
                                    marginTop: 2,
                                    background: 'var(--pico-form-element-background-color)',
                                    color: 'var(--pico-color)',
                                  }}
                                >
                                  <option value="">Выберите столбец...</option>
                                  {(sourceTable.columns as string[]).map((col) => (
                                    <option key={col} value={col}>
                                      {col}
                                    </option>
                                  ))}
                                </select>
                                
                                <div style={{ fontSize: 10, color: 'var(--pico-muted-color)', marginTop: 4 }}>
                                  Столбцов: {(sourceTable.columns as string[]).length} | Строк: {'rows' in sourceTable ? (sourceTable.rows as any[]).length : 0}
                                </div>
                              </>
                            ) : null;
                          })()}
                        </>
                      )}

                      {/* Результат */}
                      {value !== undefined && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: '6px 8px',
                            background: 'var(--pico-code-background-color)',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--pico-color)',
                            fontFamily: 'monospace',
                          }}
                        >
                          = {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </div>
                      )}
                    </>
                  )}

                  {/* Table Range - выбор по диапазону */}
                  {block.type === 'table_range' && 'dataSource' in block && (
                    <>
                      <select
                        value={block.dataSource || ''}
                        onChange={(e) => handleFieldChange(block.id, 'dataSource', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          fontSize: 11,
                          padding: '4px 6px',
                          border: '1px solid var(--pico-form-element-border-color)',
                          borderRadius: 6,
                          marginTop: 2,
                          background: 'var(--pico-form-element-background-color)',
                          color: 'var(--pico-color)',
                        }}
                      >
                        <option value="">Выберите таблицу...</option>
                        {blocks.filter((b) => b.type === 'data_table').map((tbl) => (
                          <option key={tbl.id} value={tbl.id}>
                            {tbl.label || tbl.id}
                          </option>
                        ))}
                      </select>

                      <select
                        value={block.inputId || ''}
                        onChange={(e) => handleFieldChange(block.id, 'inputId', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          fontSize: 11,
                          padding: '4px 6px',
                          border: '1px solid var(--pico-form-element-border-color)',
                          borderRadius: 6,
                          marginTop: 2,
                          background: 'var(--pico-form-element-background-color)',
                          color: 'var(--pico-color)',
                        }}
                      >
                        <option value="">Источник значения...</option>
                        {blocks
                          .filter((b) => b.id !== block.id)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label || b.id}
                            </option>
                          ))}
                      </select>

                      {block.dataSource && (() => {
                        const sourceTable = blocks.find((b) => b.id === block.dataSource && b.type === 'data_table');
                        if (!sourceTable || !('columns' in sourceTable)) return null;
                        const columns = sourceTable.columns as string[];
                        return (
                          <>
                            <select
                              value={block.minColumn || ''}
                              onChange={(e) => handleFieldChange(block.id, 'minColumn', e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '100%',
                                fontSize: 11,
                                padding: '4px 6px',
                                border: '1px solid var(--pico-form-element-border-color)',
                                borderRadius: 6,
                                marginTop: 2,
                                background: 'var(--pico-form-element-background-color)',
                                color: 'var(--pico-color)',
                              }}
                            >
                              <option value="">Min (опционально)</option>
                              {columns.map((col) => (
                                <option key={col} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>

                            <select
                              value={block.maxColumn || ''}
                              onChange={(e) => handleFieldChange(block.id, 'maxColumn', e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '100%',
                                fontSize: 11,
                                padding: '4px 6px',
                                border: '1px solid var(--pico-form-element-border-color)',
                                borderRadius: 6,
                                marginTop: 2,
                                background: 'var(--pico-form-element-background-color)',
                                color: 'var(--pico-color)',
                              }}
                            >
                              <option value="">Max</option>
                              {columns.map((col) => (
                                <option key={col} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>

                            <select
                              value={block.valueColumn || ''}
                              onChange={(e) => handleFieldChange(block.id, 'valueColumn', e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '100%',
                                fontSize: 11,
                                padding: '4px 6px',
                                border: '1px solid var(--pico-form-element-border-color)',
                                borderRadius: 6,
                                marginTop: 2,
                                background: 'var(--pico-form-element-background-color)',
                                color: 'var(--pico-color)',
                              }}
                            >
                              <option value="">Значение</option>
                              {columns.map((col) => (
                                <option key={col} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </div>
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
            maxHeight: '70vh',
            overflowY: 'auto',
            zIndex: 10000,
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#666', borderBottom: '1px solid #eee' }}>
            Создать ноду
          </div>
          {(Object.keys(blockTypeLabels) as BlockType[])
            .filter((type) => type !== 'constant')
            .map((type) => (
            <div
              key={type}
              onClick={() => createBlock(type)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
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
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: blockTypeColors[type],
                }}
              />
              {blockTypeLabels[type]}
            </div>
            ))}
        </div>
      )}

      {/* Формульная справка */}
      <div style={{ position: 'absolute', left: 12, bottom: 52, zIndex: 50 }} onWheel={(e) => e.stopPropagation()}>
        {!showHelp && (
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            style={{
              background: 'var(--pico-card-background-color)',
              color: 'var(--pico-color)',
              border: '1px solid var(--pico-border-color)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Формульная справка
          </button>
        )}
        {showHelp && (
          <div
            style={{
              width: 420,
              maxWidth: 'calc(100vw - 40px)',
              maxHeight: 220,
              overflowY: 'auto',
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'monospace',
              boxShadow: '0 2px 12px #0008',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b>Формульные операции</b>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid #fff5',
                  borderRadius: 4,
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Скрыть
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 8 }}>
              <div>
                <b>Арифметика:</b><br/>
                <span>+</span> — сложение<br/>
                <span>-</span> — вычитание<br/>
                <span>*</span> — умножение<br/>
                <span>/</span> — деление<br/>
                <span>^</span> — степень<br/>
                <span>%</span> — остаток<br/>
              </div>
              <div>
                <b>Округление:</b><br/>
                <span>round(x, n)</span> — округлить<br/>
                <span>roundup(x)</span> — вверх<br/>
                <span>rounddown(x)</span> — вниз<br/>
                <span>floor(x)</span> — вниз<br/>
                <span>ceil(x)</span> — вверх<br/>
              </div>
              <div>
                <b>Функции:</b><br/>
                <span>sqrt(x)</span> — корень<br/>
                <span>abs(x)</span> — модуль<br/>
                <span>min(a, b)</span> — минимум<br/>
                <span>max(a, b)</span> — максимум<br/>
                <span>sum(a, b)</span> — сумма<br/>
                <span>average(a, b)</span> — среднее<br/>
                <span>if(cond, a, b)</span> — условие<br/>
              </div>
              <div>
                <b>Сравнения:</b><br/>
                <span>=</span> — равно<br/>
                <span>&lt;&gt;</span> — не равно<br/>
                <span>&gt;</span> — больше<br/>
                <span>&lt;</span> — меньше<br/>
                <span>&gt;=</span> — больше или равно<br/>
                <span>&lt;=</span> — меньше или равно<br/>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: '#ffd700' }}>
              <b>Библиотека вычислений:</b>{' '}
              <a
                href="https://mathjs.org/docs/expressions/syntax.html"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#ffd700' }}
              >
                math.js
              </a>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: '#aaa' }}>
              💡 ПКМ — создать | ЛКМ — выбрать | 2× клик — редактировать | Порты — соединить | Shift+ЛКМ — панорамирование
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default DynamoNodeEditor;
