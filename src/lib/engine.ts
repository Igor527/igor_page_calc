// Расчетный движок для калькулятора на базе math.js
// Функция recalculateValues принимает массив блоков и текущие вводы, возвращает обновленный объект values

import { evaluate } from 'mathjs';
import { getFormulaErrorMessage } from './errors';
import type {
  Block,
  InputBlock,
  FormulaBlock,
  ConstantBlock,
  TableLookupBlock,
  ConditionBlock,
  DataTableBlock,
  SelectFromTableBlock,
  SelectFromObjectBlock
} from '../types/blocks';

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
      // Ограничиваем таблицу до 500 строк для производительности
      if (Array.isArray(table.rows) && table.rows.length > 500) {
        console.warn(`⚠️ Таблица "${table.id}" содержит ${table.rows.length} строк. Используются только первые 500 строк.`);
        tables[block.id] = { ...table, rows: table.rows.slice(0, 500) } as DataTableBlock;
      } else {
        tables[block.id] = table;
      }
      // Таблицы доступны в формулах через их id
    }
  }

  // 3. SELECT_FROM_TABLE (выбор значения из таблицы)
  for (const block of blocks) {
    if (block.type === 'select_from_table') {
      const sel = block as SelectFromTableBlock;
      const table = tables[sel.dataSource];
      if (table && table.rows) {
        // Получаем выбранное значение (из inputs или defaultValue)
        const selectedValue = values[block.id] !== undefined 
          ? values[block.id] 
          : (sel.defaultValue !== undefined ? sel.defaultValue : '');
        
        // Применяем фильтр если есть
        let filteredRows = table.rows;
        if (sel.filter) {
          filteredRows = table.rows.filter((row: any) => {
            return Object.entries(sel.filter!).every(([col, val]) => row[col] === val);
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
        
        // Формируем опции из столбцов
        const options = filteredRows.map((row: any) => {
          if (sel.multipleColumns && sel.multipleColumns.length > 0) {
            return sel.multipleColumns.map(col => row[col]).join(' ');
          }
          return String(row[sel.column] || '');
        });
        
        // Если значение не установлено, используем первое доступное
        if (values[block.id] === undefined && options.length > 0) {
          values[block.id] = options[0];
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
      const key = tbl.selected_key;
      // data: массив объектов
      const found = Array.isArray(tbl.data)
        ? tbl.data.find((row: any) => row[tbl.key_col] === key)
        : undefined;
      values[block.id] = found ? found[tbl.target_col] : '';
    }
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
        result = Boolean(evaluate(cond.if_exp, scope));
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
          const scope = { ...values };
          // Фильтруем ошибки из scope
          Object.keys(scope).forEach(key => {
            if (typeof scope[key] === 'string' && (scope[key].startsWith('Ошибка') || scope[key].startsWith('ERROR:'))) {
              delete scope[key];
            }
          });
          
          const result = evaluate(block.formula, scope);
          
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