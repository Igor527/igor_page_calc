import { getLayoutsFromRepo } from './githubSync';

export type SectionType = 'hero' | 'text' | 'link' | 'widget' | 'divider';

export interface PageSection {
  id: string;
  type: SectionType;
  title?: string;
  subtitle?: string;
  html?: string;
  linkLabel?: string;
  linkUrl?: string;
  adminOnly?: boolean;
  /** Показывать ограниченному гостю (списки дел, метеостанция). */
  showForGuest?: boolean;
  widgetType?: string;
}

const STORAGE_KEY = 'igor-page-layouts';

function loadAll(): Record<string, PageSection[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

/** Все секции всех страниц (для экспорта в репо). */
export function getAllLayouts(): Record<string, PageSection[]> {
  return loadAll();
}

/** Подставить данные из репо (перезапись localStorage). */
export function setAllLayoutsFromBundle(data: Record<string, PageSection[]>): void {
  if (data && typeof data === 'object') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

/** Загрузить порядок окон из data/layouts.json (статический файл сайта). */
export async function loadLayoutsBundle(): Promise<boolean> {
  try {
    const res = await fetch('./data/layouts.json');
    if (!res.ok) return false;
    const data = await res.json();
    const layouts = data?.layouts ?? data;
    if (layouts && typeof layouts === 'object') setAllLayoutsFromBundle(layouts);
    return true;
  } catch {
    return false;
  }
}

/** Загрузить порядок окон из репо по API и применить. */
export async function loadLayoutsFromRepo(): Promise<boolean> {
  const layouts = await getLayoutsFromRepo();
  if (!layouts) return false;
  setAllLayoutsFromBundle(layouts as Record<string, PageSection[]>);
  return true;
}

export function loadPageSections(pageId: string): PageSection[] {
  const all = loadAll();
  return all[pageId] ?? getDefaults(pageId);
}

export function savePageSections(pageId: string, sections: PageSection[]): void {
  const all = loadAll();
  all[pageId] = sections;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function resetPageSections(pageId: string): void {
  const all = loadAll();
  delete all[pageId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function hasCustomLayout(pageId: string): boolean {
  return !!loadAll()[pageId];
}

function sec(id: string, type: SectionType, rest: Partial<PageSection> = {}): PageSection {
  return { id, type, ...rest };
}

export function getDefaults(pageId: string): PageSection[] {
  switch (pageId) {
    case 'welcome':
      return [
        sec('w1', 'hero', {
          title: 'Добро пожаловать!',
          subtitle: 'Это страница, где вы можете сделать предварительные технические расчёты.\nПроект разрабатывается для себя и отображается «как есть». Ответственность за результаты лежит на пользователе.',
        }),
        sec('w2', 'link', { linkLabel: 'Редактор калькуляторов', linkUrl: '/editor' }),
        sec('w3', 'link', { linkLabel: 'Планировщик (Гантт)', linkUrl: '/planner', adminOnly: true, showForGuest: true }),
        sec('w5', 'link', { linkLabel: 'Калькуляторы', linkUrl: '/calculators' }),
        sec('w6', 'link', { linkLabel: 'Блог', linkUrl: '/blog' }),
        sec('w6rss', 'link', { linkLabel: 'RSS подписки', linkUrl: '/rss', adminOnly: true }),
        sec('w6a', 'link', { linkLabel: 'Словарь / Перевод', linkUrl: '/dictionary', adminOnly: true }),
        sec('w7', 'link', { linkLabel: 'Заметки (админ)', linkUrl: '/admin/notes', adminOnly: true }),
        sec('w8', 'link', { linkLabel: 'CV', linkUrl: '/cv', adminOnly: true }),
        sec('w9', 'link', { linkLabel: 'Метеостанция', linkUrl: '/weather', adminOnly: true, showForGuest: true }),
      ];
    case 'calculators':
      return [
        sec('c1', 'hero', {
          title: 'Опубликованные калькуляторы',
          subtitle: 'Выберите калькулятор для расчётов.',
        }),
        sec('c2', 'widget', { widgetType: 'calculators' }),
      ];
    case 'blog':
      return [
        sec('b1', 'widget', { widgetType: 'page-content' }),
      ];
    default:
      return [
        sec('d1', 'widget', { widgetType: 'page-content' }),
      ];
  }
}
