import React, { useMemo, useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { useCalcStore } from '@/lib/store';
import { sanitizeHtml, escapeHtml } from '@/lib/security';
import { replaceTokensInHtml, applyTableSizing, buildFormulaWithValues, getStepsCalculations, containsFormulaFunctionText } from '@/lib/reportHtml';
import { isErrorValue, extractErrorMessage } from '@/lib/errors';
import { recalculateValues } from '@/lib/engine';
import { validateBlocks, validateImportedBlocks } from '@/lib/validation';
import { toMatrixTableBlock } from '@/lib/tableData';
import type { Block } from '@/types/blocks';
import parkingDemo from '@/data/parking_demo.json';
import parkingDemoBundle from '@/data/parking_demo_bundle.json';

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Объект]';
    }
  }
  return String(value);

}

function getTokenFromSelection(): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent || '';
  if (!text) return null;
  const offset = range.startOffset;
  const safeOffset = Math.min(Math.max(offset, 0), text.length);

  let left = safeOffset;
  while (left > 0 && /[A-Za-z0-9_-]/.test(text[left - 1])) {
    left -= 1;
  }
  if (left === 0 || text[left - 1] !== '@') return null;
  let right = safeOffset;
  while (right < text.length && /[A-Za-z0-9_-]/.test(text[right])) {
    right += 1;
  }
  const token = text.slice(left, right).trim();
  return token || null;
}

