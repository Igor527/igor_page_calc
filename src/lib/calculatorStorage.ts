// Утилиты для сохранения и загрузки калькуляторов с уникальными ID

import type { Block } from '@/types/blocks';
import { validateBlocks } from './validation';

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
  blocks: Block[];
  values?: Record<string, number | string>;
  status: CalculatorStatus;
  comments: CalculatorComment[];
  history: CalculatorHistoryEntry[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  reviewedBy?: string;
  publishedAt?: number;
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
export function saveCalculator(
  id: string,
  title: string,
  blocks: Block[],
  values?: Record<string, number | string>,
  status: CalculatorStatus = 'draft',
  createdBy?: string
): { success: boolean; error?: string } {
  try {
    // Валидация перед сохранением
    const validation = validateBlocks(blocks);
    if (!validation.valid) {
      return {
        success: false,
        error: `Ошибки валидации: ${validation.errors.map(e => e.message).join('; ')}`,
      };
    }

    // Загружаем существующий калькулятор, если есть
    const existing = loadCalculator(id);
    const now = Date.now();
    
    const calculator: SavedCalculator = {
      id,
      title,
      blocks,
      values: values || {},
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

    // Сохраняем список всех калькуляторов
    const list = getCalculatorList();
    const existingIndex = list.findIndex(c => c.id === id);
    if (existingIndex >= 0) {
      list[existingIndex] = { id, title, status: calculator.status, updatedAt: calculator.updatedAt };
    } else {
      list.push({ id, title, status: calculator.status, updatedAt: calculator.updatedAt });
    }
    localStorage.setItem('calculators-list', JSON.stringify(list));

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Неизвестная ошибка',
    };
  }
}

/**
 * Загружает калькулятор по ID
 */
export function loadCalculator(id: string): SavedCalculator | null {
  try {
    const saved = localStorage.getItem(`calc-${id}`);
    if (!saved) return null;

    const calculator = JSON.parse(saved) as SavedCalculator;
    return calculator;
  } catch (e) {
    console.error('Ошибка загрузки калькулятора:', e);
    return null;
  }
}

/**
 * Получает список всех сохранённых калькуляторов
 */
export function getCalculatorList(): Array<{ id: string; title: string; status: CalculatorStatus; updatedAt: number }> {
  try {
    const saved = localStorage.getItem('calculators-list');
    if (!saved) return [];
    const list = JSON.parse(saved);
    // Обновляем формат для обратной совместимости
    return list.map((item: any) => ({
      id: item.id,
      title: item.title,
      status: item.status || 'draft',
      updatedAt: item.updatedAt,
    }));
  } catch (e) {
    console.error('Ошибка загрузки списка калькуляторов:', e);
    return [];
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
    const calculator = loadCalculator(id);
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
    const calculator = loadCalculator(id);
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
 * Получает калькуляторы по статусу
 */
export function getCalculatorsByStatus(status: CalculatorStatus): SavedCalculator[] {
  const list = getCalculatorList();
  const calculators: SavedCalculator[] = [];
  
  for (const item of list) {
    if (item.status === status) {
      const calc = loadCalculator(item.id);
      if (calc) {
        calculators.push(calc);
      }
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
    localStorage.setItem('calculators-list', JSON.stringify(filtered));
    
    return true;
  } catch (e) {
    console.error('Ошибка удаления калькулятора:', e);
    return false;
  }
}

/**
 * Генерирует публичную ссылку на калькулятор
 */
export function getPublicUrl(calculatorId: string, baseUrl: string = window.location.origin): string {
  return `${baseUrl}/calc/${calculatorId}`;
}
