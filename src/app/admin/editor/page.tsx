// Упрощённый редактор: список нод слева, редактор свойств по центру, отчёт справа
// Левая панель - список нод (только имена и описания)
// Центральная панель - редактор свойств + визуализация данных
// Правая панель - отчёт с результатами (ReportPanel)

import NodesList from '@/components/editor/NodesList';
import PropertyEditor from '@/components/editor/PropertyEditor';
import DataVisualization from '@/components/editor/DataVisualization';
import ReportPanel, { type ReportPanelHandle } from '@/components/editor/ReportPanel';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { recalculateValues } from '@/lib/engine';
import { useCalcStore } from '@/lib/store';
import type { Block } from '@/types/blocks';
import parkingDemo from '@/data/parking_demo.json';
import { generateCalculatorId, saveCalculator, loadCalculator, getCalculatorList, downloadPublishedBundle, buildPublishedBundle } from '@/lib/calculatorStorage';
import { pushCalculators } from '@/lib/githubSync';
import { validateBlocks, validateImportedBlocks } from '@/lib/validation';
import { toMatrixTableBlock } from '@/lib/tableData';
import ValidationErrors from '@/components/editor/ValidationErrors';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerTab, setCenterTab] = useState<'properties' | 'data'>('properties');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [calculatorsOpen, setCalculatorsOpen] = useState(false);
  const [pasteJsonOpen, setPasteJsonOpen] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState('');
  const [listKey, setListKey] = useState(0);
  const reportRef = useRef<ReportPanelHandle>(null);
  const saveDraftRef = useRef<() => void>(() => {});
  /** После «Пустой» / «Сбросить на демо» — при следующем сохранении всегда создаём новый калькулятор (новый id) */
  const forceNewCalculatorRef = useRef(false);

  const validation = useMemo(() => validateBlocks(blocks), [blocks]);
  const calculatorList = useMemo(() => getCalculatorList().sort((a, b) => b.updatedAt - a.updatedAt), [listKey]);
  const canSubmitReview = validation.valid && blocks.length > 0;

  const handleResetToDemo = () => {
    if (!window.confirm('Перезаписать текущие данные демо-набором?')) return;
    localStorage.removeItem('igor-page-calc');
    localStorage.removeItem('igor-page-calc-current-id');
    forceNewCalculatorRef.current = true;
    const nextBlocks = testBlocks;
    setBlocks(nextBlocks);
    const initialValues = recalculateValues(nextBlocks, {});
    setValues(initialValues);
    setSelectedId(null);
  };

  const handleNewEmpty = () => {
    if (blocks.length > 0 && !window.confirm('Создать пустой калькулятор? Текущая схема будет удалена.')) return;
    localStorage.removeItem('igor-page-calc');
    localStorage.removeItem('igor-page-calc-current-id');
    forceNewCalculatorRef.current = true;
    setBlocks([]);
    setValues({});
    reportRef.current?.setEditorHtml?.('');
    setSelectedId(null);
  };

  const getReportHtml = () => reportRef.current?.getEditorHtml?.() ?? '';

  const handlePublish = () => {
    if (!canSubmitReview) {
      const details = validation.errors.slice(0, 3).map((e) => `• ${e.blockId}: ${e.message}`).join('\n');
      const more = validation.errors.length > 3 ? `\n... и еще ${validation.errors.length - 3} ошибок` : '';
      alert(`Нельзя опубликовать. Исправьте ошибки:\n${details}${more}`);
      return;
    }
    const title = window.prompt('Название калькулятора', 'Калькулятор');
    if (!title) return;
    const slugPrompt = window.prompt('Адрес для ссылки (латиница, цифры, дефис). Оставьте пустым для авто.', loadCalculator(localStorage.getItem('igor-page-calc-current-id') ?? '')?.slug ?? '');
    const slug = slugPrompt?.trim() || undefined;

    const storageKey = 'igor-page-calc-current-id';
    const forceNew = forceNewCalculatorRef.current;
    if (forceNew) forceNewCalculatorRef.current = false;
    const existingId = forceNew ? null : localStorage.getItem(storageKey);
    const calcId = existingId || generateCalculatorId();
    const reportHtml = getReportHtml();

    const result = saveCalculator(calcId, title, blocks, values, 'published', undefined, reportHtml, slug);
    if (!result.success) {
      alert(result.error || 'Не удалось опубликовать');
      return;
    }
    localStorage.setItem(storageKey, calcId);
    setListKey((k) => k + 1);
    setSaveMessage('Опубликован. Изменения автоматически отправляются в репо (если настроена синхронизация).');
    setTimeout(() => setSaveMessage(null), 5000);
    pushCalculators(JSON.stringify(buildPublishedBundle(), null, 2)).catch(() => {});
  };

  const handleSaveDraft = () => {
    const storageKey = 'igor-page-calc-current-id';
    const forceNew = forceNewCalculatorRef.current;
    if (forceNew) forceNewCalculatorRef.current = false;
    let calcId = forceNew ? null : localStorage.getItem(storageKey);
    const loaded = calcId ? loadCalculator(calcId) : null;
    const title = loaded?.title ?? 'Черновик';
    if (!calcId) calcId = generateCalculatorId();
    const reportHtml = getReportHtml();
    const result = saveCalculator(calcId, title, blocks, values, 'draft', undefined, reportHtml, loaded?.slug);
    if (result.success) {
      localStorage.setItem(storageKey, calcId);
      setListKey((k) => k + 1);
      setSaveMessage('Черновик сохранён');
      setTimeout(() => setSaveMessage(null), 2000);
    } else {
      setSaveMessage(result.error || 'Ошибка сохранения');
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleLoadCalculator = (id: string) => {
    const calc = loadCalculator(id);
    if (!calc) {
      alert('Калькулятор не найден');
      return;
    }
    forceNewCalculatorRef.current = false; // сохранять в выбранный калькулятор, не создавать новый
    setBlocks(calc.blocks);
    const initialValues = recalculateValues(calc.blocks, calc.values ?? {});
    setValues(initialValues);
    reportRef.current?.setEditorHtml?.(calc.reportHtml ?? '');
    localStorage.setItem('igor-page-calc-current-id', id);
    localStorage.setItem('igor-page-calc-report-html', calc.reportHtml ?? '');
    setCalculatorsOpen(false);
    setSelectedId(null);
  };

  const handleApplyPasteJson = () => {
    const raw = pasteJsonText.trim();
    if (!raw) {
      setPasteJsonOpen(false);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      let nextBlocks: Block[] | null = null;
      let nextReportHtml = '';

      if (Array.isArray(parsed)) {
        const validation = validateImportedBlocks(raw);
        if (!validation.valid || !validation.blocks) {
          alert(validation.error || 'Некорректный JSON');
          return;
        }
        nextBlocks = validation.blocks;
      } else if (parsed && typeof parsed === 'object') {
        if (typeof parsed.reportHtml === 'string') nextReportHtml = parsed.reportHtml;
        if (Array.isArray(parsed.blocks)) {
          const validation = validateBlocks(parsed.blocks as Block[]);
          if (!validation.valid) {
            alert('Ошибки валидации блоков');
            return;
          }
          nextBlocks = parsed.blocks as Block[];
        }
        if (nextBlocks === null && !nextReportHtml) {
          alert('Вставьте массив блоков или объект с полями blocks и/или reportHtml');
          return;
        }
      } else {
        alert('Вставьте массив блоков или объект { blocks?: [...], reportHtml?: "..." }');
        return;
      }

      if (nextBlocks !== null) {
        setBlocks(nextBlocks);
        setValues(recalculateValues(nextBlocks, {}));
        setSelectedId(null);
      }
      if (nextReportHtml) reportRef.current?.setEditorHtml?.(nextReportHtml);
      setPasteJsonOpen(false);
      setPasteJsonText('');
    } catch (e) {
      alert('Не удалось разобрать JSON. Проверьте формат.');
    }
  };

  const handleCopyJson = () => {
    const normalizedBlocks = blocks.map((b) => b.type === 'data_table' ? toMatrixTableBlock(b as any) : b);
    const reportHtml = getReportHtml();
    const payload = { blocks: normalizedBlocks, reportHtml };
    const json = JSON.stringify(payload, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => { setSaveMessage('JSON скопирован'); setTimeout(() => setSaveMessage(null), 2000); },
      () => alert('Не удалось скопировать в буфер')
    );
  };

  const handleCopyReportOnly = () => {
    const reportHtml = getReportHtml();
    const json = JSON.stringify({ reportHtml }, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => { setSaveMessage('Отчёт скопирован'); setTimeout(() => setSaveMessage(null), 2000); },
      () => alert('Не удалось скопировать в буфер')
    );
  };

  saveDraftRef.current = handleSaveDraft;

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
      const hasChanges = Object.keys(calculated).some(
        key => calculated[key] !== values[key]
      );
      if (hasChanges) {
        setValues(calculated);
      }
    }
  }, [blocks]);

  // Ctrl+S — сохранение черновика
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveDraftRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Предупреждение при уходе со страницы
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - var(--content-offset-from-header, 112px) - var(--site-footer-height, 56px))',
        minHeight: 0,
        width: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Верхняя панель: навигация и действия */}
      <div style={{ padding: '12px 16px', background: 'var(--pico-card-background-color)', borderBottom: '1px solid var(--pico-border-color)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, lineHeight: 1, padding: '0 12px', background: 'transparent', color: 'var(--pico-color)', textDecoration: 'none', borderRadius: 4, fontSize: 13, border: '1px solid var(--pico-border-color)', boxSizing: 'border-box' }}>
            Главная
          </a>
          <span style={{ width: 1, height: 20, background: 'var(--pico-border-color)', margin: '0 4px' }} aria-hidden />
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setCalculatorsOpen(!calculatorsOpen)}
              title="Загрузить сохранённый калькулятор"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, lineHeight: 1, padding: '0 12px', background: 'var(--pico-background-color)', color: 'var(--pico-color)', border: '1px solid var(--pico-border-color)', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
            >
              Загрузить
            </button>
            {calculatorsOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCalculatorsOpen(false)} aria-hidden="true" />
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, minWidth: 260, maxHeight: 320, overflowY: 'auto' }}>
                  <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--pico-muted-color)', borderBottom: '1px solid var(--pico-border-color)' }}>Загрузить калькулятор</div>
                  {calculatorList.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 13, color: 'var(--pico-muted-color)' }}>Нет сохранённых</div>
                  ) : (
                    calculatorList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleLoadCalculator(c.id)}
                        style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--pico-border-color)' }}
                      >
                        <div style={{ fontWeight: 500 }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--pico-muted-color)' }}>{c.status === 'published' ? 'Опубликован' : 'Черновик'} · {new Date(c.updatedAt).toLocaleString('ru-RU')}</div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopyReportOnly}
            title="Скопировать только отчёт — в Copilot для правок, потом Вставить JSON"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, lineHeight: 1, padding: '0 12px', background: 'var(--pico-background-color)', color: 'var(--pico-color)', border: '1px solid var(--pico-border-color)', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
          >
            Копировать отчёт
          </button>
          <button
            type="button"
            onClick={handleCopyJson}
            title="Скопировать схему (blocks + reportHtml) в буфер"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, lineHeight: 1, padding: '0 12px', background: 'var(--pico-background-color)', color: 'var(--pico-color)', border: '1px solid var(--pico-border-color)', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
          >
            Копировать JSON
          </button>
          <button
            type="button"
            onClick={() => setPasteJsonOpen(true)}
            title="Вставить JSON из Copilot/ChatGPT: скопируйте ответ AI и нажмите сюда"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, lineHeight: 1, padding: '0 12px', background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
          >
            Вставить JSON
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 32, lineHeight: 1, padding: '0 12px', background: 'var(--color-success-bg)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
          >
            Сохранить (Ctrl+S)
          </button>
          {saveMessage && <span style={{ fontSize: 12, color: 'var(--pico-primary)' }}>{saveMessage}</span>}
        <button
          type="button"
          onClick={handleNewEmpty}
          title="Создать пустой калькулятор (без блоков)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 32,
            lineHeight: 1,
            padding: '0 12px',
            background: 'var(--pico-card-background-color)',
            color: 'var(--pico-color)',
            border: '1px solid var(--pico-border-color)',
            borderRadius: 4,
            fontSize: 13,
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        >
          Пустой
        </button>
        <button
          type="button"
          onClick={handleResetToDemo}
          title="Перезаписать текущие данные демо-набором"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 32,
            lineHeight: 1,
            padding: '0 12px',
            background: 'var(--pico-card-background-color)',
            color: 'var(--pico-color)',
            border: '1px solid var(--pico-border-color)',
            borderRadius: 4,
            fontSize: 13,
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        >
          Сбросить на демо
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!canSubmitReview}
          title={!canSubmitReview ? 'Исправьте ошибки в блоках' : 'Опубликовать (появится в списке после экспорта в репо)'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 32,
            lineHeight: 1,
            padding: '0 12px',
            background: canSubmitReview ? 'var(--color-accent)' : 'var(--color-muted-text)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            boxSizing: 'border-box',
            cursor: canSubmitReview ? 'pointer' : 'not-allowed',
          }}
        >
          Опубликовать
        </button>
        <button
          type="button"
          onClick={downloadPublishedBundle}
          title="Скачать calculators.json — положите в public/data/ и запушьте в репо"
          style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', fontSize: 13, border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-card-background-color)', color: 'var(--pico-color)', cursor: 'pointer' }}
        >
          Экспорт для GitHub
        </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
          Слева — элементы калькулятора; в центре — настройка выбранного; справа — отчёт для пользователя.
        </div>
        {!validation.valid && (
          <ValidationErrors blocks={blocks} onSelectBlock={(id) => setSelectedId(id)} />
        )}
      </div>

      {pasteJsonOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100 }} onClick={() => { setPasteJsonOpen(false); setPasteJsonText(''); }} aria-hidden="true" />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 1101, width: '90%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--pico-color)' }}>Вставить JSON (схема из Copilot)</div>
            <p style={{ fontSize: 12, color: 'var(--color-muted-text)', marginBottom: 6 }}>Чтобы одним вставлением получить и формулы, и отчёт — попросите Copilot вернуть объект с полями <code style={{ background: 'var(--pico-code-background-color)', padding: '2px 4px', borderRadius: 4 }}>blocks</code> и <code style={{ background: 'var(--pico-code-background-color)', padding: '2px 4px', borderRadius: 4 }}>reportHtml</code>. В отчёте используйте токены <code>@id</code>, для формул с шагами — <code>@id.stepsCalculations</code> и <code>@id</code>.</p>
            <p style={{ fontSize: 12, color: 'var(--color-muted-text)', marginBottom: 4 }}>Формат: только отчёт <code>{'{'} "reportHtml": "&lt;html&gt;..." {'}'}</code> (блоки не трогаем), или блоки + отчёт, или массив блоков. При вставке только reportHtml обновляется лишь отчёт.</p>
            <button
              type="button"
              onClick={() => {
                const example = JSON.stringify({ blocks: [], reportHtml: '<h3>Отчёт</h3><p>Значение: @id</p>' }, null, 2);
                navigator.clipboard?.writeText(example).then(() => setSaveMessage('Пример скопирован')).catch(() => {});
                setTimeout(() => setSaveMessage(null), 2000);
              }}
              style={{ fontSize: 11, padding: '4px 8px', marginBottom: 8, border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-background-color)', color: 'var(--pico-color)', cursor: 'pointer' }}
            >
              Скопировать пример формата (blocks + reportHtml)
            </button>
            <textarea
              value={pasteJsonText}
              onChange={(e) => setPasteJsonText(e.target.value)}
              placeholder='[{"id":"a","type":"input",...}] или {"blocks":[...],"reportHtml":"..."}'
              rows={12}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 8, marginBottom: 12, background: 'var(--pico-background-color)', color: 'var(--pico-color)', border: '1px solid var(--pico-border-color)', borderRadius: 4, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setPasteJsonOpen(false); setPasteJsonText(''); }} style={{ padding: '6px 12px', border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-background-color)', color: 'var(--pico-color)', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
              <button type="button" onClick={handleApplyPasteJson} style={{ padding: '6px 12px', border: 'none', borderRadius: 4, background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)', cursor: 'pointer', fontSize: 13 }}>Применить</button>
            </div>
          </div>
        </>
      )}
      
      <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100vw' }}>
        {/* Левая панель - элементы калькулятора */}
        <div
          style={{
            width: leftCollapsed ? 40 : 360,
            minWidth: leftCollapsed ? 40 : 320,
            maxWidth: leftCollapsed ? 40 : 400,
            borderRight: '1px solid var(--pico-border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'min-width 0.2s, width 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--pico-border-color)', display: 'flex', alignItems: 'center', justifyContent: leftCollapsed ? 'center' : 'space-between', background: 'var(--pico-card-background-color)', flexShrink: 0 }}>
            {!leftCollapsed && <span style={{ fontSize: 13, fontWeight: 600 }}>Элементы калькулятора</span>}
            <button
              type="button"
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              title={leftCollapsed ? 'Показать панель' : 'Скрыть панель'}
              style={{ padding: '4px 8px', border: '1px solid var(--pico-border-color)', borderRadius: 4, background: 'var(--pico-background-color)', cursor: 'pointer', fontSize: 12 }}
            >
              {leftCollapsed ? '→' : '←'}
            </button>
          </div>
          {!leftCollapsed && (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <NodesList selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          )}
        </div>

        {/* Центральная панель - настройка блока (вкладки Свойства / Данные) */}
        <div
          style={{
            width: 400,
            minWidth: 350,
            maxWidth: 500,
            borderRight: '1px solid var(--pico-border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--pico-background-color)',
          }}
        >
          <div style={{ display: 'flex', borderBottom: '1px solid var(--pico-border-color)', flexShrink: 0, background: 'var(--pico-card-background-color)' }}>
            <button
              type="button"
              onClick={() => setCenterTab('properties')}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderBottom: centerTab === 'properties' ? '2px solid var(--pico-primary)' : '2px solid transparent',
                background: centerTab === 'properties' ? 'var(--pico-background-color)' : 'transparent',
                color: centerTab === 'properties' ? 'var(--pico-color)' : 'var(--pico-muted-color)',
                cursor: 'pointer',
              }}
            >
              Свойства
            </button>
            <button
              type="button"
              onClick={() => setCenterTab('data')}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderBottom: centerTab === 'data' ? '2px solid var(--pico-primary)' : '2px solid transparent',
                background: centerTab === 'data' ? 'var(--pico-background-color)' : 'transparent',
                color: centerTab === 'data' ? 'var(--pico-color)' : 'var(--pico-muted-color)',
                cursor: 'pointer',
              }}
            >
              Данные
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {centerTab === 'properties' && <PropertyEditor selectedId={selectedId} onSelect={setSelectedId} />}
            {centerTab === 'data' && <DataVisualization selectedId={selectedId} />}
          </div>
        </div>

        {/* Правая панель - отчёт */}
        <div
          style={{
            flex: 1,
            minWidth: 800,
            maxWidth: 1200,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--pico-card-background-color)',
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--pico-border-color)', background: 'var(--pico-card-background-color)', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Отчёт</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ReportPanel ref={reportRef} onSelect={setSelectedId} selectedId={selectedId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;
