import { getLayoutsFromRepo } from './githubSync';

export type SectionType = 'hero' | 'text' | 'link' | 'widget' | 'divider';

export interface PageSection {
  id: string;
  type: SectionType;
  title?: string;
  subtitle?: string;
  titleEn?: string;
  subtitleEn?: string;
  titleRu?: string;
  subtitleRu?: string;
  html?: string;
  htmlEn?: string;
  htmlRu?: string;
  linkLabel?: string;
  linkLabelEn?: string;
  linkLabelRu?: string;
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
  const { getFirebaseApp } = await import('./firebaseAuth');
  if (getFirebaseApp()) {
    const layouts = await getLayoutsFromRepo();
    if (layouts) {
      setAllLayoutsFromBundle(layouts as Record<string, PageSection[]>);
      return true;
    }
  }
  try {
    const res = await fetch('/data/layouts.json');
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
  const sections = all[pageId] ?? getDefaults(pageId);
  // Ensure the welcome hero section is up-to-date with Igor Chevela greeting & bilingual text
  if (pageId === 'welcome' && Array.isArray(sections)) {
    const hero = sections.find((s) => s.id === 'w1');
    if (hero && (!hero.title || !hero.title.includes('Igor Chevela'))) {
      const defHero = getDefaults('welcome').find((s) => s.id === 'w1');
      if (defHero) {
        Object.assign(hero, defHero);
      }
    }
    const hasProjects = sections.some((s) => s.linkUrl === '/projects');
    if (!hasProjects) {
      const defProj = getDefaults('welcome').find((s) => s.linkUrl === '/projects');
      if (defProj) {
        sections.splice(1, 0, defProj);
      }
    }
    const calcSec = sections.find((s) => s.linkUrl === '/calculators' || s.id === 'w5');
    if (calcSec) {
      calcSec.adminOnly = true;
    }
  }
  return sections;
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
          title: "Hello!\nI'm Igor Chevela",
          titleEn: "Hello!\nI'm Igor Chevela",
          titleRu: "Привет!\nЯ — Игорь Чевела",
          subtitle:
            'I specialize in site design, master planning, BIM services, and 3D modeling across Autodesk and Blender. Over the past year, my primary focus has been on developing proprietary plugins for Autodesk AutoCAD Civil 3D and creating 3D models of any complexity.',
          subtitleEn:
            'I specialize in site design, master planning, BIM services, and 3D modeling across Autodesk and Blender. Over the past year, my primary focus has been on developing proprietary plugins for Autodesk AutoCAD Civil 3D and creating 3D models of any complexity.',
          subtitleRu:
            'Занимаюсь разработкой генеральных планов, мастер-планов, BIM-услугами и 3D-моделированием в продуктах Autodesk и Blender. В последний год сфокусирован на разработке авторских плагинов для Autodesk AutoCAD Civil 3D и подготовке 3D-моделей любой сложности.',
        }),
        sec('w7', 'link', { linkLabel: 'Projects', linkLabelEn: 'Projects', linkLabelRu: 'Проекты', linkUrl: '/projects' }),
        sec('w6', 'link', { linkLabel: 'Blog', linkLabelEn: 'Blog', linkLabelRu: 'Блог', linkUrl: '/blog' }),
        sec('w8', 'link', { linkLabel: 'CV', linkLabelEn: 'CV', linkLabelRu: 'CV', linkUrl: '/cv' }),
        sec('w5', 'link', { linkLabel: 'Calculators', linkLabelEn: 'Calculators', linkLabelRu: 'Калькуляторы', linkUrl: '/calculators', adminOnly: true }),
        sec('w2', 'link', { linkLabel: 'Calculator Editor', linkLabelEn: 'Calculator Editor', linkLabelRu: 'Редактор калькуляторов', linkUrl: '/editor', adminOnly: true }),
      ];
    case 'calculators':
      return [
        sec('c1', 'hero', {
          title: 'Published Calculators',
          titleEn: 'Published Calculators',
          titleRu: 'Опубликованные калькуляторы',
          subtitle: 'Select a calculator to perform calculations.',
          subtitleEn: 'Select a calculator to perform calculations.',
          subtitleRu: 'Выберите калькулятор для расчётов.',
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
