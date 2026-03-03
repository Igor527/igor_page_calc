/**
 * Синхронизация с GitHub: чтение/запись файлов в репо через API.
 * Конфиг (owner, repo, branch, token) хранится в localStorage.
 * Токен — GitHub Personal Access Token с правами repo (contents: read/write).
 */

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
    return { branch: c.branch || 'main', ...c };
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

/** Декодировать base64 в UTF-8 (в браузере atob даёт бинарную строку в Latin-1, кириллица ломается). */
function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Получить содержимое файла из репо. Возвращает { content, sha } или null при ошибке.
 */
export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  const cfg = getSyncConfig();
  if (!cfg) return null;
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${cfg.token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.content || !data.sha) return null;
  try {
    const content =
      typeof atob !== 'undefined'
        ? base64ToUtf8(data.content)
        : Buffer.from(data.content, 'base64').toString('utf8');
    return { content, sha: data.sha };
  } catch {
    return null;
  }
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
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`;
  const body: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: encoded,
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { message?: string }).message || res.statusText };
  }
  return { ok: true };
}

/** Проверка подключения: запрос к API репозитория. */
export async function testConnection(): Promise<SyncResult> {
  const cfg = getSyncConfig();
  if (!cfg) return { ok: false, error: 'Не заданы owner, repo или token' };
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${cfg.token}` },
  });
  if (res.ok) return { ok: true };
  const err = await res.json().catch(() => ({}));
  return { ok: false, error: (err as { message?: string }).message || res.statusText };
}

const DEBOUNCE_MS = 2500;
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Вызвать push через DEBOUNCE_MS; повторный вызов с тем же key сбрасывает таймер. */
export function schedulePush(key: string, push: () => void | Promise<void>): void {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key];
    void Promise.resolve(push());
  }, DEBOUNCE_MS);
}

/** Отменить отложенный push (например, перед ручной отправкой или отменой). */
export function cancelScheduledPush(key: string): void {
  if (debounceTimers[key]) {
    clearTimeout(debounceTimers[key]);
    delete debounceTimers[key];
  }
}

/** Запланировать push через заданное кол-во мс (для блога — пауза перед отправкой). */
export function schedulePushWithDelay(
  key: string,
  delayMs: number,
  push: () => void | Promise<void>
): void {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key];
    void Promise.resolve(push());
  }, delayMs);
}

/** Объединить заметки и папки: по id берётся версия с большим updatedAt; папки — по id, при дубликате локальные поверх. */
function mergeNotes(
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

/** Авто-пуш заметок: перед отправкой загружаем репо и мержим по id + updatedAt. */
export async function pushNotes(notes: unknown[], folders: unknown[]): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getNotesFromRepo();
  const localNotes = notes as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>;
  const localFolders = folders as Array<{ id?: string; [k: string]: unknown }>;
  const remoteNotes = (remote?.notes ?? []) as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>;
  const remoteFolders = (remote?.folders ?? []) as Array<{ id?: string; [k: string]: unknown }>;
  const { notes: mergedNotes, folders: mergedFolders } = mergeNotes(remoteNotes, remoteFolders, localNotes, localFolders);
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), notes: mergedNotes, folders: mergedFolders }, null, 2);
  return putFile(dataPath('notes.json'), payload, 'Автосинхронизация: заметки');
}

/** Посты из репо (public/data/posts.json). null если файла нет или ошибка. */
export async function getPostsFromRepo(): Promise<Array<{ id?: string; updatedAt?: number; deleted?: boolean; [k: string]: unknown }> | null> {
  const file = await getFile(dataPath('posts.json'));
  if (!file) return null;
  try {
    const data = JSON.parse(file.content) as { posts?: unknown[] };
    const list = Array.isArray(data?.posts) ? data.posts : [];
    return list as Array<{ id?: string; updatedAt?: number; deleted?: boolean; [k: string]: unknown }>;
  } catch {
    return null;
  }
}

/** Загрузить JSON из репо по пути. Возвращает распарсенный объект или null. */
async function getJsonFromRepo(path: string): Promise<unknown | null> {
  const file = await getFile(path);
  if (!file) return null;
  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

/** Заметки и папки из репо (notes.json). */
export async function getNotesFromRepo(): Promise<{ notes: unknown[]; folders: unknown[] } | null> {
  const data = await getJsonFromRepo(dataPath('notes.json')) as { notes?: unknown[]; folders?: unknown[] } | null;
  if (!data) return null;
  return {
    notes: Array.isArray(data.notes) ? data.notes : [],
    folders: Array.isArray(data.folders) ? data.folders : [],
  };
}

/** Словарь из репо (dictionary.json). */
export async function getDictionaryFromRepo(): Promise<{ entries: unknown[]; priorityLangs: string[] } | null> {
  const data = await getJsonFromRepo(dataPath('dictionary.json')) as { entries?: unknown[]; priorityLangs?: string[] } | null;
  if (!data) return null;
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    priorityLangs: Array.isArray(data.priorityLangs) ? data.priorityLangs : [],
  };
}

