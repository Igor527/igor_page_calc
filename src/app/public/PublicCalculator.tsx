// Публичный вид калькулятора (без редактора)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCalcStore } from '@/lib/store';
import { recalculateValues } from '@/lib/engine';
import ChartRenderer from '@/components/editor/ChartRenderer';
import { sanitizeText, sanitizeUrl, sanitizeHtml } from '@/lib/security';
import { normalizeTableData } from '@/lib/tableData';
import { replaceTokensInHtml, applyTableSizing, buildFormulaWithValues, getStepsCalculations } from '@/lib/reportHtml';
import type { Block, GroupBlock, InputBlock, SelectFromTableBlock, DataTableBlock, ImageBlock, ChartBlock } from '@/types/blocks';

interface PublicCalculatorProps {
  calculatorId?: string;
  blocks?: Block[];
  /** Режим превью: не трогает глобальный store, использует локальное состояние (для панели ревью) */
  previewMode?: boolean;
  /** Начальные значения (опционально, для превью) */
  initialValues?: Record<string, number | string>;
  /** HTML отчёта из редактора (как в ReportPanel); если задан — под полями ввода показывается отчёт с подставленными значениями */
  reportHtml?: string;
}

/** Безопасный вывод значения в UI: объекты не рендерятся как React child, приводим к строке */
function formatValueForDisplay(val: unknown): string {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return '[Объект]';
    }
  }
  return String(val);
}

/** Получить опции select_from_table, повторяя логику из renderBlock */
function getSelectFromTableOptions(selBlock: SelectFromTableBlock, allBlocks: Block[]): string[] {
  const tableBlock = allBlocks.find(b => b.id === selBlock.dataSource && b.type === 'data_table') as DataTableBlock | undefined;
  const normalized = tableBlock ? normalizeTableData(tableBlock) : null;
  if (!normalized) return [];
  let filteredRows = normalized.rows;
  if (selBlock.filter) {
    filteredRows = filteredRows.filter((row: any) =>
      Object.entries(selBlock.filter!).every(([col, val]) => row[col] === val)
    );
  }
  if (selBlock.range) {
    filteredRows = filteredRows.filter((row: any) => {
      const val = row[selBlock.column];
      const num = typeof val === 'number' ? val : parseFloat(String(val));
      if (isNaN(num)) return true;
      if (selBlock.range!.min !== undefined && num < selBlock.range!.min) return false;
      if (selBlock.range!.max !== undefined && num > selBlock.range!.max) return false;
      return true;
    });
  }
  return filteredRows.map((row: any) => {
    if (selBlock.multipleColumns && selBlock.multipleColumns.length > 0) {
      return selBlock.multipleColumns.map(col => row[col]).join(' ');
    }
    return String(row[selBlock.column] || '');
  });
}

/** Собрать упорядоченный список ID заполняемых полей (input / select_from_table) */
function getOrderedFillableIds(blocks: Block[]): string[] {
  const result: string[] = [];
  const groupChildIds = new Set(
    blocks.filter(b => b.type === 'group').flatMap((g: any) =>
      Array.isArray(g.children) ? g.children.map((c: any) => typeof c === 'string' ? c : c.id) : []
    )
  );
  const collect = (block: Block) => {
    if (block.type === 'group') {
      const group = block as GroupBlock;
      if (Array.isArray(group.children)) {
        for (const child of group.children) {
          const childBlock = typeof child === 'string' ? blocks.find(b => b.id === child) : child;
          if (childBlock) collect(childBlock);
        }
      }
      return;
    }
    if (block.type === 'select_from_table') {
      if ((block as SelectFromTableBlock).lockValue) return;
      result.push(block.id);
      return;
    }
    if (block.type === 'input') {
      result.push(block.id);
    }
  };
  for (const block of blocks) {
    if (!groupChildIds.has(block.id)) collect(block);
  }
  return result;
}

