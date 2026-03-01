import DOMPurify from 'dompurify';

const PURIFY_CFG = {
  ALLOWED_TAGS: [
    'b', 'i', 'u', 'strong', 'em', 'br', 'p', 'span', 'a',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'ul', 'ol', 'li',
    'div', 'blockquote', 'pre', 'code', 'hr', 'img',
    'figure', 'figcaption', 'sub', 'sup', 'mark',
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
    'class', 'title', 'style',
    'data-token', 'data-width', 'data-pos-x', 'data-pos-y', 'data-zoom',
    'colspan', 'rowspan', 'open',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['data-token', 'data-width', 'data-pos-x', 'data-pos-y', 'data-zoom'],
};

/** Удаляет теги, оставляет только безопасные (fallback при отсутствии DOMPurify/window). */
function sanitizeHtmlFallback(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/&/g, '&amp;');
}

/**
 * Sanitize HTML using DOMPurify — safe against XSS.
 * Allows rich formatting tags (headings, lists, tables, images, links).
 * При отсутствии window (SSR/тесты) — экранирует HTML (fallback).
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof window === 'undefined') return sanitizeHtmlFallback(html);
  try {
    if (typeof DOMPurify.sanitize !== 'function') return sanitizeHtmlFallback(html);
    return DOMPurify.sanitize(html, PURIFY_CFG);
  } catch {
    return sanitizeHtmlFallback(html);
  }
}

/**
 * Экранирует HTML-специальные символы
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Валидирует URL на безопасность
 * Разрешает только http, https, data (для изображений), относительные пути
 * Блокирует javascript:, vbscript:, data:text/html и другие опасные протоколы
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Разрешаем относительные пути
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return true;
  }
  
  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.toLowerCase();
    
    // Разрешаем только безопасные протоколы
    const allowedProtocols = ['http:', 'https:', 'data:'];
    
    if (!allowedProtocols.includes(protocol)) {
      return false;
    }
    
    // Для data: протокола разрешаем только изображения
    if (protocol === 'data:') {
      const allowedDataTypes = [
        'data:image/png',
        'data:image/jpeg',
        'data:image/jpg',
        'data:image/gif',
        'data:image/svg+xml',
        'data:image/webp',
      ];
      return allowedDataTypes.some(type => url.toLowerCase().startsWith(type));
    }
    
    return true;
  } catch {
    // Если URL невалидный, проверяем как относительный путь
    return url.startsWith('/') || url.startsWith('./') || url.startsWith('../');
  }
}

/**
 * Валидирует и санитизирует URL, возвращает безопасный URL или null
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  const trimmed = url.trim();
  if (!trimmed) return null;
  
  if (isValidUrl(trimmed)) {
    return trimmed;
  }
  
  return null;
}

/**
 * Проверяет, содержит ли строка потенциально опасный JavaScript код
 */
export function containsDangerousCode(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const dangerousPatterns = [
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i, // onclick=, onerror= и т.д.
    /<script/i,
    /<\/script>/i,
    /eval\s*\(/i,
    /expression\s*\(/i,
    /import\s*\(/i,
    /require\s*\(/i,
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(text));
}

/**
 * Валидирует формулу на безопасность (базовая проверка)
 * Проверяет, что формула не содержит опасных вызовов
 */
export function isValidFormula(formula: string): { valid: boolean; error?: string } {
  if (!formula || typeof formula !== 'string') {
    return { valid: false, error: 'Формула не может быть пустой' };
  }
  
  // Проверяем на опасные паттерны
  const dangerousPatterns = [
    { pattern: /import\s*\(/i, error: 'Импорт не разрешён в формулах' },
    { pattern: /require\s*\(/i, error: 'Require не разрешён в формулах' },
    { pattern: /eval\s*\(/i, error: 'Eval не разрешён в формулах' },
    { pattern: /Function\s*\(/i, error: 'Function конструктор не разрешён' },
    { pattern: /new\s+Function/i, error: 'Function конструктор не разрешён' },
    { pattern: /\.constructor/i, error: 'Доступ к constructor не разрешён' },
    { pattern: /__proto__/i, error: 'Доступ к __proto__ не разрешён' },
    { pattern: /prototype/i, error: 'Доступ к prototype не разрешён' },
  ];
  
  for (const { pattern, error } of dangerousPatterns) {
    if (pattern.test(formula)) {
      return { valid: false, error };
    }
  }
  
  return { valid: true };
}

/**
 * Валидирует ID блока (должен быть безопасным идентификатором)
 */
export function isValidBlockId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // Разрешаем только буквы, цифры, подчёркивания и дефисы
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 100;
}

/**
 * Санитизирует текст для безопасного отображения
 * Экранирует HTML, но сохраняет переносы строк
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  // Сначала экранируем HTML
  let sanitized = escapeHtml(text);
  
  // Заменяем переносы строк на <br>
  sanitized = sanitized.replace(/\n/g, '<br>');
  
  return sanitized;
}
