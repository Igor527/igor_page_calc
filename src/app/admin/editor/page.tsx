// Базовый лейаут редактора с тремя панелями: левая (40%), правая (60%), AI-панель (только для админа)
// Для UI используется простая flex-верстка. AI-панель отображается только если isAdmin === true.


import BlueprintPanel from '@/components/editor/BlueprintPanel';
import ReportPanel from '@/components/editor/ReportPanel';
import PropertyEditor from '@/components/editor/PropertyEditor';
import React, { useState } from 'react';
import { recalculateValues } from '@/lib/engine';
import type { Block } from '@/types/blocks';

// Тестовые блоки для проверки UI и движка
const testBlocks: Block[] = [
  { id: 'a', type: 'input', label: 'A', inputType: 'number', defaultValue: 2 },
  { id: 'b', type: 'input', label: 'B', inputType: 'number', defaultValue: 3 },
  { id: 'sum', type: 'formula', label: 'A + B', formula: 'a + b', dependencies: ['a', 'b'] },
  { id: 'text1', type: 'text', content: 'Это текстовый блок', style: 'p' },
];

// Подсказка для AI-панели администратора:
// Для генерации схемы калькулятора используйте инструкцию из раздела "Инструкция для AI Copilot/ChatGPT" в README.md этого проекта.
// Просто скопируйте шаблон и вставьте его в окно AI.

const EditorPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {

  // Инициализация тестовых блоков в Zustand store (один раз)
  const setBlocks = require('@/lib/store').useCalcStore((s: any) => s.setBlocks);
  const blocks = require('@/lib/store').useCalcStore((s: any) => s.blocks);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  React.useEffect(() => { setBlocks(testBlocks); }, []);
  const values = recalculateValues(blocks, {});

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Левая панель (BlueprintPanel) */}
      <div style={{ flex: '0 0 40%', borderRight: '1px solid #eee', padding: 0, overflowY: 'auto' }}>
        <BlueprintPanel selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      {/* Правая панель (ReportPanel) */}
      <div style={{ flex: isAdmin ? '0 0 50%' : '0 0 60%', borderRight: isAdmin ? '1px solid #eee' : undefined, padding: 0, overflowY: 'auto' }}>
        <ReportPanel />
        <div style={{ marginTop: 24, padding: 16, background: '#f6f6f6' }}>
          <b>Результаты расчёта:</b>
          <pre>{JSON.stringify(values, null, 2)}</pre>
        </div>
      </div>
      {/* PropertyEditor (свойства выбранного блока) */}
      <div style={{ flex: '0 0 20%', minWidth: 220, background: '#fafbfc', padding: 0, borderLeft: '1px solid #eee', overflowY: 'auto' }}>
        <PropertyEditor selectedId={selectedId} />
        <div style={{ marginTop: 24, padding: 16 }}>
          <b>Выбранный блок:</b>
          <pre>{JSON.stringify(blocks.find(b => b.id === selectedId) || null, null, 2)}</pre>
        </div>
      </div>
      {/* AI-панель (только для админа) */}
      {isAdmin && (
        <div style={{ flex: '0 0 10%', minWidth: 220, background: '#fafbfc', padding: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>AI-панель (Mistral)</div>
          <div>Только для администратора</div>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
