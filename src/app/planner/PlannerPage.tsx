// Приватный планировщик с диаграммой Ганта (gantt-task-react)

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { Gantt, ViewMode, type Task } from 'gantt-task-react';
import { schedulePush, pushPlanner, getPlannerFromRepo, getSyncConfig } from '@/lib/githubSync';

const STORAGE_KEY = 'igor-page-planner-tasks';
const STORAGE_KEY_LABELS = 'igor-page-planner-labels';

/** Задача планировщика: Task + ручной цвет и метки */
export type PlannerTask = Task & { barColor?: string; labels?: string[] };

const ROW_HEIGHT = 44;
const ROW_HEIGHT_MOBILE = 36;
const GANTT_HEADER_HEIGHT = 52;
const GANTT_HEADER_HEIGHT_MOBILE = 44;
const TABLE_WIDTH = 640;

/** Палитра цветов для полос Ганта и для выбора цвета меток */
const GANTT_BAR_PALETTE = [
  '#4a90d9', '#7b68ee', '#50c878', '#e6a23c', '#f56c6c', '#c77eb5', '#20b2aa', '#dda0dd',
];

export type LabelWithColor = { name: string; color?: string };

function getBarStyles(
  index: number,
  barColor?: string,
  taskLabels?: string[],
  labelColors?: Record<string, string>
): Task['styles'] {
  let bg: string;
  if (labelColors && taskLabels?.length) {
    const firstLabelColor = taskLabels.map((l) => labelColors[l]).find(Boolean);
    bg = firstLabelColor ?? barColor ?? GANTT_BAR_PALETTE[index % GANTT_BAR_PALETTE.length];
  } else {
    bg = barColor ?? GANTT_BAR_PALETTE[index % GANTT_BAR_PALETTE.length];
  }
  const progress = 'rgba(0,0,0,0.25)';
  return {
    backgroundColor: bg,
    backgroundSelectedColor: bg,
    progressColor: progress,
    progressSelectedColor: progress,
  };
}

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

function loadStoredTasks(): PlannerTask[] {
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

function loadStoredLabels(): LabelWithColor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LABELS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x: unknown) =>
      typeof x === 'string' ? { name: x } : x && typeof x === 'object' && 'name' in x ? { name: String((x as any).name), color: (x as any).color } : null
    ).filter(Boolean) as LabelWithColor[];
  } catch {
    return [];
  }
}

/** Подставить задачи из репо в localStorage. Вызывается при глобальном pull и из кнопки «Синхронизировать с репо». */
/** Применить данные планировщика из репо (задачи и метки с цветами). */
export function applyPlannerFromRepoData(data: { tasks: Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }>; labels?: Array<{ name: string; color?: string }> }): void {
  try {
    if (Array.isArray(data.tasks) && data.tasks.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.tasks));
    }
    if (Array.isArray(data.labels) && data.labels.length > 0) {
      localStorage.setItem(STORAGE_KEY_LABELS, JSON.stringify(data.labels));
    }
  } catch {}
}

