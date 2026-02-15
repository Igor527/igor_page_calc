// Публичный вид калькулятора (без редактора)

import React, { useEffect, useState } from 'react';
import { useCalcStore } from '@/lib/store';
import { recalculateValues } from '@/lib/engine';
import ChartRenderer from '@/components/editor/ChartRenderer';
import { sanitizeText, sanitizeUrl } from '@/lib/security';
import type { Block, GroupBlock, InputBlock, SelectFromTableBlock, DataTableBlock, ImageBlock, ChartBlock } from '@/types/blocks';

interface PublicCalculatorProps {
  calculatorId?: string;
  blocks?: Block[];
}

// Функция рендеринга блока (аналогична ReportPanel, но без редактирования)
function renderBlock(
  block: Block,
  values: Record<string, any>,
  allBlocks: Block[],
  onValueChange: (id: string, value: number | string) => void
): React.ReactNode {
  if (block.type === 'group') {
    const group = block as GroupBlock;
    return (
      <div key={group.id} style={{ border: '1px solid #eee', borderRadius: 8, margin: '12px 0', padding: 10, background: '#f9f9fa' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{group.title || group.label || 'Группа'}</div>
        <div style={{ marginLeft: 12 }}>
          {Array.isArray(group.children) && group.children.length > 0
            ? group.children.map(child => {
                const childBlock = typeof child === 'string' ? allBlocks.find(b => b.id === child) : child;
                return childBlock ? renderBlock(childBlock, values, allBlocks, onValueChange) : null;
              })
            : <span style={{ color: '#aaa' }}>Нет блоков</span>}
        </div>
      </div>
    );
  }

  if (block.type === 'output') {
    return (
      <div key={block.id} style={{ margin: '8px 0', fontWeight: 500 }}>
        {block.label || 'Результат'}: <span style={{ color: '#0a6' }}>{values[block.id]}</span>
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
        style={{ margin: '8px 0', fontWeight: block.style === 'h1' ? 700 : 400, fontSize: block.style === 'h1' ? 20 : 15 }}
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    );
  }

  if (block.type === 'image') {
    const imageBlock = block as ImageBlock;
    const safeUrl = sanitizeUrl(imageBlock.url || '');
    if (!safeUrl) {
      return (
        <div key={block.id} style={{ margin: '8px 0', color: '#c00' }}>
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
      <div key={block.id} style={{ margin: '8px 0' }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          {block.label || block.id}:
          {inputBlock.unit && <span style={{ color: '#888', marginLeft: 4 }}>({inputBlock.unit})</span>}
        </label>
        {inputBlock.inputType === 'select' && inputBlock.options ? (
          <select
            value={String(values[block.id] || '')}
            onChange={(e) => onValueChange(block.id, e.target.value)}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
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
            min={inputBlock.min}
            max={inputBlock.max}
            step={inputBlock.step}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
          />
        )}
      </div>
    );
  }

  if (block.type === 'select_from_table') {
    const selBlock = block as SelectFromTableBlock;
    const tableBlock = allBlocks.find(b => b.id === selBlock.dataSource && b.type === 'data_table') as DataTableBlock | undefined;
    let options: string[] = [];
    
    if (tableBlock && tableBlock.rows) {
      let filteredRows = tableBlock.rows;
      
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
    
    return (
      <div key={block.id} style={{ margin: '8px 0' }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          {block.label || block.id}:
        </label>
        <select
          value={String(values[block.id] || '')}
          onChange={(e) => onValueChange(block.id, e.target.value)}
          style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
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
      <div key={block.id} style={{ margin: '8px 0', padding: '8px', background: '#f0f8ff', borderRadius: 4 }}>
        <strong>{block.label || block.id}:</strong>{' '}
        <span style={{ color: '#0a6', fontWeight: 600 }}>{values[block.id] ?? '—'}</span>
      </div>
    );
  }

  return (
    <div key={block.id} style={{ margin: '8px 0' }}>
      {block.label || block.id}: <span style={{ color: '#222' }}>{values[block.id] ?? '—'}</span>
    </div>
  );
}

const PublicCalculator: React.FC<PublicCalculatorProps> = ({ calculatorId, blocks: initialBlocks }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const values = useCalcStore((s) => s.values);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const setValues = useCalcStore((s) => s.setValues);
  const updateValue = useCalcStore((s) => s.updateValue);

  // Загрузка схемы калькулятора
  useEffect(() => {
    if (initialBlocks) {
      setBlocks(initialBlocks);
      const initialValues = recalculateValues(initialBlocks, {});
      setValues(initialValues);
    } else if (calculatorId) {
      // Загрузка из localStorage по ID
      try {
        const saved = localStorage.getItem(`calc-${calculatorId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.blocks) {
            setBlocks(parsed.blocks);
            const initialValues = recalculateValues(parsed.blocks, parsed.values || {});
            setValues(initialValues);
          }
        }
      } catch (e) {
        console.error('Ошибка загрузки калькулятора:', e);
      }
    }
  }, [calculatorId, initialBlocks, setBlocks, setValues]);

  // Обработчик изменения значения с автоматическим пересчётом
  const handleValueChange = (id: string, value: number | string) => {
    updateValue(id, value);
    const newValues = { ...values, [id]: value };
    const calculated = recalculateValues(blocks, newValues);
    setValues(calculated);
  };

  // Визуализируем только верхнеуровневые блоки
  const groupChildIds = new Set(
    blocks.filter((b: Block) => b.type === 'group').flatMap((g: any) => 
      Array.isArray(g.children) ? g.children.map((c: any) => typeof c === 'string' ? c : c.id) : []
    )
  );
  const topBlocks = blocks.filter((b: Block) => !groupChildIds.has(b.id));

  if (blocks.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h2>Калькулятор не найден</h2>
        <p style={{ color: '#888' }}>Калькулятор с ID "{calculatorId}" не найден или не загружен.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <h1 style={{ marginBottom: 24, fontSize: 24, fontWeight: 600 }}>Калькулятор</h1>
      {topBlocks.map(b => renderBlock(b, values, blocks, handleValueChange))}
    </div>
  );
};

export default PublicCalculator;