interface ReportPanelProps {
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

export interface ReportPanelHandle {
  insertToken: (id: string) => void;
  getEditorHtml: () => string;
  setEditorHtml: (html: string) => void;
}

const ReportPanel = React.forwardRef<ReportPanelHandle, ReportPanelProps>(({ onSelect, selectedId }, ref) => {
  const blocks = useCalcStore((s) => s.blocks);
  const values = useCalcStore((s) => s.values);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const [editorHtml, setEditorHtml] = useState<string>('');
  const editorRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageKey = 'igor-page-calc-report-html';
  const demoTemplate = parkingDemoBundle.reportHtml || '';
  const [tableRows, setTableRows] = useState<number>(3);
  const [tableCols, setTableCols] = useState<number>(3);
  const [tableWidth, setTableWidth] = useState<number>(100);
  const [viewMode, setViewMode] = useState<'formulas' | 'values'>('values');
  const [reportScale, setReportScale] = useState<number>(1);
  const fontSizeKey = 'igor-page-calc-report-font-size';
  const [fontSize, setFontSize] = useState<number>(14);
  const [tokenPopup, setTokenPopup] = useState<{ id: string; x: number; y: number } | null>(null);
  const tokenStyles = `.report-token{cursor:pointer;font-weight:600;color:var(--pico-color);} .report-token-active{background:#ffe08a;color:#222;padding:0 2px;border-radius:3px;}`;
  const numberInputStyle = { width: 70, marginBottom: 0, paddingRight: 12, fontSize: 12, height: 28 };

  const errorItems = useMemo(() => {
    return blocks
      .filter((b) => isErrorValue(values[b.id]))
      .map((b) => ({
        id: b.id,
        label: b.label || b.id,
        message: extractErrorMessage(values[b.id]) || 'Неизвестная ошибка',
      }));
  }, [blocks, values]);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && saved.trim()) {
      setEditorHtml(saved);
      if (editorRef.current) {
        editorRef.current.innerHTML = saved;
      }
      return;
    }

    if (demoTemplate) {
      setEditorHtml(demoTemplate);
      if (editorRef.current) {
        editorRef.current.innerHTML = demoTemplate;
      }
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(fontSizeKey);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setFontSize(Math.min(28, Math.max(10, parsed)));
    }
  }, []);

  const loadDemo = () => {
    const demoBlocks = parkingDemo as Block[];
    setBlocks(demoBlocks);
    const nextValues = recalculateValues(demoBlocks, {});
    setValues(nextValues);

    if (demoTemplate) {
      setEditorHtml(demoTemplate);
      if (editorRef.current) {
        editorRef.current.innerHTML = demoTemplate;
      }
    }
  };

  useEffect(() => {
    if (!editorHtml) return;
    localStorage.setItem(storageKey, editorHtml);
  }, [editorHtml]);

  useEffect(() => {
    const handleReportReplace = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (!custom.detail || typeof custom.detail !== 'string') return;
      setEditorHtml(custom.detail);
      if (editorRef.current && document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = custom.detail;
      }
    };

    window.addEventListener('report-html-replace', handleReportReplace);
    return () => window.removeEventListener('report-html-replace', handleReportReplace);
  }, []);

  useEffect(() => {
    localStorage.setItem(fontSizeKey, String(fontSize));
  }, [fontSize]);

  const availableTokens = useMemo(() => {
    return blocks
      .filter((b) => b.type !== 'group')
      .map((b) => ({ id: b.id, label: b.label || b.id, type: b.type }));
  }, [blocks]);

  const blockMap = useMemo(() => {
    return new Map(blocks.map((block) => [block.id, block]));
  }, [blocks]);

  const escapeRegex = useCallback((value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }, []);

  const replaceIdentifiers = useCallback((expression: string, replacements: Record<string, string>) => {
    let result = expression;
    const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    keys.forEach((key) => {
      const value = replacements[key];
      if (!key) return;
      const regex = new RegExp(`\\b${escapeRegex(key)}\\b`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  }, [escapeRegex]);

  const formatFormulaTokens = useCallback((block: Block) => {
    if (block.type !== 'formula' || !('formula' in block)) return '';
    const deps = Array.isArray(block.dependencies) ? block.dependencies : [];
    const map: Record<string, string> = {};
    deps.forEach((dep) => {
      map[dep] = `@${dep}`;
    });
    const expr = replaceIdentifiers(String(block.formula || ''), map);
    return expr.trim();
  }, [replaceIdentifiers]);

  const formatFormulaValues = useCallback((block: Block) => {
    if (block.type !== 'formula' || !('formula' in block)) return '';
    const deps = Array.isArray(block.dependencies) ? block.dependencies : [];
    const map: Record<string, string> = {};
    deps.forEach((dep) => {
      map[dep] = formatValue(values[dep]);
    });
    const expr = replaceIdentifiers(String(block.formula || ''), map);
    return expr.trim();
  }, [replaceIdentifiers, values]);

  const getTokenHint = useCallback((id: string) => {
    const block = blockMap.get(id);
    if (!block) return '';
    if (block.description && block.description.trim()) {
      return block.description.trim();
    }
    if (block.type === 'formula') {
      const valuesLine = `@${block.id} = ${formatFormulaValues(block)}`.trim();
      const tokensLine = `${formatValue(values[block.id])} = ${formatFormulaTokens(block)}`.trim();
      return `${valuesLine}\n${tokensLine}`.trim();
    }
    return formatValue(values[id]);
  }, [blockMap, formatFormulaTokens, formatFormulaValues, values]);

  const getTokenPopupLines = useCallback((id: string) => {
    const block = blockMap.get(id);
    if (block && block.type === 'formula') {
      const valuesLine = `${formatValue(values[id])} = ${formatFormulaValues(block)}`.trim();
      const tokensLine = `@${id} = ${formatFormulaTokens(block)}`.trim();
      return { line1: valuesLine, line2: tokensLine };
    }
    return { line1: formatValue(values[id]), line2: `@${id}` };
  }, [blockMap, formatFormulaTokens, formatFormulaValues, values]);

  const getDisplayForMode = useCallback((id: string, suffix?: string) => {
    const block = blockMap.get(id);
    const value = values[id];
    const title = getTokenHint(id);
    // Токен @id:expr — формула с числами и результат (в окне формулы; round убран из отображения)
    if (suffix === 'expr' && block) {
      const text = buildFormulaWithValues(block, values, (v) => formatValue(v), false, true);
      return { text, title };
    }
    // Токен @id:exprOnly или @id.stepsCalculations
    if ((suffix === 'exprOnly' || suffix === 'stepsCalculations') && block) {
      if (viewMode === 'formulas' && block.type === 'formula') {
        const text = formatFormulaTokens(block);
        return { text, title };
      }
      const text = getStepsCalculations(block, values, (v) => formatValue(v));
      // В режиме значений не показываем служебные имена функций вроде max/min/ceil.
      return { text: containsFormulaFunctionText(text) ? formatValue(value) : text, title };
    }
    if (viewMode === 'formulas') {
      const tokenText = suffix ? (suffix === 'stepsCalculations' ? `@${id}.${suffix}` : `@${id}:${suffix}`) : `@${id}`;
      return { text: tokenText, title };
    }
    if (isErrorValue(value)) {
      return { text: `Ошибка: ${formatValue(value)}`, title };
    }
    // В ячейке значения — только число (подстановка "= expr" только в ячейке формулы через @id:exprOnly)
    return { text: formatValue(value), title };
  }, [blockMap, formatFormulaTokens, formatFormulaValues, getTokenHint, viewMode, values]);

  const handleTokenClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const token = target?.dataset?.token;
    if (!token) {
      setTokenPopup(null);
      return;
    }
    onSelect?.(token);
    setTokenPopup({ id: token, x: event.clientX, y: event.clientY });
  }, [onSelect]);

  const previewHtml = useMemo(() => {
    const safeHtml = sanitizeHtml(editorHtml || '');
    const sizedHtml = applyTableSizing(safeHtml);
    return replaceTokensInHtml(sizedHtml, blocks, selectedId, getDisplayForMode);
  }, [editorHtml, blocks, selectedId, getDisplayForMode]);

  const decoratedEditorHtml = useMemo(() => {
    const safeHtml = sanitizeHtml(editorHtml || '');
    return replaceTokensInHtml(safeHtml, blocks, selectedId, getDisplayForMode);
  }, [editorHtml, blocks, selectedId, getDisplayForMode]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    if (editor.innerHTML !== decoratedEditorHtml) {
      editor.innerHTML = decoratedEditorHtml;
    }
  }, [decoratedEditorHtml]);

  useEffect(() => {
    if (!selectedId) return;
    const container = editorContainerRef.current;
    if (!container) return;
    const target =
      container.querySelector(`[data-token="${selectedId}"]`) as HTMLElement | null
      ?? container.querySelector(`[data-token^="${selectedId}."]`) as HTMLElement | null
      ?? container.querySelector(`[data-token^="${selectedId}:"]`) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId, editorHtml, previewHtml]);

  const applyFormat = (command: string) => {
    document.execCommand(command, false);
    if (editorRef.current) {
      setEditorHtml(editorRef.current.innerHTML);
    }
  };

  const insertToken = useCallback((id: string) => {
    if (viewMode === 'formulas') {
      const hint = getTokenHint(id);
      const safeTitle = hint ? ` title="${escapeHtml(hint)}"` : '';
      document.execCommand(
        'insertHTML',
        false,
        `<span data-token="${id}" class="report-token"${safeTitle}>@${id}</span>`
      );
    } else {
      document.execCommand('insertText', false, `@${id}`);
    }
    if (editorRef.current) {
      setEditorHtml(editorRef.current.innerHTML);
      editorRef.current.focus();
    }
  }, [getTokenHint, viewMode]);

  const getEditorHtml = useCallback(() => {
    if (editorRef.current) return editorRef.current.innerHTML;
    return editorHtml;
  }, [editorHtml]);

  const setEditorHtmlExternal = useCallback((html: string) => {
    setEditorHtml(html);
    if (editorRef.current) editorRef.current.innerHTML = html;
  }, []);

  useImperativeHandle(ref, () => ({ insertToken, getEditorHtml, setEditorHtml: setEditorHtmlExternal }), [insertToken, getEditorHtml, setEditorHtmlExternal]);

  const insertTable = () => {
    const rows = Math.min(20, Math.max(1, tableRows));
    const cols = Math.min(12, Math.max(1, tableCols));
    const width = Math.min(100, Math.max(10, tableWidth));
    const cells = Array.from({ length: cols }, () => '<td>&nbsp;</td>').join('');
    const rowsHtml = Array.from({ length: rows }, () => `<tr>${cells}</tr>`).join('');
    const tableHtml = `<table data-width="${width}"><tbody>${rowsHtml}</tbody></table>`;
    document.execCommand('insertHTML', false, tableHtml);
    if (editorRef.current) {
      setEditorHtml(editorRef.current.innerHTML);
      editorRef.current.focus();
    }
  };

  const exportJson = () => {
    const normalizedBlocks = blocks.map((block) => block.type === 'data_table' ? toMatrixTableBlock(block as any) : block);
    const payload = {
      blocks: normalizedBlocks,
      reportHtml: editorHtml,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calculator-export.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportDemoJson = () => {
    const normalizedBlocks = (parkingDemo as Block[]).map((block) => block.type === 'data_table' ? toMatrixTableBlock(block as any) : block);
    const payload = {
      blocks: normalizedBlocks,
      reportHtml: demoTemplate,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'parking-demo.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result || '');
        const parsed = JSON.parse(raw);
        let nextBlocks: Block[] = [];
        let nextReportHtml = '';

        if (Array.isArray(parsed)) {
          const validation = validateImportedBlocks(raw);
          if (!validation.valid || !validation.blocks) {
            alert(validation.error || 'Некорректный JSON');
            return;
          }
          nextBlocks = validation.blocks;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.blocks)) {
            const validation = validateBlocks(parsed.blocks as Block[]);
            if (!validation.valid) {
              alert('Ошибки валидации блоков');
              return;
            }
            nextBlocks = parsed.blocks as Block[];
          } else {
            alert('JSON должен содержать массив blocks');
            return;
          }

          if (typeof parsed.reportHtml === 'string') {
            nextReportHtml = parsed.reportHtml;
          }
        } else {
          alert('Некорректный JSON');
          return;
        }

        setBlocks(nextBlocks);
        const nextValues = recalculateValues(nextBlocks, {});
        setValues(nextValues);

        if (nextReportHtml) {
          setEditorHtml(nextReportHtml);
          if (editorRef.current) {
            editorRef.current.innerHTML = nextReportHtml;
          }
        }
      } catch {
        alert('Не удалось импортировать JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <section
      style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}
    >
      <style>{tokenStyles}</style>
      <div
        onWheel={(e) => e.stopPropagation()}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--pico-card-background-color)',
          paddingBottom: 4,
          borderBottom: '1px solid var(--pico-border-color)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Редактор отчета</h2>
        </div>

        {errorItems.length > 0 && (
          <div
            style={{
              padding: '6px 8px',
              border: '1px solid #ffc107',
              borderRadius: 6,
              background: '#3b2e07',
              color: '#ffe39a',
              fontSize: 12,
            }}
          >
            Обнаружены ошибки в данных. Исправьте значения таблиц/вводов и повторите расчет.
            {errorItems.slice(0, 3).map((item) => (
              <div key={item.id} style={{ marginTop: 4 }}>
                • {item.label}: {item.message}
              </div>
            ))}
            {errorItems.length > 3 && (
              <div style={{ marginTop: 4 }}>… и еще {errorItems.length - 3} ошибок</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: '100%', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'formulas' ? 'values' : 'formulas')}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              {viewMode === 'formulas' ? 'Показать значения' : 'Показать формулы'}
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Шрифт, px
              <input
                type="number"
                min={10}
                max={28}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value) || 14)}
                style={numberInputStyle}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Масштаб
              <input
                type="range"
                min={80}
                max={140}
                value={Math.round(reportScale * 100)}
                onChange={(e) => setReportScale(Number(e.target.value) / 100)}
                onWheel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                style={{ width: 110 }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: '100%', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Строки
              <input
                type="number"
                min={1}
                max={20}
                value={tableRows}
                onChange={(e) => setTableRows(Number(e.target.value) || 1)}
                style={numberInputStyle}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Столбцы
              <input
                type="number"
                min={1}
                max={12}
                value={tableCols}
                onChange={(e) => setTableCols(Number(e.target.value) || 1)}
                style={numberInputStyle}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Ширина %
              <input
                type="number"
                min={10}
                max={100}
                value={tableWidth}
                onChange={(e) => setTableWidth(Number(e.target.value) || 100)}
                style={numberInputStyle}
              />
            </label>
            <button type="button" onClick={insertTable} style={{ fontSize: 12, padding: '4px 8px' }}>
              Вставить таблицу
            </button>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => applyFormat('bold')} style={{ fontSize: 12, padding: '4px 8px' }}>
                Жирный
              </button>
              <button type="button" onClick={() => applyFormat('italic')} style={{ fontSize: 12, padding: '4px 8px' }}>
                Курсив
              </button>
              <button type="button" onClick={() => applyFormat('underline')} style={{ fontSize: 12, padding: '4px 8px' }}>
                Подчеркнутый
              </button>
              <button type="button" onClick={() => applyFormat('removeFormat')} style={{ fontSize: 12, padding: '4px 8px' }}>
                Очистить формат
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button type="button" onClick={exportJson} style={{ fontSize: 12, padding: '4px 8px' }}>
              Экспорт JSON
            </button>
            <button type="button" onClick={importJson} style={{ fontSize: 12, padding: '4px 8px' }}>
              Импорт JSON
            </button>
            <button type="button" onClick={loadDemo} style={{ fontSize: 12, padding: '4px 8px' }}>
              Загрузить демо
            </button>
          </div>
        </div>

      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImportFile(file);
            e.target.value = '';
          }
        }}
      />

      <div
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 8 }}
        onWheel={(e) => e.stopPropagation()}
        onScroll={() => setTokenPopup(null)}
        onClick={(e) => handleTokenClick(e)}
      >
        <div ref={editorContainerRef} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const raw = (e.target as HTMLDivElement).innerHTML;
              const normalized = sanitizeHtml(raw).replace(/<span\b[^>]*data-token="([^"]+)"[^>]*>.*?<\/span>/gi, (_match, id) => {
                return `<span data-token="${id}" class="report-token">@${id}</span>`;
              });
              setEditorHtml(normalized);
            }}
            onMouseUp={() => {
              const token = getTokenFromSelection();
              if (token && onSelect) {
                onSelect(token);
              }
            }}
            onClick={handleTokenClick}
            style={{
              minHeight: 260,
              padding: 12,
              fontSize,
              background: 'var(--pico-code-background-color)',
              color: 'var(--pico-color)',
              border: '1px solid var(--pico-border-color)',
              borderRadius: 8,
              outline: 'none',
              transform: `scale(${reportScale})`,
              transformOrigin: '0 0',
              width: `${100 / reportScale}%`,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          />
        </div>
      </div>

      {tokenPopup && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(window.innerWidth - 260, tokenPopup.x + 12),
            top: Math.min(window.innerHeight - 90, tokenPopup.y + 12),
            background: 'var(--pico-card-background-color)',
            color: 'var(--pico-color)',
            border: '1px solid var(--pico-border-color)',
            borderRadius: 8,
            padding: '6px 8px',
            fontSize: 12,
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            zIndex: 10,
            maxWidth: 240,
            whiteSpace: 'pre-wrap',
          }}
        >
          <div>{getTokenPopupLines(tokenPopup.id).line1}</div>
          <div style={{ marginTop: 4, color: 'var(--pico-muted-color)' }}>
            {getTokenPopupLines(tokenPopup.id).line2}
          </div>
        </div>
      )}


    </section>
  );
});

export default ReportPanel;
