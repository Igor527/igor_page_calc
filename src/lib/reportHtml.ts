/**
 * Обработка HTML отчёта: подстановка токенов @id и размеры таблиц.
 * Используется в ReportPanel (редактор) и в PublicCalculator (публичный вид).
 */

import { escapeHtml } from '@/lib/security';
import type { Block } from '@/types/blocks';

/**
 * Убирает все внешние round(...) из формулы только для отображения (расчёт остаётся с round).
 * Например: "round(max(0, x))" → "max(0, x)", "round(round(x))" → "x".
 */
export function stripRoundForDisplay(formula: string): string {
  let t = formula.trim();
  for (;;) {
    if (!/^round\s*\(/i.test(t)) return t;
    const open = t.indexOf('(');
    let depth = 0;
    let found = false;
    for (let i = open; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')') {
        depth--;
        if (depth === 0) {
          t = t.slice(open + 1, i).trim();
          found = true;
          break;
        }
      }
    }
    if (!found) return formula.trim();
  }
}

/**
 * Подставляет в выражение формулы значения переменных.
 * Возвращает "expr = value" или только "expr" при exprOnly.
 * stripRoundForDisplay: убрать round(...) только из отображаемого выражения (расчёт не меняется).
 */
export function buildFormulaWithValues(
  block: Block,
  values: Record<string, unknown>,
  formatValue: (v: unknown) => string,
  exprOnly?: boolean,
  stripRoundForDisplayOption?: boolean
): string {
  if (block.type !== 'formula' || !('formula' in block)) return formatValue(values[block.id]);
  const deps = Array.isArray((block as { dependencies?: string[] }).dependencies) ? (block as { dependencies: string[] }).dependencies : [];
  let formula = String((block as { formula?: string }).formula ?? '');
  if (stripRoundForDisplayOption) formula = stripRoundForDisplay(formula);
  const map: Record<string, string> = {};
  deps.forEach((dep) => {
    map[dep] = formatValue(values[dep]);
  });
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let expr = formula;
  keys.forEach((key) => {
    if (!key) return;
    const val = map[key];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expr = expr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), val);
  });
  const exprStr = expr.trim();
  if (exprOnly) return exprStr || formatValue(values[block.id]);
  const resultStr = formatValue(values[block.id]);
  return exprStr ? `${exprStr} = ${resultStr}` : resultStr;
}

/**
 * Шаги вычислений формулы: выражение с подставленными значениями, без round в отображении.
 * Для блока-формулы возвращает строку вида "50000/33*0.257*1"; для остальных — форматированное значение.
 * Используется токеном @id.stepsCalculations в отчёте.
 */
export function getStepsCalculations(
  block: Block,
  values: Record<string, unknown>,
  formatValue: (v: unknown) => string
): string {
  if (block.type !== 'formula' || !('formula' in block)) {
    return formatValue(values[block.id]);
  }
  return buildFormulaWithValues(block, values, formatValue, true, true);
}

/** Парсит токен "id", "id:suffix" или "id.stepsCalculations" в { id, suffix }. */
export function parseReportToken(token: string): { id: string; suffix?: string } {
  const dot = token.indexOf('.');
  const colon = token.indexOf(':');
  if (dot >= 0) {
    return { id: token.slice(0, dot), suffix: token.slice(dot + 1) || undefined };
  }
  if (colon >= 0) {
    return { id: token.slice(0, colon), suffix: token.slice(colon + 1) || undefined };
  }
  return { id: token };
}

export type GetDisplayFn = (
  id: string,
  suffix?: string
) => { text: string; isError?: boolean; title?: string };

/** Токены: @id, @id:suffix (expr, exprOnly), @id.stepsCalculations (шаги вычислений без round) */
const TOKEN_RE = /@([A-Za-z0-9_-]+)(?::([a-z]+)|\.([A-Za-z]+))?/g;

export function replaceTokensInHtml(
  html: string,
  blocks: Block[],
  selectedId: string | null | undefined,
  getDisplay: GetDisplayFn
): string {
  const allowedIds = new Set(blocks.map((b) => b.id));

  let result = html.replace(/<span\b[^>]*data-token="([^"]+)"[^>]*>.*?<\/span>/gi, (match, token) => {
    const { id, suffix } = parseReportToken(token);
    if (!allowedIds.has(id)) return match;
    const display = getDisplay(id, suffix);
    const safeTitle = display.title ? ` title="${escapeHtml(display.title)}"` : '';
    const cls = selectedId === id ? 'report-token report-token-active' : 'report-token';
    return `<span data-token="${token}" class="${cls}"${safeTitle}>${escapeHtml(display.text)}</span>`;
  });

  const parts = result.split(/(<[^>]+>)/g);
  let insideTokenSpan = false;
  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<span\b[^>]*data-token=/i.test(part)) insideTokenSpan = true;
        if (/^<\/span>/i.test(part)) insideTokenSpan = false;
        return part;
      }
      if (insideTokenSpan) return part;
      return part.replace(TOKEN_RE, (match, id, suffixColon, suffixDot) => {
        if (!allowedIds.has(id)) return match;
        const suffix = suffixColon ?? suffixDot;
        const tokenStr = id + (suffixColon != null ? ':' + suffixColon : suffixDot != null ? '.' + suffixDot : '');
        const display = getDisplay(id, suffix);
        const safeTitle = display.title ? ` title="${escapeHtml(display.title)}"` : '';
        const cls = selectedId === id ? 'report-token report-token-active' : 'report-token';
        return `<span data-token="${tokenStr}" class="${cls}"${safeTitle}>${escapeHtml(display.text)}</span>`;
      });
    })
    .join('');
}

export function applyTableSizing(html: string): string {
  return html.replace(/<table([^>]*)>/gi, (match, attrs) => {
    const widthMatch = attrs.match(/data-width\s*=\s*"([^"]+)"/i);
    if (!widthMatch) return '<table>';
    const raw = widthMatch[1].trim();
    if (!/^\d{1,3}$/.test(raw)) return '<table>';
    const numeric = Math.min(100, Math.max(10, Number(raw)));
    return `<table style="width:${numeric}%">`;
  });
}