/** Лучшее совпадение token → option из списка */
function findBestMatch(token: string, options: string[]): string {
  if (options.length === 0) return token;
  const lower = token.toLowerCase().trim();
  const exact = options.find(o => o === token);
  if (exact) return exact;
  const ci = options.find(o => o.toLowerCase() === lower);
  if (ci) return ci;
  const startsWith = options.find(o => o.toLowerCase().startsWith(lower));
  if (startsWith) return startsWith;
  const contains = options.find(o => o.toLowerCase().includes(lower));
  if (contains) return contains;
  return options[0];
}

/** Привести token к значению, подходящему для конкретного блока (число / опция селекта / текст) */
function matchValueToField(block: Block, token: string, allBlocks: Block[]): string | number {
  if (block.type === 'input') {
    const inp = block as InputBlock;
    if (inp.inputType === 'number') {
      const num = parseFloat(token);
      return isNaN(num) ? 0 : num;
    }
    if (inp.inputType === 'select' && inp.options && inp.options.length > 0) {
      return findBestMatch(token, inp.options);
    }
    return token;
  }
  if (block.type === 'select_from_table') {
    const opts = getSelectFromTableOptions(block as SelectFromTableBlock, allBlocks);
    if (opts.length > 0) return findBestMatch(token, opts);
    return token;
  }
  return token;
}

/** Разобрать текст из буфера на отдельные токены. Строки в кавычках "..." или '...' — один токен. */
function parseClipboardTokens(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = text.length;
  const isSpace = (c: string) => /[\s\t\n]/.test(c);

  while (i < n) {
    while (i < n && isSpace(text[i])) i++;
    if (i >= n) break;
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      i++;
      const start = i;
      while (i < n && text[i] !== quote) i++;
      tokens.push(text.slice(start, i));
      i++;
    } else {
      const start = i;
      while (i < n && !isSpace(text[i])) i++;
      const t = text.slice(start, i).trim();
      if (t) tokens.push(t);
    }
  }
  return tokens;
}

