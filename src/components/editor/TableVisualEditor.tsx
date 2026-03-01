import React, { useState, useMemo } from 'react';
import type { DataTableBlock } from '@/types/blocks';
import { normalizeTableData } from '@/lib/tableData';

interface TableVisualEditorProps {
  table: DataTableBlock | null;
  selectedColumn?: string | null;
  selectedRow?: number | null;
  onColumnSelect?: (column: string) => void;
  onRowSelect?: (rowIndex: number) => void;
  highlightKeyColumn?: string | null;
  highlightTargetColumn?: string | null;
  highlightKeyValue?: string | number | null;
}

const TableVisualEditor: React.FC<TableVisualEditorProps> = ({
  table,
  selectedColumn,
  selectedRow,
  onColumnSelect,
  onRowSelect,
  highlightKeyColumn,
  highlightTargetColumn,
  highlightKeyValue,
}) => {
  const normalized = useMemo(() => {
    if (!table) return null;
    return normalizeTableData(table);
  }, [table]);

  if (!table || !normalized || normalized.columns.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        Выберите таблицу для просмотра
      </div>
    );
  }

  const columns = normalized.columns;
  const rows = normalized.rows;

  return (
    <div style={{ 
      border: '1px solid var(--pico-border-color)', 
      borderRadius: 8, 
      overflow: 'auto',
      maxHeight: 400,
      background: 'var(--pico-card-background-color)'
    }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        fontSize: 13,
      }}>
        <thead>
          <tr style={{ background: 'var(--pico-code-background-color)', position: 'sticky', top: 0, zIndex: 10 }}>
            {columns.map((col, colIdx) => {
              const isSelected = selectedColumn === col;
              const isKeyColumn = highlightKeyColumn === col;
              const isTargetColumn = highlightTargetColumn === col;
              
              return (
                <th
                  key={col}
                  onClick={() => onColumnSelect?.(col)}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    border: '1px solid var(--pico-border-color)',
                    cursor: onColumnSelect ? 'pointer' : 'default',
                    background: isTargetColumn 
                      ? 'var(--pico-primary-background)' 
                      : isKeyColumn 
                      ? 'var(--color-warning-bg)' 
                      : isSelected 
                      ? 'var(--color-success-bg)' 
                      : 'var(--pico-code-background-color)',
                    fontWeight: isSelected || isKeyColumn || isTargetColumn ? 600 : 400,
                    color: 'var(--pico-color)',
                    borderBottom: '2px solid var(--pico-border-color)',
                    position: 'relative',
                  }}
                  title={isKeyColumn ? 'Ключевой столбец' : isTargetColumn ? 'Целевой столбец' : isSelected ? 'Выбранный столбец' : 'Нажмите для выбора'}
                >
                  {col}
                  {isKeyColumn && <span style={{ marginLeft: 4, fontSize: 10 }}>🔑</span>}
                  {isTargetColumn && <span style={{ marginLeft: 4, fontSize: 10 }}>🎯</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const isSelected = selectedRow === rowIdx;
            const isHighlighted = highlightKeyValue !== null && highlightKeyColumn && 
              String(row[highlightKeyColumn]) === String(highlightKeyValue);
            
            return (
              <tr
                key={rowIdx}
                onClick={() => onRowSelect?.(rowIdx)}
                style={{
                  background: isHighlighted 
                    ? 'var(--color-warning-bg)' 
                    : isSelected 
                    ? 'var(--color-success-bg)' 
                    : rowIdx % 2 === 0 
                    ? 'var(--pico-card-background-color)' 
                    : 'var(--pico-code-background-color)',
                  cursor: onRowSelect ? 'pointer' : 'default',
                  borderBottom: '1px solid var(--pico-border-color)',
                  color: 'var(--pico-color)',
                }}
              >
                {columns.map((col) => {
                  const isKeyColumn = highlightKeyColumn === col;
                  const isTargetColumn = highlightTargetColumn === col;
                  const cellValue = row[col];
                  
                  return (
                    <td
                      key={col}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid var(--pico-border-color)',
                        background: isTargetColumn && isHighlighted
                          ? 'var(--color-success-bg)'
                          : isTargetColumn
                          ? 'var(--pico-primary-background)'
                          : isKeyColumn && isHighlighted
                          ? 'var(--color-warning-bg)'
                          : isKeyColumn
                          ? 'var(--color-warning-bg)'
                          : 'transparent',
                        fontWeight: isTargetColumn && isHighlighted ? 600 : 400,
                        color: 'var(--pico-color)',
                      }}
                    >
                      {cellValue !== undefined && cellValue !== null ? String(cellValue) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ 
        padding: '8px 12px', 
        background: 'var(--pico-code-background-color)', 
        borderTop: '1px solid var(--pico-border-color)',
        fontSize: 12,
        color: 'var(--pico-muted-color)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>Столбцов: {columns.length} | Строк: {rows.length}</span>
        {highlightKeyColumn && (
          <span style={{ marginLeft: 12 }}>
            🔑 Ключ: {highlightKeyColumn}
            {highlightTargetColumn && <span style={{ marginLeft: 8 }}>🎯 Результат: {highlightTargetColumn}</span>}
          </span>
        )}
      </div>
    </div>
  );
};

export default TableVisualEditor;
