import React from 'react';
import { useCalcStore } from '@/lib/store';
import TableVisualEditor from './TableVisualEditor';
import type { Block, DataTableBlock, FormulaBlock, TableLookupBlock } from '@/types/blocks';
import { normalizeTableData } from '@/lib/tableData';

interface DataVisualizationProps {
  selectedId: string | null;
}

const DataVisualization: React.FC<DataVisualizationProps> = ({ selectedId }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const values = useCalcStore((s) => s.values);

  if (!selectedId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--pico-muted-color)' }}>
        Выберите ноду для просмотра данных
      </div>
    );
  }

  const block = blocks.find((b) => b.id === selectedId);
  if (!block) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--pico-muted-color)' }}>
        Нода не найдена
      </div>
    );
  }

  // Для таблиц - показываем визуальный редактор
  if (block.type === 'data_table') {
    return (
      <div style={{ padding: 16, background: 'var(--pico-card-background-color)', color: 'var(--pico-color)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--pico-color)' }}>
          Визуализация таблицы: {block.label || block.id}
        </div>
        <TableVisualEditor table={block as DataTableBlock} />
      </div>
    );
  }

  // Для lookup блоков - показываем таблицу с выделением
  if (block.type === 'table_lookup') {
    const lookupBlock = block as TableLookupBlock;
    const sourceTable = lookupBlock.dataSource
      ? (blocks.find((b) => b.id === lookupBlock.dataSource && b.type === 'data_table') as DataTableBlock | undefined)
      : null;

    if (!sourceTable) {
      return (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--pico-muted-color)' }}>
          Выберите источник таблицы в настройках
        </div>
      );
    }

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
      <div style={{ padding: 16, background: 'var(--pico-card-background-color)', color: 'var(--pico-color)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--pico-color)' }}>
          Визуализация lookup: {block.label || block.id}
        </div>
        <div style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 8 }}>
          Источник: {sourceTable.label || sourceTable.id}
        </div>
        <TableVisualEditor
          table={sourceTable}
          highlightKeyColumn={lookupBlock.key_col || null}
          highlightTargetColumn={lookupBlock.target_col || null}
          highlightKeyValue={keyValue}
        />
      </div>
    );
  }

  // Для формул - показываем формулу и зависимости
  if (block.type === 'formula') {
    const formulaBlock = block as FormulaBlock;
    const formulaValue = values[block.id];
    const hasError = typeof formulaValue === 'string' && (formulaValue.startsWith('ERROR:') || formulaValue.startsWith('Ошибка'));

    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Формула: {block.label || block.id}
        </div>
        <div
          style={{
            padding: 12,
            background: hasError ? 'var(--pico-background-warning)' : 'var(--pico-background-info)',
            borderRadius: 6,
            border: `1px solid ${hasError ? 'var(--pico-color-yellow-500)' : 'var(--pico-color-blue-500)'}`,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 4 }}>Формула:</div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              color: hasError ? 'var(--pico-color-yellow-700)' : 'var(--pico-color-blue-700)',
              fontWeight: 500,
              wordBreak: 'break-word',
            }}
          >
            {formulaBlock.formula || '—'}
          </div>
        </div>
        {formulaBlock.dependencies && formulaBlock.dependencies.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 4 }}>Зависимости:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {formulaBlock.dependencies.map((depId) => {
                const depBlock = blocks.find((b) => b.id === depId);
                const depValue = values[depId];
                return (
                  <div
                    key={depId}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--pico-card-background-color)',
                      border: '1px solid var(--pico-border-color)',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    {depBlock?.label || depId}: <strong>{String(depValue ?? '—')}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 4 }}>Результат:</div>
          <div
            style={{
              padding: 12,
              background: hasError ? 'var(--pico-background-warning)' : 'var(--pico-background-success)',
              borderRadius: 6,
              border: `1px solid ${hasError ? 'var(--pico-color-yellow-500)' : 'var(--pico-color-green-500)'}`,
              fontSize: 16,
              fontWeight: 600,
              color: hasError ? 'var(--pico-color-yellow-700)' : 'var(--pico-color-green-700)',
            }}
          >
            {hasError ? 'Ошибка вычисления' : String(formulaValue ?? '—')}
          </div>
        </div>
      </div>
    );
  }

  // Для других типов - показываем значение
  const blockValue = values[block.id];
  if (blockValue !== undefined) {
    return (
      <div style={{ padding: 16, background: 'var(--pico-card-background-color)', color: 'var(--pico-color)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--pico-color)' }}>
          Значение: {block.label || block.id}
        </div>
        <div
          style={{
            padding: 12,
            background: 'var(--pico-card-background-color)',
            borderRadius: 6,
            border: '1px solid var(--pico-border-color)',
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          {String(blockValue)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, textAlign: 'center', color: 'var(--pico-muted-color)' }}>
      Нет данных для отображения
    </div>
  );
};

export default DataVisualization;
