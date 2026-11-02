import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLang } from '@/lib/i18n';
import { getSyncConfig, pushProjects, fetchProjectsFromRepo, schedulePushWithDelay, cancelScheduledPush } from '@/lib/githubSync';
import { getFirebaseApp } from '@/lib/firebaseAuth';
import { idbGet, idbSet } from '@/lib/idbStorage';

export interface ProjectItem {
  id: string;
  title: string;
  titleEn?: string;
  category: string;
  categoryEn?: string;
  description: string;
  descriptionEn?: string;
  imageUrl: string;
  tags: string[];
  tagsEn?: string[];
  linkUrl?: string;
  year?: string;
  published: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

const STORAGE_KEY = 'igor-projects';
let projectsBundle: ProjectItem[] | null = null;

export function loadProjectsBundle(): Promise<void> {
  return fetch('/data/projects.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data: { version?: number; exportedAt?: number; projects?: ProjectItem[] } | ProjectItem[]) => {
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { projects?: ProjectItem[] }).projects)
        ? (data as { projects: ProjectItem[] }).projects
        : [];
      const remoteExportedAt = (!Array.isArray(data) && data.exportedAt) ? data.exportedAt : 0;
      projectsBundle = list.filter((p) => !p.deleted);
      try {
        const local = loadLocalProjects();
        if (local.length === 0) {
          saveLocalProjects(list);
        } else if (remoteExportedAt > 0) {
          const localMax = Math.max(0, ...local.map((p) => p.updatedAt ?? 0));
          if (remoteExportedAt > localMax) {
            const map = new Map<string, ProjectItem>();
            for (const p of list) {
              if (p.id) map.set(p.id, p);
            }
            for (const p of local) {
              if (!p.id) continue;
              const remoteItem = map.get(p.id);
              if (!remoteItem || (p.updatedAt ?? 0) >= (remoteItem.updatedAt ?? 0)) {
                map.set(p.id, p);
              }
            }
            const merged = Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            projectsBundle = merged.filter((p) => !p.deleted);
            saveLocalProjects(merged);
          }
        }
      } catch {}
    })
    .catch(() => {
      projectsBundle = null;
    });
}

let projectsMemoryCache: ProjectItem[] | null = null;

