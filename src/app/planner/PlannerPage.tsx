// Приватный планировщик с диаграммой Ганта (gantt-task-react)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Gantt, ViewMode, type Task } from 'gantt-task-react';

const STORAGE_KEY = 'igor-page-planner-tasks';

const ROW_HEIGHT = 44;
const GANTT_HEADER_HEIGHT = 52;
const TABLE_WIDTH = 500;

/** Ширина колонки календаря по режиму: месяц/неделя требуют больше места для подписей */
function getColumnWidth(viewMode: ViewMode): number {
  switch (viewMode) {
    case ViewMode.Month:
      return 120;
    case ViewMode.Week:
      return 100;
    case ViewMode.Year:
      return 80;
    case ViewMode.Day:
      return 72;
    default:
      return 72;
  }
}

const formatDate = (d: Date) => d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const toDateInputValue = (d: Date) => d.toISOString().slice(0, 10);
function parseDateInput(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Парсинг даты из ячейки Excel/Google: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, число дней с 1900 */
function parseCellDate(s: string): Date | null {
  const raw = String(s).trim();
  if (!raw) return null;
  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD.MM.YYYY или DD.MM.YY
  const dmy = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    const d = new Date(y, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  // YYYY.MM.DD
  const ymd = raw.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (ymd) {
    const d = new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  // Excel serial date (days since 1900-01-01), e.g. 45323
  const num = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  if (!isNaN(num) && num > 0 && num < 1000000) {
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + Math.floor(num));
    return d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

interface ParsedTaskRow {
  name: string;
  start: Date | null;
  end: Date | null;
}

/**
 * Парсит текст из буфера (Excel, Google Таблицы, CSV): строки по \n, колонки по \t или запятой.
 * Ожидаемые форматы: "Название [Начало] [Окончание]" или "Название \t ДД.ММ.ГГГГ \t ДД.ММ.ГГГГ".
 * Первая колонка — имя задачи; следующие — даты (автоопределение).
 */
function parsePastedTasks(text: string): ParsedTaskRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: ParsedTaskRow[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.includes('\t') ? '\t' : ',';
    const cells = line.split(sep).map((c) => c.trim());
    const name = cells[0] || `Задача ${result.length + 1}`;
    const date1 = cells[1] ? parseCellDate(cells[1]) : null;
    const date2 = cells[2] ? parseCellDate(cells[2]) : null;

    let start: Date;
    let end: Date;
    if (date1 && date2) {
      start = date1.getTime() <= date2.getTime() ? date1 : date2;
      end = date1.getTime() > date2.getTime() ? date1 : date2;
    } else if (date1) {
      start = date1;
      end = new Date(date1);
      end.setDate(end.getDate() + 1);
    } else {
      const offset = result.length;
      start = new Date(today);
      start.setDate(start.getDate() + offset);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }
    result.push({ name, start, end });
  }
  return result;
}

function loadStoredTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultTasks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultTasks();
    return parsed.map((t: any) => ({
      ...t,
      start: new Date(t.start),
      end: new Date(t.end),
    }));
  } catch {
    return getDefaultTasks();
  }
}

function getDefaultTasks(): Task[] {
  const now = new Date();
  const d = (days: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() + days);
    return x;
  };
  return [
    { id: '1', name: 'Подготовка', start: now, end: d(3), progress: 40, type: 'task' },
    { id: '2', name: 'Разработка', start: d(2), end: d(7), progress: 20, type: 'task' },
    { id: '3', name: 'Тестирование', start: d(6), end: d(10), progress: 0, type: 'task' },
    { id: '4', name: 'Запуск', start: d(10), end: d(11), progress: 0, type: 'task' },
  ];
}

const PlannerPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(loadStoredTasks);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const syncFromRef = useRef<'table' | 'gantt' | null>(null);

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    const ganttEl = ganttScrollRef.current;
    if (!tableEl || !ganttEl) return;
    const onTableScroll = () => {
      if (syncFromRef.current === 'gantt') return;
      syncFromRef.current = 'table';
      ganttEl.scrollTop = tableEl.scrollTop;
      requestAnimationFrame(() => { syncFromRef.current = null; });
    };
    const onGanttScroll = () => {
      if (syncFromRef.current === 'table') return;
      syncFromRef.current = 'gantt';
      tableEl.scrollTop = ganttEl.scrollTop;
      requestAnimationFrame(() => { syncFromRef.current = null; });
    };
    tableEl.addEventListener('scroll', onTableScroll);
    ganttEl.addEventListener('scroll', onGanttScroll);
    return () => {
      tableEl.removeEventListener('scroll', onTableScroll);
      ganttEl.removeEventListener('scroll', onGanttScroll);
    };
  }, []);

  useEffect(() => {
    try {
      const toStore = tasks.map((t) => ({
        ...t,
        start: t.start.getTime(),
        end: t.end.getTime(),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.warn('Planner: не удалось сохранить задачи', e);
    }
  }, [tasks]);

  const handleDateChange = useCallback((task: Task) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, start: task.start, end: task.end } : t
      )
    );
  }, []);

  const handleProgressChange = useCallback((task: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, progress: task.progress } : t))
    );
  }, []);

  const handleNameChange = useCallback((id: string, name: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t))
    );
  }, []);

  const handleStartChange = useCallback((id: string, value: string) => {
    const date = parseDateInput(value);
    if (!date) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, start: date } : t))
    );
  }, []);

  const handleEndChange = useCallback((id: string, value: string) => {
    const date = parseDateInput(value);
    if (!date) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, end: date } : t))
    );
  }, []);

  const handleProgressChangeTable = useCallback((id: string, value: number) => {
    const p = Math.min(100, Math.max(0, value));
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, progress: p } : t))
    );
  }, []);

  const handleAddTask = () => {
    const last = tasks[tasks.length - 1];
    const start = last ? new Date(last.end) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const newTask: Task = {
      id: `task-${Date.now()}`,
      name: 'Новая задача',
      start,
      end,
      progress: 0,
      type: 'task',
    };
    setTasks((prev) => [...prev, newTask]);
  };

  const handlePasteAdd = () => {
    setPasteError(null);
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setPasteError('Вставьте текст из Excel или Google Таблиц.');
      return;
    }
    const parsed = parsePastedTasks(trimmed);
    if (parsed.length === 0) {
      setPasteError('Не удалось распознать ни одной строки. Формат: название [таб/запятая] дата начала [таб/запятая] дата окончания.');
      return;
    }
    const baseId = Date.now();
    const newTasks: Task[] = parsed.map((row, i) => ({
      id: `task-${baseId}-${i}`,
      name: row.name,
      start: row.start!,
      end: row.end!,
      progress: 0,
      type: 'task',
    }));
    setTasks((prev) => [...prev, ...newTasks]);
    setPasteText('');
    setPasteOpen(false);
  };

  // Задачи для Ганта: без зависимостей (стрелки не рисуем) и без milestone (жёлтый ромб не показываем)
  const ganttTasks = tasks.map((t) => ({
    ...t,
    progress: t.progress === 0 ? 0.5 : t.progress,
    dependencies: undefined,
    type: 'task' as const,
  }));

  const handleReset = () => {
    if (window.confirm('Сбросить все задачи к демо-набору?')) {
      setTasks(getDefaultTasks());
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - var(--content-offset-from-header, 112px) - var(--site-footer-height, 56px))',
        overflow: 'hidden',
      }}
    >
      {/* Компактная панель инструментов (best practice: как Notion — минимум отступов) */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--pico-border-color)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--pico-card-background-color)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>Планировщик</span>
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-border-color)', fontSize: 12, background: 'var(--pico-background-color)', color: 'var(--pico-color)', height: 28 }}
        >
          <option value={ViewMode.Hour}>Часы</option>
          <option value={ViewMode.QuarterDay}>Четверть дня</option>
          <option value={ViewMode.HalfDay}>Полдня</option>
          <option value={ViewMode.Day}>День</option>
          <option value={ViewMode.Week}>Неделя</option>
          <option value={ViewMode.Month}>Месяц</option>
          <option value={ViewMode.Year}>Год</option>
        </select>
        <button type="button" onClick={handleAddTask} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)', cursor: 'pointer', fontSize: 12, height: 28 }}>
          + Задача
        </button>
        <button
          type="button"
          onClick={() => { setPasteOpen((o) => !o); setPasteError(null); }}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid var(--pico-border-color)',
            background: pasteOpen ? 'var(--pico-primary-background)' : 'var(--pico-background-color)',
            color: 'var(--pico-color)',
            cursor: 'pointer',
            fontSize: 12,
            height: 28,
          }}
          title="Вставить задачи из Excel / Google Таблиц (название, даты)"
        >
          Вставить из буфера
        </button>
        <button type="button" onClick={handleReset} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', cursor: 'pointer', fontSize: 12, height: 28 }}>
          Сбросить к демо
        </button>
      </div>

      {/* Панель вставки из буфера */}
      {pasteOpen && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--pico-border-color)',
            background: 'var(--pico-background-color)',
            flexShrink: 0,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--pico-muted-color)' }}>
            Вставьте сюда скопированную таблицу: одна строка — одна задача. Колонки через табуляцию (Excel, Google Таблицы) или запятую. Первая колонка — название, далее — дата начала и дата окончания (форматы: ДД.ММ.ГГГГ, ГГГГ-ММ-ДД или число как в Excel).
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setPasteError(null); }}
            onPaste={() => setPasteError(null)}
            placeholder="Название задачи&#10;01.03.2025	10.03.2025&#10;или вставьте из Excel..."
            rows={4}
            style={{
              width: '100%',
              maxWidth: 600,
              padding: 8,
              borderRadius: 6,
              border: '1px solid var(--pico-border-color)',
              background: 'var(--pico-form-element-background-color)',
              color: 'var(--pico-color)',
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          {pasteError && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>{pasteError}</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={handlePasteAdd}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--pico-primary)',
                color: 'var(--pico-primary-inverse)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Добавить задачи в график
            </button>
            <button
              type="button"
              onClick={() => { setPasteText(''); setPasteError(null); setPasteOpen(false); }}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--pico-border-color)',
                background: 'var(--pico-background-color)',
                color: 'var(--pico-color)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Слева таблица (фиксированная ширина колонок), справа Гант; вертикальный скролл синхронный */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div
          style={{
            width: TABLE_WIDTH,
            minWidth: TABLE_WIDTH,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--pico-border-color)',
            background: 'var(--pico-card-background-color)',
            overflow: 'hidden',
          }}
        >
          <div ref={tableScrollRef} style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed', minWidth: TABLE_WIDTH }}>
              <thead>
                <tr style={{ height: GANTT_HEADER_HEIGHT, borderBottom: '1px solid var(--pico-border-color)', boxSizing: 'border-box' }}>
                  <th style={{ textAlign: 'left', padding: '0 8px', fontWeight: 600, width: 200, minWidth: 160, verticalAlign: 'middle' }}>Название</th>
                  <th style={{ textAlign: 'left', padding: '0 8px', fontWeight: 600, width: 120, minWidth: 100, verticalAlign: 'middle' }}>Начало</th>
                  <th style={{ textAlign: 'left', padding: '0 8px', fontWeight: 600, width: 120, minWidth: 100, verticalAlign: 'middle' }}>Окончание</th>
                  <th style={{ textAlign: 'center', padding: '0 8px', fontWeight: 600, width: 56, minWidth: 48, verticalAlign: 'middle' }}>%</th>
                  <th style={{ width: 44, minWidth: 44, padding: 0, verticalAlign: 'middle' }}></th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--pico-muted-color)', fontSize: 13, borderBottom: '1px solid var(--pico-border-color)' }}>
                      Нет задач. Нажмите «+ Задача», чтобы добавить.
                    </td>
                  </tr>
                ) : (
                tasks.map((t) => (
                  <tr key={t.id} style={{ height: ROW_HEIGHT, borderBottom: '1px solid var(--pico-border-color)', boxSizing: 'border-box' }}>
                    <td style={{ padding: '0 8px', verticalAlign: 'middle', height: ROW_HEIGHT, boxSizing: 'border-box', width: 200, minWidth: 160 }}>
                      <input
                        type="text"
                        value={t.name}
                        onChange={(e) => handleNameChange(t.id, e.target.value)}
                        style={{ width: '100%', minWidth: 0, height: 28, padding: '0 6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 12, boxSizing: 'border-box' }}
                        placeholder="Название"
                      />
                    </td>
                    <td style={{ padding: '0 8px', verticalAlign: 'middle', height: ROW_HEIGHT, boxSizing: 'border-box', width: 120, minWidth: 100 }}>
                      <input
                        type="date"
                        value={toDateInputValue(t.start)}
                        onChange={(e) => handleStartChange(t.id, e.target.value)}
                        style={{ width: '100%', minWidth: 0, height: 28, padding: '0 6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 11, boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '0 8px', verticalAlign: 'middle', height: ROW_HEIGHT, boxSizing: 'border-box', width: 120, minWidth: 100 }}>
                      <input
                        type="date"
                        value={toDateInputValue(t.end)}
                        onChange={(e) => handleEndChange(t.id, e.target.value)}
                        style={{ width: '100%', minWidth: 0, height: 28, padding: '0 6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 11, boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '0 8px', verticalAlign: 'middle', height: ROW_HEIGHT, boxSizing: 'border-box', textAlign: 'center', width: 56, minWidth: 48 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.progress}
                        onChange={(e) => handleProgressChangeTable(t.id, parseInt(e.target.value, 10) || 0)}
                        style={{ width: 48, height: 28, padding: '0 4px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 11, textAlign: 'center', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '0 4px', verticalAlign: 'middle', height: ROW_HEIGHT, boxSizing: 'border-box', width: 44 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Удалить задачу «${t.name}»?`)) {
                            setTasks((prev) => prev.filter((task) => task.id !== t.id));
                          }
                        }}
                        title="Удалить задачу"
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          border: 'none',
                          borderRadius: 4,
                          background: 'transparent',
                          color: 'var(--color-muted-text)',
                          cursor: 'pointer',
                          fontSize: 18,
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-error-bg)';
                          e.currentTarget.style.color = 'var(--color-danger)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--color-muted-text)';
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="planner-gantt-wrap"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--pico-background-color)',
          }}
        >
          <div ref={ganttScrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--pico-background-color)' }}>
            {ganttTasks.length > 0 ? (
              <Gantt
                tasks={ganttTasks}
                viewMode={viewMode}
                listCellWidth=""
                columnWidth={getColumnWidth(viewMode)}
                rowHeight={ROW_HEIGHT}
                headerHeight={GANTT_HEADER_HEIGHT}
                barFill={100}
                ganttHeight={0}
                locale="ru-RU"
                barBackgroundColor="var(--gantt-bar-bg)"
                barBackgroundSelectedColor="var(--gantt-bar-bg-selected)"
                barProgressColor="var(--gantt-bar-progress)"
                barProgressSelectedColor="var(--gantt-bar-progress-selected)"
                todayColor="var(--gantt-today)"
                onDateChange={handleDateChange}
                onProgressChange={(task) => {
                  const p = task.progress <= 0.5 ? 0 : Math.round(task.progress);
                  handleProgressChange({ ...task, progress: p });
                }}
                onDelete={(task) => setTasks((prev) => prev.filter((t) => t.id !== task.id))}
              />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--pico-muted-color)', fontSize: 14 }}>
                Нет задач. Нажмите «+ Задача», чтобы добавить.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlannerPage;
