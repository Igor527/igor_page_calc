// Расчетный движок для калькулятора на базе math.js
// Функция recalculateValues принимает массив блоков и текущие вводы, возвращает обновленный объект values

import { evaluate } from 'mathjs';
import type { Block, InputBlock, FormulaBlock } from '../types/blocks';

import type {
  Block,
  InputBlock,
  FormulaBlock,
  ConstantBlock,
  TableLookupBlock,
  ConditionBlock
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

  // 2. TABLE_LOOKUP
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

  // 3. CONDITION (логика: если if_exp true, то then_id, иначе else_id)
  for (const block of blocks) {
    if (block.type === 'condition') {
      const cond = block as ConditionBlock;
      let result = false;
      try {
        result = Boolean(evaluate(cond.if_exp, values));
      } catch {
        result = false;
      }
      const id = result ? cond.then_id : cond.else_id;
      values[block.id] = values[id];
    }
  }

  // 4. FORMULA (реактивно, с учетом зависимостей)
  const formulaBlocks = blocks.filter(b => b.type === 'formula') as FormulaBlock[];
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    for (const block of formulaBlocks) {
      if (block.dependencies.every(dep => values[dep] !== undefined)) {
        try {
          const scope = { ...values };
          const result = evaluate(block.formula, scope);
          if (values[block.id] !== result) {
            values[block.id] = result;
            changed = true;
          }
        } catch (e) {
          values[block.id] = 'Ошибка формулы';
        }
      }
    }
    iterations++;
  }

  // 5. OUTPUT (просто копирует значение из sourceId)
  for (const block of blocks) {
    if (block.type === 'output' && 'sourceId' in block) {
      values[block.id] = values[(block as any).sourceId];
    }
  }

  return values;
}

// Для работы требуется mathjs: npm install mathjs
// Функция безопасно пересчитывает значения всех формул, учитывая зависимости и ввод пользователя.