// Компонент для визуального отображения зависимостей между блоками

import React, { useMemo } from 'react';
import type { Block, FormulaBlock } from '@/types/blocks';

interface DependencyGraphProps {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const DependencyGraph: React.FC<DependencyGraphProps> = ({ blocks, selectedId, onSelect }) => {
  // Строим граф зависимостей
  const graph = useMemo(() => {
    const nodes: Record<string, { block: Block; dependencies: string[]; dependents: string[] }> = {};
    
    // Инициализация узлов
    blocks.forEach(block => {
      nodes[block.id] = {
        block,
        dependencies: [],
        dependents: [],
      };
    });
    
    // Заполняем зависимости
    blocks.forEach(block => {
      if (block.type === 'formula') {
        const formula = block as FormulaBlock;
        if (Array.isArray(formula.dependencies)) {
          formula.dependencies.forEach(depId => {
            if (nodes[depId]) {
              nodes[block.id].dependencies.push(depId);
              nodes[depId].dependents.push(block.id);
            }
          });
        }
      }
      
      if (block.type === 'output' && 'sourceId' in block) {
        const sourceId = block.sourceId;
        if (nodes[sourceId]) {
          nodes[block.id].dependencies.push(sourceId);
          nodes[sourceId].dependents.push(block.id);
        }
      }
      
      if (block.type === 'condition') {
        if ('then_id' in block && nodes[block.then_id]) {
          nodes[block.id].dependencies.push(block.then_id);
          nodes[block.then_id].dependents.push(block.id);
        }
        if ('else_id' in block && nodes[block.else_id]) {
          nodes[block.id].dependencies.push(block.else_id);
          nodes[block.else_id].dependents.push(block.id);
        }
      }
      
      if (block.type === 'select_from_table' && 'dataSource' in block) {
        const dataSource = (block as any).dataSource;
        if (nodes[dataSource]) {
          nodes[block.id].dependencies.push(dataSource);
          nodes[dataSource].dependents.push(block.id);
        }
      }
    });
    
    return nodes;
  }, [blocks]);
  
  // Получаем зависимости и зависимые для выбранного блока
  const selectedNode = selectedId ? graph[selectedId] : null;
  
  if (!selectedId || !selectedNode) {
    return (
      <div style={{ padding: 12, color: '#888', fontSize: 13 }}>
        Выберите блок, чтобы увидеть его зависимости
      </div>
    );
  }
  
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
        Зависимости блока "{selectedNode.block.label || selectedId}"
      </div>
      
      {selectedNode.dependencies.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 500 }}>
            Зависит от ({selectedNode.dependencies.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedNode.dependencies.map(depId => {
              const depBlock = blocks.find(b => b.id === depId);
              if (!depBlock) return null;
              return (
                <div
                  key={depId}
                  onClick={() => onSelect(depId)}
                  style={{
                    padding: '6px 10px',
                    background: '#e3f2fd',
                    border: '1px solid #90caf9',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#bbdefb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#e3f2fd';
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{depBlock.label || depId}</span>
                  <span style={{ color: '#666', marginLeft: 8 }}>({depBlock.type})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {selectedNode.dependents.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 500 }}>
            Используется в ({selectedNode.dependents.length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedNode.dependents.map(depId => {
              const depBlock = blocks.find(b => b.id === depId);
              if (!depBlock) return null;
              return (
                <div
                  key={depId}
                  onClick={() => onSelect(depId)}
                  style={{
                    padding: '6px 10px',
                    background: '#f3e5f5',
                    border: '1px solid #ce93d8',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e1bee7';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3e5f5';
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{depBlock.label || depId}</span>
                  <span style={{ color: '#666', marginLeft: 8 }}>({depBlock.type})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {selectedNode.dependencies.length === 0 && selectedNode.dependents.length === 0 && (
        <div style={{ color: '#888', fontSize: 12 }}>
          Этот блок не имеет зависимостей
        </div>
      )}
    </div>
  );
};

export default DependencyGraph;
