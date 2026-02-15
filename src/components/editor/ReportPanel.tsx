import React from 'react';
import { useCalcStore } from '@/lib/store';
import { recalculateValues } from '@/lib/engine';
import type { Block, GroupBlock } from '@/types/blocks';

function renderBlock(block: Block, values: Record<string, any>, allBlocks: Block[]): React.ReactNode {
  if (block.type === 'group') {
    const group = block as GroupBlock;
    return (
      <div key={group.id} style={{ border: '1px solid #eee', borderRadius: 8, margin: '12px 0', padding: 10, background: '#f9f9fa' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{group.title || group.label || 'Группа'}</div>
        <div style={{ marginLeft: 12 }}>
          {Array.isArray(group.children) && group.children.length > 0
            ? group.children.map(child => {
                const childBlock = typeof child === 'string' ? allBlocks.find(b => b.id === child) : child;
                return childBlock ? renderBlock(childBlock, values, allBlocks) : null;
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
    return (
      <div key={block.id} style={{ margin: '12px 0', color: '#888' }}>
        [График: {block.label || block.id}] (визуализация не реализована)
      </div>
    );
  }
  if (block.type === 'text') {
    return (
      <div key={block.id} style={{ margin: '8px 0', fontWeight: block.style === 'h1' ? 700 : 400, fontSize: block.style === 'h1' ? 20 : 15 }}>
        {block.content}
      </div>
    );
  }
  // Для input, formula, constant, table_lookup, select_from_table, select_from_object
  return (
    <div key={block.id} style={{ margin: '8px 0' }}>
      {block.label || block.id}: <span style={{ color: '#222' }}>{values[block.id]}</span>
    </div>
  );
}

const ReportPanel: React.FC = () => {
  const blocks = useCalcStore((s: any) => s.blocks);
  const values = recalculateValues(blocks, {});
  // Визуализируем только верхнеуровневые блоки (не входящие в группы как дочерние)
  const groupChildIds = new Set(
    blocks.filter((b: Block) => b.type === 'group').flatMap((g: any) => Array.isArray(g.children) ? g.children.map((c: any) => typeof c === 'string' ? c : c.id) : [])
  );
  const topBlocks = blocks.filter((b: Block) => !groupChildIds.has(b.id));

  return (
    <section style={{ padding: 16 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Отчёт</h2>
      {topBlocks.length === 0 && <div style={{ color: '#888' }}>Нет блоков для отображения</div>}
      {topBlocks.map(b => renderBlock(b, values, blocks))}
    </section>
  );
};

export default ReportPanel;
