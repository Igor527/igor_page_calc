import React, { useMemo, useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { useCalcStore } from '@/lib/store';
import { sanitizeHtml, escapeHtml } from '@/lib/security';
import { isErrorValue } from '@/lib/errors';
import { recalculateValues } from '@/lib/engine';
import { validateBlocks, validateImportedBlocks } from '@/lib/validation';
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

function replaceTokensInHtml(
  html: string,
  blocks: Block[],
  selectedId: string | null | undefined,
  getDisplay: (id: string) => { text: string; isError?: boolean; title?: string }
): string {
  const parts = html.split(/(<[^>]+>)/g);
  const allowedIds = new Set(blocks.map((b) => b.id));

  let insideTokenSpan = false;
  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<span\b[^>]*data-token=/i.test(part)) insideTokenSpan = true;
        if (/^<\/span>/i.test(part)) insideTokenSpan = false;
        return part;
      }
      if (insideTokenSpan) return part;
      return part.replace(/@([A-Za-z0-9_-]+)/g, (match, id) => {
        if (!allowedIds.has(id)) return match;
        const display = getDisplay(id);
        const safeTitle = display.title ? ` title="${escapeHtml(display.title)}"` : '';
        const cls = selectedId === id ? 'report-token report-token-active' : 'report-token';
        return `<span data-token="${id}" class="${cls}"${safeTitle}>${escapeHtml(display.text)}</span>`;
      });
    })
    .join('');
}

function applyTableSizing(html: string): string {
  return html.replace(/<table([^>]*)>/gi, (match, attrs) => {
    const widthMatch = attrs.match(/data-width\s*=\s*"([^"]+)"/i);
    if (!widthMatch) return '<table>';
    const raw = widthMatch[1].trim();
    if (!/^\d{1,3}$/.test(raw)) return '<table>';
    const numeric = Math.min(100, Math.max(10, Number(raw)));
    return `<table style="width:${numeric}%">`;
  });
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
}

