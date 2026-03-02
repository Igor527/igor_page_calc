// Утилиты для сохранения и загрузки калькуляторов с уникальными ID

import type { Block } from '@/types/blocks';
import { validateBlocks } from './validation';
import { toMatrixTableBlock } from './tableData';

export type CalculatorStatus = 'draft' | 'review' | 'published' | 'rejected';

export interface CalculatorComment {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface CalculatorHistoryEntry {
  id: string;
  action: 'created' | 'updated' | 'status_changed' | 'commented';
  author: string;
  timestamp: number;
  details?: string;
  oldStatus?: CalculatorStatus;
  newStatus?: CalculatorStatus;
}

export interface SavedCalculator {
  id: string;
  title: string;
  /** Адрес для ссылки: латиница, цифры, дефис. Если задан, публичный URL — /calculators/:slug */
  slug?: string;
  blocks: Block[];
  values?: Record<string, number | string>;
  /** HTML отчёта из редактора (токены @id подставляются при показе) */
  reportHtml?: string;
  status: CalculatorStatus;
  comments: CalculatorComment[];
  history: CalculatorHistoryEntry[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  reviewedBy?: string;
  publishedAt?: number;
}

/** Нормализует slug: только a-z, 0-9, дефис; в нижнем регистре */
export function normalizeSlug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || '';
}

/**
 * Генерирует уникальный ID для калькулятора
 */
export function generateCalculatorId(): string {
  return 'calc_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
}

/**
 * Сохраняет калькулятор в localStorage
 */
const REPORT_HTML_STORAGE_KEY = 'igor-page-calc-report-html';

export function saveCalculator(
  id: string,
  title: string,
  blocks: Block[],
  values?: Record<string, number | string>,
  status: CalculatorStatus = 'draft',
  createdBy?: string,
  reportHtml?: string,
  slug?: string
): { success: boolean; error?: string } {
  try {
    const normalizedBlocks = blocks.map((block) => block.type === 'data_table' ? toMatrixTableBlock(block as any) : block);
    // Валидация перед сохранением
    const validation = validateBlocks(normalizedBlocks);
    if (!validation.valid) {
      return {
        success: false,
        error: `Ошибки валидации: ${validation.errors.map(e => e.message).join('; ')}`,
      };
    }

    // Загружаем существующий калькулятор из localStorage, если есть (нужен для existing?.slug и т.д.)
    const existing = loadCalculatorFromStorage(id);
    let normalizedSlug: string | undefined;
    if (slug !== undefined && slug !== '') {
      normalizedSlug = normalizeSlug(slug);
      if (normalizedSlug.length === 0) {
        return { success: false, error: 'Адрес должен содержать хотя бы один символ (латиница, цифры, дефис)' };
      }
      const listForConflict = getCalculatorList();
      const conflict = listForConflict.find((c: any) => c.slug === normalizedSlug && c.id !== id);
      if (conflict) {
        return { success: false, error: `Адрес «${normalizedSlug}» уже занят другим калькулятором` };
      }
    } else {
      // По умолчанию — сквозная нумерация /1, /2, ...
      normalizedSlug = existing?.slug ?? String(getNextCalculatorNumber());
    }
    const now = Date.now();
    const reportHtmlToSave = reportHtml ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(REPORT_HTML_STORAGE_KEY) : null) ?? existing?.reportHtml ?? '';

    const calculator: SavedCalculator = {
      id,
      title,
      slug: normalizedSlug ?? existing?.slug,
      blocks: normalizedBlocks,
      values: values || {},
      reportHtml: reportHtmlToSave || undefined,
      status: status || existing?.status || 'draft',
      comments: existing?.comments || [],
      history: existing?.history || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: createdBy || existing?.createdBy,
      reviewedBy: existing?.reviewedBy,
      publishedAt: existing?.publishedAt,
    };

    // Добавляем запись в историю
    if (existing) {
      calculator.history.push({
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        action: 'updated',
        author: createdBy || 'user',
        timestamp: now,
      });
    } else {
      calculator.history.push({
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        action: 'created',
        author: createdBy || 'user',
        timestamp: now,
      });
    }

    // Сохраняем в localStorage
    localStorage.setItem(`calc-${id}`, JSON.stringify(calculator));

    // Сохраняем список всех калькуляторов (без ограничения количества, без мутации — новый массив)
    const list = getCalculatorList();
    const entry = { id, title, status: calculator.status, updatedAt: calculator.updatedAt, slug: calculator.slug };
    const existingIndex = list.findIndex((c) => c.id === id);
    const newList =
      existingIndex >= 0
        ? list.map((c, i) => (i === existingIndex ? entry : c))
        : [...list, entry];
    localStorage.setItem(CALC_LIST_KEY, JSON.stringify(newList));

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Неизвестная ошибка',
    };
  }
}

