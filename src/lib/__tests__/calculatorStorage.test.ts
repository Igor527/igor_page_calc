/**
 * Тесты: normalizeSlug, getNextCalculatorNumber, getCalculatorList, getCalculatorBySlug,
 * getPublishedCalculators, saveCalculator (с моком localStorage), loadCalculator, updateCalculatorStatus.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeSlug,
  getNextCalculatorNumber,
  getCalculatorList,
  getCalculatorBySlug,
  getPublishedCalculators,
  saveCalculator,
  loadCalculator,
  updateCalculatorStatus,
  getPublicUrl,
  type CalculatorStatus,
} from '../calculatorStorage';

const minimalBlocks = [
  { id: 'a', type: 'input' as const, inputType: 'number' as const, defaultValue: 0 },
  { id: 'b', type: 'constant' as const, value: 10 },
  { id: 'c', type: 'formula' as const, formula: 'a + b', dependencies: ['a', 'b'] },
];

function setupLocalStorage() {
  const store: Record<string, string> = {};
  const handler: ProxyHandler<Record<string, string>> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  });
  return store;
}

describe('normalizeSlug', () => {
  it('приводит к нижнему регистру и заменяет спецсимволы на дефис', () => {
    expect(normalizeSlug('  My-Calc_123  ')).toBe('my-calc-123');
    expect(normalizeSlug('Паркинг')).toBe('');
    expect(normalizeSlug('parking')).toBe('parking');
    expect(normalizeSlug('123')).toBe('123');
  });

  it('схлопывает несколько дефисов и убирает с краёв', () => {
    expect(normalizeSlug('--hello--world--')).toBe('hello-world');
    expect(normalizeSlug('  a  b  ')).toBe('a-b');
  });

  it('пустая строка или только спецсимволы дают пустой результат', () => {
    expect(normalizeSlug('')).toBe('');
    expect(normalizeSlug('   ')).toBe('');
    expect(normalizeSlug('---')).toBe('');
  });
});

describe('getNextCalculatorNumber', () => {
  beforeEach(() => {
    const store = setupLocalStorage();
    const base = { blocks: minimalBlocks, comments: [], history: [], createdAt: 1 };
    store['calc-c1'] = JSON.stringify({ id: 'c1', title: 'A', status: 'draft', updatedAt: 1, slug: '1', ...base });
    store['calc-c2'] = JSON.stringify({ id: 'c2', title: 'B', status: 'draft', updatedAt: 2, slug: '2', ...base });
    store['calc-c3'] = JSON.stringify({ id: 'c3', title: 'C', status: 'draft', updatedAt: 3, slug: '10', ...base });
  });

  it('возвращает max(числовые slug) + 1', () => {
    expect(getNextCalculatorNumber()).toBe(11);
  });

  it('при пустом списке возвращает 1', () => {
    setupLocalStorage();
    expect(getNextCalculatorNumber()).toBe(1);
  });

  it('игнорирует нечисловые slug', () => {
    const store = setupLocalStorage();
    const base = { blocks: minimalBlocks, comments: [], history: [], createdAt: 1 };
    store['calc-c1'] = JSON.stringify({ id: 'c1', title: 'A', status: 'draft', updatedAt: 1, slug: 'parking', ...base });
    expect(getNextCalculatorNumber()).toBe(1);
  });
});

describe('saveCalculator / loadCalculator / list', () => {
  beforeEach(() => setupLocalStorage());

  it('сохраняет и загружает калькулятор, добавляет в список', () => {
    const r = saveCalculator('id1', 'Title', minimalBlocks, {}, 'draft', undefined, undefined, 'my-slug');
    expect(r.success).toBe(true);

    const loaded = loadCalculator('id1');
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Title');
    expect(loaded!.slug).toBe('my-slug');
    expect(loaded!.status).toBe('draft');
    expect(loaded!.blocks).toHaveLength(3);

    const list = getCalculatorList();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('id1');
    expect(list[0].slug).toBe('my-slug');
  });

  it('при пустом slug присваивает порядковый номер', () => {
    saveCalculator('id1', 'First', minimalBlocks, {}, 'draft', undefined, undefined, undefined);
    const loaded = loadCalculator('id1');
    expect(loaded!.slug).toBe('1');

    saveCalculator('id2', 'Second', minimalBlocks, {}, 'draft', undefined, undefined, undefined);
    expect(loadCalculator('id2')!.slug).toBe('2');
  });

  it('отклоняет дубликат slug у другого калькулятора', () => {
    saveCalculator('id1', 'A', minimalBlocks, {}, 'draft', undefined, undefined, 'same');
    const r = saveCalculator('id2', 'B', minimalBlocks, {}, 'draft', undefined, undefined, 'same');
    expect(r.success).toBe(false);
    expect(r.error).toContain('уже занят');
  });
});

describe('getCalculatorBySlug', () => {
  beforeEach(() => {
    const store = setupLocalStorage();
    store['calc-calc1'] = JSON.stringify({
      id: 'calc1',
      title: 'One',
      slug: 'one',
      blocks: minimalBlocks,
      status: 'published',
      comments: [],
      history: [],
      createdAt: 1,
      updatedAt: 1,
    });
  });

  it('находит калькулятор по slug', () => {
    const calc = getCalculatorBySlug('one');
    expect(calc).not.toBeNull();
    expect(calc!.id).toBe('calc1');
  });

  it('возвращает null для неизвестного slug', () => {
    expect(getCalculatorBySlug('unknown')).toBeNull();
  });
});

describe('getPublishedCalculators', () => {
  beforeEach(() => {
    const store = setupLocalStorage();
    const base = { blocks: minimalBlocks, comments: [], history: [], createdAt: 1, updatedAt: 1 };
    store['calc-c1'] = JSON.stringify({ id: 'c1', title: 'A', slug: 'a', status: 'published', ...base });
    store['calc-c2'] = JSON.stringify({ id: 'c2', title: 'B', slug: 'b', status: 'draft', ...base });
  });

  it('возвращает только калькуляторы со статусом published', () => {
    const pub = getPublishedCalculators();
    expect(pub).toHaveLength(1);
    expect(pub[0].id).toBe('c1');
    expect(pub[0].slug).toBe('a');
  });
});

describe('updateCalculatorStatus', () => {
  beforeEach(() => {
    const store = setupLocalStorage();
    store['calc-c1'] = JSON.stringify({
      id: 'c1',
      title: 'A',
      slug: 'a',
      status: 'review',
      blocks: minimalBlocks,
      comments: [],
      history: [],
      createdAt: 1,
      updatedAt: 1,
    });
  });

  it('меняет статус и обновляет список', () => {
    const r = updateCalculatorStatus('c1', 'published' as CalculatorStatus, 'Admin');
    expect(r.success).toBe(true);
    expect(loadCalculator('c1')!.status).toBe('published');
    const list = getCalculatorList();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('published');
  });
});

describe('getPublicUrl', () => {
  beforeEach(() => {
    const store = setupLocalStorage();
    vi.stubGlobal('window', { location: { origin: 'https://example.com' } });
    store['calc-id1'] = JSON.stringify({
      id: 'id1',
      title: 'T',
      slug: 'my-calc',
      blocks: minimalBlocks,
      status: 'published',
      comments: [],
      history: [],
      createdAt: 1,
      updatedAt: 1,
    });
  });

  it('использует slug в URL если он есть', () => {
    const url = getPublicUrl('id1', 'https://example.com');
    expect(url).toBe('https://example.com/calculators/my-calc');
  });
});
