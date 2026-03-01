// Утилиты для нормализации таблиц (поддержка матрицы и объектов)

import type { DataTableBlock } from '@/types/blocks';

export interface NormalizedTableData {
  columns: string[];
  rows: Array<Record<string, number | string>>;
}

export function toMatrixTableBlock(table: DataTableBlock): DataTableBlock {
  const rawRows = Array.isArray(table.rows) ? table.rows : [];
  const columnsFromBlock = Array.isArray(table.columns) ? table.columns : [];
  const hasMatrixRows = rawRows.length > 0 && rawRows.every((row) => Array.isArray(row));
  let dataRows = rawRows as Array<Array<string | number>>;

  if (hasMatrixRows && columnsFromBlock.length > 0) {
    const header = rawRows[0] as Array<string | number>;
    const headerMatches = header.length === columnsFromBlock.length
      && header.every((cell, idx) => String(cell ?? '') === String(columnsFromBlock[idx] ?? ''));
    dataRows = headerMatches ? (rawRows.slice(1) as Array<Array<string | number>>) : (rawRows as Array<Array<string | number>>);
  }

  const normalized = normalizeTableData(table);
  const columns = normalized.columns;
  if (columns.length === 0) {
    return { ...table, rows: rawRows };
  }

  const matrixRows: Array<Array<string | number>> = [columns];
  const rowsFromNormalized = normalized.rows.map((row) => columns.map((col) => row[col] ?? ''));
  const rowsToUse = hasMatrixRows && columnsFromBlock.length > 0 ? dataRows : rowsFromNormalized;
  matrixRows.push(...rowsToUse);

  const { columns: _columns, ...rest } = table;
  return {
    ...rest,
    rows: matrixRows,
  } as DataTableBlock;
}

export function normalizeTableData(table: DataTableBlock): NormalizedTableData {
  const rawRows = Array.isArray(table.rows) ? table.rows : [];
  const columnsFromBlock = Array.isArray(table.columns) ? table.columns : [];
  const hasMatrixRows = rawRows.length > 0 && rawRows.every((row) => Array.isArray(row));
  const hasObjectRows = rawRows.length > 0 && rawRows.every((row) => row && typeof row === 'object' && !Array.isArray(row));

  if (hasMatrixRows) {
    const header = (!columnsFromBlock.length && Array.isArray(rawRows[0])) ? rawRows[0] as Array<string | number> : [];
    const columns = (columnsFromBlock.length ? columnsFromBlock : header.map((cell) => String(cell ?? ''))).filter(Boolean);
    const dataRows = columnsFromBlock.length ? rawRows as Array<Array<string | number>> : rawRows.slice(1) as Array<Array<string | number>>;
    const rows = dataRows.map((row) => {
      const record: Record<string, number | string> = {};
      columns.forEach((col, idx) => {
        record[col] = (row?.[idx] ?? '') as any;
      });
      return record;
    });
    return { columns, rows };
  }

  if (hasObjectRows) {
    const rows = rawRows as Array<Record<string, number | string>>;
    const columns = columnsFromBlock.length ? columnsFromBlock : Object.keys(rows[0] || {});
    const normalizedRows = rows.map((row) => {
      const record: Record<string, number | string> = {};
      columns.forEach((col) => {
        record[col] = row[col] ?? '';
      });
      return record;
    });
    return { columns, rows: normalizedRows };
  }

  return { columns: columnsFromBlock, rows: [] };
}
