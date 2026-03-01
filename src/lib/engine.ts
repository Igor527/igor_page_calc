// Расчетный движок для калькулятора на базе math.js
// Функция recalculateValues принимает массив блоков и текущие вводы, возвращает обновленный объект values

import { evaluate } from 'mathjs';
import { getFormulaErrorMessage } from './errors';
import { normalizeTableData } from './tableData';
import type {
  Block,
  InputBlock,
  FormulaBlock,
  ConstantBlock,
  TableLookupBlock,
  TableRangeBlock,
  ConditionBlock,
  DataTableBlock,
  SelectFromTableBlock,
  SelectFromObjectBlock
} from '../types/blocks';

// Округление вверх/вниз в стиле Excel
function roundUp(value: number, digits = 0): number {
  const factor = Math.pow(10, digits);
  if (value >= 0) return Math.ceil(value * factor) / factor;
  return Math.floor(value * factor) / factor;
}

function roundDown(value: number, digits = 0): number {
  const factor = Math.pow(10, digits);
  if (value >= 0) return Math.floor(value * factor) / factor;
  return Math.ceil(value * factor) / factor;
}

function buildFormulaScope(values: Record<string, number | string>) {
  const scope: Record<string, any> = { ...values };
  // Удаляем ошибки из scope
  Object.keys(scope).forEach(key => {
    if (typeof scope[key] === 'string' && (scope[key].startsWith('Ошибка') || scope[key].startsWith('ERROR:'))) {
      delete scope[key];
    }
  });
  scope.roundup = roundUp;
  scope.rounddown = roundDown;
  scope.round = (x: number) => (typeof x === 'number' && isFinite(x) ? Math.round(x) : x);
  // МГН увеличенных размеров по №945-ПП (ступенчато от общего числа мест)
  scope.mgnEnlarged = (totalPlaces: number) => {
    const n = typeof totalPlaces === 'number' && isFinite(totalPlaces) ? Number(totalPlaces) : 0;
    if (n <= 100) return Math.ceil(n * 0.05);
    if (n <= 200) return 5 + Math.ceil((n - 100) * 0.03);
    if (n <= 500) return 8 + Math.ceil((n - 200) * 0.02);
    return 14 + Math.ceil((n - 500) * 0.01);
  };
  return scope;
}

function normalizeLookupValue(value: any): any {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
    return trimmed;
  }
  return value;
}

