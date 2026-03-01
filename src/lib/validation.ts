// Валидация схемы калькулятора: проверка блоков, зависимостей, обязательных полей

import type { Block, InputBlock, FormulaBlock, DataTableBlock, SelectFromTableBlock, ImageBlock, TableRangeBlock, TableLookupBlock } from '../types/blocks';
import { isValidBlockId, isValidFormula, isValidUrl } from './security';
import { normalizeTableData } from './tableData';

export interface ValidationError {
  blockId: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Валидирует массив блоков
 */
export function validateBlocks(blocks: Block[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const blockIds = new Set<string>();
  
  // Проверка 1: Уникальность ID
  for (const block of blocks) {
    if (!block.id) {
      errors.push({
        blockId: 'unknown',
        field: 'id',
        message: 'Блок без ID',
      });
      continue;
    }
    
    if (!isValidBlockId(block.id)) {
      errors.push({
        blockId: block.id,
        field: 'id',
        message: `ID блока "${block.id}" содержит недопустимые символы. Разрешены только буквы, цифры, подчёркивания и дефисы.`,
      });
    }
    
    if (blockIds.has(block.id)) {
      errors.push({
        blockId: block.id,
        field: 'id',
        message: `Дублирующийся ID: "${block.id}"`,
      });
    }
    blockIds.add(block.id);
  }
  
  // Проверка 2: Обязательные поля для каждого типа блока
  for (const block of blocks) {
    const blockErrors = validateBlockFields(block, blockIds);
    errors.push(...blockErrors);
  }
  
  // Проверка 3: Зависимости (проверка существования ссылок)
  for (const block of blocks) {
    const depErrors = validateDependencies(block, blockIds, blocks);
    errors.push(...depErrors);
  }
  
  // Проверка 4: Циклические зависимости в формулах
  const cycleErrors = detectCircularDependencies(blocks);
  errors.push(...cycleErrors);
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Валидирует поля конкретного блока
 */
function validateBlockFields(block: Block, allBlockIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  
  switch (block.type) {
    case 'input': {
      const input = block as InputBlock;
      if (!input.inputType) {
        errors.push({
          blockId: block.id,
          field: 'inputType',
          message: 'Поле inputType обязательно для input блока',
        });
      }
      break;
    }
    
    case 'formula': {
      const formula = block as FormulaBlock;
      if (!formula.formula || formula.formula.trim() === '') {
        errors.push({
          blockId: block.id,
          field: 'formula',
          message: 'Поле formula обязательно для formula блока',
        });
      } else {
        // Валидация формулы на безопасность
        const formulaValidation = isValidFormula(formula.formula);
        if (!formulaValidation.valid) {
          errors.push({
            blockId: block.id,
            field: 'formula',
            message: formulaValidation.error || 'Некорректная формула',
          });
        }
      }
      
      if (!Array.isArray(formula.dependencies)) {
        errors.push({
          blockId: block.id,
          field: 'dependencies',
          message: 'Поле dependencies должно быть массивом',
        });
      }
      break;
    }
    
    case 'data_table': {
      const table = block as DataTableBlock;
      if (!table.name || table.name.trim() === '') {
        errors.push({
          blockId: block.id,
          field: 'name',
          message: 'Поле name обязательно для data_table блока',
        });
      }
      if (!Array.isArray(table.rows)) {
        errors.push({
          blockId: block.id,
          field: 'rows',
          message: 'Поле rows должно быть массивом',
        });
        break;
      }

      const hasColumns = Array.isArray(table.columns) && table.columns.length > 0;
      const rowsArray = table.rows as Array<any>;
      const hasMatrixRows = rowsArray.length > 0 && rowsArray.every((row) => Array.isArray(row));
      const hasObjectRows = rowsArray.length > 0 && rowsArray.every((row) => row && typeof row === 'object' && !Array.isArray(row));

      if (!hasColumns && !hasMatrixRows) {
        errors.push({
          blockId: block.id,
          field: 'columns',
          message: 'Нужно указать columns или использовать матричный формат rows с первой строкой заголовков',
        });
      }

      if (!hasMatrixRows && !hasObjectRows && rowsArray.length > 0) {
        errors.push({
          blockId: block.id,
          field: 'rows',
          message: 'rows должен быть массивом объектов или матрицей',
        });
      }

      if (hasMatrixRows && rowsArray.length > 0) {
        const header = rowsArray[0];
        if (!Array.isArray(header) || header.length === 0) {
          errors.push({
            blockId: block.id,
            field: 'rows',
            message: 'В матрице первая строка должна содержать заголовки столбцов',
          });
        }
      }
      // Ограничение размера таблицы
      const rowCount = hasMatrixRows ? Math.max(0, rowsArray.length - 1) : rowsArray.length;
      if (rowCount > 500) {
        errors.push({
          blockId: block.id,
          field: 'rows',
          message: `Таблица содержит ${rowCount} строк. Максимально допустимо 500 строк. Для больших таблиц обратитесь к разработчику.`,
        });
      }
      break;
    }

    case 'table_range': {
      const range = block as TableRangeBlock;
      if (!range.dataSource) {
        errors.push({
          blockId: block.id,
          field: 'dataSource',
          message: 'Поле dataSource обязательно для table_range блока',
        });
      }
      if (!range.inputId) {
        errors.push({
          blockId: block.id,
          field: 'inputId',
          message: 'Поле inputId обязательно для table_range блока',
        });
      }
      if (!range.maxColumn) {
        errors.push({
          blockId: block.id,
          field: 'maxColumn',
          message: 'Поле maxColumn обязательно для table_range блока',
        });
      }
      if (!range.valueColumn) {
        errors.push({
          blockId: block.id,
          field: 'valueColumn',
          message: 'Поле valueColumn обязательно для table_range блока',
        });
      }
      break;
    }
    
    case 'select_from_table': {
      const sel = block as SelectFromTableBlock;
      if (!sel.dataSource) {
        errors.push({
          blockId: block.id,
          field: 'dataSource',
          message: 'Поле dataSource обязательно для select_from_table блока',
        });
      } else if (!allBlockIds.has(sel.dataSource)) {
        errors.push({
          blockId: block.id,
          field: 'dataSource',
          message: `Источник данных "${sel.dataSource}" не найден`,
        });
      }
      if (!sel.column || sel.column.trim() === '') {
        errors.push({
          blockId: block.id,
          field: 'column',
          message: 'Поле column обязательно для select_from_table блока',
        });
      }
      if (sel.rowRange) {
        const start = sel.rowRange.start;
        const end = sel.rowRange.end;
        if (start !== undefined && start < 1) {
          errors.push({
            blockId: block.id,
            field: 'rowRange.start',
            message: 'rowRange.start должен быть >= 1',
          });
        }
        if (end !== undefined && end < 1) {
          errors.push({
            blockId: block.id,
            field: 'rowRange.end',
            message: 'rowRange.end должен быть >= 1',
          });
        }
        if (start !== undefined && end !== undefined && start > end) {
          errors.push({
            blockId: block.id,
            field: 'rowRange',
            message: 'rowRange.start не может быть больше rowRange.end',
          });
        }
      }
      break;
    }
    
    case 'image': {
      const image = block as ImageBlock;
      if (!image.url || image.url.trim() === '') {
        errors.push({
          blockId: block.id,
          field: 'url',
          message: 'Поле url обязательно для image блока',
        });
      } else if (!isValidUrl(image.url)) {
        errors.push({
          blockId: block.id,
          field: 'url',
          message: `URL "${image.url}" небезопасен или невалиден`,
        });
      }
      break;
    }
    
    case 'output': {
      if (!('sourceId' in block) || !block.sourceId) {
        errors.push({
          blockId: block.id,
          field: 'sourceId',
          message: 'Поле sourceId обязательно для output блока',
        });
      }
      break;
    }
    
    case 'condition': {
      if (!('if_exp' in block) || !block.if_exp) {
        errors.push({
          blockId: block.id,
          field: 'if_exp',
          message: 'Поле if_exp обязательно для condition блока',
        });
      }
      if (!('then_id' in block) || !block.then_id) {
        errors.push({
          blockId: block.id,
          field: 'then_id',
          message: 'Поле then_id обязательно для condition блока',
        });
      }
      if (!('else_id' in block) || !block.else_id) {
        errors.push({
          blockId: block.id,
          field: 'else_id',
          message: 'Поле else_id обязательно для condition блока',
        });
      }
      break;
    }
  }
  
  return errors;
}

/**
 * Валидирует зависимости блока (ссылки на другие блоки)
 */
function validateDependencies(block: Block, allBlockIds: Set<string>, blocks: Block[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (block.type === 'formula') {
    const formula = block as FormulaBlock;
    if (Array.isArray(formula.dependencies)) {
      for (const depId of formula.dependencies) {
        if (!allBlockIds.has(depId)) {
          errors.push({
            blockId: block.id,
            field: 'dependencies',
            message: `Зависимость "${depId}" не найдена`,
          });
        }
      }
    }
  }
  
  if (block.type === 'output' && 'sourceId' in block) {
    if (!allBlockIds.has(block.sourceId)) {
      errors.push({
        blockId: block.id,
        field: 'sourceId',
        message: `Источник "${block.sourceId}" не найден`,
      });
    }
  }
  
  if (block.type === 'condition') {
    if ('then_id' in block && !allBlockIds.has(block.then_id)) {
      errors.push({
        blockId: block.id,
        field: 'then_id',
        message: `Блок "${block.then_id}" не найден`,
      });
    }
    if ('else_id' in block && !allBlockIds.has(block.else_id)) {
      errors.push({
        blockId: block.id,
        field: 'else_id',
        message: `Блок "${block.else_id}" не найден`,
      });
    }
  }
  
  if (block.type === 'select_from_table') {
    const sel = block as SelectFromTableBlock;
    if (sel.dataSource && !allBlockIds.has(sel.dataSource)) {
      errors.push({
        blockId: block.id,
        field: 'dataSource',
        message: `Источник данных "${sel.dataSource}" не найден`,
      });
    }
  }
  
  if (block.type === 'select_from_object' && 'objectSource' in block) {
    if (!allBlockIds.has(block.objectSource)) {
      errors.push({
        blockId: block.id,
        field: 'objectSource',
        message: `Источник объекта "${block.objectSource}" не найден`,
      });
    }
  }

  if (block.type === 'table_lookup') {
    const tbl = block as TableLookupBlock;
    if (tbl.dataSource && !allBlockIds.has(tbl.dataSource)) {
      errors.push({
        blockId: block.id,
        field: 'dataSource',
        message: `Источник данных "${tbl.dataSource}" не найден`,
      });
    } else if (tbl.dataSource && allBlockIds.has(tbl.dataSource)) {
      // Проверяем существование столбцов в выбранной таблице
      const sourceTable = blocks.find(b => b.id === tbl.dataSource && b.type === 'data_table') as DataTableBlock | undefined;
      if (sourceTable) {
        const normalized = normalizeTableData(sourceTable);
        const columns = normalized.columns;
        
        if (tbl.key_col && !columns.includes(tbl.key_col)) {
          // Проверяем, не является ли key_col ID блока
          if (!allBlockIds.has(tbl.key_col)) {
            errors.push({
              blockId: block.id,
              field: 'key_col',
              message: `Столбец "${tbl.key_col}" не найден в таблице "${tbl.dataSource}". Доступные столбцы: ${columns.join(', ')}`,
            });
          }
        }
        
        if (tbl.target_col && !columns.includes(tbl.target_col)) {
          // Проверяем, не является ли target_col ID блока (динамический выбор столбца)
          if (!allBlockIds.has(tbl.target_col)) {
            errors.push({
              blockId: block.id,
              field: 'target_col',
              message: `Столбец "${tbl.target_col}" не найден в таблице "${tbl.dataSource}". Доступные столбцы: ${columns.join(', ')}`,
            });
          }
        }
      }
    }
  }

  if (block.type === 'table_range') {
    const range = block as TableRangeBlock;
    if (range.dataSource && !allBlockIds.has(range.dataSource)) {
      errors.push({
        blockId: block.id,
        field: 'dataSource',
        message: `Источник данных "${range.dataSource}" не найден`,
      });
    }
    if (range.inputId && !allBlockIds.has(range.inputId)) {
      errors.push({
        blockId: block.id,
        field: 'inputId',
        message: `Источник значения "${range.inputId}" не найден`,
      });
    }
  }
  
  return errors;
}

/**
 * Обнаруживает циклические зависимости в формулах
 */
function detectCircularDependencies(blocks: Block[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const formulaBlocks = blocks.filter(b => b.type === 'formula') as FormulaBlock[];
  
  // Строим граф зависимостей
  const graph: Record<string, string[]> = {};
  for (const block of formulaBlocks) {
    graph[block.id] = block.dependencies || [];
  }
  
  // Проверяем каждый блок на циклы
  function hasCycle(blockId: string, visited: Set<string>, recStack: Set<string>): boolean {
    visited.add(blockId);
    recStack.add(blockId);
    
    const deps = graph[blockId] || [];
    for (const dep of deps) {
      // Если зависимость - это формула, проверяем её
      if (graph[dep]) {
        if (!visited.has(dep)) {
          if (hasCycle(dep, visited, recStack)) {
            return true;
          }
        } else if (recStack.has(dep)) {
          // Найден цикл
          return true;
        }
      }
    }
    
    recStack.delete(blockId);
    return false;
  }
  
  for (const block of formulaBlocks) {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    if (hasCycle(block.id, visited, recStack)) {
      errors.push({
        blockId: block.id,
        field: 'dependencies',
        message: 'Обнаружена циклическая зависимость в формулах',
      });
    }
  }
  
  return errors;
}

/**
 * Валидирует JSON перед импортом блоков
 */
export function validateImportedBlocks(json: string): { valid: boolean; blocks?: Block[]; error?: string } {
  try {
    const parsed = JSON.parse(json);
    
    if (!Array.isArray(parsed)) {
      return { valid: false, error: 'JSON должен быть массивом блоков' };
    }
    
    // Базовая проверка структуры
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        return { valid: false, error: 'Каждый элемент должен быть объектом' };
      }
      if (!item.id || typeof item.id !== 'string') {
        return { valid: false, error: 'Каждый блок должен иметь строковое поле id' };
      }
      if (!item.type || typeof item.type !== 'string') {
        return { valid: false, error: 'Каждый блок должен иметь строковое поле type' };
      }
    }
    
    // Полная валидация
    const validation = validateBlocks(parsed as Block[]);
    if (!validation.valid) {
      return {
        valid: false,
        error: `Ошибки валидации: ${validation.errors.map(e => e.message).join('; ')}`,
      };
    }
    
    return { valid: true, blocks: parsed as Block[] };
  } catch (e) {
    return { valid: false, error: `Ошибка парсинга JSON: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}` };
  }
}