// Функция рендеринга блока (аналогична ReportPanel, но без редактирования)
function renderBlock(
  block: Block,
  values: Record<string, any>,
  allBlocks: Block[],
  onValueChange: (id: string, value: number | string) => void,
  onPasteFill?: (startBlockId: string, clipboardText: string) => boolean
): React.ReactNode {
  if (block.type === 'group') {
    const group = block as GroupBlock;
    return (
      <div key={group.id} style={{ border: '1px solid var(--pico-border-color)', borderRadius: 8, margin: '12px 0', padding: 10, background: 'var(--pico-card-background-color)', color: 'var(--pico-color)' }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--pico-color)' }}>{group.title || group.label || 'Группа'}</div>
        <div style={{ marginLeft: 12 }}>
          {Array.isArray(group.children) && group.children.length > 0
            ? group.children.map(child => {
                const childBlock = typeof child === 'string' ? allBlocks.find(b => b.id === child) : child;
                return childBlock ? renderBlock(childBlock, values, allBlocks, onValueChange, onPasteFill) : null;
              })
            : <span style={{ color: 'var(--pico-muted-color)' }}>Нет блоков</span>}
        </div>
      </div>
    );
  }

  if (block.type === 'output') {
    return (
      <div key={block.id} style={{ margin: '8px 0', fontWeight: 500, color: 'var(--pico-color)' }}>
        {block.label || 'Результат'}: <span style={{ color: 'var(--pico-primary-color)', fontWeight: 600 }}>{formatValueForDisplay(values[block.id])}</span>
      </div>
    );
  }

  if (block.type === 'chart') {
    const chartBlock = block as ChartBlock;
    const dataSourceBlock = allBlocks.find(
      b => b.id === chartBlock.dataSource && b.type === 'data_table'
    ) as DataTableBlock | undefined;
    
    return (
      <div key={block.id} style={{ margin: '12px 0' }}>
        <ChartRenderer block={chartBlock} dataSource={dataSourceBlock || null} />
      </div>
    );
  }

  if (block.type === 'text') {
    const sanitizedContent = sanitizeText(block.content || '');
    const Tag = block.style === 'h1' ? 'h1' : 'div';
    return (
      <Tag 
        key={block.id} 
        style={{ margin: '8px 0', fontWeight: block.style === 'h1' ? 700 : 400, fontSize: block.style === 'h1' ? 20 : 15, color: 'var(--pico-color)' }}
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    );
  }

  if (block.type === 'image') {
    const imageBlock = block as ImageBlock;
    const safeUrl = sanitizeUrl(imageBlock.url || '');
    if (!safeUrl) {
      return (
        <div key={block.id} style={{ margin: '8px 0', color: 'var(--color-danger)' }}>
          [Ошибка: небезопасный URL изображения]
        </div>
      );
    }
    return (
      <div key={block.id} style={{ margin: '8px 0' }}>
        <img 
          src={safeUrl} 
          alt={imageBlock.alt || block.label || 'Изображение'} 
          style={{ maxWidth: '100%', height: 'auto' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  if (block.type === 'input') {
    const inputBlock = block as InputBlock;
    return (
      <div key={block.id} style={{ margin: '8px 0', color: 'var(--pico-color)' }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: 'var(--pico-color)' }}>
          {block.label || block.id}:
          {inputBlock.unit && <span style={{ color: 'var(--pico-muted-color)', marginLeft: 4 }}>({inputBlock.unit})</span>}
        </label>
        {inputBlock.inputType === 'select' && inputBlock.options ? (
          <select
            value={String(values[block.id] || '')}
            onChange={(e) => onValueChange(block.id, e.target.value)}
            onPaste={(e) => {
              if (!onPasteFill) return;
              const text = e.clipboardData.getData('text/plain');
              if (text && onPasteFill(block.id, text)) e.preventDefault();
            }}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-form-element-border-color)', background: 'var(--pico-form-element-background-color)', color: 'var(--pico-color)' }}
          >
            {inputBlock.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type={inputBlock.inputType || 'text'}
            value={String(values[block.id] || '')}
            onChange={(e) => {
              const val = inputBlock.inputType === 'number' 
                ? (e.target.value === '' ? '' : parseFloat(e.target.value) || 0)
                : e.target.value;
              onValueChange(block.id, val);
            }}
            onPaste={(e) => {
              if (!onPasteFill) return;
              const text = e.clipboardData.getData('text/plain');
              if (text && onPasteFill(block.id, text)) e.preventDefault();
            }}
            min={inputBlock.min}
            max={inputBlock.max}
            step={inputBlock.step}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)' }}
          />
        )}
      </div>
    );
  }

  if (block.type === 'select_from_table') {
    const selBlock = block as SelectFromTableBlock;
    const tableBlock = allBlocks.find(b => b.id === selBlock.dataSource && b.type === 'data_table') as DataTableBlock | undefined;
    const normalized = tableBlock ? normalizeTableData(tableBlock) : null;
    let options: string[] = [];
    
    if (normalized) {
      let filteredRows = normalized.rows;
      
      if (selBlock.filter) {
        filteredRows = filteredRows.filter((row: any) => {
          return Object.entries(selBlock.filter!).every(([col, val]) => row[col] === val);
        });
      }
      
      if (selBlock.range) {
        filteredRows = filteredRows.filter((row: any) => {
          const val = row[selBlock.column];
          const num = typeof val === 'number' ? val : parseFloat(String(val));
          if (isNaN(num)) return true;
          if (selBlock.range!.min !== undefined && num < selBlock.range!.min) return false;
          if (selBlock.range!.max !== undefined && num > selBlock.range!.max) return false;
          return true;
        });
      }
      
      options = filteredRows.map((row: any) => {
        if (selBlock.multipleColumns && selBlock.multipleColumns.length > 0) {
          return selBlock.multipleColumns.map(col => row[col]).join(' ');
        }
        return String(row[selBlock.column] || '');
      });
    }
    
    const lockedValue = values[block.id] ?? selBlock.defaultValue ?? '';

    if (selBlock.lockValue) {
      return (
        <div key={block.id} style={{ margin: '8px 0', color: 'var(--pico-color)' }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: 'var(--pico-color)' }}>
            {block.label || block.id}:
          </label>
          <div style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-form-element-border-color)', background: 'var(--pico-form-element-background-color)', color: 'var(--pico-color)' }}>
            🔒 {formatValueForDisplay(lockedValue)}
          </div>
        </div>
      );
    }

    return (
      <div key={block.id} style={{ margin: '8px 0', color: 'var(--pico-color)' }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, color: 'var(--pico-color)' }}>
          {block.label || block.id}:
        </label>
        <select
          value={formatValueForDisplay(values[block.id])}
          onChange={(e) => onValueChange(block.id, e.target.value)}
          onPaste={(e) => {
            if (!onPasteFill) return;
            const text = e.clipboardData.getData('text/plain');
            if (text && onPasteFill(block.id, text)) e.preventDefault();
          }}
          style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)' }}
        >
          {options.length === 0 && <option value="">Нет опций</option>}
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (block.type === 'formula') {
    return (
      <div key={block.id} style={{ margin: '8px 0', padding: '8px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: 4, color: 'var(--pico-color)' }}>
        <strong>{block.label || block.id}:</strong>{' '}
        <span style={{ color: 'var(--pico-primary-color)', fontWeight: 600 }}>{formatValueForDisplay(values[block.id])}</span>
      </div>
    );
  }

  return (
    <div key={block.id} style={{ margin: '8px 0', color: 'var(--pico-color)' }}>
      {block.label || block.id}: <span style={{ color: 'var(--pico-primary-color)', fontWeight: 500 }}>{formatValueForDisplay(values[block.id])}</span>
    </div>
  );
}

const PublicCalculator: React.FC<PublicCalculatorProps> = ({ calculatorId, blocks: initialBlocks, previewMode = false, initialValues: propInitialValues, reportHtml: reportHtmlProp }) => {
  const storeBlocks = useCalcStore((s) => s.blocks);
  const storeValues = useCalcStore((s) => s.values);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const updateValue = useCalcStore((s) => s.updateValue);

  // В режиме превью — локальное состояние, не трогаем store
  const [previewBlocks, setPreviewBlocks] = useState<Block[]>(() => initialBlocks || []);
  const [previewValues, setPreviewValues] = useState<Record<string, number | string>>(() =>
    initialBlocks?.length ? recalculateValues(initialBlocks, propInitialValues || {}) : {}
  );

  const blocks = previewMode ? previewBlocks : storeBlocks;
  const values = previewMode ? previewValues : storeValues;

  // Синхронизация превью с переданными blocks
  useEffect(() => {
    if (previewMode && initialBlocks && initialBlocks.length > 0) {
      setPreviewBlocks(initialBlocks);
      setPreviewValues(recalculateValues(initialBlocks, propInitialValues || {}));
    }
  }, [previewMode, initialBlocks, propInitialValues]);

  // Загрузка схемы калькулятора в store (только когда не превью)
  useEffect(() => {
    if (!previewMode && initialBlocks && initialBlocks.length > 0) {
      setBlocks(initialBlocks);
      const initialV = recalculateValues(initialBlocks, {});
      setValues(initialV);
    }
  }, [previewMode, initialBlocks, setBlocks, setValues]);

  // Обработчик изменения значения с автоматическим пересчётом
  const handleValueChange = (id: string, value: number | string) => {
    if (previewMode) {
      const newValues = { ...previewValues, [id]: value };
      const calculated = recalculateValues(previewBlocks, newValues);
      setPreviewValues(calculated);
    } else {
      updateValue(id, value);
      const newValues = { ...storeValues, [id]: value };
      const calculated = recalculateValues(storeBlocks, newValues);
      setValues(calculated);
    }
  };

  // Сквозная вставка: разбор буфера обмена и распределение значений по последовательным полям
  const handlePasteFill = useCallback((startBlockId: string, clipboardText: string): boolean => {
    const tokens = parseClipboardTokens(clipboardText);
    if (tokens.length <= 1) return false;

    const fillableIds = getOrderedFillableIds(blocks);
    const startIdx = fillableIds.indexOf(startBlockId);
    if (startIdx === -1) return false;

    const newValues: Record<string, number | string> = { ...values };
    for (let i = 0; i < tokens.length && startIdx + i < fillableIds.length; i++) {
      const blockId = fillableIds[startIdx + i];
      const block = blocks.find(b => b.id === blockId);
      if (!block) continue;
      newValues[blockId] = matchValueToField(block, tokens[i], blocks);
    }

    const calculated = recalculateValues(blocks, newValues);
    if (previewMode) {
      setPreviewValues(calculated);
    } else {
      setValues(calculated);
    }
    return true;
  }, [blocks, values, previewMode, previewValues, setPreviewValues, storeValues, setValues]);

  // Визуализируем только верхнеуровневые блоки
  const groupChildIds = new Set(
    blocks.filter((b: Block) => b.type === 'group').flatMap((g: any) => 
      Array.isArray(g.children) ? g.children.map((c: any) => typeof c === 'string' ? c : c.id) : []
    )
  );
  const topBlocks = blocks.filter((b: Block) => !groupChildIds.has(b.id));

  // Если есть HTML отчёта — над отчётом показываем только поля ввода и оформление (текст, картинки, группы)
  const formBlockTypes = new Set(['input', 'select_from_table', 'select_from_object', 'output', 'text', 'image', 'group']);
  const blocksToShow = reportHtmlProp && reportHtmlProp.trim()
    ? topBlocks.filter((b) => formBlockTypes.has(b.type))
    : topBlocks;

  const reportHtmlProcessed = useMemo(() => {
    if (!reportHtmlProp || !reportHtmlProp.trim()) return null;
    const safe = sanitizeHtml(reportHtmlProp);
    const sized = applyTableSizing(safe);
    return replaceTokensInHtml(sized, blocks, null, (id, suffix) => {
      const block = blocks.find((b) => b.id === id);
      if (suffix === 'expr' && block) {
        return {
          text: buildFormulaWithValues(block, values, formatValueForDisplay, false, true),
          title: '',
        };
      }
      if (suffix === 'exprOnly' || suffix === 'stepsCalculations') {
        if (block) {
          return { text: getStepsCalculations(block, values, formatValueForDisplay), title: '' };
        }
      }
      // В ячейке значения — только число
      return { text: formatValueForDisplay(values[id]), title: '' };
    });
  }, [reportHtmlProp, blocks, values]);

  if (blocks.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h2>Калькулятор не загружен</h2>
        <p style={{ color: 'var(--color-muted-text)' }}>Не удалось загрузить калькулятор. Это может быть ошибка в роутинге.</p>
        <a href="/editor" style={{ color: 'var(--color-accent)', textDecoration: 'underline', marginTop: 16, display: 'inline-block' }}>Вернуться в редактор</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px', color: 'var(--pico-color)', background: 'var(--pico-background-color)' }}>
      <h1 style={{ marginBottom: 24, fontSize: 24, fontWeight: 600, color: 'var(--pico-color)' }}>Калькулятор</h1>
      {blocksToShow.map((b) => renderBlock(b, values, blocks, handleValueChange, handlePasteFill))}
      {reportHtmlProcessed && (
        <div
          className="calculator-report"
          style={{ marginTop: 24 }}
          dangerouslySetInnerHTML={{ __html: reportHtmlProcessed }}
        />
      )}
    </div>
  );
};

export default PublicCalculator;
