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

/** Авто-пуш заметок (вызывать при изменении notes/folders). */
export async function pushNotes(notes: unknown[], folders: unknown[]): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), notes, folders }, null, 2);
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

/** Авто-пуш словаря. */
export async function pushDictionary(entries: unknown[], priorityLangs: string[]): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), entries, priorityLangs }, null, 2);
  return putFile(dataPath('dictionary.json'), payload, 'Автосинхронизация: словарь');
}

/** Авто-пуш калькуляторов (опубликованные из localStorage). */
export async function pushCalculators(bundleJson: string): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  return putFile(dataPath('calculators.json'), bundleJson, 'Автосинхронизация: калькуляторы');
}

/** Авто-пуш порядка окон (layouts). */
export async function pushLayouts(layouts: Record<string, unknown[]>): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), layouts }, null, 2);
  return putFile(dataPath('layouts.json'), payload, 'Автосинхронизация: порядок окон');
}

/** Задачи планировщика (Гантт): start/end как timestamp (number). */
export async function pushPlanner(tasks: Array<{ id: string; name: string; start: Date; end: Date; progress?: number; type?: string; [k: string]: unknown }>): Promise<SyncResult> {
  if (!getSyncConfig()) return { ok: false, error: 'Синхронизация не настроена' };
  const serialized = tasks.map((t) => ({
    ...t,
    start: t.start instanceof Date ? t.start.getTime() : t.start,
    end: t.end instanceof Date ? t.end.getTime() : t.end,
  }));
  const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), tasks: serialized }, null, 2);
  return putFile(dataPath('planner.json'), payload, 'Автосинхронизация: планировщик');
}