function getDefaultTasks(): PlannerTask[] {
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
  const [tasks, setTasks] = useState<PlannerTask[]>(loadStoredTasks);
  const [labelsList, setLabelsList] = useState<LabelWithColor[]>(loadStoredLabels);
  const [labelsPanelOpen, setLabelsPanelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const syncFromRef = useRef<'table' | 'gantt' | null>(null);
  /** Высота контента таблицы = scrollHeight Ганта, чтобы прокрутка строк совпадала */
  const [tableContentHeight, setTableContentHeight] = useState(0);

  // Загрузка задач из public/data/planner.json (при первом открытии)
  useEffect(() => {
    if (plannerLoaded) return;
    setPlannerLoaded(true);
    fetch('./data/planner.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const raw = data?.tasks;
        if (!Array.isArray(raw) || raw.length === 0) return;
        const parsed: PlannerTask[] = raw.map((t: { start: number; end: number; [k: string]: unknown }) => ({
          ...t,
          start: new Date(typeof t.start === 'number' ? t.start : t.start),
          end: new Date(typeof t.end === 'number' ? t.end : t.end),
        }));
        setTasks(parsed);
        try {
          const toStore = parsed.map((t) => ({ ...t, start: t.start.getTime(), end: t.end.getTime() }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch {}
      })
      .catch(() => {});
  }, [plannerLoaded]);

  useEffect(() => {
    const m = window.matchMedia('(max-width: 768px)');
    const onMatch = () => setIsNarrow(m.matches);
    m.addEventListener('change', onMatch);
    return () => m.removeEventListener('change', onMatch);
  }, []);

  /** Для подсветки выходных: дата первого столбца (мин. start по задачам), начало дня */
  const ganttStartDate = useMemo(() => {
    if (ganttTasks.length === 0) return new Date();
    const min = new Date(Math.min(...ganttTasks.map((t) => t.start.getTime())));
    min.setHours(0, 0, 0, 0);
    return min;
  }, [ganttTasks]);

  const isDayScaleView =
    viewMode === ViewMode.Hour ||
    viewMode === ViewMode.QuarterDay ||
    viewMode === ViewMode.HalfDay ||
    viewMode === ViewMode.Day;

  const colW = getColumnWidth(viewMode);
  const weekendWrapStyle: React.CSSProperties | null =
    isDayScaleView && ganttTasks.length > 0
      ? {
          ['--gantt-weekend-gradient' as string]: `linear-gradient(to right, var(--gantt-weekend) 0%, var(--gantt-weekend) ${100 / 7}%, transparent ${100 / 7}%, transparent ${(100 * 6) / 7}%, var(--gantt-weekend) ${(100 * 6) / 7}%, var(--gantt-weekend) 100%)`,
          ['--gantt-weekend-size' as string]: `${7 * colW}px`,
          ['--gantt-weekend-offset' as string]: `${-ganttStartDate.getDay() * colW}px`,
        }
      : null;

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

  // Выравнивание высоты контента таблицы под Гант для совпадения прокрутки
  useLayoutEffect(() => {
    const ganttEl = ganttScrollRef.current;
    if (!ganttEl) return;
    const read = () => {
      const sh = ganttEl.scrollHeight;
      if (sh > 0) setTableContentHeight(sh);
    };
    read();
    const t = requestAnimationFrame(read); // после отрисовки Ганта
    return () => cancelAnimationFrame(t);
  }, [ganttTasks.length, rowH, headerH, viewMode]);

  useEffect(() => {
    try {
      const toStore = tasks.map((t) => ({
        ...t,
        start: t.start.getTime(),
        end: t.end.getTime(),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      schedulePush('planner', () => pushPlanner(tasks, labelsList));
    } catch (e) {
      console.warn('Planner: не удалось сохранить задачи', e);
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LABELS, JSON.stringify(labelsList));
    } catch {}
  }, [labelsList]);

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
      prev.map((t) => (t.id === id ? { ...t, name } : t))
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

  const handleTaskAddLabel = useCallback((id: string, label: string) => {
    if (!label) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const labels = t.labels ?? [];
        return labels.includes(label) ? t : { ...t, labels: [...labels, label] };
      })
    );
  }, []);

  const handleTaskRemoveLabel = useCallback((id: string, label: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id !== id ? t : { ...t, labels: (t.labels ?? []).filter((l) => l !== label) }
      )
    );
  }, []);

  const addLabelToList = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLabelsList((prev) => {
      if (prev.some((l) => l.name === trimmed)) return prev;
      return [...prev, { name: trimmed }].sort((a, b) => a.name.localeCompare(b.name));
    });
    setNewLabelName('');
  }, []);

  const setLabelColor = useCallback((labelName: string, color: string) => {
    setLabelsList((prev) =>
      prev.map((l) => (l.name === labelName ? { ...l, color: color || undefined } : l))
    );
  }, []);

  const removeLabelFromList = useCallback((label: string) => {
    setLabelsList((prev) => prev.filter((l) => l.name !== label));
    setTasks((prev) =>
      prev.map((t) => ({ ...t, labels: (t.labels ?? []).filter((l) => l !== label) }))
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

  const labelColors = React.useMemo(
    () =>
      labelsList.reduce<Record<string, string>>((acc, l, i) => {
        acc[l.name] = l.color ?? GANTT_BAR_PALETTE[i % GANTT_BAR_PALETTE.length];
        return acc;
      }, {}),
    [labelsList]
  );

  const [filterByLabel, setFilterByLabel] = useState<string | null>(null);
  const [groupByLabels, setGroupByLabels] = useState(false);

  const displayedTasks = React.useMemo(() => {
    let list = filterByLabel
      ? tasks.filter((t) => (t.labels ?? []).includes(filterByLabel))
      : [...tasks];
    if (groupByLabels && labelsList.length > 0) {
      const primary = (t: PlannerTask) => (t.labels ?? [])[0] ?? '';
      const order = new Map(labelsList.map((l, i) => [l.name, i]));
      order.set('', labelsList.length);
      list.sort((a, b) => (order.get(primary(a)) ?? 999) - (order.get(primary(b)) ?? 999));
    }
    return list;
  }, [tasks, filterByLabel, groupByLabels, labelsList]);

  // Задачи для Ганта: без зависимостей, без milestone, цвет по метке или barColor или палитра
  const ganttTasks = displayedTasks.map((t, i) => ({
    ...t,
    progress: t.progress === 0 ? 0.5 : t.progress,
    dependencies: undefined,
    type: 'task' as const,
    styles: getBarStyles(i, t.barColor, t.labels, labelColors),
  }));

  const handleReset = () => {
    if (window.confirm('Сбросить все задачи к демо-набору?')) {
      setTasks(getDefaultTasks());
    }
  };

  const rowH = isNarrow ? ROW_HEIGHT_MOBILE : ROW_HEIGHT;
  const headerH = isNarrow ? GANTT_HEADER_HEIGHT_MOBILE : GANTT_HEADER_HEIGHT;
  const cellPad = isNarrow ? '0 4px' : '0 8px';

  const handlePullFromRepo = useCallback(async () => {
    setPullError(null);
    setPullLoading(true);
    try {
      const raw = await getPlannerFromRepo();
      if (raw && (raw.tasks?.length > 0 || (raw.labels?.length ?? 0) > 0)) {
        applyPlannerFromRepoData(raw);
        const parsed: PlannerTask[] = (raw.tasks ?? []).map((t) => ({
          ...t,
          start: new Date(t.start),
          end: new Date(t.end),
        }));
        setTasks(parsed);
        if (raw.labels?.length) setLabelsList(raw.labels);
      } else {
        setPullError('В репо нет данных планировщика или ошибка загрузки.');
      }
    } catch (e) {
      setPullError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setPullLoading(false);
    }
  }, []);

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
        {getSyncConfig() && (
          <>
            <button type="button" onClick={handlePullFromRepo} disabled={pullLoading} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', cursor: pullLoading ? 'wait' : 'pointer', fontSize: 12, height: 28 }}>
              {pullLoading ? 'Загрузка…' : 'Выгрузить последний сэйв из репо'}
            </button>
            <button type="button" onClick={() => pushPlanner(tasks, labelsList).catch(() => {})} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', cursor: 'pointer', fontSize: 12, height: 28 }}>
              Загрузить в репо
            </button>
          </>
        )}
        {pullError && <span style={{ fontSize: 11, color: 'var(--pico-del-color)' }}>{pullError}</span>}
        {labelsList.length > 0 && (
          <>
            <select
              value={filterByLabel ?? ''}
              onChange={(e) => setFilterByLabel(e.target.value || null)}
              title="Показать загрузку одного сотрудника"
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--pico-border-color)', fontSize: 12, background: 'var(--pico-background-color)', color: 'var(--pico-color)', height: 28 }}
            >
              <option value="">Все</option>
              {labelsList.map((l) => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }} title="Группировать задачи по первой метке (сотруднику)">
              <input type="checkbox" checked={groupByLabels} onChange={(e) => setGroupByLabels(e.target.checked)} />
              Группа по меткам
            </label>
          </>
        )}
        <button
          type="button"
          onClick={() => { setLabelsPanelOpen((o) => !o); }}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid var(--pico-border-color)',
            background: labelsPanelOpen ? 'var(--pico-primary-background)' : 'var(--pico-background-color)',
            color: 'var(--pico-color)',
            cursor: 'pointer',
            fontSize: 12,
            height: 28,
          }}
          title="Вести список меток (сотрудники, теги) и назначать их задачам"
        >
          Метки
        </button>
        <button type="button" onClick={handleReset} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', cursor: 'pointer', fontSize: 12, height: 28 }}>
          Сбросить к демо
        </button>
      </div>

      {/* Панель списка меток */}
      {labelsPanelOpen && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--pico-border-color)',
            background: 'var(--pico-background-color)',
            flexShrink: 0,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--pico-muted-color)' }}>
            Список меток (например, имена сотрудников или теги). Добавьте метки здесь, затем назначайте их задачам в колонке «Метки».
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabelToList(newLabelName); } }}
              placeholder="Новая метка"
              style={{
                width: 140,
                height: 28,
                padding: '0 8px',
                borderRadius: 4,
                border: '1px solid var(--pico-border-color)',
                background: 'var(--pico-form-element-background-color)',
                color: 'var(--pico-color)',
                fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => addLabelToList(newLabelName)}
              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)', cursor: 'pointer', fontSize: 12, height: 28 }}
            >
              Добавить
            </button>
            {labelsList.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--pico-muted-color)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {labelsList.map((l) => (
                  <span
                    key={l.name}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: l.color ? `${l.color}22` : 'var(--pico-primary-background)',
                      color: l.color || 'var(--pico-primary)',
                      fontSize: 11,
                    }}
                  >
                    <input
                      type="color"
                      value={labelColors[l.name] ?? '#4a90d9'}
                      onChange={(e) => setLabelColor(l.name, e.target.value)}
                      title="Цвет метки (и полосы Ганта)"
                      style={{ width: 20, height: 18, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span>{l.name}</span>
                    <button
                      type="button"
                      onClick={() => removeLabelFromList(l.name)}
                      title="Удалить метку"
                      style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

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
            <div
              style={{
                minHeight: tableContentHeight > 0 ? tableContentHeight : undefined,
                height: tableContentHeight > 0 ? tableContentHeight : undefined,
                boxSizing: 'border-box',
              }}
            >
              <table style={{ width: '100%', height: tableContentHeight > 0 ? '100%' : undefined, borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed', minWidth: TABLE_WIDTH, boxSizing: 'border-box' }}>
              <thead>
                <tr style={{ height: headerH, minHeight: headerH, maxHeight: headerH, borderBottom: '1px solid var(--pico-border-color)', boxSizing: 'border-box' }}>
                  <th style={{ textAlign: 'left', padding: cellPad, fontWeight: 600, width: 160, minWidth: 120, verticalAlign: 'middle' }}>Название</th>
                  <th style={{ textAlign: 'left', padding: cellPad, fontWeight: 600, width: 100, minWidth: 80, verticalAlign: 'middle' }}>Метки</th>
                  <th style={{ textAlign: 'left', padding: cellPad, fontWeight: 600, width: 100, minWidth: 88, verticalAlign: 'middle' }}>Начало</th>
                  <th style={{ textAlign: 'left', padding: cellPad, fontWeight: 600, width: 100, minWidth: 88, verticalAlign: 'middle' }}>Окончание</th>
                  <th style={{ textAlign: 'center', padding: cellPad, fontWeight: 600, width: 48, minWidth: 40, verticalAlign: 'middle' }}>%</th>
                  <th style={{ width: 40, minWidth: 36, padding: 0, verticalAlign: 'middle' }}></th>
                </tr>
              </thead>
              <tbody>
                {displayedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--pico-muted-color)', fontSize: 13, borderBottom: '1px solid var(--pico-border-color)' }}>
                      {filterByLabel ? 'Нет задач у выбранного сотрудника.' : 'Нет задач. Нажмите «+ Задача», чтобы добавить.'}
                    </td>
                  </tr>
                ) : (
                (() => {
                  // Без отдельных строк-заголовков групп, чтобы число строк таблицы совпадало с Гантом и скролл был синхронным
                  return displayedTasks.map((t) => (
                  <tr key={t.id} style={{ height: rowH, minHeight: rowH, maxHeight: rowH, borderBottom: '1px solid var(--pico-border-color)', boxSizing: 'border-box', lineHeight: 1 }}>
                    <td style={{ padding: cellPad, verticalAlign: 'middle', height: rowH, boxSizing: 'border-box', width: 160, minWidth: 120 }}>
                      <input
                        type="text"
                        value={t.name}
                        onChange={(e) => handleNameChange(t.id, e.target.value)}
                        style={{ width: '100%', minWidth: 0, height: 28, padding: '0 6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 12, boxSizing: 'border-box' }}
                        placeholder="Название"
                      />
                    </td>
                    <td style={{ padding: cellPad, verticalAlign: 'middle', height: rowH, boxSizing: 'border-box', width: 100, minWidth: 80 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', minHeight: 26 }}>
                        {(t.labels ?? []).map((l) => (
                          <span
                            key={l}
                            onClick={() => handleTaskRemoveLabel(t.id, l)}
                            title="Убрать метку"
                            style={{
                              fontSize: 10,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: labelColors[l] ? `${labelColors[l]}33` : 'var(--pico-primary-background)',
                              color: labelColors[l] ? '#fff' : 'var(--pico-primary)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {l} ×
                          </span>
                        ))}
                        <select
                          value=""
                          onChange={(e) => { const v = e.target.value; if (v) handleTaskAddLabel(t.id, v); e.currentTarget.value = ''; }}
                          title="Добавить метку"
                          style={{
                            minWidth: 0,
                            height: 24,
                            padding: '0 2px',
                            borderRadius: 3,
                            border: '1px solid var(--pico-border-color)',
                            background: 'var(--pico-background-color)',
                            color: 'var(--pico-color)',
                            fontSize: 10,
                            flex: '1 1 40px',
                            maxWidth: 80,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">+</option>
                          {labelsList.filter((l) => !(t.labels ?? []).includes(l.name)).map((l) => (
                            <option key={l.name} value={l.name}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: cellPad, verticalAlign: 'middle', height: rowH, boxSizing: 'border-box', width: 100, minWidth: 88 }}>
                      <input
                        type="date"
                        value={toDateInputValue(t.start)}
                        onChange={(e) => handleStartChange(t.id, e.target.value)}
                        style={{ width: '100%', minWidth: 0, height: 28, padding: '0 6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 11, boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: cellPad, verticalAlign: 'middle', height: rowH, boxSizing: 'border-box', width: 100, minWidth: 88 }}>
                      <input
                        type="date"
                        value={toDateInputValue(t.end)}
                        onChange={(e) => handleEndChange(t.id, e.target.value)}
                        style={{ width: '100%', minWidth: 0, height: 28, padding: '0 6px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 11, boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: cellPad, verticalAlign: 'middle', height: rowH, boxSizing: 'border-box', textAlign: 'center', width: 48, minWidth: 40 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.progress}
                        onChange={(e) => handleProgressChangeTable(t.id, parseInt(e.target.value, 10) || 0)}
                        style={{ width: 48, height: 28, padding: '0 4px', borderRadius: 4, border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', color: 'var(--pico-color)', fontSize: 11, textAlign: 'center', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '0 4px', verticalAlign: 'middle', height: rowH, boxSizing: 'border-box', width: 40 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Удалить задачу «${t.name || '(без названия)'}»?`)) {
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
                  ));
                })()
                )}
              </tbody>
            </table>
            </div>
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
            ['--planner-row-h' as string]: `${rowH}px`,
            ['--planner-header-h' as string]: `${headerH}px`,
          }}
        >
          <div ref={ganttScrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--pico-background-color)' }}>
            {ganttTasks.length > 0 ? (
              <div
                className={weekendWrapStyle ? 'planner-weekend-overlay' : ''}
                style={
                  weekendWrapStyle
                    ? { display: 'inline-block', position: 'relative', minWidth: '100%', ...weekendWrapStyle }
                    : undefined
                }
              >
                <Gantt
                  tasks={ganttTasks}
                  viewMode={viewMode}
                  listCellWidth=""
                  columnWidth={getColumnWidth(viewMode)}
                  rowHeight={rowH}
                  headerHeight={headerH}
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
              </div>
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
