/**
 * Тесты расчётного движка: recalculateValues (input, constant, formula).
 */
import { describe, it, expect } from 'vitest';
import { recalculateValues } from '../engine';
import type { Block } from '@/types/blocks';

const blocks: Block[] = [
  { id: 'a', type: 'input', inputType: 'number', defaultValue: 5 },
  { id: 'b', type: 'constant', value: 10 },
  { id: 'sum', type: 'formula', formula: 'a + b', dependencies: ['a', 'b'] },
  { id: 'double', type: 'formula', formula: 'sum * 2', dependencies: ['sum'] },
];

describe('recalculateValues', () => {
  it('подставляет default для input и считает формулу', () => {
    const values = recalculateValues(blocks, {});
    expect(values.a).toBe(5);
    expect(values.b).toBe(10);
    expect(values.sum).toBe(15);
    expect(values.double).toBe(30);
  });

  it('использует переданные inputs поверх default', () => {
    const values = recalculateValues(blocks, { a: 3 });
    expect(values.a).toBe(3);
    expect(values.sum).toBe(13);
    expect(values.double).toBe(26);
  });

  it('поддерживает round и тернарный оператор', () => {
    const bl: Block[] = [
      { id: 'x', type: 'input', inputType: 'number', defaultValue: 2.7 },
      { id: 'r', type: 'formula', formula: 'round(x)', dependencies: ['x'] },
      { id: 't', type: 'formula', formula: 'x > 2 ? 1 : 0', dependencies: ['x'] },
    ];
    const values = recalculateValues(bl, {});
    expect(values.r).toBe(3);
    expect(values.t).toBe(1);
  });
});
