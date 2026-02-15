// Система обработки и хранения ошибок

export interface CalculationError {
  blockId: string;
  type: 'formula' | 'condition' | 'table_lookup' | 'select' | 'other';
  message: string;
  details?: string;
  timestamp: number;
}

export interface ErrorState {
  errors: CalculationError[];
  addError: (error: CalculationError) => void;
  removeError: (blockId: string) => void;
  clearErrors: () => void;
  getError: (blockId: string) => CalculationError | undefined;
}

/**
 * Форматирует сообщение об ошибке для пользователя
 */
export function formatError(error: Error | unknown, context?: string): string {
  if (error instanceof Error) {
    const message = error.message;
    
    // Специфичные сообщения для math.js
    if (message.includes('Undefined symbol')) {
      const symbol = message.match(/symbol (.+)/)?.[1];
      return symbol 
        ? `Неизвестная переменная "${symbol}". Проверьте, что блок с ID "${symbol}" существует и имеет значение.`
        : 'Неизвестная переменная в формуле. Проверьте зависимости.';
    }
    
    if (message.includes('Unexpected type')) {
      return 'Неправильный тип данных в формуле. Убедитесь, что все переменные имеют числовые значения.';
    }
    
    if (message.includes('Function') && message.includes('not found')) {
      const func = message.match(/Function (.+) not found/)?.[1];
      return func 
        ? `Функция "${func}" не поддерживается. Используйте стандартные математические функции.`
        : 'Неподдерживаемая функция в формуле.';
    }
    
    if (message.includes('Parse error') || message.includes('Syntax error')) {
      return 'Синтаксическая ошибка в формуле. Проверьте правильность написания.';
    }
    
    if (context) {
      return `${context}: ${message}`;
    }
    
    return message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'Произошла неизвестная ошибка';
}

/**
 * Создаёт объект ошибки для блока
 */
export function createCalculationError(
  blockId: string,
  type: CalculationError['type'],
  error: Error | unknown,
  details?: string
): CalculationError {
  return {
    blockId,
    type,
    message: formatError(error),
    details,
    timestamp: Date.now(),
  };
}

/**
 * Получает понятное сообщение об ошибке формулы
 */
export function getFormulaErrorMessage(error: Error | unknown, blockId: string, formula?: string): string {
  const baseMessage = formatError(error);
  
  if (formula) {
    return `Ошибка в формуле блока "${blockId}": ${baseMessage}\nФормула: ${formula}`;
  }
  
  return `Ошибка в формуле блока "${blockId}": ${baseMessage}`;
}

/**
 * Проверяет, является ли значение ошибкой
 */
export function isErrorValue(value: any): boolean {
  if (typeof value === 'string') {
    return value.startsWith('Ошибка') || value.startsWith('ERROR:');
  }
  return false;
}

/**
 * Извлекает сообщение об ошибке из значения
 */
export function extractErrorMessage(value: any): string | null {
  if (isErrorValue(value)) {
    if (typeof value === 'string') {
      return value.replace(/^(Ошибка|ERROR:)\s*/, '');
    }
  }
  return null;
}
