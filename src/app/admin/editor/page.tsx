// Полноценный Dynamo-style редактор: ноды с портами и визуальными связями
// Левая панель - визуальный редактор нод (DynamoNodeEditor)
// Правая панель - отчёт с результатами (ReportPanel)
// Inline-редактирование прямо на нодах (двойной клик)
// Создание нод - по правой кнопке мыши на канвасе
// Соединение нод - drag & drop между портами

import DynamoNodeEditor from '@/components/editor/DynamoNodeEditor';
import ReportPanel, { type ReportPanelHandle } from '@/components/editor/ReportPanel';
import React, { useState, useEffect, useRef } from 'react';
import { recalculateValues } from '@/lib/engine';
import { useCalcStore } from '@/lib/store';
import type { Block } from '@/types/blocks';
import parkingDemo from '@/data/parking_demo.json';

// Демонстрационный набор блоков (загружается из JSON)
const testBlocks = parkingDemo as Block[];

// Подсказка для AI-панели администратора:
// Для генерации схемы калькулятора используйте инструкцию из раздела "Инструкция для AI Copilot/ChatGPT" в README.md этого проекта.
// Просто скопируйте шаблон и вставьте его в окно AI.

const EditorPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  const blocks = useCalcStore((s) => s.blocks);
  const setBlocks = useCalcStore((s) => s.setBlocks);
  const values = useCalcStore((s) => s.values);
  const setValues = useCalcStore((s) => s.setValues);
  const reportRef = useRef<ReportPanelHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Инициализация тестовых блоков в Zustand store (один раз)
  useEffect(() => {
    if (blocks.length === 0) {
      setBlocks(testBlocks);
      // Инициализируем значения при первой загрузке
      const initialValues = recalculateValues(testBlocks, {});
      setValues(initialValues);
    }
  }, []);

  // Автоматический пересчёт при изменении blocks (но не values, чтобы избежать циклов)
  useEffect(() => {
    if (blocks.length > 0) {
      const calculated = recalculateValues(blocks, values);
      // Обновляем только если есть изменения
      const hasChanges = Object.keys(calculated).some(
        key => calculated[key] !== values[key]
      );
      if (hasChanges) {
        setValues(calculated);
      }
    }
  }, [blocks]);

  // Перетаскивание разделителя панелей
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const next = (e.clientX / window.innerWidth) * 100;
      const clamped = Math.min(80, Math.max(20, next));
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 200px)',
        minHeight: 'calc(100vh - 200px)',
        width: '100%',
        flexDirection: 'column'
      }}
    >
      {/* Верхняя панель навигации */}
      <div style={{ padding: '12px 16px', background: 'var(--pico-card-background-color)', borderBottom: '1px solid var(--pico-border-color)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/" style={{ padding: '4px 12px', background: '#222', color: '#fff', textDecoration: 'none', borderRadius: 4, fontSize: 13 }}>
          Редактор
        </a>
        <a href="/admin/review" style={{ padding: '4px 12px', background: '#880', color: '#fff', textDecoration: 'none', borderRadius: 4, fontSize: 13 }}>
          Ревью
        </a>
      </div>
      
      {/* AI-панель (только для админа) - перемещена наверх */}
      {isAdmin && (
        <div style={{ padding: '12px 16px', background: 'var(--pico-card-background-color)', borderBottom: '1px solid var(--pico-border-color)' }}>
          <details style={{ margin: 0 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: '4px 0' }}>🤖 AI-панель (Mistral)</summary>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <textarea id="ai-instructions" rows={4} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8 }} placeholder="Инструкция для AI..." />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                <button type="button" style={{ background: '#0a6', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12 }} onClick={() => {
                  const example = '[{"id":"a","type":"input","label":"A","inputType":"number"},{"id":"b","type":"input","label":"B","inputType":"number"},{"id":"sum","type":"formula","label":"A+B","formula":"a+b","dependencies":["a","b"]}]';
                  const out = document.getElementById('ai-json-out');
                  if (out) out.textContent = example;
                }}>Генерировать</button>
                <button type="button" style={{ background: '#222', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 12 }} onClick={() => {
                  const out = document.getElementById('ai-json-out');
                  if (!out) return;
                  try {
                    const blocks = JSON.parse(out.textContent || '');
                    setBlocks(blocks);
                    alert('Блоки вставлены!');
                  } catch {
                    alert('Ошибка JSON');
                  }
                }}>Вставить</button>
              </div>
            </div>
            <pre id="ai-json-out" style={{ background: 'var(--pico-code-background-color)', marginTop: 8, padding: 8, fontSize: 11, maxHeight: 100, overflow: 'auto', borderRadius: 4 }}></pre>
          </details>
        </div>
      )}
      
      <div style={{ display: 'flex', flex: 1, width: '100vw' }}>
        {/* Левая панель - визуальный редактор нод (полный Dynamo-style) */}
        <div
          style={{
            flex: `0 0 ${splitPercent}%`,
            borderRight: '1px solid var(--pico-border-color)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            <DynamoNodeEditor selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div
            onWheel={(e) => e.stopPropagation()}
            style={{
              borderBottom: '1px solid var(--pico-border-color)',
              background: 'var(--pico-card-background-color)',
              padding: 8,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
              Список всех токенов (нажми на токен для вставки в текст)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {blocks
                .filter((b) => b.type !== 'group')
                .map((token) => (
                  <button
                    key={token.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(token.id);
                      reportRef.current?.insertToken(token.id);
                    }}
                    style={{
                      fontSize: 12,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: '1px solid var(--pico-border-color)',
                      background: 'var(--pico-card-background-color)',
                      color: 'var(--pico-color)',
                      cursor: 'pointer',
                    }}
                  >
                    {token.label || token.id}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div
          onMouseDown={(e) => {
            if (e.shiftKey) {
              setIsResizing(true);
            }
          }}
          style={{
            width: 10,
            cursor: 'col-resize',
            background: 'var(--pico-border-color)',
            opacity: isResizing ? 1 : 0.8,
            transition: 'opacity 0.1s',
            position: 'relative',
          }}
          title="Зажмите Shift и потяните, чтобы изменить ширину"
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 4,
              height: 40,
              borderRadius: 4,
              background: 'var(--pico-muted-border-color)'
            }}
          />
        </div>

        {/* Правая панель - отчёт с результатами */}
        <div
          style={{
            flex: `0 0 ${100 - splitPercent}%`,
            minWidth: 360,
            overflow: 'hidden',
            background: 'var(--pico-card-background-color)',
          }}
        >
          <ReportPanel ref={reportRef} onSelect={setSelectedId} selectedId={selectedId} />
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
