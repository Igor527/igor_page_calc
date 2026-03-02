/**
 * Тесты отчёта: stripRoundForDisplay, parseReportToken, replaceTokensInHtml, applyTableSizing.
 */
import { describe, it, expect } from 'vitest';
import {
  stripRoundForDisplay,
  parseReportToken,
  replaceTokensInHtml,
  applyTableSizing,
  buildFormulaWithValues,
  getStepsCalculations,
} from '../reportHtml';
import type { Block } from '@/types/blocks';

describe('stripRoundForDisplay', () => {
  it('убирает один внешний round(...)', () => {
    expect(stripRoundForDisplay('round(max(0, x))')).toBe('max(0, x)');
    expect(stripRoundForDisplay('round(100)')).toBe('100');
  });

  it('убирает вложенные round', () => {
    expect(stripRoundForDisplay('round(round(x))')).toBe('x');
  });

  it('для round(expr) снимает обёртку и возвращает expr', () => {
    expect(stripRoundForDisplay('round(a + b * 2)')).toBe('a + b * 2');
  });

  it('оставляет строку без round как есть', () => {
    expect(stripRoundForDisplay('a + b')).toBe('a + b');
  });

  it('убирает floor и ceil для отображения в отчёте', () => {
    expect(stripRoundForDisplay('floor(10 * 3)')).toBe('10 * 3');
    expect(stripRoundForDisplay('ceil(x / 2)')).toBe('x / 2');
    expect(stripRoundForDisplay('floor(round(a))')).toBe('a');
  });
});

describe('parseReportToken', () => {
  it('парсит id и suffix после точки', () => {
    expect(parseReportToken('id.stepsCalculations')).toEqual({ id: 'id', suffix: 'stepsCalculations' });
  });

  it('парсит id и suffix после двоеточия', () => {
    expect(parseReportToken('id:exprOnly')).toEqual({ id: 'id', suffix: 'exprOnly' });
  });

  it('только id без суффикса', () => {
    expect(parseReportToken('sum')).toEqual({ id: 'sum' });
  });
});

describe('replaceTokensInHtml', () => {
  const blocks: Block[] = [
    { id: 'a', type: 'input', inputType: 'number', defaultValue: 0 },
    { id: 'b', type: 'constant', value: 10 },
  ];

  it('заменяет @id на значение из getDisplay', () => {
    const html = 'Result: @a and @b';
    const getDisplay = (id: string) => ({
      text: id === 'a' ? '5' : '10',
      isError: false,
    });
    const result = replaceTokensInHtml(html, blocks, null, getDisplay);
    expect(result).toContain('5');
    expect(result).toContain('10');
    expect(result).toContain('data-token');
  });

  it('не заменяет @unknown (id не в blocks)', () => {
    const html = 'Value: @unknown';
    const getDisplay = () => ({ text: 'x', isError: false });
    const result = replaceTokensInHtml(html, blocks, null, getDisplay);
    expect(result).toContain('@unknown');
  });
});

describe('applyTableSizing', () => {
  it('подставляет width из data-width', () => {
    const html = '<table data-width="80">';
    expect(applyTableSizing(html)).toContain('width:80%');
  });

  it('ограничивает число 10–100', () => {
    expect(applyTableSizing('<table data-width="5">')).toContain('width:10%');
    expect(applyTableSizing('<table data-width="200">')).toContain('width:100%');
  });
});

describe('buildFormulaWithValues / getStepsCalculations', () => {
  const formulaBlock: Block = {
    id: 'f',
    type: 'formula',
    formula: 'a * b',
    dependencies: ['a', 'b'],
  };
  const values = { a: 3, b: 4, f: 12 };
  const formatValue = (v: unknown) => String(v ?? '—');

  it('buildFormulaWithValues подставляет числа в формулу', () => {
    const s = buildFormulaWithValues(formulaBlock, values, formatValue, false, true);
    expect(s).toContain('3');
    expect(s).toContain('4');
    expect(s).toContain('12');
  });

  it('getStepsCalculations для formula возвращает выражение с числами', () => {
    const s = getStepsCalculations(formulaBlock, values, formatValue);
    expect(s).toMatch(/3\s*\*\s*4/);
  });

  it('getStepsCalculations для не-формулы возвращает formatValue', () => {
    const inputBlock: Block = { id: 'a', type: 'input', inputType: 'number', defaultValue: 0 };
    expect(getStepsCalculations(inputBlock, values, formatValue)).toBe('3');
  });
});