/** Порядок окон из репо (layouts.json). */
export async function getLayoutsFromRepo(): Promise<Record<string, unknown[]> | null> {
  const data = await getJsonFromRepo(dataPath('layouts.json')) as { layouts?: Record<string, unknown[]> } | Record<string, unknown[]> | null;
  if (!data) return null;
  const layouts = (data as { layouts?: Record<string, unknown[]> }).layouts ?? data as Record<string, unknown[]>;
  return layouts && typeof layouts === 'object' ? layouts : null;
}

/** Задачи планировщика из репо (planner.json). */
export async function getPlannerFromRepo(): Promise<Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }> | null> {
  const data = await getJsonFromRepo(dataPath('planner.json')) as { tasks?: unknown[] } | null;
  if (!data || !Array.isArray(data.tasks)) return null;
  return data.tasks as Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }>;
}

/** Содержимое calculators.json из репо (для подстановки в published bundle). */
export async function getCalculatorsJsonFromRepo(): Promise<string | null> {
  const file = await getFile(dataPath('calculators.json'));
  return file ? file.content : null;
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
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getDictionaryFromRepo();
  const localEntries = entries as Array<{ id?: string; addedAt?: number; [k: string]: unknown }>;
  const remoteEntries = (remote?.entries ?? []) as Array<{ id?: string; addedAt?: number; [k: string]: unknown }>;
  const remotePriority = (remote?.priorityLangs ?? []) as string[];
  const { entries: mergedEntries, priorityLangs: mergedPriority } = mergeDictionary(remoteEntries, remotePriority, localEntries, priorityLangs);
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), entries: mergedEntries, priorityLangs: mergedPriority }, null, 2);
  return putFile(dataPath('dictionary.json'), payload, 'Автосинхронизация: словарь');
}

/** Объединить калькуляторы: по id калькулятора локальная версия перекрывает удалённую. */
function mergeCalculators(remoteJson: string | null, localJson: string): string {
  if (!remoteJson?.trim()) return localJson;
  try {
    const remote = JSON.parse(remoteJson) as { calculators?: Array<{ id?: string; [k: string]: unknown }> };
    const local = JSON.parse(localJson) as { calculators?: Array<{ id?: string; [k: string]: unknown }> };
    const remoteList = remote?.calculators ?? [];
    const localList = local?.calculators ?? [];
    const byId = new Map<string, unknown>();
    for (const c of remoteList) {
      const id = String((c as { id?: string }).id ?? '');
      if (id) byId.set(id, c);
    }
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

/** Авто-пуш калькуляторов: перед отправкой загружаем репо и мержим по id (локальные поверх). */
export async function pushCalculators(bundleJson: string): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remoteJson = await getCalculatorsJsonFromRepo();
  const merged = mergeCalculators(remoteJson, bundleJson);
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
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getLayoutsFromRepo();
  const merged = mergeLayouts(remote, layouts);
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), layouts: merged }, null, 2);
  return putFile(dataPath('layouts.json'), payload, 'Автосинхронизация: порядок окон');
}

/** Объединить задачи планировщика: по id задачи локальная версия перекрывает удалённую. */
function mergePlanner(
  remote: Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }> | null,
  local: Array<{ id: string; name: string; start: Date; end: Date; progress?: number; type?: string; [k: string]: unknown }>
): Array<{ id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }> {
  const byId = new Map<string, { id: string; name: string; start: number; end: number; progress?: number; [k: string]: unknown }>();
  for (const t of remote ?? []) {
    if (t.id) byId.set(t.id, { ...t, start: t.start, end: t.end });
  }
  for (const t of local) {
    const start = t.start instanceof Date ? t.start.getTime() : (t.start as number);
    const end = t.end instanceof Date ? t.end.getTime() : (t.end as number);
    if (t.id) byId.set(t.id, { ...t, start, end });
  }
  return [...byId.values()];
}

/** Авто-пуш планировщика: перед отправкой загружаем репо и мержим по id задачи (локальные поверх). */
export async function pushPlanner(tasks: Array<{ id: string; name: string; start: Date; end: Date; progress?: number; type?: string; [k: string]: unknown }>): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const remote = await getPlannerFromRepo();
  const serialized = mergePlanner(remote, tasks);
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), tasks: serialized }, null, 2);
  return putFile(dataPath('planner.json'), payload, 'Автосинхронизация: планировщик');
}

/** Списки RSS из репо (rss-lists.json). */
export async function getRssListsFromRepo(): Promise<{ lists: unknown[] } | null> {
  const data = await getJsonFromRepo(dataPath('rss-lists.json')) as { lists?: unknown[] } | null;
  if (!data) return null;
  return { lists: Array.isArray(data.lists) ? data.lists : [] };
}

/** Пуш списков RSS в репо. */
export async function pushRssLists(lists: unknown[]): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), lists }, null, 2);
  return putFile(dataPath('rss-lists.json'), payload, 'Синхронизация: RSS подписки');
}