/**
 * Загружает калькулятор по ID из localStorage (внутренний вызов, без учёта бандла).
 */
function loadCalculatorFromStorage(id: string): SavedCalculator | null {
  try {
    const saved = localStorage.getItem(`calc-${id}`);
    if (!saved) return null;
    return JSON.parse(saved) as SavedCalculator;
  } catch {
    return null;
  }
}

/**
 * Загружает калькулятор по ID. Сначала бандл из репо, затем localStorage.
 */
export function loadCalculator(id: string): SavedCalculator | null {
  if (publishedBundle) {
    const fromBundle = publishedBundle.find((c) => c.id === id);
    if (fromBundle) return fromBundle;
  }
  return loadCalculatorFromStorage(id);
}

const CALC_LIST_KEY = 'calculators-list';
const CALC_PREFIX = 'calc-';

/** Список опубликованных калькуляторов из JSON в репо (при наличии). Приоритет над localStorage для публичного списка. */
let publishedBundle: SavedCalculator[] | null = null;

const PUBLISHED_JSON_URL = './data/calculators.json';

/**
 * Загружает опубликованный список из репо (data/calculators.json). Вызвать при старте приложения.
 * После загрузки getPublishedCalculators() и getCalculatorBySlug() отдают данные из бандла.
 */
export function loadPublishedBundle(): Promise<void> {
  return fetch(PUBLISHED_JSON_URL)
    .then((res) => (res.ok ? res.json() : Promise.reject(res)))
    .then((data: { version?: number; calculators?: SavedCalculator[] }) => {
      const list = Array.isArray(data.calculators) ? data.calculators : [];
      publishedBundle = list.filter((c) => c.status === 'published');
    })
    .catch(() => {
      publishedBundle = null;
    });
}

/**
 * Собирает список калькуляторов по всем ключам calc-* в localStorage (источник истины).
 * Используется для восстановления списка, если calculators-list усечён или повреждён.
 */
function getCalculatorListFromStorageKeys(): Array<{ id: string; title: string; status: CalculatorStatus; updatedAt: number; slug?: string }> {
  if (typeof localStorage === 'undefined') return [];
  const result: Array<{ id: string; title: string; status: CalculatorStatus; updatedAt: number; slug?: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CALC_PREFIX) || key === CALC_LIST_KEY) continue;
    const id = key.slice(CALC_PREFIX.length);
    if (!id) continue;
    const calc = loadCalculatorFromStorage(id);
    if (calc) {
      result.push({
        id: calc.id,
        title: calc.title,
        status: calc.status,
        updatedAt: calc.updatedAt,
        slug: calc.slug,
      });
    }
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Получает список всех сохранённых калькуляторов (без ограничения количества).
 * Всегда собирает по ключам calc-* в localStorage — источник истины.
 * Кеш calculators-list обновляется автоматически.
 */
export function getCalculatorList(): Array<{ id: string; title: string; status: CalculatorStatus; updatedAt: number; slug?: string }> {
  const list = getCalculatorListFromStorageKeys();
  try {
    localStorage.setItem(CALC_LIST_KEY, JSON.stringify(list));
  } catch { /* игнорируем ошибку записи кеша */ }
  return list;
}