export function recalculateValues(
  blocks: Block[],
  inputs: Record<string, number | string>
): Record<string, number | string> {
  // Значения по id
  const values: Record<string, number | string> = { ...inputs };

  // 1. INPUT и CONSTANT
  for (const block of blocks) {
    if (block.type === 'input') {
      // Значение уже в inputs, либо defaultValue
      if (values[block.id] === undefined && (block as InputBlock).defaultValue !== undefined) {
        values[block.id] = (block as InputBlock).defaultValue!;
      }
    }
    if (block.type === 'constant') {
      values[block.id] = (block as ConstantBlock).value;
    }
  }

  // 2. DATA_TABLE (инициализация таблиц для доступа)
  const tables: Record<string, DataTableBlock> = {};
  for (const block of blocks) {
    if (block.type === 'data_table') {
      const table = block as DataTableBlock;
      const normalized = normalizeTableData(table);
      const normalizedTable: DataTableBlock = {
        ...table,
        columns: normalized.columns,
        rows: normalized.rows,
      };
      // Ограничиваем таблицу до 500 строк для производительности
      if (Array.isArray(normalizedTable.rows) && normalizedTable.rows.length > 500) {
        console.warn(`⚠️ Таблица "${table.id}" содержит ${normalizedTable.rows.length} строк. Используются только первые 500 строк.`);
        tables[block.id] = { ...normalizedTable, rows: normalizedTable.rows.slice(0, 500) } as DataTableBlock;
      } else {
        tables[block.id] = normalizedTable;
      }
      // Таблицы доступны в формулах через их id
    }
  }

  // 3. SELECT_FROM_TABLE (выбор значения из таблицы)
  for (const block of blocks) {
    if (block.type === 'select_from_table') {
      const sel = block as SelectFromTableBlock;
      const table = tables[sel.dataSource];
      if (!table || !table.rows) {
        values[block.id] = 'ERROR: Таблица не найдена для выбора';
        continue;
      }
      if (!table.columns || !table.columns.includes(sel.column)) {
        values[block.id] = `ERROR: Столбец "${sel.column}" не найден в таблице`;
        continue;
      }
      if (table && table.rows) {
        // Получаем выбранное значение (из inputs или defaultValue)
        const hasErrorValue = typeof values[block.id] === 'string'
          && (values[block.id] as string).startsWith('ERROR:');
        const selectedValue = values[block.id] !== undefined && !hasErrorValue
          ? values[block.id]
          : (sel.defaultValue !== undefined ? sel.defaultValue : '');
        
        // Применяем фильтр если есть
        let filteredRows = table.rows;
        if (sel.filter) {
          filteredRows = table.rows.filter((row: any) => {
            return Object.entries(sel.filter!).every(([col, val]) => row[col] === val);
          });
        }

        // Применяем диапазон строк (1-based)
        if (sel.rowRange && (sel.rowRange.start !== undefined || sel.rowRange.end !== undefined)) {
          const start = sel.rowRange.start ?? 1;
          const end = sel.rowRange.end ?? filteredRows.length;
          filteredRows = filteredRows.filter((_, idx: number) => {
            const rowIndex = idx + 1;
            return rowIndex >= start && rowIndex <= end;
          });
        }
        
        // Применяем диапазон если есть
        if (sel.range) {
          filteredRows = filteredRows.filter((row: any) => {
            const val = row[sel.column];
            const num = typeof val === 'number' ? val : parseFloat(String(val));
            if (isNaN(num)) return true;
            if (sel.range!.min !== undefined && num < sel.range!.min) return false;
            if (sel.range!.max !== undefined && num > sel.range!.max) return false;
            return true;
          });
        }

        // Сортировка
        if (sel.sortBy) {
          const dir = sel.sortDirection === 'desc' ? -1 : 1;
          filteredRows = [...filteredRows].sort((a: any, b: any) => {
            const av = a[sel.sortBy!];
            const bv = b[sel.sortBy!];
            if (av === bv) return 0;
            if (av === undefined) return 1;
            if (bv === undefined) return -1;
            return (av > bv ? 1 : -1) * dir;
          });
        }
        
        const rawOptions = filteredRows.map((row: any) => row[sel.column]);
        if (rawOptions.length === 0) {
          values[block.id] = 'ERROR: Нет доступных значений для выбора';
          continue;
        }
        
        // Если значение не установлено или недоступно, используем defaultValue или первое доступное
        const normalizedSelected = selectedValue === '' ? undefined : selectedValue;
        const normalizedOpt = (v: any) => normalizeLookupValue(v);
        const hasSelected = normalizedSelected !== undefined && rawOptions.some(
          (o: any) => normalizedOpt(o) === normalizedOpt(normalizedSelected)
        );
        const matchedOption = hasSelected ? rawOptions.find((o: any) => normalizedOpt(o) === normalizedOpt(normalizedSelected)) : undefined;
        if (hasSelected && matchedOption !== undefined) {
          values[block.id] = matchedOption;
        } else if (sel.defaultValue !== undefined) {
          values[block.id] = sel.defaultValue as any;
        } else if (rawOptions.length > 0) {
          values[block.id] = rawOptions[0] as any;
        }
      }
    }
  }

  // 4. SELECT_FROM_OBJECT (выбор значения из объекта)
  for (const block of blocks) {
    if (block.type === 'select_from_object') {
      const sel = block as SelectFromObjectBlock;
      const sourceBlock = blocks.find(b => b.id === sel.objectSource);
      if (sourceBlock && sourceBlock.type === 'constant') {
        const obj = (sourceBlock as ConstantBlock).value;
        // Если объект - это JSON строка, парсим её
        if (typeof obj === 'string') {
          try {
            const parsed = JSON.parse(obj);
            if (typeof parsed === 'object' && parsed !== null) {
              const keys = Object.keys(parsed);
              if (values[block.id] === undefined && keys.length > 0) {
                values[block.id] = sel.defaultValue !== undefined ? sel.defaultValue : keys[0];
              }
            }
          } catch {
            // Не JSON, игнорируем
          }
        }
      }
    }
  }

  // 5. TABLE_LOOKUP
  for (const block of blocks) {
    if (block.type === 'table_lookup') {
      const tbl = block as TableLookupBlock;
      if ((!tbl.dataSource || !tbl.dataSource.trim()) && (!Array.isArray(tbl.data) || tbl.data.length === 0)) {
        values[block.id] = '';
        continue;
      }
      let key = tbl.selected_key;
      if (typeof key === 'string' && values[key] !== undefined) {
        const resolved = values[key] as any;
        if (typeof resolved === 'string' && (resolved.startsWith('Ошибка') || resolved.startsWith('ERROR:'))) {
          values[block.id] = 'ERROR: Ключ содержит ошибку';
          continue;
        }
        key = resolved;
      }
      let targetCol = tbl.target_col;
      if (typeof targetCol === 'string' && values[targetCol] !== undefined) {
        const value = values[targetCol];
        if (typeof value === 'string' && value.trim()) {
          targetCol = value;
        }
      }
      // K2: по образцу столбец по ТТК (inside/outside); если не выбран — по умолчанию outside
      const isK2Lookup = block.id === 'k2Lookup';
      if (isK2Lookup && (targetCol === 'selectTtk' || !targetCol)) {
        targetCol = 'outside';
      }
      let data: any[] = Array.isArray(tbl.data) ? tbl.data : [];
      if (data.length === 0 && tbl.dataSource && tables[tbl.dataSource]) {
        data = tables[tbl.dataSource].rows as any[];
      }
      if (!Array.isArray(data) || data.length === 0) {
        values[block.id] = 'ERROR: Таблица пуста или не найдена';
        continue;
      }
      if (key === undefined || key === null || key === '') {
        values[block.id] = '';
        continue;
      }
      if (!tbl.key_col || !tbl.target_col) {
        values[block.id] = 'ERROR: Не заданы ключевой или целевой столбец';
        continue;
      }
      // data: массив объектов
      const normalizedKey = normalizeLookupValue(key);
      const found = Array.isArray(data)
        ? data.find((row: any) => normalizeLookupValue(row[tbl.key_col]) === normalizedKey)
        : undefined;
      if (!found) {
        if (isK2Lookup) {
          values[block.id] = 0.9;
        } else {
          values[block.id] = 'ERROR: Значение по ключу не найдено';
        }
        continue;
      }
      if (found[targetCol] === undefined) {
        if (isK2Lookup && (found['outside'] !== undefined || found['inside'] !== undefined)) {
          targetCol = found['outside'] !== undefined ? 'outside' : 'inside';
        } else {
          values[block.id] = 'ERROR: Целевой столбец не найден';
          continue;
        }
      }
      values[block.id] = found ? found[targetCol] : '';
    }
  }

  // 5.5 TABLE_RANGE
  for (const block of blocks) {
    if (block.type === 'table_range') {
      const tbl = block as TableRangeBlock;
      const table = tables[tbl.dataSource];
      const inputValue = values[tbl.inputId];
      if (!table) {
        values[block.id] = 'ERROR: Таблица диапазонов не найдена';
        continue;
      }
      if (inputValue === undefined) {
        values[block.id] = 'ERROR: Входное значение для диапазона не задано';
        continue;
      }
      const rows = table.rows as Array<Record<string, any>>;
      const needle = Number(inputValue);
      if (!Number.isFinite(needle)) {
        values[block.id] = 'ERROR: Входное значение не является числом';
        continue;
      }
      if (!tbl.maxColumn || !tbl.valueColumn) {
        values[block.id] = 'ERROR: Не заданы колонки диапазона';
        continue;
      }
      const found = rows.find((row) => {
        const minVal = tbl.minColumn ? Number(row[tbl.minColumn]) : Number.NEGATIVE_INFINITY;
        const maxVal = Number(row[tbl.maxColumn]);
        if (!Number.isFinite(maxVal)) return false;
        if (!Number.isFinite(minVal)) return false;
        return needle >= minVal && needle <= maxVal;
      });
      if (!found) {
        values[block.id] = 'ERROR: Диапазон не найден';
        continue;
      }
      if (found[tbl.valueColumn] === undefined) {
        values[block.id] = 'ERROR: Колонка результата не найдена';
        continue;
      }
      values[block.id] = found ? found[tbl.valueColumn] : (tbl.fallbackValue ?? '');
    }
  }

  const hasBlockingErrors = Object.values(values).some(
    (val) => typeof val === 'string' && (val.startsWith('Ошибка') || val.startsWith('ERROR:'))
  );
  if (hasBlockingErrors) {
    return values;
  }
  
  // Также поддерживаем доступ к таблицам через синтаксис tableId[rowIndex][columnName]
  // Это будет работать в формулах через math.js
  for (const [tableId, table] of Object.entries(tables)) {
    if (table.rows && table.rows.length > 0) {
      // Делаем таблицу доступной в формулах
      values[tableId] = table.rows as any;
    }
  }

  // 6. CONDITION (логика: если if_exp true, то then_id, иначе else_id)
  for (const block of blocks) {
    if (block.type === 'condition') {
      const cond = block as ConditionBlock;
      let result = false;
      try {
        // Фильтруем ошибки из scope
        const scope = { ...values };
        Object.keys(scope).forEach(key => {
          if (typeof scope[key] === 'string' && (scope[key].startsWith('Ошибка') || scope[key].startsWith('ERROR:'))) {
            delete scope[key];
          }
        });
        result = Boolean(evaluate(cond.if_exp, buildFormulaScope(values)));
      } catch (e) {
        values[block.id] = `ERROR: Ошибка в условии: ${getFormulaErrorMessage(e, block.id, cond.if_exp)}`;
        continue;
      }
      const id = result ? cond.then_id : cond.else_id;
      if (values[id] === undefined) {
        values[block.id] = `ERROR: Блок "${id}" не найден`;
      } else {
        values[block.id] = values[id];
      }
    }
  }

  // 7. FORMULA (реактивно, с учетом зависимостей)
  const formulaBlocks = blocks.filter(b => b.type === 'formula') as FormulaBlock[];
  let changed = true;
  let iterations = 0;
  const formulaErrors: Record<string, string> = {};
  
  while (changed && iterations < 10) {
    changed = false;
    for (const block of formulaBlocks) {
      // Проверяем, что все зависимости доступны и не являются ошибками
      const missingDeps = block.dependencies.filter(dep => values[dep] === undefined);
      const errorDeps = block.dependencies.filter(dep => {
        const val = values[dep];
        return typeof val === 'string' && (val.startsWith('Ошибка') || val.startsWith('ERROR:'));
      });
      
      if (missingDeps.length > 0) {
        const errorMsg = `Недостающие зависимости: ${missingDeps.join(', ')}`;
        values[block.id] = `ERROR: ${errorMsg}`;
        formulaErrors[block.id] = errorMsg;
        continue;
      }
      
      if (errorDeps.length > 0) {
        const errorMsg = `Зависимости содержат ошибки: ${errorDeps.join(', ')}`;
        values[block.id] = `ERROR: ${errorMsg}`;
        formulaErrors[block.id] = errorMsg;
        continue;
      }
      
      if (block.dependencies.every(dep => values[dep] !== undefined)) {
        try {
          const result = evaluate(block.formula, buildFormulaScope(values));
          
          // Проверяем, что результат валидный
          if (result === null || result === undefined || (typeof result === 'number' && !isFinite(result))) {
            throw new Error('Результат формулы не является валидным числом');
          }
          
          if (values[block.id] !== result) {
            values[block.id] = result;
            changed = true;
            // Удаляем ошибку, если формула теперь работает
            delete formulaErrors[block.id];
          }
        } catch (e) {
          const errorMsg = getFormulaErrorMessage(e, block.id, block.formula);
          values[block.id] = `ERROR: ${errorMsg}`;
          formulaErrors[block.id] = errorMsg;
        }
      }
    }
    iterations++;
  }
  
  // Предупреждение о превышении лимита итераций
  if (iterations >= 10 && changed) {
    console.warn('⚠️ Достигнут лимит итераций при пересчёте формул. Возможны циклические зависимости.');
  }

  // 8. OUTPUT (просто копирует значение из sourceId)
  for (const block of blocks) {
    if (block.type === 'output' && 'sourceId' in block) {
      values[block.id] = values[(block as any).sourceId];
    }
  }

  return values;
}

// Для работы требуется mathjs: npm install mathjs
// Функция безопасно пересчитывает значения всех формул, учитывая зависимости и ввод пользователя.