const ReportPanel = React.forwardRef<ReportPanelHandle, ReportPanelProps>(({ onSelect, selectedId }, ref) => {
  const blocks = useCalcStore((s) => s.blocks);
  const values = useCalcStore((s) => s.values);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const [editorHtml, setEditorHtml] = useState<string>('');
  const editorRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storageKey = 'igor-page-calc-report-html';
  const demoTemplate = parkingDemoBundle.reportHtml || '';
  const [tableRows, setTableRows] = useState<number>(3);
  const [tableCols, setTableCols] = useState<number>(3);
  const [tableWidth, setTableWidth] = useState<number>(100);
  const [viewMode, setViewMode] = useState<'formulas' | 'values'>('formulas');
  const [reportScale, setReportScale] = useState<number>(1);
  const fontSizeKey = 'igor-page-calc-report-font-size';
  const [fontSize, setFontSize] = useState<number>(14);
  const tokenStyles = `.report-token{cursor:pointer;font-weight:600;color:var(--pico-color);} .report-token-active{background:#ffe08a;color:#222;padding:0 2px;border-radius:3px;}`;
  const numberInputStyle = { width: 96, marginBottom: 0, paddingRight: 20, fontSize: 13 };

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
    if (block.type === 'formula') {
      const valuesLine = `@${block.id} = ${formatFormulaValues(block)}`.trim();
      const tokensLine = `${formatValue(values[block.id])} = ${formatFormulaTokens(block)}`.trim();
      return `${valuesLine}\n${tokensLine}`.trim();
    }
    return formatValue(values[id]);
  }, [blockMap, formatFormulaTokens, formatFormulaValues, values]);

  const getDisplayForMode = useCallback((id: string) => {
    const block = blockMap.get(id);
    const value = values[id];
    const title = getTokenHint(id);
    if (!block) {
      return { text: formatValue(value), title };
    }
    if (block.type === 'formula') {
      const valuesLine = `@${block.id} = ${formatFormulaValues(block)}`.trim();
      const tokensLine = `${formatValue(values[block.id])} = ${formatFormulaTokens(block)}`.trim();
      if (viewMode === 'values') {
        return { text: valuesLine, title };
      }
      return { text: tokensLine, title };
    }
    if (isErrorValue(value)) {
      return { text: `Ошибка: ${formatValue(value)}`, title };
    }
    return { text: formatValue(value), title };
  }, [blockMap, formatFormulaTokens, formatFormulaValues, getTokenHint, viewMode, values]);

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
    if (viewMode !== 'formulas') return;
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    if (editor.innerHTML !== decoratedEditorHtml) {
      editor.innerHTML = decoratedEditorHtml;
    }
  }, [viewMode, decoratedEditorHtml]);

  useEffect(() => {
    if (!selectedId) return;
    const container = viewMode === 'formulas' ? editorContainerRef.current : previewContainerRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-token="${selectedId}"]`) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId, viewMode, editorHtml, previewHtml]);

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

  useImperativeHandle(ref, () => ({ insertToken }), [insertToken]);

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
    const payload = {
      blocks,
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
    const payload = {
      blocks: parkingDemo as Block[],
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
      } catch (error) {
        console.error('Ошибка импорта JSON:', error);
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
          paddingBottom: 6,
          borderBottom: '1px solid var(--pico-border-color)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Редактор отчета</h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'formulas' ? 'values' : 'formulas')}
              style={{ fontSize: 13 }}
            >
              {viewMode === 'formulas' ? 'Показать значения' : 'Показать формулы'}
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Размер шрифта
              <input
                type="number"
                min={10}
                max={28}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value) || 14)}
                style={numberInputStyle}
              />
              <input
                type="range"
                min={10}
                max={28}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value) || 14)}
                style={{ width: 120 }}
              />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Масштаб
              <input
                type="range"
                min={80}
                max={140}
                value={Math.round(reportScale * 100)}
                onChange={(e) => setReportScale(Number(e.target.value) / 100)}
                style={{ width: 140 }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
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
            <button type="button" onClick={insertTable} style={{ fontSize: 13 }}>
              Вставить таблицу
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" onClick={() => applyFormat('bold')} style={{ fontSize: 13 }}>
            Жирный
          </button>
          <button type="button" onClick={() => applyFormat('italic')} style={{ fontSize: 13 }}>
            Курсив
          </button>
          <button type="button" onClick={() => applyFormat('underline')} style={{ fontSize: 13 }}>
            Подчеркнутый
          </button>
          <button type="button" onClick={() => applyFormat('removeFormat')} style={{ fontSize: 13 }}>
            Очистить формат
          </button>
          <button type="button" onClick={exportJson} style={{ fontSize: 13 }}>
            Экспорт JSON
          </button>
          <button type="button" onClick={exportDemoJson} style={{ fontSize: 13 }}>
            Экспорт демо JSON
          </button>
          <button type="button" onClick={importJson} style={{ fontSize: 13 }}>
            Импорт JSON
          </button>
          <button type="button" onClick={loadDemo} style={{ fontSize: 13 }}>
            Загрузить демо
          </button>
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

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8 }}>
        {viewMode === 'formulas' ? (
          <div ref={editorContainerRef}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setEditorHtml((e.target as HTMLDivElement).innerHTML)}
              onMouseUp={() => {
                const token = getTokenFromSelection();
                if (token && onSelect) {
                  onSelect(token);
                }
              }}
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
              }}
            />
          </div>
        ) : (
          <div ref={previewContainerRef}>
            <div
              style={{
                minHeight: 260,
                padding: 12,
                border: '1px solid var(--pico-border-color)',
                borderRadius: 8,
                background: 'var(--pico-card-background-color)',
                color: 'var(--pico-color)',
                fontSize,
                transform: `scale(${reportScale})`,
                transformOrigin: '0 0',
                width: `${100 / reportScale}%`,
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement | null;
                const token = target?.dataset?.token;
                if (token && onSelect) {
                  onSelect(token);
                }
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>


    </section>
  );
});

export default ReportPanel;
