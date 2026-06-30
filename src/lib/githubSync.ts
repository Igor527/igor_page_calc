/**
 * Синхронизация с GitHub: чтение/запись файлов в репо через API.
 * Конфиг (owner, repo, branch, token) хранится в localStorage.
 * Токен — GitHub Personal Access Token с правами repo (contents: read/write).
 */

import {
  formatGitHubApiError,
  formatRepoFileError,
  GITHUB_REPO_FETCH_FAILED,
  GITHUB_SYNC_NOT_CONFIGURED,
} from './syncAuthMessages';
import { getFirebaseApp } from './firebaseAuth';
import * as fb from './firebaseData';
import type { CalculatorStatus } from './calculatorStorage';

const CONFIG_KEY = 'igor-github-sync-config';

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export function getSyncConfig(): GitHubSyncConfig | null {

  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as GitHubSyncConfig;
    if (!c.owner || !c.repo || !c.token) return null;
    return { ...c, branch: c.branch || 'main' };
  } catch {
    return null;
  }
}

export function setSyncConfig(config: GitHubSyncConfig | null): void {
  if (!config) {
    localStorage.removeItem(CONFIG_KEY);
    return;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Сохранить конфиг с проверкой: возвращает ошибку, если localStorage недоступен (инкогнито, блокировка на Android). */
export function setSyncConfigSafe(config: GitHubSyncConfig | null): { ok: boolean; error?: string } {
  try {
    if (typeof localStorage === 'undefined') return { ok: false, error: 'localStorage недоступен' };
    if (!config) {
      localStorage.removeItem(CONFIG_KEY);
      return { ok: true };
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || 'Не удалось сохранить настройки' };
  }
}

/** Путь к файлу в репо (от корня). Для сайта используем public/data/... */
export function dataPath(filename: string): string {
  return `public/data/${filename}`;
}

export interface SyncResult {
  ok: boolean;
  error?: string;
}

export type GitHubFileResult =
  | { ok: true; content: string; sha: string }
  | { ok: false; status?: number; error: string };

/** GitHub Contents API: кодируем сегменты пути, слэши оставляем (encodeURIComponent('a/b') → 404). */
function encodeRepoPath(path: string): string {
  return path.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

/** Декодировать base64 в UTF-8 (в браузере atob даёт бинарную строку в Latin-1, кириллица ломается). */
function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function githubAuthHeaders(cfg: GitHubSyncConfig, accept = 'application/vnd.github.v3+json'): HeadersInit {
  return { Accept: accept, Authorization: `token ${cfg.token}` };
}

type GitHubContentMeta = {
  content?: string;
  sha?: string;
  size?: number;
  download_url?: string | null;
  git_url?: string | null;
};

/** Сырой текст файла через Contents API (тот же origin, без CORS raw.githubusercontent.com). */
async function fetchContentsRaw(cfg: GitHubSyncConfig, contentsUrl: string): Promise<string | null> {
  try {
    const res = await fetch(contentsUrl, {
      headers: githubAuthHeaders(cfg, 'application/vnd.github.v3.raw'),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith('{') && text.includes('"documentation_url"')) return null;
    return text;
  } catch {
    return null;
  }
}

/** Текст файла: base64 из Contents API; для крупных файлов — raw Accept / git blob (не download_url: CORS). */
async function readFileBody(
  cfg: GitHubSyncConfig,
  meta: GitHubContentMeta,
  contentsUrl: string
): Promise<string | null> {
  if (meta.content?.trim() && meta.sha) {
    try {
      return typeof atob !== 'undefined'
        ? base64ToUtf8(meta.content)
        : Buffer.from(meta.content, 'base64').toString('utf8');
    } catch {
      /* fallback below */
    }
  }
  if (!meta.sha) return null;

  const raw = await fetchContentsRaw(cfg, contentsUrl);
  if (raw != null) return raw;

  if (meta.git_url) {
    try {
      const res = await fetch(meta.git_url, { headers: githubAuthHeaders(cfg) });
      if (!res.ok) return null;
      const blob = (await res.json()) as { content?: string; encoding?: string };
      if (blob.content) {
        return blob.encoding === 'base64' || !blob.encoding
          ? base64ToUtf8(blob.content)
          : blob.content;
      }
    } catch {
      /* ignore */
    }
  }

  if (meta.download_url) {
    try {
      const res = await fetch(meta.download_url, { headers: githubAuthHeaders(cfg, 'application/vnd.github.v3.raw') });
      if (res.ok) return await res.text();
    } catch {
      /* CORS на private raw — ожидаемо в браузере */
    }
  }

  return null;
}

/**
 * Получить содержимое файла из репо с описанием ошибки (в т.ч. 401/403 — просроченный токен).
 */
export async function fetchFile(path: string): Promise<GitHubFileResult> {
  const cfg = getSyncConfig();
  if (!cfg) return { ok: false, error: GITHUB_SYNC_NOT_CONFIGURED };
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  try {
    const res = await fetch(url, { headers: githubAuthHeaders(cfg) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        status: res.status,
        error: formatRepoFileError(path, formatGitHubApiError(res.status, (err as { message?: string }).message)),
      };
    }
    const data = (await res.json()) as GitHubContentMeta | GitHubContentMeta[];
    if (Array.isArray(data)) {
      return { ok: false, error: formatRepoFileError(path, 'путь указывает на папку, а не на файл') };
    }
    if (!data.sha) {
      return { ok: false, error: formatRepoFileError(path, 'GitHub не вернул идентификатор файла') };
    }
    const content = await readFileBody(cfg, data, url);
    if (content == null) {
      const sizeHint = typeof data.size === 'number' ? ` (${Math.round(data.size / 1024)} КБ)` : '';
      return {
        ok: false,
        error: formatRepoFileError(
          path,
          `не удалось получить содержимое${sizeHint}. Для больших файлов нужен download_url или git blob.`
        ),
      };
    }
    return { ok: true, content, sha: data.sha };
  } catch (e) {
    const detail = e instanceof Error ? e.message : '';
    return {
      ok: false,
      error: formatRepoFileError(path, detail ? `сеть: ${detail}` : GITHUB_REPO_FETCH_FAILED),
    };
  }
}

/** Получить содержимое файла из репо. Возвращает { content, sha } или null при ошибке. */
export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  const r = await fetchFile(path);
  return r.ok ? { content: r.content, sha: r.sha } : null;
}

/**
 * Создать или обновить файл в репо. content — строка (будет в base64). message — сообщение коммита.
 */
export async function putFile(path: string, content: string, message: string): Promise<SyncResult> {
  const cfg = getSyncConfig();
  if (!cfg) return { ok: false, error: 'Не настроена синхронизация с GitHub' };
  const encoded = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(content))) : Buffer.from(content, 'utf8').toString('base64');
  let sha: string | undefined;
  const existing = await getFile(path);
  if (existing) sha = existing.sha;
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeRepoPath(path)}`;
  const body: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: encoded,
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...githubAuthHeaders(cfg),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: formatGitHubApiError(res.status, (err as { message?: string }).message) };
  }
  return { ok: true };
}

/**
 * Получить список файлов в директории репо. Возвращает массив файлов или null.
 */
export async function listFiles(path: string): Promise<Array<{name: string; path: string; sha: string; download_url: string | null}> | null> {
  const cfg = getSyncConfig();
  if (!cfg) return null;
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: githubAuthHeaders(cfg),
  });
  if (!res.ok) {
    if (res.status === 404) return []; // Папка еще не существует
    return null;
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.filter((item: any) => item.type === 'file').map((item: any) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
    download_url: item.download_url,
  }));
}

/**
 * Удалить файл в репо.
 */
export async function deleteFile(path: string, sha: string, message: string): Promise<SyncResult> {
  const cfg = getSyncConfig();
  if (!cfg) return { ok: false, error: 'Не настроена синхронизация с GitHub' };
  
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeRepoPath(path)}`;
  const body = {
    message,
    sha,
    branch: cfg.branch,
  };
  
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...githubAuthHeaders(cfg),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: formatGitHubApiError(res.status, (err as { message?: string }).message) };
  }
  return { ok: true };
}