function loadLocalProjects(): ProjectItem[] {
  if (projectsMemoryCache && projectsMemoryCache.length > 0) {
    return projectsMemoryCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ProjectItem[];
    const normalized = arr.map((p) => ({
      ...p,
      tags: p.tags ?? [],
      deleted: p.deleted ?? false,
    }));
    projectsMemoryCache = normalized;
    return normalized;
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: ProjectItem[]): void {
  projectsMemoryCache = projects;
  void idbSet(STORAGE_KEY, projects);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('localStorage quota exceeded for projects, saved to IndexedDB & memory:', e);
    try {
      const lightweight = projects.map(p => ({
        ...p,
        imageUrl: (p.imageUrl && p.imageUrl.length > 1000) ? '' : p.imageUrl
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
    } catch {}
  }
}

export function downloadProjectsBundle(projects: ProjectItem[]): void {
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: Date.now(), projects }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'projects.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function resizeProjectImage(dataUrl: string, maxW = 1280): Promise<string> {
  if (dataUrl.startsWith('data:image/gif')) return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxW) {
        resolve(dataUrl);
        return;
      }
      const r = maxW / img.width;
      const c = document.createElement('canvas');
      c.width = maxW;
      c.height = Math.round(img.height * r);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.88));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const ProjectsPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  const { isEn, lang, setLang } = useLang();
  const [projects, setProjects] = useState<ProjectItem[]>(() => {
    const local = loadLocalProjects();
    if (local.length > 0) return local;
    return projectsBundle ?? [];
  });

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [lightboxProject, setLightboxProject] = useState<ProjectItem | null>(null);

  // Editor states
  const [editTab, setEditTab] = useState<'ru' | 'en'>('ru');
  const [titleRu, setTitleRu] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [categoryRu, setCategoryRu] = useState('');
  const [categoryEn, setCategoryEn] = useState('');
  const [descRu, setDescRu] = useState('');
  const [descEn, setDescEn] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [year, setYear] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [published, setPublished] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Асинхронно восстанавливаем из IndexedDB
  useEffect(() => {
    void idbGet<ProjectItem[]>(STORAGE_KEY).then((idbProjs) => {
      if (Array.isArray(idbProjs) && idbProjs.length > 0) {
        setProjects((current) => {
          if (current.length === 0) return idbProjs;
          const currMax = Math.max(0, ...current.map((p) => p.updatedAt ?? 0));
          const idbMax = Math.max(0, ...idbProjs.map((p) => p.updatedAt ?? 0));
          if (idbMax >= currMax) {
            return idbProjs;
          }
          return current;
        });
      }
    });
  }, []);

  // Подгружаем актуальный бандл из репозитория/хостинга при загрузке страницы
  useEffect(() => {
    void loadProjectsBundle().then(() => {
      if (projectsBundle && projectsBundle.length > 0) {
        setProjects((current) => {
          if (current.length === 0) return projectsBundle!;
          const currMax = Math.max(0, ...current.map((p) => p.updatedAt ?? 0));
          const bundleMax = Math.max(0, ...projectsBundle!.map((p) => p.updatedAt ?? 0));
          if (bundleMax > currMax) {
            return projectsBundle!;
          }
          return current;
        });
      }
    });
  }, []);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'loading' | 'sending' | 'ok' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const justPushedRef = useRef(false);

  const doPush = useCallback(async (listToPush: ProjectItem[]) => {
    setSyncStatus('sending');
    setSyncError(null);
    const res = await pushProjects(listToPush);
    if (res.ok) {
      setSyncStatus('ok');
      justPushedRef.current = true;
      setTimeout(() => setSyncStatus('idle'), 4000);
    } else {
      setSyncStatus('error');
      setSyncError(res.error || (isEn ? 'Sync failed' : 'Ошибка синхронизации'));
    }
  }, [isEn]);

  const saveAndSync = useCallback((updated: ProjectItem[]) => {
    setProjects(updated);
    saveLocalProjects(updated);
    if (!isAdmin) return;
    if (getSyncConfig() || getFirebaseApp()) {
      setSyncStatus('pending');
      setSyncError(null);
      schedulePushWithDelay('projects', 4000, () => doPush(updated));
    }
  }, [isAdmin, doPush]);

  const handleSyncNow = useCallback(() => {
    cancelScheduledPush('projects');
    void doPush(projects);
  }, [projects, doPush]);

  const handlePullFromRepo = useCallback(async () => {
    cancelScheduledPush('projects');
    setSyncStatus('loading');
    setSyncError(null);
    const remote = await fetchProjectsFromRepo();
    if (remote.ok) {
      const remoteList = (Array.isArray(remote.projects) ? remote.projects : []) as ProjectItem[];
      const map = new Map<string, ProjectItem>();
      for (const p of remoteList) {
        if (p.id) map.set(p.id, p);
      }
      for (const p of projects) {
        if (!p.id) continue;
        const ex = map.get(p.id);
        if (!ex || (p.updatedAt ?? 0) >= (ex.updatedAt ?? 0)) {
          map.set(p.id, p);
        }
      }
      const merged = Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setProjects(merged);
      saveLocalProjects(merged);
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
      setSyncStatus('error');
      setSyncError(remote.error || (isEn ? 'Failed to fetch from repo' : 'Не удалось получить данные из репозитория'));
    }
  }, [projects, isEn]);

  const handleCancelPush = useCallback(() => {
    cancelScheduledPush('projects');
    setSyncStatus('idle');
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    const list = isAdmin ? projects.filter((p) => !p.deleted) : projects.filter((p) => p.published && !p.deleted);
    list.forEach((p) => {
      const cat = (isEn ? p.categoryEn : p.category) || p.category;
      if (cat) set.add(cat);
    });
    return Array.from(set);
  }, [projects, isAdmin, isEn]);

  const filteredProjects = useMemo(() => {
    let list = isAdmin ? projects.filter((p) => !p.deleted) : projects.filter((p) => p.published && !p.deleted);
    if (activeCategory !== 'all') {
      list = list.filter((p) => {
        const cat = (isEn ? p.categoryEn : p.category) || p.category;
        return cat === activeCategory;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const titleMatch = (p.title || '').toLowerCase().includes(q) || (p.titleEn || '').toLowerCase().includes(q);
        const descMatch = (p.description || '').toLowerCase().includes(q) || (p.descriptionEn || '').toLowerCase().includes(q);
        const tagMatch = (p.tags || []).some((t) => t.toLowerCase().includes(q));
        const catMatch = (p.category || '').toLowerCase().includes(q) || (p.categoryEn || '').toLowerCase().includes(q);
        return titleMatch || descMatch || tagMatch || catMatch;
      });
    }
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [projects, isAdmin, activeCategory, search, isEn]);

  const handleStartNew = () => {
    const newProj: ProjectItem = {
      id: 'proj_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36),
      title: '',
      titleEn: '',
      category: '',
      categoryEn: '',
      description: '',
      descriptionEn: '',
      imageUrl: '',
      tags: [],
      year: new Date().getFullYear().toString(),
      published: true,
      order: projects.length + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setEditingProject(newProj);
    setTitleRu('');
    setTitleEn('');
    setCategoryRu('');
    setCategoryEn('');
    setDescRu('');
    setDescEn('');
    setImageUrl('');
    setTagsStr('');
    setYear(newProj.year || '');
    setLinkUrl('');
    setPublished(true);
    setEditTab('ru');
  };

  const handleStartEdit = (proj: ProjectItem) => {
    setEditingProject(proj);
    setTitleRu(proj.title || '');
    setTitleEn(proj.titleEn || '');
    setCategoryRu(proj.category || '');
    setCategoryEn(proj.categoryEn || '');
    setDescRu(proj.description || '');
    setDescEn(proj.descriptionEn || '');
    setImageUrl(proj.imageUrl || '');
    setTagsStr((proj.tags || []).join(', '));
    setYear(proj.year || '');
    setLinkUrl(proj.linkUrl || '');
    setPublished(proj.published);
    setEditTab('ru');
  };

  const handleSaveEditor = () => {
    if (!editingProject) return;
    const activeTitle = titleRu.trim() || titleEn.trim() || (isEn ? 'Untitled Project' : 'Новый проект');
    const tagsArr = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const updatedItem: ProjectItem = {
      ...editingProject,
      title: titleRu.trim() || activeTitle,
      titleEn: titleEn.trim() || undefined,
      category: categoryRu.trim() || (isEn ? 'Other' : 'Разное'),
      categoryEn: categoryEn.trim() || undefined,
      description: descRu.trim(),
      descriptionEn: descEn.trim() || undefined,
      imageUrl: imageUrl.trim() || '/assets/project-civil3d.svg',
      tags: tagsArr,
      year: year.trim() || undefined,
      linkUrl: linkUrl.trim() || undefined,
      published,
      updatedAt: Date.now(),
    };

    const exists = projects.some((p) => p.id === updatedItem.id);
    let updatedList: ProjectItem[];
    if (exists) {
      updatedList = projects.map((p) => (p.id === updatedItem.id ? updatedItem : p));
    } else {
      updatedList = [...projects, updatedItem];
    }
    saveAndSync(updatedList);
    setEditingProject(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm(isEn ? 'Delete this project card?' : 'Удалить эту карточку проекта?')) return;
    const updated = projects.map((p) => (p.id === id ? { ...p, deleted: true, updatedAt: Date.now() } : p));
    saveAndSync(updated);
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const list = [...filteredProjects];
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const currentItem = list[idx];
    const targetItem = list[targetIdx];

    const fullSorted = [...projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const fullIdx = fullSorted.findIndex((p) => p.id === currentItem.id);
    const fullTargetIdx = fullSorted.findIndex((p) => p.id === targetItem.id);

    if (fullIdx >= 0 && fullTargetIdx >= 0) {
      fullSorted.splice(fullIdx, 1);
      fullSorted.splice(fullTargetIdx, 0, currentItem);
    }

    const now = Date.now();
    const updatedAll = fullSorted.map((p, i) => ({
      ...p,
      order: i + 1,
      updatedAt: now,
    }));
    saveAndSync(updatedAll);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const finalUrl = file.type === 'image/gif' ? dataUrl : await resizeProjectImage(dataUrl, 1280);
      setImageUrl(finalUrl);
    } catch {
      alert(isEn ? 'Failed to process screenshot' : 'Не удалось обработать скриншот');
    }
    e.target.value = '';
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="text-center mb-8">
        <div className="flex justify-center items-center gap-3 mb-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 m-0">
            {isEn ? 'Projects & Showcase' : 'Проекты и примеры работ'}
          </h1>
        </div>
        <p className="text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {isEn
            ? 'Key portfolio works: custom Civil 3D plugins, complex 3D modeling in Blender, urban master planning, and BIM infrastructure.'
            : 'Ключевые примеры работ: авторские плагины для Civil 3D, 3D-моделирование в Blender, генеральные планы и инфраструктурный BIM.'}
        </p>

        {isAdmin && (
          <div className="mt-4 p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 max-w-2xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all"
                >
                  {isEn ? '+ Add Project Card' : '+ Добавить проект'}
                </button>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncStatus === 'sending' || syncStatus === 'loading'}
                  className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium shadow-sm transition-all"
                  title={isEn ? 'Push changes to GitHub repository' : 'Отправить изменения в репозиторий GitHub'}
                >
                  {syncStatus === 'sending' ? (isEn ? 'Pushing...' : 'Отправка...') : (isEn ? '🚀 Push to Repo' : '🚀 Загрузить в репо')}
                </button>
                <button
                  type="button"
                  onClick={handlePullFromRepo}
                  disabled={syncStatus === 'sending' || syncStatus === 'loading'}
                  className="px-3.5 py-1.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 rounded-lg text-sm font-medium transition-all"
                >
                  {syncStatus === 'loading' ? (isEn ? 'Pulling...' : 'Загрузка...') : (isEn ? '🔄 Pull from Repo' : '🔄 Обновить из репо')}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadProjectsBundle(projects)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                >
                  {isEn ? 'Export JSON' : 'Скачать JSON'}
                </button>
                <a
                  href="/#sync-settings-anchor"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  title={isEn ? 'Configure GitHub Token' : 'Настройки токена GitHub'}
                >
                  {isEn ? '⚙️ Sync Settings' : '⚙️ Настройки синхронизации'}
                </a>
              </div>
            </div>

            {/* Sync feedback banner */}
            <div className="text-xs text-left">
              {syncStatus === 'pending' && (
                <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span>⏳ {isEn ? 'Changes will be pushed to GitHub in 4s...' : 'Изменения будут отправлены в репозиторий через 4 сек...'}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSyncNow} className="underline font-semibold">{isEn ? 'Push Now' : 'Загрузить сейчас'}</button>
                    <button type="button" onClick={handleCancelPush} className="underline opacity-75">{isEn ? 'Cancel' : 'Отмена'}</button>
                  </div>
                </div>
              )}
              {syncStatus === 'sending' && (
                <div className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg border border-blue-200 dark:border-blue-800">
                  🚀 {isEn ? 'Pushing projects.json to GitHub repository... (creating commit)' : 'Отправка projects.json в репозиторий GitHub... (создаётся коммит)'}
                </div>
              )}
              {syncStatus === 'loading' && (
                <div className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg border border-blue-200 dark:border-blue-800">
                  🔄 {isEn ? 'Loading latest projects from repository...' : 'Загрузка актуальных проектов из репозитория...'}
                </div>
              )}
              {syncStatus === 'ok' && (
                <div className="text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 p-2 rounded-lg border border-green-200 dark:border-green-800">
                  ✅ {isEn ? 'Successfully pushed to GitHub! A commit was made and GitHub Actions is deploying the site.' : 'Успешно отправлено в репозиторий GitHub! Коммит создан, GitHub Actions запустил сборку сайта.'}
                </div>
              )}
              {syncStatus === 'error' && (
                <div className="text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 p-2 rounded-lg border border-red-200 dark:border-red-800">
                  ❌ {syncError}
                </div>
              )}
              {syncStatus === 'idle' && (
                <div className="text-gray-500 dark:text-gray-400">
                  {getSyncConfig() ? (
                    <span>
                      ✓ {isEn ? 'GitHub Sync configured' : 'Синхронизация с GitHub настроена'}: <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{getSyncConfig()?.owner}/{getSyncConfig()?.repo} ({getSyncConfig()?.branch})</code>. {isEn ? 'Any edits auto-push to repo.' : 'Все изменения автоматически отправляются в репозиторий.'}
                    </span>
                  ) : (
                    <span>
                      ⚠️ {isEn ? 'GitHub Token is not configured. Edits are currently saved ONLY in your browser localStorage. To publish to the site & repo, configure GitHub Token in Sync Settings.' : 'GitHub Token не настроен. Сейчас изменения сохраняются ТОЛЬКО локально в вашем браузере. Чтобы они попадали в репозиторий и на сайт, укажите токен в Настройках синхронизации.'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Search & Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {isEn ? 'All Works' : 'Все работы'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full sm:w-64">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isEn ? 'Search projects...' : 'Поиск проектов...'}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Projects Grid (Uniform 16:9 Aspect Tiles) */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">{isEn ? 'No projects found.' : 'Проектов не найдено.'}</p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-sm text-blue-600 dark:text-blue-400 underline"
            >
              {isEn ? 'Clear search' : 'Сбросить поиск'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filteredProjects.map((proj, idx) => {
            const title = (isEn ? proj.titleEn : proj.title) || proj.title;
            const category = (isEn ? proj.categoryEn : proj.category) || proj.category;
            const description = (isEn ? proj.descriptionEn : proj.description) || proj.description;

            return (
              <div
                key={proj.id}
                className="group flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/90 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                {/* 16:9 Image Preview Tile */}
                <div
                  className="relative w-full aspect-video bg-gray-100 dark:bg-gray-950 cursor-pointer overflow-hidden group-hover:brightness-105 transition-all"
                  onClick={() => setLightboxProject(proj)}
                  title={isEn ? 'Click to enlarge screenshot' : 'Нажмите, чтобы увеличить скриншот'}
                >
                  <img
                    src={proj.imageUrl}
                    alt={title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3 flex gap-2">
                    {category && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-900/80 text-white backdrop-blur-sm shadow-sm">
                        {category}
                      </span>
                    )}
                    {proj.year && (
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-blue-600/90 text-white backdrop-blur-sm shadow-sm">
                        {proj.year}
                      </span>
                    )}
                  </div>
                  {isAdmin && !proj.published && (
                    <span className="absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-bold bg-amber-500 text-gray-900 shadow-sm">
                      {isEn ? 'Draft' : 'Черновик'}
                    </span>
                  )}
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 backdrop-blur-sm">
                    🔍 {isEn ? 'Zoom' : 'Увеличить'}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3
                      className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      onClick={() => setLightboxProject(proj)}
                    >
                      {title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4 whitespace-pre-line">
                      {description}
                    </p>
                  </div>

                  <div>
                    {/* Tags */}
                    {proj.tags && proj.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {proj.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                      {proj.linkUrl ? (
                        <a
                          href={proj.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium hover:underline"
                        >
                          {isEn ? 'External Link / Demo ↗' : 'Подробнее / Ссылка ↗'}
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLightboxProject(proj)}
                          className="text-blue-600 dark:text-blue-400 font-medium hover:underline p-0 border-0 bg-transparent"
                        >
                          {isEn ? 'View Details & Zoom' : 'Смотреть детали и скриншот'}
                        </button>
                      )}

                      {/* Admin Controls */}
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMove(proj.id, 'up')}
                            disabled={idx === 0}
                            className="p-1 px-2 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                            title={isEn ? 'Move up' : 'Выше'}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(proj.id, 'down')}
                            disabled={idx === filteredProjects.length - 1}
                            className="p-1 px-2 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                            title={isEn ? 'Move down' : 'Ниже'}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(proj)}
                            className="p-1 px-2.5 rounded border border-blue-400 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium"
                          >
                            ✎ {isEn ? 'Edit' : 'Ред.'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(proj.id)}
                            className="p-1 px-2 rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Full View Modal */}
      {lightboxProject && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxProject(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <span className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 mr-2">
                  {(isEn ? lightboxProject.categoryEn : lightboxProject.category) || lightboxProject.category}
                </span>
                {lightboxProject.year && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{lightboxProject.year}</span>
                )}
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 mb-0">
                  {(isEn ? lightboxProject.titleEn : lightboxProject.title) || lightboxProject.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLightboxProject(null)}
                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Screenshot full width */}
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 mb-6 bg-black/5 dark:bg-black/30">
              <img
                src={lightboxProject.imageUrl}
                alt={lightboxProject.title}
                className="w-full max-h-[60vh] object-contain mx-auto"
              />
            </div>

            <p className="text-base text-gray-700 dark:text-gray-200 leading-relaxed mb-6 whitespace-pre-line">
              {(isEn ? lightboxProject.descriptionEn : lightboxProject.description) || lightboxProject.description}
            </p>

            {lightboxProject.tags && lightboxProject.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {lightboxProject.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-md text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              {lightboxProject.linkUrl && (
                <a
                  href={lightboxProject.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  {isEn ? 'Open Project Link ↗' : 'Перейти по ссылке ↗'}
                </a>
              )}
              <button
                type="button"
                onClick={() => setLightboxProject(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
              >
                {isEn ? 'Close' : 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Project Editor Modal */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <h2 className="text-xl font-bold mb-4">
              {isEn ? 'Edit Project Tile' : 'Редактирование карточки проекта'}
            </h2>

            {/* Language tabs */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setEditTab('ru')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  editTab === 'ru'
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                🇷🇺 Русский {titleRu ? '✓' : ''}
              </button>
              <button
                type="button"
                onClick={() => setEditTab('en')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  editTab === 'en'
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                🇬🇧 English {titleEn ? '✓' : ''}
              </button>
            </div>

            {/* Bilingual Inputs */}
            {editTab === 'ru' ? (
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Название проекта (RU) *
                  </label>
                  <input
                    type="text"
                    value={titleRu}
                    onChange={(e) => setTitleRu(e.target.value)}
                    placeholder="Например: Плагины для Civil 3D"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Категория (RU)
                  </label>
                  <input
                    type="text"
                    value={categoryRu}
                    onChange={(e) => setCategoryRu(e.target.value)}
                    placeholder="Например: Плагины и автоматизация"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Описание проекта (RU)
                  </label>
                  <textarea
                    rows={4}
                    value={descRu}
                    onChange={(e) => setDescRu(e.target.value)}
                    placeholder="Краткое описание задачи, технологий и результата..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Project Title (EN)
                  </label>
                  <input
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="e.g.: Proprietary Civil 3D Plugin Suite"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Category (EN)
                  </label>
                  <input
                    type="text"
                    value={categoryEn}
                    onChange={(e) => setCategoryEn(e.target.value)}
                    placeholder="e.g.: Plugins & Automation"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Project Description (EN)
                  </label>
                  <textarea
                    rows={4}
                    value={descEn}
                    onChange={(e) => setDescEn(e.target.value)}
                    placeholder="Brief description of the challenge, tech stack, and deliverable..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Common Image / Settings */}
            <div className="space-y-4 mb-6 pt-4 border-t border-gray-200 dark:border-gray-800">
              {/* Image Preview & Upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  {isEn ? 'Screenshot / Preview Image (16:9 format)' : 'Скриншот / Обложка (формат 16:9)'}
                </label>
                {imageUrl && (
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-2 max-w-sm">
                    <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    📁 {isEn ? 'Upload Screenshot from device' : 'Загрузить скриншот с устройства'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder={isEn ? 'Or paste image URL / SVG path' : 'Или вставьте URL / путь к изображению'}
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    {isEn ? 'Year / Period' : 'Год / Период'}
                  </label>
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2025–2026"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    {isEn ? 'External Link (Optional)' : 'Ссылка на проект (опционально)'}
                  </label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  {isEn ? 'Tags (comma-separated)' : 'Теги (через запятую)'}
                </label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="Civil 3D, C#, Blender, BIM, Master Plan"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                <span>{isEn ? 'Published (visible to guests)' : 'Опубликован (виден гостям)'}</span>
              </label>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
              >
                {isEn ? 'Cancel' : 'Отмена'}
              </button>
              <button
                type="button"
                onClick={handleSaveEditor}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                {isEn ? 'Save Project' : 'Сохранить проект'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to Home Link */}
      <p className="mt-12 text-center">
        <a href="/" className="text-sm text-gray-500 hover:underline">
          {isEn ? '← Back to Home' : '← На главную'}
        </a>
      </p>
    </main>
  );
};