/**
 * Следующий порядковый номер для slug по умолчанию (/1, /2, …).
 * По всем сохранённым калькуляторам ищет числовые slug и возвращает max + 1.
 */
export function getNextCalculatorNumber(): number {
  const list = getCalculatorList();
  let max = 0;
  for (const item of list) {
    const slug = item.slug ?? '';
    if (/^\d+$/.test(slug)) {
      const n = parseInt(slug, 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * Загружает калькулятор по адресу (slug). Для ссылки /calculators/:slug.
 * Сначала бандл из репо, затем localStorage.
 */
export function getCalculatorBySlug(slug: string): SavedCalculator | null {
  if (publishedBundle) {
    const fromBundle = publishedBundle.find((c) => (c.slug ?? c.id) === slug);
    if (fromBundle) return fromBundle;
  }
  const list = getCalculatorList();
  const item = list.find((c) => c.slug === slug);
  if (!item) return null;
  return loadCalculatorFromStorage(item.id);
}

/**
 * Список опубликованных калькуляторов для страницы /calculators и главной.
 * Если загружен бандл из data/calculators.json — берётся из него, иначе из localStorage.
 */
export function getPublishedCalculators(): Array<{ id: string; title: string; slug?: string }> {
  if (publishedBundle && publishedBundle.length > 0) {
    return [...publishedBundle]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, title: c.title, slug: c.slug }));
  }
  if (typeof localStorage === 'undefined') return [];
  const result: Array<{ id: string; title: string; slug?: string; updatedAt: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CALC_PREFIX) || key === CALC_LIST_KEY) continue;
    const id = key.slice(CALC_PREFIX.length);
    if (!id) continue;
    const calc = loadCalculatorFromStorage(id);
    if (calc?.status === 'published') {
      result.push({
        id: calc.id,
        title: calc.title,
        slug: calc.slug,
        updatedAt: calc.updatedAt,
      });
    }
  }
  result.sort((a, b) => b.updatedAt - a.updatedAt);
  return result.map(({ id, title, slug }) => ({ id, title, slug }));
}

/**
 * Обновляет адрес (slug) калькулятора.
 */
export function updateCalculatorSlug(id: string, slug: string | undefined): { success: boolean; error?: string } {
  try {
    const calculator = loadCalculatorFromStorage(id);
    if (!calculator) return { success: false, error: 'Калькулятор не найден' };
    const normalized = slug !== undefined && slug !== '' ? normalizeSlug(slug) : undefined;
    if (normalized !== undefined && normalized.length === 0) {
      return { success: false, error: 'Адрес должен содержать хотя бы один символ (латиница, цифры, дефис)' };
    }
    if (normalized !== undefined) {
      const list = getCalculatorList();
      const conflict = list.find((c: any) => c.slug === normalized && c.id !== id);
      if (conflict) return { success: false, error: `Адрес «${normalized}» уже занят` };
    }
    calculator.slug = normalized;
    calculator.updatedAt = Date.now();
    localStorage.setItem(`calc-${id}`, JSON.stringify(calculator));
    const list = getCalculatorList();
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const newList = list.map((c, i) => (i === idx ? { ...c, slug: calculator.slug } : c));
      localStorage.setItem(CALC_LIST_KEY, JSON.stringify(newList));
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Ошибка' };
  }
}

/**
 * Обновляет статус калькулятора
 */