/** Проверка подключения: запрос к API репозитория. */
export async function testConnection(): Promise<SyncResult> {
  try {
    const cfg = getSyncConfig();
    if (!cfg) return { ok: false, error: GITHUB_SYNC_NOT_CONFIGURED };
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
    const res = await fetch(url, {
      headers: githubAuthHeaders(cfg),
    });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: formatGitHubApiError(res.status, (err as { message?: string }).message) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Сеть или CORS: ${detail}` };
  }
}

const DEBOUNCE_MS = 2500;
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export type SyncBadgeState = 'idle' | 'syncing' | 'ok' | 'error';

let syncBadgeState: SyncBadgeState = 'idle';
let syncBadgeError: string | null = null;
let syncInFlight = 0;
const syncBadgeListeners = new Set<() => void>();

function emitSyncBadge() {
  syncBadgeListeners.forEach((fn) => fn());
}

export function subscribeSyncBadge(listener: () => void): () => void {
  syncBadgeListeners.add(listener);
  return () => syncBadgeListeners.delete(listener);
}

export function getSyncBadge(): { state: SyncBadgeState; error: string | null } {
  const hasPending = Object.keys(debounceTimers).length > 0;
  if (syncInFlight > 0 || hasPending) {
    return { state: 'syncing', error: syncBadgeError };
  }
  return { state: syncBadgeState, error: syncBadgeError };
}

export function setSyncBadgeResult(ok: boolean, error?: string): void {
  syncBadgeState = ok ? 'ok' : 'error';
  syncBadgeError = ok ? null : (error ?? 'Ошибка синхронизации');
  emitSyncBadge();
  if (ok) {
    setTimeout(() => {
      if (syncBadgeState === 'ok' && syncInFlight === 0 && Object.keys(debounceTimers).length === 0) {
        syncBadgeState = 'idle';
        syncBadgeError = null;
        emitSyncBadge();
      }
    }, 3000);
  }
}

function beginSyncOperation(): void {
  syncInFlight += 1;
  syncBadgeState = 'syncing';
  emitSyncBadge();
}

function endSyncOperation(): void {
  syncInFlight = Math.max(0, syncInFlight - 1);
  emitSyncBadge();
}

async function runScheduledPush(push: () => any | Promise<any>): Promise<void> {
  beginSyncOperation();
  try {
    const result = await Promise.resolve(push());
    if (result && typeof result === 'object' && 'ok' in result) {
      const r = result as SyncResult;
      setSyncBadgeResult(r.ok, r.error);
    } else {
      setSyncBadgeResult(true);
    }
  } catch (e) {
    setSyncBadgeResult(false, e instanceof Error ? e.message : String(e));
  } finally {
    endSyncOperation();
  }
}

/** Вызвать push через DEBOUNCE_MS; повторный вызов с тем же key сбрасывает таймер. */
export function schedulePush(key: string, push: () => any | Promise<any>): void {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  emitSyncBadge();
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key];
    emitSyncBadge();
    void runScheduledPush(push);
  }, DEBOUNCE_MS);
}

/** Отменить отложенный push (например, перед ручной отправкой или отменой). */
export function cancelScheduledPush(key: string): void {
  if (debounceTimers[key]) {
    clearTimeout(debounceTimers[key]);
    delete debounceTimers[key];
    emitSyncBadge();
  }
}

/** Запланировать push через заданное кол-во мс (для блога — пауза перед отправкой). */
export function schedulePushWithDelay(
  key: string,
  delayMs: number,
  push: () => any | Promise<any>
): void {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  emitSyncBadge();
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key];
    emitSyncBadge();
    void runScheduledPush(push);
  }, delayMs);
}

/** Объединить заметки и папки: по id берётся версия с большим updatedAt; папки — по id, при дубликате локальные поверх. */
export function mergeNotes(
  remoteNotes: Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
  remoteFolders: Array<{ id?: string; [k: string]: unknown }>,
  localNotes: Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
  localFolders: Array<{ id?: string; [k: string]: unknown }>
): { notes: unknown[]; folders: unknown[] } {
  const notesById = new Map<string, { id?: string; updatedAt?: number; [k: string]: unknown }>();
  for (const n of remoteNotes) {
    const id = String(n.id ?? '');
    if (id && (!notesById.has(id) || (n.updatedAt ?? 0) > (notesById.get(id)!.updatedAt ?? 0))) notesById.set(id, { ...n });
  }
  for (const n of localNotes) {
    const id = String(n.id ?? '');
    if (!id) continue;
    const ex = notesById.get(id);
    if (!ex || (n.updatedAt ?? 0) > (ex.updatedAt ?? 0)) notesById.set(id, { ...n });
  }
  const notes = [...notesById.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const foldersById = new Map<string, unknown>();
  for (const f of remoteFolders) {
    const id = String((f as { id?: string }).id ?? '');
    if (id) foldersById.set(id, f);
  }
  for (const f of localFolders) {
    const id = String((f as { id?: string }).id ?? '');
    if (id) foldersById.set(id, f);
  }
  const folders = [...foldersById.values()];
  return { notes, folders };
}

/** Записать уже объединённые заметки в репо (без повторного merge). */
export async function pushNotesMerged(notes: unknown[], folders: unknown[]): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), notes, folders }, null, 2);
  return putFile(dataPath('notes.json'), payload, 'Автосинхронизация: заметки');
}

/** Авто-пуш заметок: перед отправкой загружаем репо и мержим по id + updatedAt. */
export async function pushNotes(notes: unknown[], folders: unknown[]): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const res = await fb.pushNotesToFirebase(notes, folders);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getNotesFromRepo();
  const localNotes = notes as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>;
  const localFolders = folders as Array<{ id?: string; [k: string]: unknown }>;
  const remoteNotes = (remote?.notes ?? []) as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>;
  const remoteFolders = (remote?.folders ?? []) as Array<{ id?: string; [k: string]: unknown }>;
  const { notes: mergedNotes, folders: mergedFolders } = mergeNotes(remoteNotes, remoteFolders, localNotes, localFolders);
  return pushNotesMerged(mergedNotes, mergedFolders);
}

type BlogPostRepo = { id?: string; updatedAt?: number; deleted?: boolean; [k: string]: unknown };

/** Посты из репо (public/data/posts.json) с текстом ошибки. */
export async function fetchPostsFromRepo(ignoreFirebase = false): Promise<
  | { ok: true; posts: BlogPostRepo[] }
  | { ok: false; error: string }
> {
  if (getFirebaseApp() && !ignoreFirebase) {
    const res = await fb.getPostsFromFirebase();
    if (res) return { ok: true, posts: res as BlogPostRepo[] };
    return { ok: false, error: 'Посты в Firebase не найдены' };
  }
  const file = await fetchFile(dataPath('posts.json'));
  if (!file.ok) return { ok: false, error: file.error };
  try {
    const data = JSON.parse(file.content.replace(/^\uFEFF/, '').trim()) as { posts?: unknown[] };
    const list = Array.isArray(data?.posts) ? data.posts : [];
    return { ok: true, posts: list as BlogPostRepo[] };
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'невалидный JSON';
    return { ok: false, error: formatRepoFileError(dataPath('posts.json'), detail) };
  }
}

/** Посты из репо (public/data/posts.json). null если файла нет или ошибка. */
export async function getPostsFromRepo(ignoreFirebase = false): Promise<BlogPostRepo[] | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    const res = await fb.getPostsFromFirebase();
    return res ? (res as BlogPostRepo[]) : null;
  }
  const r = await fetchPostsFromRepo();
  return r.ok ? r.posts : null;
}

/** Загрузить JSON из репо по пути. */
async function getJsonFromRepo(path: string): Promise<{ data: unknown | null; error?: string }> {
  const file = await fetchFile(path);
  if (!file.ok) return { data: null, error: file.error };
  const trimmed = file.content.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { data: null, error: formatRepoFileError(path, 'файл пустой') };
  }
  try {
    return { data: JSON.parse(trimmed) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'невалидный JSON';
    return { data: null, error: formatRepoFileError(path, detail) };
  }
}

/** Заметки и папки из репо (notes.json) с текстом ошибки. */
export async function fetchNotesFromRepo(): Promise<
  | { ok: true; notes: unknown[]; folders: unknown[] }
  | { ok: false; error: string }
> {
  if (getFirebaseApp()) {
    const res = await fb.getNotesFromFirebase();
    if (res) return { ok: true, notes: res.notes, folders: res.folders };
    return { ok: false, error: 'Заметки в Firebase не найдены' };
  }
  const notesPath = dataPath('notes.json');
  const { data, error } = await getJsonFromRepo(notesPath);
  if (error) return { ok: false, error };
  if (data == null) {
    return { ok: false, error: formatRepoFileError(notesPath, 'в файле только null — ожидается объект { version, notes, folders }') };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: formatRepoFileError(notesPath, 'ожидается объект JSON, а не массив или примитив') };
  }
  const parsed = data as { notes?: unknown[]; folders?: unknown[] };
  return {
    ok: true,
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
  };
}

/** Заметки и папки из репо (notes.json). */
export async function getNotesFromRepo(ignoreFirebase = false): Promise<{ notes: unknown[]; folders: unknown[] } | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getNotesFromFirebase();
  }
  const r = await fetchNotesFromRepo();
  return r.ok ? { notes: r.notes, folders: r.folders } : null;
}

/** Словарь из репо (dictionary.json). */
export async function getDictionaryFromRepo(ignoreFirebase = false): Promise<{ entries: unknown[]; priorityLangs: string[] } | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getDictionaryFromFirebase();
  }
  const { data, error } = await getJsonFromRepo(dataPath('dictionary.json'));
  if (error || !data) return null;
  const parsed = data as { entries?: unknown[]; priorityLangs?: string[] };
  return {
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    priorityLangs: Array.isArray(parsed.priorityLangs) ? parsed.priorityLangs : [],
  };
}

/** Порядок окон из репо (layouts.json). */
export async function getLayoutsFromRepo(ignoreFirebase = false): Promise<Record<string, unknown[]> | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getLayoutsFromFirebase();
  }
  const { data, error } = await getJsonFromRepo(dataPath('layouts.json'));
  if (error || !data) return null;
  const layouts = (data as { layouts?: Record<string, unknown[]> }).layouts ?? data as Record<string, unknown[]>;
  return layouts && typeof layouts === 'object' ? layouts : null;
}

/** Данные планировщика из репо (planner.json): задачи и метки с цветами. */
export type PlannerRepoData = {
  tasks: Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }>;
  labels?: Array<{ name: string; color?: string }>;
};

export async function getPlannerFromRepo(ignoreFirebase = false): Promise<PlannerRepoData | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getPlannerFromFirebase();
  }
  const { data, error } = await getJsonFromRepo(dataPath('planner.json'));
  if (error || !data) return null;
  const parsed = data as { tasks?: unknown[]; labels?: unknown[] };
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks as PlannerRepoData['tasks'] : [];
  const labels = Array.isArray(parsed.labels)
    ? (parsed.labels as Array<{ name?: string; color?: string }>).filter((l) => l && typeof l.name === 'string').map((l) => ({ name: l.name!, color: l.color }))
    : undefined;
  return { tasks, labels };
}

/** Содержимое calculators.json из репо (для подстановки в published bundle). */
export async function getCalculatorsJsonFromRepo(ignoreFirebase = false): Promise<string | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getCalculatorsJsonFromFirebase();
  }
  const file = await getFile(dataPath('calculators.json'));
  return file ? file.content : null;
}

/** CV (резюме) из репо: public/data/cv.json с полем html. */
export async function getCvFromRepo(ignoreFirebase = false): Promise<string | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getCvFromFirebase();
  }
  const { data, error } = await getJsonFromRepo(dataPath('cv.json'));
  if (error || !data) return null;
  const parsed = data as { html?: string };
  if (typeof parsed.html !== 'string') return null;
  return parsed.html;
}

/** Авто-пуш CV в репо (public/data/cv.json). */
export async function pushCv(html: string): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const res = await fb.pushCvToFirebase(html);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), html }, null, 2);
  return putFile(dataPath('cv.json'), payload, 'Автосинхронизация: CV');
}

/** Объединить посты с репо и локальные: по каждому id берётся версия с большим updatedAt (удаление не теряется). */
export function mergePosts(
  remote: Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
  local: Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>
): Array<{ id?: string; updatedAt?: number; [k: string]: unknown }> {
  const byId = new Map<string, { id?: string; updatedAt?: number; [k: string]: unknown }>();
  for (const p of remote) {
    const id = String(p.id ?? '');
    if (id && (!byId.has(id) || (p.updatedAt ?? 0) > (byId.get(id)!.updatedAt ?? 0))) byId.set(id, { ...p });
  }
  for (const p of local) {
    const id = String(p.id ?? '');
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || (p.updatedAt ?? 0) > (existing.updatedAt ?? 0)) byId.set(id, { ...p });
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Авто-пуш постов блога. В репо updatedAt = время пуша только у постов из modifiedPostIds. */
export async function pushPosts(
  posts: unknown[],
  modifiedPostIds?: Set<string>
): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const now = Date.now();
    const ids = modifiedPostIds ?? new Set<string>();
    const postsWithPushTime = (posts as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>).map((p) =>
      ids.has(String(p.id ?? '')) ? { ...p, updatedAt: now } : p
    );
    const res = await fb.pushPostsToFirebase(postsWithPushTime);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const now = Date.now();
  const ids = modifiedPostIds ?? new Set<string>();
  const postsWithPushTime = (posts as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>).map((p) =>
    ids.has(String(p.id ?? '')) ? { ...p, updatedAt: now } : p
  );
  const payload = JSON.stringify({ version: 1, exportedAt: now, posts: postsWithPushTime }, null, 2);
  return putFile(dataPath('posts.json'), payload, 'Автосинхронизация: блог');
}

/** Объединить словарь: по id записи берётся версия с большим addedAt; priorityLangs — локальные первые, потом дополнение из ремо. */
function mergeDictionary(
  remoteEntries: Array<{ id?: string; addedAt?: number; [k: string]: unknown }>,
  remotePriority: string[],
  localEntries: Array<{ id?: string; addedAt?: number; [k: string]: unknown }>,
  localPriority: string[]
): { entries: unknown[]; priorityLangs: string[] } {
  const byId = new Map<string, { id?: string; addedAt?: number; [k: string]: unknown }>();
  for (const e of remoteEntries) {
    const id = String(e.id ?? '');
    if (id && (!byId.has(id) || (e.addedAt ?? 0) > (byId.get(id)!.addedAt ?? 0))) byId.set(id, { ...e });
  }
  for (const e of localEntries) {
    const id = String(e.id ?? '');
    if (!id) continue;
    const ex = byId.get(id);
    if (!ex || (e.addedAt ?? 0) > (ex.addedAt ?? 0)) byId.set(id, { ...e });
  }
  const entries = [...byId.values()].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  const prioritySet = new Set(localPriority);
  const priorityLangs = [...localPriority];
  for (const code of remotePriority) if (!prioritySet.has(code)) { priorityLangs.push(code); prioritySet.add(code); }
  return { entries, priorityLangs };
}

/** Авто-пуш словаря: перед отправкой загружаем репо и мержим по id + addedAt. */
export async function pushDictionary(entries: unknown[], priorityLangs: string[]): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const res = await fb.pushDictionaryToFirebase(entries, priorityLangs);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getDictionaryFromRepo();
  const localEntries = entries as Array<{ id?: string; addedAt?: number; [k: string]: unknown }>;
  const remoteEntries = (remote?.entries ?? []) as Array<{ id?: string; addedAt?: number; [k: string]: unknown }>;
  const remotePriority = (remote?.priorityLangs ?? []) as string[];
  const { entries: mergedEntries, priorityLangs: mergedPriority } = mergeDictionary(remoteEntries, remotePriority, localEntries, priorityLangs);
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), entries: mergedEntries, priorityLangs: mergedPriority }, null, 2);
  return putFile(dataPath('dictionary.json'), payload, 'Автосинхронизация: словарь');
}

/** Объединить калькуляторы: по id калькулятора локальная версия перекрывает удалённую. 
 * Если калькулятор есть в remote, но в local он помечен как не-published (или удален), он исключается.
 */
function mergeCalculators(remoteJson: string | null, localJson: string, allLocalStatuses: Array<{ id: string; status: CalculatorStatus }>): string {
  if (!remoteJson?.trim()) return localJson;
  try {
    const remote = JSON.parse(remoteJson) as { calculators?: Array<{ id?: string; [k: string]: unknown }> };
    const local = JSON.parse(localJson) as { calculators?: Array<{ id?: string; [k: string]: unknown }> };
    const remoteList = remote?.calculators ?? [];
    const localList = local?.calculators ?? [];
    
    const byId = new Map<string, unknown>();
    const localStatusMap = new Map(allLocalStatuses.map(s => [s.id, s.status]));

    // 1. Сначала берем всё из репо
    for (const c of remoteList) {
      const id = String((c as { id?: string }).id ?? '');
      if (!id) continue;
      
      // Но если локально мы ЗНАЕМ, что этот калькулятор теперь черновик (или его нет в списке опубликованных)
      // мы его НЕ добавляем из репо.
      const localStatus = localStatusMap.get(id);
      if (localStatus && localStatus !== 'published') continue;
      
      byId.set(id, c);
    }
    
    // 2. Сверху накатываем локальные опубликованные
    for (const c of localList) {
      const id = String((c as { id?: string }).id ?? '');
      if (id) byId.set(id, c);
    }
    
    const merged = { ...local, calculators: [...byId.values()] };
    return JSON.stringify(merged, null, 2);
  } catch {
    return localJson;
  }
}

/** Авто-пуш калькуляторов: перед отправкой загружаем репо и мержим по id. */
export async function pushCalculators(bundleJson: string, allLocalStatuses: Array<{ id: string; status: CalculatorStatus }>): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const remoteJson = await fb.getCalculatorsJsonFromFirebase();
    const merged = mergeCalculators(remoteJson, bundleJson, allLocalStatuses);
    const res = await fb.pushCalculatorsToFirebase(merged);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remoteJson = await getCalculatorsJsonFromRepo();
  const merged = mergeCalculators(remoteJson, bundleJson, allLocalStatuses);
  return putFile(dataPath('calculators.json'), merged, 'Автосинхронизация: калькуляторы');
}

/** Объединить порядок окон: по каждому pageId секции мержатся по id секции, локальные поверх. */
function mergeLayouts(remote: Record<string, unknown[]> | null, local: Record<string, unknown[]>): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = { ...remote };
  for (const [pageId, sections] of Object.entries(local)) {
    const rem = (remote ?? {})[pageId];
    const remArr = Array.isArray(rem) ? rem : [];
    const byId = new Map<string, unknown>();
    for (const s of remArr) {
      const id = String((s as { id?: string })?.id ?? '');
      if (id) byId.set(id, s);
    }
    for (const s of sections) {
      const id = String((s as { id?: string })?.id ?? '');
      if (id) byId.set(id, s);
    }
    out[pageId] = [...byId.values()];
  }
  return out;
}

/** Авто-пуш порядка окон: перед отправкой загружаем репо и мержим по id секции. */
export async function pushLayouts(layouts: Record<string, unknown[]>): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const res = await fb.pushLayoutsToFirebase(layouts);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getLayoutsFromRepo();
  const merged = mergeLayouts(remote, layouts);
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), layouts: merged }, null, 2);
  return putFile(dataPath('layouts.json'), payload, 'Автосинхронизация: порядок окон');
}

/** Сериализация задач планировщика для пуша (Date → number). */
function serializePlannerTasks(
  tasks: Array<{ id: string; name: string; start: Date; end: Date; progress?: number; type?: string; [k: string]: unknown }>
): Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }> {
  return tasks.map((t) => ({
    ...t,
    start: t.start instanceof Date ? t.start.getTime() : (t.start as number),
    end: t.end instanceof Date ? t.end.getTime() : (t.end as number),
  }));
}

/** Авто-пуш планировщика: в репо уходит текущее локальное состояние (задачи и метки). Удаления и любые правки отражаются в репо. */
export async function pushPlanner(
  tasks: Array<{ id: string; name: string; start: Date; end: Date; progress?: number; type?: string; [k: string]: unknown }>,
  labels?: Array<{ name: string; color?: string }>
): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const serialized = serializePlannerTasks(tasks);
    const res = await fb.pushPlannerToFirebase(serialized, labels ?? []);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const serialized = serializePlannerTasks(tasks);
  const payload = JSON.stringify(
    { version: 1, exportedAt: Date.now(), tasks: serialized, labels: labels ?? [] },
    null,
    2
  );
  return putFile(dataPath('planner.json'), payload, 'Автосинхронизация: планировщик');
}

/** Списки RSS из репо (rss-lists.json). */
export async function getRssListsFromRepo(ignoreFirebase = false): Promise<{ lists: unknown[] } | null> {
  if (getFirebaseApp() && !ignoreFirebase) {
    return fb.getRssListsFromFirebase();
  }
  const { data, error } = await getJsonFromRepo(dataPath('rss-lists.json'));
  if (error || !data) return null;
  const parsed = data as { lists?: unknown[] };
  return { lists: Array.isArray(parsed.lists) ? parsed.lists : [] };
}

/** Пуш списков RSS в репо. */
export async function pushRssLists(lists: unknown[]): Promise<SyncResult> {
  if (getFirebaseApp()) {
    beginSyncOperation();
    const res = await fb.pushRssListsToFirebase(lists);
    setSyncBadgeResult(res.ok, res.error);
    endSyncOperation();
    return res;
  }
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), lists }, null, 2);
  return putFile(dataPath('rss-lists.json'), payload, 'Синхронизация: RSS подписки');
}
