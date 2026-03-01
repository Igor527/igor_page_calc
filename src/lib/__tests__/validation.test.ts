/**
 * Тесты валидации блоков: validateBlocks.
 */
import { describe, it, expect } from 'vitest';
import { validateBlocks } from '../validation';
import type { Block } from '@/types/blocks';

const validBlocks: Block[] = [
  { id: 'a', type: 'input', inputType: 'number', defaultValue: 0 },
  { id: 'b', type: 'constant', value: 10 },
  { id: 'c', type: 'formula', formula: 'a + b', dependencies: ['a', 'b'] },
];

describe('validateBlocks', () => {
  it('принимает валидный набор блоков', () => {
    const r = validateBlocks(validBlocks);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('ошибка при дублирующемся id', () => {
    const blocks: Block[] = [
      { id: 'x', type: 'input', inputType: 'number' },
      { id: 'x', type: 'constant', value: 1 },
    ];
    const r = validateBlocks(blocks);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('Дублирующийся') && e.blockId === 'x')).toBe(true);
  });

  it('ошибка при пустой формуле у formula-блока', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'input', inputType: 'number' },
      { id: 'f', type: 'formula', formula: '', dependencies: ['a'] },
    ];
    const r = validateBlocks(blocks);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'formula' && e.blockId === 'f')).toBe(true);
  });

  it('ошибка при недопустимом id блока', () => {
    const blocks: Block[] = [
      { id: 'bad id!', type: 'input', inputType: 'number' },
    ];
    const r = validateBlocks(blocks);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'id')).toBe(true);
  });

  it('ошибка при отсутствии inputType у input', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'input', label: 'A' } as Block,
    ];
    const r = validateBlocks(blocks);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'inputType')).toBe(true);
  });

  it('ошибка при опасной формуле', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'input', inputType: 'number' },
      { id: 'f', type: 'formula', formula: 'eval(1)', dependencies: ['a'] },
    ];
    const r = validateBlocks(blocks);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'formula')).toBe(true);
  });
});