export function updateCalculatorStatus(
  id: string,
  newStatus: CalculatorStatus,
  reviewedBy?: string
): { success: boolean; error?: string } {
  try {
    const calculator = loadCalculatorFromStorage(id);
    if (!calculator) {
      return { success: false, error: 'Калькулятор не найден' };
    }

    const oldStatus = calculator.status;
    calculator.status = newStatus;
    calculator.updatedAt = Date.now();
    
    if (reviewedBy) {
      calculator.reviewedBy = reviewedBy;
    }
    
    if (newStatus === 'published') {
      calculator.publishedAt = Date.now();
    }

    // Добавляем запись в историю
    calculator.history.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      action: 'status_changed',
      author: reviewedBy || 'system',
      timestamp: Date.now(),
      oldStatus,
      newStatus,
    });

    localStorage.setItem(`calc-${id}`, JSON.stringify(calculator));

    // Обновляем статус в общем списке (неизменяемо)
    const list = getCalculatorList();
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const newList = list.map((c, i) =>
        i === idx ? { ...c, status: newStatus, updatedAt: calculator.updatedAt } : c
      );
      localStorage.setItem(CALC_LIST_KEY, JSON.stringify(newList));
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Неизвестная ошибка',
    };
  }
}

/**
 * Добавляет комментарий к калькулятору
 */
export function addComment(
  id: string,
  text: string,
  author: string
): { success: boolean; error?: string; comment?: CalculatorComment } {
  try {
    const calculator = loadCalculatorFromStorage(id);
    if (!calculator) {
      return { success: false, error: 'Калькулятор не найден' };
    }

    const comment: CalculatorComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      author,
      text,
      createdAt: Date.now(),
    };

    calculator.comments.push(comment);
    calculator.updatedAt = Date.now();

    // Добавляем запись в историю
    calculator.history.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      action: 'commented',
      author,
      timestamp: Date.now(),
      details: text.substring(0, 100),
    });

    localStorage.setItem(`calc-${id}`, JSON.stringify(calculator));
    return { success: true, comment };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Неизвестная ошибка',
    };
  }
}

/**
 * Получает калькуляторы по статусу.
 * Обходит все ключи calc-* в localStorage напрямую — не зависит от calculators-list.
 */
export function getCalculatorsByStatus(status: CalculatorStatus): SavedCalculator[] {
  if (typeof localStorage === 'undefined') return [];
  const calculators: SavedCalculator[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CALC_PREFIX) || key === CALC_LIST_KEY) continue;
    const id = key.slice(CALC_PREFIX.length);
    if (!id) continue;
    const calc = loadCalculatorFromStorage(id);
    if (calc && calc.status === status) {
      calculators.push(calc);
    }
  }
  return calculators.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Удаляет калькулятор
 */
export function deleteCalculator(id: string): boolean {
  try {
    localStorage.removeItem(`calc-${id}`);
    
    // Удаляем из списка
    const list = getCalculatorList();
    const filtered = list.filter(c => c.id !== id);
    localStorage.setItem(CALC_LIST_KEY, JSON.stringify(filtered));
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Генерирует публичную ссылку на калькулятор (предпочитает slug, если задан)
 */
export function getPublicUrl(calculatorId: string, baseUrl: string = window.location.origin): string {
  const calc = loadCalculator(calculatorId) ?? loadCalculatorFromStorage(calculatorId);
  const path = calc?.slug ?? calculatorId;
  return `${baseUrl}/calculators/${path}`;
}

/** Формат файла data/calculators.json в репо */
export interface PublishedBundleJson {
  version: number;
  exportedAt: number;
  calculators: SavedCalculator[];
}

/**
 * Собирает всех опубликованных калькуляторов из localStorage в объект для сохранения в репо.
 * Положите результат в public/data/calculators.json и закоммитьте — на сайте будет этот список.
 */
export function buildPublishedBundle(): PublishedBundleJson {
  const list = getCalculatorsByStatus('published');
  return {
    version: 1,
    exportedAt: Date.now(),
    calculators: list,
  };
}

/**
 * Скачивает файл calculators.json с опубликованными калькуляторами.
 * Сохраните его в репо как public/data/calculators.json и сделайте push.
 */
export function downloadPublishedBundle(): void {
  const bundle = buildPublishedBundle();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'calculators.json';
  a.click();
  URL.revokeObjectURL(url);
}
