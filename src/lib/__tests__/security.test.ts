/**
 * Тесты безопасности: escapeHtml, isValidUrl, isValidBlockId, isValidFormula, sanitizeText.
 */
import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  isValidUrl,
  isValidBlockId,
  isValidFormula,
  sanitizeText,
  sanitizeUrl,
  containsDangerousCode,
} from '../security';

describe('escapeHtml', () => {
  it('экранирует & < > " \'', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('пустая или не строка возвращает пустую строку', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null as any)).toBe('');
  });
});

describe('isValidUrl', () => {
  it('разрешает http и https', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://a.b')).toBe(true);
  });

  it('разрешает относительные пути', () => {
    expect(isValidUrl('/path')).toBe(true);
    expect(isValidUrl('./file')).toBe(true);
  });

  it('запрещает javascript:', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('data: только для изображений', () => {
    expect(isValidUrl('data:image/png;base64,abc')).toBe(true);
    expect(isValidUrl('data:text/html,<script>')).toBe(false);
  });
});

describe('isValidBlockId', () => {
  it('разрешает буквы, цифры, _ и -', () => {
    expect(isValidBlockId('a')).toBe(true);
    expect(isValidBlockId('input_1')).toBe(true);
    expect(isValidBlockId('my-block')).toBe(true);
  });

  it('запрещает пробелы и спецсимволы', () => {
    expect(isValidBlockId('a b')).toBe(false);
    expect(isValidBlockId('a.b')).toBe(false);
    expect(isValidBlockId('')).toBe(false);
  });
});

describe('isValidFormula', () => {
  it('принимает простую формулу', () => {
    expect(isValidFormula('a + b').valid).toBe(true);
    expect(isValidFormula('round(x)').valid).toBe(true);
  });

  it('отклоняет пустую формулу', () => {
    expect(isValidFormula('').valid).toBe(false);
  });

  it('запрещает eval, Function, import, require', () => {
    expect(isValidFormula('eval(1)').valid).toBe(false);
    expect(isValidFormula('Function("return 1")()').valid).toBe(false);
    expect(isValidFormula('import("x")').valid).toBe(false);
  });
});

describe('sanitizeText', () => {
  it('экранирует HTML и заменяет \\n на <br>', () => {
    expect(sanitizeText('<b>bold</b>')).toContain('&lt;');
    expect(sanitizeText('a\nb')).toContain('<br>');
  });
});

describe('sanitizeUrl', () => {
  it('возвращает URL если он валиден', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('возвращает null для невалидного', () => {
    expect(sanitizeUrl('javascript:void(0)')).toBe(null);
  });
});

describe('containsDangerousCode', () => {
  it('находит script и onclick', () => {
    expect(containsDangerousCode('<script>alert(1)</script>')).toBe(true);
    expect(containsDangerousCode('onclick="x"')).toBe(true);
  });

  it('безопасный текст не помечается', () => {
    expect(containsDangerousCode('Hello world')).toBe(false);
  });
});
