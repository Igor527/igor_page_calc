import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/security';
import {
  getSyncConfig,
  schedulePushWithDelay,
  cancelScheduledPush,
  pushPosts,
  getPostsFromRepo,
  mergePosts,
} from '@/lib/githubSync';
import { attachCodeCopyButtons } from '@/lib/useCodeCopyButtons';
import { applyImageFocusStyles } from '@/lib/imageFocusStyles';
import RichTextEditor from '@/components/editor/RichTextEditor';

const STORAGE_KEY = 'igor-blog';
const VIEWS_KEY = 'igor-blog-views';
const POLL_VOTED_KEY = 'igor-blog-poll-voted';
const POLL_RESULTS_PREFIX = 'igor-blog-poll-results-';
const TODOS_CHECKED_KEY = 'igor-blog-todos-checked';

/* ═══════════════════ Types ═══════════════════ */

interface CoverSettings {
  posX: number;  // 0–100, object-position X%
  posY: number;  // 0–100, object-position Y%
  zoom: number;  // 1–3 scale factor
}

const defaultCover: CoverSettings = { posX: 50, posY: 50, zoom: 1 };

export interface BlogPollOption {
  id: string;
  text: string;
}

export interface BlogPoll {
  id: string;
  question: string;
  options: BlogPollOption[];
  multiple: boolean; // несколько вариантов или один
}

export interface BlogTodoItem {
  id: string;
  text: string;
}

interface BlogPost {
  id: string;
  title: string;
  content: string;
  slug: string;
  published: boolean;
  tags: string[];
  coverImage?: string;
  coverSettings?: CoverSettings;
  polls?: BlogPoll[];
  todos?: BlogTodoItem[];
  createdAt: number;
  updatedAt: number;
  /** Мягкое удаление: при синхронизации с репо удаление не теряется при пушах с другого устройства */
  deleted?: boolean;
}

/* ═══════════════════ View counter ═══════════════════ */

function getViewCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}'); } catch { return {}; }
}

function incrementView(postId: string): number {
  const counts = getViewCounts();
  counts[postId] = (counts[postId] || 0) + 1;
  localStorage.setItem(VIEWS_KEY, JSON.stringify(counts));
  return counts[postId];
}

function getPollVoted(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(POLL_VOTED_KEY) || '{}'); } catch { return {}; }
}

function setPollVoted(pollId: string) {
  const o = getPollVoted();
  o[pollId] = true;
  localStorage.setItem(POLL_VOTED_KEY, JSON.stringify(o));
}

function getPollResults(pollId: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(POLL_RESULTS_PREFIX + pollId) || '{}'); } catch { return {}; }
}

function addPollVotes(pollId: string, optionIds: string[]) {
  const cur = getPollResults(pollId);
  for (const id of optionIds) cur[id] = (cur[id] || 0) + 1;
  localStorage.setItem(POLL_RESULTS_PREFIX + pollId, JSON.stringify(cur));
}

function getTodosChecked(): Record<string, Record<string, boolean>> {
  try { return JSON.parse(localStorage.getItem(TODOS_CHECKED_KEY) || '{}'); } catch { return {}; }
}

function setTodoChecked(postId: string, todoId: string, checked: boolean) {
  const o = getTodosChecked();
  if (!o[postId]) o[postId] = {};
  o[postId][todoId] = checked;
  localStorage.setItem(TODOS_CHECKED_KEY, JSON.stringify(o));
}

/* ═══════════════════ Storage ═══════════════════ */

let blogBundle: BlogPost[] | null = null;

export function loadBlogBundle(): Promise<void> {
  return fetch('./data/posts.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data: { posts?: BlogPost[] } | BlogPost[]) => {
      const list = Array.isArray(data) ? data : (Array.isArray((data as { posts?: BlogPost[] }).posts) ? (data as { posts: BlogPost[] }).posts : []);
      blogBundle = list
        .filter((p) => !(p as BlogPost & { deleted?: boolean }).deleted)
        .map((p) => ({
          ...p,
          tags: p.tags ?? [],
          coverImage: p.coverImage ?? '',
          polls: p.polls ?? [],
          todos: p.todos ?? [],
        }));
    })
    .catch(() => { blogBundle = null; });
}

/** Для отображения: из файла репо, если загружен, иначе localStorage (без удалённых) */
export function getPostsForDisplay(): BlogPost[] {
  if (blogBundle) return blogBundle;
  return loadPosts().filter((p) => !p.deleted);
}

export function downloadPostsBundle(): void {
  const posts = loadPosts();
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: Date.now(), posts }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'posts.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadPosts(): BlogPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BlogPost[];
    return arr.map((p) => ({
      ...p,
      tags: p.tags ?? [],
      coverImage: p.coverImage ?? '',
      polls: p.polls ?? [],
      todos: p.todos ?? [],
      deleted: p.deleted ?? false,
    }));
  } catch { return []; }
}

function savePosts(posts: BlogPost[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function generateId(): string {
  return 'post_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || generateId();
}

/* ═══════════════════ Tag helpers ═══════════════════ */

function extractTags(html: string): string[] {
  const text = html.replace(/<[^>]*>/g, ' ');
  const matches = text.match(/#[a-zA-Zа-яёА-ЯЁ0-9_-]{2,}/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

function mergeTags(manual: string[], auto: string[]): string[] {
  const set = new Set(manual.map(t => t.toLowerCase()));
  for (const t of auto) set.add(t);
  return [...set].sort();
}

/* ═══════════════════ TOC generator ═══════════════════ */

interface TocItem { id: string; text: string; level: number }

function generateToc(html: string): TocItem[] {
  const re = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
  const items: TocItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]*>/g, '').trim();
    if (text) {
      const id = text.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 50);
      items.push({ id, text, level: Number(m[1]) });
    }
  }
  return items;
}

/* ═══════════════════ Image helpers ═══════════════════ */

const MAX_IMG_W = 1200;

function resizeImage(dataUrl: string, maxW = MAX_IMG_W): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxW) { resolve(dataUrl); return; }
      const r = maxW / img.width;
      const c = document.createElement('canvas');
      c.width = maxW; c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
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

/* ═══════════════════ CoverDisplay ═══════════════════ */

const CoverDisplay: React.FC<{ src: string; settings?: CoverSettings; maxHeight?: number; radius?: number; alt?: string }> = ({ src, settings, maxHeight = 280, radius = 0, alt = 'cover' }) => {
  const s = settings ?? defaultCover;
  return (
    <div style={{ overflow: 'hidden', maxHeight, borderRadius: radius, lineHeight: 0 }}>
      <img src={src} alt={alt} width={800} height={maxHeight} style={{
        width: '100%', height: maxHeight, objectFit: 'cover',
        objectPosition: `${s.posX}% ${s.posY}%`,
        transform: s.zoom > 1 ? `scale(${s.zoom})` : undefined,
        transformOrigin: `${s.posX}% ${s.posY}%`,
        display: 'block',
      }} />
    </div>
  );
};

/* ═══════════════════ CoverEditor ═══════════════════ */

const CoverEditor: React.FC<{
  src: string;
  settings: CoverSettings;
  onChange: (s: CoverSettings) => void;
  onRemove: () => void;
}> = ({ src, settings, onChange, onRemove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = settings.posX;
    const startPosY = settings.posY;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const sensitivity = 0.3;
      onChange({
        ...settings,
        posX: Math.max(0, Math.min(100, startPosX - dx * sensitivity)),
        posY: Math.max(0, Math.min(100, startPosY - dy * sensitivity)),
      });
    };

    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [settings, onChange]);

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 4, display: 'block' }}>
        Обложка — перетащите для позиционирования
      </label>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative', overflow: 'hidden', borderRadius: 8,
          maxHeight: 220, cursor: 'move', userSelect: 'none',
          border: '2px dashed var(--pico-border-color)',
        }}
      >
        <img src={src} alt="cover" width={800} height={220} style={{
          width: '100%', height: 220, objectFit: 'cover',
          objectPosition: `${settings.posX}% ${settings.posY}%`,
          transform: settings.zoom > 1 ? `scale(${settings.zoom})` : undefined,
          transformOrigin: `${settings.posX}% ${settings.posY}%`,
          display: 'block', pointerEvents: 'none',
        }} />
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          <button type="button" onClick={e => { e.stopPropagation(); onChange(defaultCover); }}
            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Сброс
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, background: 'rgba(200,0,0,0.7)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Зум
          <input type="range" min={100} max={300} value={Math.round(settings.zoom * 100)}
            onChange={e => onChange({ ...settings, zoom: Number(e.target.value) / 100 })}
            style={{ width: 100 }} />
          <span style={{ minWidth: 32 }}>{Math.round(settings.zoom * 100)}%</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--pico-muted-color)' }}>
          X: {Math.round(settings.posX)}%  Y: {Math.round(settings.posY)}%
        </label>
      </div>
    </div>
  );
};

/* ═══════════════════ TagInput component ═══════════════════ */

const TagInput: React.FC<{ tags: string[]; onChange: (tags: string[]) => void }> = ({ tags, onChange }) => {
  const [input, setInput] = useState('');
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const tag = input.trim().toLowerCase().replace(/^#/, '');
      if (tag && !tags.includes(tag)) onChange([...tags, tag]);
      setInput('');
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 8px', border: '1px solid var(--pico-border-color)', borderRadius: 6, minHeight: 34, background: 'var(--pico-form-element-background-color)' }}>
      {tags.map(t => (
        <span key={t} className="tag-chip">
          #{t}
          <span className="tag-chip-remove" onClick={() => onChange(tags.filter(x => x !== t))}>✕</span>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={tags.length === 0 ? 'Добавить тег (Enter)...' : ''}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, flex: 1, minWidth: 80, padding: '2px 0', color: 'var(--pico-color)' }}
      />
    </div>
  );
};

/* ═══════════════════ PollBlock (голосование без регистрации) ═══════════════════ */

const PollBlock: React.FC<{ poll: BlogPoll }> = ({ poll }) => {
  const voted = getPollVoted()[poll.id];
  const results = getPollResults(poll.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const total = Object.values(results).reduce((a, b) => a + b, 0);

  const handleVote = () => {
    if (selected.size === 0) return;
    addPollVotes(poll.id, [...selected]);
    setPollVoted(poll.id);
    setSubmitted(true);
  };

  const toggle = (optionId: string) => {
    if (voted || submitted) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (poll.multiple) {
        if (next.has(optionId)) next.delete(optionId);
        else next.add(optionId);
      } else {
        next.clear();
        next.add(optionId);
      }
      return next;
    });
  };

  const showResults = voted || submitted;

  return (
    <div className="poll-block" style={{
      margin: '20px 0',
      padding: 16,
      border: '1px solid var(--pico-border-color)',
      borderRadius: 8,
      background: 'var(--pico-card-background-color)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>{poll.question}</div>
      {poll.multiple && !showResults && (
        <div style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 8 }}>Можно выбрать несколько вариантов</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {poll.options.map(opt => {
          const count = results[opt.id] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isSelected = selected.has(opt.id);
          return (
            <div key={opt.id}>
              <label className="poll-option-label" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: showResults ? 'default' : 'pointer',
                padding: '8px 10px',
                borderRadius: 6,
                background: isSelected ? 'var(--pico-primary-background)' : 'transparent',
                border: `1px solid ${isSelected ? 'var(--pico-primary)' : 'transparent'}`,
              }}>
                {!showResults ? (
                  <>
                    <input
                      type={poll.multiple ? 'checkbox' : 'radio'}
                      name={poll.id}
                      checked={isSelected}
                      onChange={() => toggle(opt.id)}
                      style={{ flexShrink: 0 }}
                    />
                    <span>{opt.text}</span>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1 }}>{opt.text}</span>
                    <span style={{ fontSize: 13, color: 'var(--pico-muted-color)', minWidth: 48 }}>{count} ({pct}%)</span>
                  </>
                )}
              </label>
              {showResults && (
                <div style={{
                  height: 6,
                  marginTop: 4,
                  borderRadius: 3,
                  background: 'var(--pico-border-color)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--pico-primary)',
                    borderRadius: 3,
                    transition: 'width .3s',
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!showResults && (
        <button
          type="button"
          onClick={handleVote}
          disabled={selected.size === 0}
          style={{
            marginTop: 12,
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--pico-primary)',
            color: 'var(--pico-primary-inverse)',
            cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
            fontSize: 13,
            opacity: selected.size > 0 ? 1 : 0.6,
          }}
        >
          Голосовать
        </button>
      )}
      {showResults && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--pico-muted-color)' }}>
          Всего голосов: {total}. {voted && 'Вы уже проголосовали.'}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════ TodoBlock (список дел, отметки любым юзером) ═══════════════════ */

const TodoBlock: React.FC<{ postId: string; todos: BlogTodoItem[] }> = ({ postId, todos }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const stored = getTodosChecked()[postId] ?? {};
    return { ...stored };
  });

  const toggle = (todoId: string) => {
    const next = !checked[todoId];
    setChecked(prev => ({ ...prev, [todoId]: next }));
    setTodoChecked(postId, todoId, next);
  };

  if (todos.length === 0) return null;

  return (
    <div className="todo-block" style={{
      margin: '20px 0',
      padding: 16,
      border: '1px solid var(--pico-border-color)',
      borderRadius: 8,
      background: 'var(--pico-card-background-color)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Список дел</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map(t => (
          <li
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 0',
              borderBottom: '1px solid var(--pico-border-color)',
            }}
          >
            <label className="todo-item-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
              <input
                type="checkbox"
                checked={!!checked[t.id]}
                onChange={() => toggle(t.id)}
                style={{ flexShrink: 0 }}
              />
              <span style={{
                textDecoration: checked[t.id] ? 'line-through' : 'none',
                color: checked[t.id] ? 'var(--pico-muted-color)' : 'var(--pico-color)',
              }}>
                {t.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ═══════════════════ BlogList ═══════════════════ */

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

const BlogList: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [posts, setPosts] = useState<BlogPost[]>(() => loadPosts());
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState('');
  const [coverSettings, setCoverSettings] = useState<CoverSettings>(defaultCover);
  const [isPublished, setIsPublished] = useState(true);
  const [polls, setPolls] = useState<BlogPoll[]>([]);
  const [todos, setTodos] = useState<BlogTodoItem[]>([]);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const modifiedPostIdsRef = useRef<Set<string>>(new Set());
  const justPushedRef = useRef(false);
  const BLOG_PUSH_DELAY_MS = 6000;

  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'loading' | 'sending' | 'ok' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => { savePosts(posts); }, [posts]);

  const runPullMergePush = useCallback(async () => {
    setSyncStatus('loading');
    setSyncError(null);
    const remote = await getPostsFromRepo();
    setSyncStatus('sending');
    const merged = mergePosts(remote ?? [], posts) as BlogPost[];
    const ids = new Set(modifiedPostIdsRef.current);
    modifiedPostIdsRef.current.clear();
    const result = await pushPosts(merged, ids);
    if (result.ok) {
      const normalized = merged.map((p) => ({
        ...p,
        tags: p.tags ?? [],
        coverImage: p.coverImage ?? '',
        polls: p.polls ?? [],
        todos: p.todos ?? [],
        deleted: p.deleted ?? false,
      }));
      setPosts(normalized);
      justPushedRef.current = true;
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
      setSyncStatus('error');
      setSyncError(result.error ?? 'Ошибка');
    }
  }, [posts]);

  // Планируем пуш через 6 с после изменений. Не отменяем при unmount — иначе при уходе со страницы (в т.ч. с телефона) пуш не выполнится.
  useEffect(() => {
    if (justPushedRef.current) {
      justPushedRef.current = false;
      return;
    }
    if (!getSyncConfig() || modifiedPostIdsRef.current.size === 0) return;
    setSyncStatus('pending');
    schedulePushWithDelay('blog', BLOG_PUSH_DELAY_MS, runPullMergePush);
  }, [posts, runPullMergePush]);

  const handleSyncNow = useCallback(() => {
    cancelScheduledPush('blog');
    setSyncStatus('pending');
    void runPullMergePush();
  }, [runPullMergePush]);

  const handlePullOnly = useCallback(async () => {
    cancelScheduledPush('blog');
    setSyncStatus('loading');
    setSyncError(null);
    const remote = await getPostsFromRepo();
    if (remote && remote.length >= 0) {
      const merged = mergePosts(remote, posts) as BlogPost[];
      const normalized = merged.map((p) => ({
        ...p,
        tags: p.tags ?? [],
        coverImage: p.coverImage ?? '',
        polls: p.polls ?? [],
        todos: p.todos ?? [],
        deleted: p.deleted ?? false,
      }));
      justPushedRef.current = true;
      setPosts(normalized);
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } else {
      setSyncStatus('idle');
    }
  }, [posts]);

  const handleCancelPush = useCallback(() => {
    cancelScheduledPush('blog');
    setSyncStatus('idle');
    setSyncError(null);
  }, []);

  // Гости видят посты из data/posts.json (если есть), админ — из localStorage без удалённых
  const displayPosts = isAdmin ? posts.filter((p) => !p.deleted) : getPostsForDisplay();

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of displayPosts) { for (const t of (p.tags ?? [])) set.add(t); }
    return [...set].sort();
  }, [displayPosts]);

  const visiblePosts = useMemo(() => {
    let list = isAdmin ? posts.filter((p) => !p.deleted) : displayPosts.filter((p) => p.published);
    if (filterTag) list = list.filter((p) => p.tags?.includes(filterTag));
    return list.sort((a, b) => sortAsc ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt);
  }, [posts, displayPosts, isAdmin, filterTag, sortAsc]);

  const startNew = () => {
    setEditing('__new__');
    setTitle(''); setContent(''); setTags([]); setCoverImage(''); setCoverSettings(defaultCover);
    setIsPublished(true); setPolls([]); setTodos([]);
    setTimeout(() => titleRef.current?.focus(), 50);
  };

  const startEdit = (post: BlogPost) => {
    setEditing(post.id);
    setTitle(post.title); setContent(post.content); setTags(post.tags ?? []);
    setCoverImage(post.coverImage ?? ''); setCoverSettings(post.coverSettings ?? defaultCover);
    setIsPublished(post.published);
    setPolls(post.polls ?? []); setTodos(post.todos ?? []);
    setTimeout(() => titleRef.current?.focus(), 50);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const now = Date.now();
    const autoTags = extractTags(content);
    const finalTags = mergeTags(tags, autoTags);
    const finalSlug = slugify(title);

    if (editing === '__new__') {
      const post: BlogPost = {
        id: generateId(), title: title.trim(), content, slug: finalSlug,
        published: isPublished, tags: finalTags, coverImage, coverSettings,
        polls: polls.length > 0 ? polls : undefined,
        todos: todos.length > 0 ? todos : undefined,
        createdAt: now, updatedAt: now,
      };
      modifiedPostIdsRef.current.add(post.id);
      setPosts(prev => [post, ...prev]);
    } else if (editing) {
      modifiedPostIdsRef.current.add(editing);
      setPosts(prev => prev.map(p =>
        p.id === editing ? {
          ...p, title: title.trim(), content, slug: finalSlug, published: isPublished, tags: finalTags,
          coverImage, coverSettings, polls: polls.length > 0 ? polls : undefined, todos: todos.length > 0 ? todos : undefined, updatedAt: now,
        } : p
      ));
    }
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Удалить пост?')) return;
    modifiedPostIdsRef.current.add(id);
    const now = Date.now();
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, deleted: true, updatedAt: now } : p))
    );
    if (editing === id) setEditing(null);
  };

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const resized = await resizeImage(dataUrl);
    setCoverImage(resized);
    e.target.value = '';
  }, []);

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/blog/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Ссылка скопирована!');
    });
  };

  return (
    <main className="blog-page-main max-w-[750px] mx-auto">
      <article>
        <header className="text-center mb-6">
          <h1 className="text-2xl font-semibold mb-2">Блог</h1>
          <p className="text-sm" style={{ color: 'var(--pico-muted-color)' }}>
            Новости, статьи и заметки о проекте.
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--pico-muted-color)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <a href="/feed.xml" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pico-primary)' }}>Подписаться на блог (RSS)</a>
            <button type="button" className="outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/feed.xml`)} title="Скопировать ссылку на ленту">Копировать ссылку</button>
            {isAdmin && (
              <>
                <span style={{ color: 'var(--pico-muted-color)' }}>·</span>
                <a href="/rss" style={{ color: 'var(--pico-primary)' }}>RSS подписки</a>
              </>
            )}
          </p>
        </header>

        {/* Sort + Tag filter */}
        <div className="blog-toolbar-wrap" style={{ marginBottom: 16, justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => setSortAsc(!sortAsc)} className="outline blog-touch-btn"
            style={{ fontSize: 12, borderRadius: 12 }}
            title={sortAsc ? 'Сначала старые' : 'Сначала новые'}>
            {sortAsc ? '↑ Старые' : '↓ Новые'}
          </button>
        </div>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16, justifyContent: 'center' }}>
            <span
              className="tag-chip"
              onClick={() => setFilterTag(null)}
              style={filterTag === null ? { background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)' } : {}}
            >Все</span>
            {allTags.map(t => (
              <span
                key={t} className="tag-chip"
                onClick={() => setFilterTag(filterTag === t ? null : t)}
                style={filterTag === t ? { background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)' } : {}}
              >#{t}</span>
            ))}
          </div>
        )}

        {/* Editor form */}
        {isAdmin && editing ? (
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid var(--pico-border-color)', borderRadius: 8 }}>
            <input ref={titleRef} type="text" placeholder="Заголовок поста"
              value={title} onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', marginBottom: 12, fontSize: 16, fontWeight: 600 }} />

            {/* Cover image editor */}
            {coverImage ? (
              <CoverEditor src={coverImage} settings={coverSettings}
                onChange={setCoverSettings}
                onRemove={() => { setCoverImage(''); setCoverSettings(defaultCover); }} />
            ) : (
              <div style={{ marginBottom: 12 }}>
                <button onClick={() => coverInputRef.current?.click()} className="outline" style={{ fontSize: 12, padding: '4px 12px' }}>
                  Загрузить обложку
                </button>
                <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 4, display: 'block' }}>Теги</label>
              <TagInput tags={tags} onChange={setTags} />
            </div>

            <RichTextEditor value={content} onChange={setContent} placeholder="Содержание поста..." minHeight={260} />

            {/* Голосования */}
            <div style={{ marginTop: 16, marginBottom: 16, padding: 12, border: '1px solid var(--pico-border-color)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Голосования</div>
              {polls.map((poll, pi) => (
                <div key={poll.id} style={{ marginBottom: 12, padding: 10, background: 'var(--pico-background-color)', borderRadius: 6 }}>
                  <input
                    type="text"
                    value={poll.question}
                    onChange={e => setPolls(prev => prev.map((p, i) => i === pi ? { ...p, question: e.target.value } : p))}
                    placeholder="Вопрос"
                    style={{ width: '100%', marginBottom: 8, padding: '4px 8px', fontSize: 13 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12 }}>
                    <input type="checkbox" checked={poll.multiple} onChange={e => setPolls(prev => prev.map((p, i) => i === pi ? { ...p, multiple: e.target.checked } : p))} />
                    Несколько вариантов
                  </label>
                  {poll.options.map((opt, oi) => (
                    <div key={opt.id} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={e => setPolls(prev => prev.map((p, i) => i === pi ? { ...p, options: p.options.map((o, j) => j === oi ? { ...o, text: e.target.value } : o) } : p))}
                        placeholder="Вариант ответа"
                        style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                      />
                      <button type="button" onClick={() => setPolls(prev => prev.map((p, i) => i === pi ? { ...p, options: p.options.filter((_, j) => j !== oi) } : p))} style={{ padding: '2px 8px', fontSize: 12 }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" onClick={() => setPolls(prev => prev.map((p, i) => i === pi ? { ...p, options: [...p.options, { id: genId(), text: '' }] } : p))} className="outline" style={{ fontSize: 12, padding: '2px 10px' }}>+ Вариант</button>
                    <button type="button" onClick={() => setPolls(prev => prev.filter((_, i) => i !== pi))} style={{ fontSize: 12, padding: '2px 8px', color: 'var(--color-danger)' }}>Удалить голосование</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setPolls(prev => [...prev, { id: genId(), question: '', options: [{ id: genId(), text: '' }, { id: genId(), text: '' }], multiple: false }])} className="outline" style={{ fontSize: 12, padding: '4px 12px' }}>+ Добавить голосование</button>
            </div>

            {/* Список дел */}
            <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--pico-border-color)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Список дел</div>
              {todos.map((todo, ti) => (
                <div key={todo.id} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input
                    type="text"
                    value={todo.text}
                    onChange={e => setTodos(prev => prev.map((t, i) => i === ti ? { ...t, text: e.target.value } : t))}
                    placeholder="Пункт списка"
                    style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
                  />
                  <button type="button" onClick={() => setTodos(prev => prev.filter((_, i) => i !== ti))} style={{ padding: '2px 8px', fontSize: 12, color: 'var(--color-danger)' }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setTodos(prev => [...prev, { id: genId(), text: '' }])} className="outline" style={{ fontSize: 12, padding: '4px 12px', marginTop: 4 }}>+ Добавить пункт</button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              Опубликован
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={!title.trim()}>
                {editing === '__new__' ? 'Создать' : 'Сохранить'}
              </button>
              <button onClick={() => setEditing(null)} className="secondary">Отмена</button>
            </div>
          </div>
        ) : isAdmin ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button onClick={startNew} style={{ flex: '1 1 auto' }}>+ Новый пост</button>
              <button onClick={downloadPostsBundle} className="outline" title="Скачать posts.json для public/data/">Экспорт для GitHub</button>
            </div>
            {getSyncConfig() && (
              <div style={{ marginBottom: 20, padding: 12, border: '1px solid var(--pico-border-color)', borderRadius: 8, background: 'var(--pico-card-background-color)', fontSize: 13 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--pico-muted-color)' }}>
                  Изменения с телефона и с компьютера объединяются по времени: перед отправкой загружаем репо и сливаем (удаления не теряются). С телефона можно нажать «Загрузить в репо» для немедленной отправки.
                </p>
                {(syncStatus !== 'idle' || syncError) && (
                  <div style={{ marginBottom: 8, color: syncStatus === 'error' ? 'var(--color-danger)' : 'var(--pico-muted-color)' }}>
                    {syncStatus === 'pending' && `Через ${BLOG_PUSH_DELAY_MS / 1000} сек загрузка в репо (сначала выгрузка из репо и объединение).`}
                    {syncStatus === 'loading' && 'Выгружаем последний сэйв из репо…'}
                    {syncStatus === 'sending' && 'Загружаем в репо…'}
                    {syncStatus === 'ok' && 'Загружено в репо.'}
                    {syncStatus === 'error' && syncError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {syncStatus === 'pending' && (
                    <>
                      <button type="button" onClick={handleSyncNow} style={{ fontSize: 12 }}>Загрузить в репо</button>
                      <button type="button" onClick={handleCancelPush} className="secondary" style={{ fontSize: 12 }}>Отменить отправку</button>
                    </>
                  )}
                  <button type="button" onClick={handlePullOnly} className="outline" style={{ fontSize: 12 }} title="Загрузить с репо и объединить с локальными">
                    Выгрузить последний сэйв из репо
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}

        {visiblePosts.length === 0 && (
          <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--pico-muted-color)' }}>
            {isAdmin ? 'Нет постов. Создайте первый.' : 'Пока нет публикаций.'}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {visiblePosts.map(post => (
            <PostCard key={post.id} post={post} isAdmin={isAdmin}
              onEdit={() => startEdit(post)} onDelete={() => handleDelete(post.id)} onCopyLink={() => copyLink(post.slug)} />
          ))}
        </div>

        <p className="mt-8 text-center">
          <a href="/" style={{ color: 'var(--pico-muted-color)', textDecoration: 'underline' }}>На главную</a>
        </p>
      </article>
    </main>
  );
};

/* ═══════════════════ PostCard ═══════════════════ */

const PostCard: React.FC<{
  post: BlogPost; isAdmin: boolean;
  onEdit: () => void; onDelete: () => void; onCopyLink: () => void;
}> = ({ post, isAdmin, onEdit, onDelete, onCopyLink }) => {
  const toc = generateToc(post.content);
  const views = getViewCounts()[post.id] || 0;

  return (
    <article style={{ padding: 0, border: '1px solid var(--pico-border-color)', borderRadius: 8, overflow: 'hidden' }}>
      {post.coverImage && (
        <CoverDisplay src={post.coverImage} settings={post.coverSettings} maxHeight={280} alt={post.title || 'cover'} />
      )}
      <div className="blog-card-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(1.1rem, 4vw, 1.375rem)' }}>{post.title}</h2>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--pico-muted-color)', alignItems: 'center', flexWrap: 'wrap' }}>
              <time dateTime={new Date(post.updatedAt).toISOString()}>{new Date(post.updatedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              {views > 0 && <span>👁 {views}</span>}
              {isAdmin && !post.published && (
                <span style={{ color: '#ca8a04', fontWeight: 600 }}>Черновик</span>
              )}
            </div>
          </div>
          <div className="blog-toolbar-wrap" style={{ flexShrink: 0 }}>
            <button onClick={onCopyLink} className="outline blog-touch-btn" style={{ fontSize: 12 }} title="Скопировать ссылку">🔗</button>
            {isAdmin && (
              <>
                <button onClick={onEdit} className="outline blog-touch-btn" style={{ fontSize: 13 }}>✎</button>
                <button onClick={onDelete} className="outline secondary blog-touch-btn" style={{ fontSize: 13 }}>✕</button>
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {post.tags.map(t => <span key={t} className="tag-chip">#{t}</span>)}
          </div>
        )}

        {/* TOC */}
        {toc.length >= 3 && (
          <details style={{ marginBottom: 12, fontSize: 13 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--pico-muted-color)' }}>Содержание</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, listStyle: 'none' }}>
              {toc.map((item, i) => (
                <li key={i} style={{ paddingLeft: item.level === 3 ? 14 : 0, lineHeight: 1.8 }}>
                  <a href={`#${item.id}`} style={{ color: 'var(--pico-primary)', textDecoration: 'none' }}>{item.text}</a>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="blog-content" style={{ lineHeight: 1.7, fontSize: 15 }}
          ref={el => { if (el) { attachCodeCopyButtons(el); applyImageFocusStyles(el); } }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />

        {post.polls && post.polls.length > 0 && (
          <div style={{ marginTop: 20 }}>
            {post.polls.map(poll => <PollBlock key={poll.id} poll={poll} />)}
          </div>
        )}
        {(post.todos ?? []).length > 0 && (
          <div style={{ marginTop: 20 }}>
            <TodoBlock postId={post.id} todos={post.todos ?? []} />
          </div>
        )}
      </div>
    </article>
  );
};

/* ═══════════════════ BlogPostView (single post) ═══════════════════ */

const BlogPostView: React.FC<{ slug: string; isAdmin: boolean }> = ({ slug, isAdmin }) => {
  const posts = getPostsForDisplay();
  const post = posts.find(p => p.slug === slug);

  useEffect(() => {
    if (post) incrementView(post.id);
  }, [post?.id]);

  if (!post || (!post.published && !isAdmin)) {
    return (
      <main className="blog-post-main max-w-[750px] mx-auto text-center">
        <h2>Пост не найден</h2>
        <p style={{ color: 'var(--pico-muted-color)' }}>Публикация по адресу «{slug}» не найдена.</p>
        <a href="/blog" style={{ color: 'var(--pico-muted-color)', textDecoration: 'underline' }}>Назад к блогу</a>
      </main>
    );
  }

  const toc = generateToc(post.content);

  return (
    <main className="blog-post-main max-w-[750px] mx-auto">
      <article className="blog-article">
        {post.coverImage && (
          <div style={{ marginBottom: 20 }}>
            <CoverDisplay src={post.coverImage} settings={post.coverSettings} maxHeight={340} radius={8} alt={post.title || 'cover'} />
          </div>
        )}
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ marginBottom: 8, fontSize: 'clamp(1.25rem, 5vw, 1.75rem)', wordBreak: 'break-word' }}>{post.title}</h1>
          <div style={{ fontSize: 13, color: 'var(--pico-muted-color)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <time dateTime={new Date(post.updatedAt).toISOString()}>{new Date(post.updatedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</time>
            {isAdmin && !post.published && (
              <span style={{ color: '#ca8a04', fontWeight: 600 }}>Черновик</span>
            )}
          </div>
          {post.tags && post.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {post.tags.map(t => <span key={t} className="tag-chip">#{t}</span>)}
            </div>
          )}
        </header>

        {toc.length >= 3 && (
          <nav style={{ marginBottom: 20, padding: 12, border: '1px solid var(--pico-border-color)', borderRadius: 8, fontSize: 13 }}>
            <strong>Содержание</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, listStyle: 'none' }}>
              {toc.map((item, i) => (
                <li key={i} style={{ paddingLeft: item.level === 3 ? 14 : 0, lineHeight: 1.8 }}>
                  <a href={`#${item.id}`} style={{ color: 'var(--pico-primary)', textDecoration: 'none' }}>{item.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="blog-content" style={{ lineHeight: 1.7, fontSize: 15 }}
          ref={el => { if (el) { attachCodeCopyButtons(el); applyImageFocusStyles(el); } }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />

        {post.polls && post.polls.length > 0 && (
          <div style={{ marginTop: 24 }}>
            {post.polls.map(poll => <PollBlock key={poll.id} poll={poll} />)}
          </div>
        )}
        {(post.todos ?? []).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <TodoBlock postId={post.id} todos={post.todos ?? []} />
          </div>
        )}

        <CommentSection postId={post.id} isAdmin={isAdmin} />

        <hr style={{ margin: '32px 0' }} />
        <p className="text-center">
          <a href="/blog" style={{ color: 'var(--pico-muted-color)', textDecoration: 'underline' }}>← Все публикации</a>
        </p>
      </article>
    </main>
  );
};

/* ═══════════════════ Comments system ═══════════════════ */

const COMMENTS_KEY = 'igor-blog-comments';
const RATE_KEY = 'igor-blog-comment-rate';

interface BlogComment {
  id: string;
  postId: string;
  author: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

function loadComments(): BlogComment[] {
  try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]'); }
  catch { return []; }
}

function saveComments(comments: BlogComment[]) {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
}

const URL_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /[a-z0-9-]+\.(com|net|org|ru|io|me|dev|co|info|biz|xyz|top|site|online|click|link|tk|ml|ga|cf|gq)\b/i,
  /t\.me\//i,
  /bit\.ly/i,
  /goo\.gl/i,
];

const SPAM_PATTERNS = [
  /\bcasino\b/i, /\bpoker\b/i, /\bviagra\b/i, /\bcrypto\b/i,
  /\bfree money\b/i, /\bbuy now\b/i, /\bclick here\b/i,
  /\b(win|earn)\s+\$?\d+/i,
];

function containsUrl(text: string): boolean {
  return URL_PATTERNS.some(p => p.test(text));
}

function isSpam(text: string): boolean {
  return SPAM_PATTERNS.some(p => p.test(text));
}

function canComment(): boolean {
  const last = Number(localStorage.getItem(RATE_KEY) || '0');
  return Date.now() - last >= 30000;
}

function markCommented() {
  localStorage.setItem(RATE_KEY, String(Date.now()));
}

function sanitizeCommentText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

const CommentSection: React.FC<{ postId: string; isAdmin: boolean }> = ({ postId, isAdmin }) => {
  const [comments, setComments] = useState<BlogComment[]>(() => loadComments());
  const [author, setAuthor] = useState(() => localStorage.getItem('igor-blog-comment-name') || '');
  const [text, setText] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const formOpenTime = useRef(Date.now());

  useEffect(() => { saveComments(comments); }, [comments]);

  const postComments = useMemo(() => {
    if (isAdmin) return comments.filter(c => c.postId === postId);
    return comments.filter(c => c.postId === postId && c.status === 'approved');
  }, [comments, postId, isAdmin]);

  const pendingCount = useMemo(() =>
    comments.filter(c => c.postId === postId && c.status === 'pending').length
  , [comments, postId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (honeypot) return;

    const fillTime = Date.now() - formOpenTime.current;
    if (fillTime < 3000) { setError('Слишком быстро. Попробуйте ещё раз.'); return; }

    if (!canComment()) { setError('Подождите 30 секунд перед следующим комментарием.'); return; }

    const trimAuthor = author.trim();
    const trimText = text.trim();

    if (!trimAuthor || trimAuthor.length < 2) { setError('Укажите имя (минимум 2 символа).'); return; }
    if (trimAuthor.length > 50) { setError('Имя слишком длинное (макс. 50 символов).'); return; }
    if (!trimText || trimText.length < 3) { setError('Комментарий слишком короткий.'); return; }
    if (trimText.length > 2000) { setError('Комментарий слишком длинный (макс. 2000 символов).'); return; }

    if (containsUrl(trimText) || containsUrl(trimAuthor)) {
      setError('Ссылки в комментариях запрещены.'); return;
    }
    if (isSpam(trimText)) {
      setError('Комментарий заблокирован системой защиты.'); return;
    }

    const safeAuthor = sanitizeCommentText(trimAuthor);
    const safeText = sanitizeCommentText(trimText);

    const comment: BlogComment = {
      id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      postId,
      author: safeAuthor,
      text: safeText,
      status: 'pending',
      createdAt: Date.now(),
    };

    setComments(prev => [...prev, comment]);
    localStorage.setItem('igor-blog-comment-name', trimAuthor);
    markCommented();
    setText('');
    setSuccess('Комментарий отправлен на модерацию.');
    formOpenTime.current = Date.now();
  };

  const moderate = (id: string, status: 'approved' | 'rejected') => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const deleteComment = (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: 18, marginBottom: 16 }}>
        Комментарии
        {isAdmin && pendingCount > 0 && (
          <span style={{ fontSize: 12, color: '#ca8a04', marginLeft: 8 }}>({pendingCount} на модерации)</span>
        )}
      </h3>

      {/* Comment list */}
      {postComments.length === 0 ? (
        <p style={{ color: 'var(--pico-muted-color)', fontSize: 14 }}>Пока нет комментариев. Будьте первым!</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {postComments.map(c => (
            <div key={c.id} style={{
              padding: '10px 14px', borderRadius: 8,
              border: '1px solid var(--pico-border-color)',
              background: c.status === 'pending' ? 'var(--pico-primary-background)' : 'transparent',
              opacity: c.status === 'rejected' ? 0.4 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{c.author}</strong>
                  <span style={{ fontSize: 11, color: 'var(--pico-muted-color)' }}>
                    {new Date(c.createdAt).toLocaleString('ru-RU')}
                  </span>
                  {isAdmin && c.status === 'pending' && (
                    <span style={{ fontSize: 11, color: '#ca8a04', fontWeight: 600 }}>⏳ Модерация</span>
                  )}
                  {isAdmin && c.status === 'rejected' && (
                    <span style={{ fontSize: 11, color: 'var(--color-danger)', fontWeight: 600 }}>Отклонён</span>
                  )}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {c.status !== 'approved' && (
                      <button onClick={() => moderate(c.id, 'approved')}
                        style={{ padding: '2px 8px', fontSize: 11, background: 'var(--color-success)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✓</button>
                    )}
                    {c.status !== 'rejected' && (
                      <button onClick={() => moderate(c.id, 'rejected')}
                        style={{ padding: '2px 8px', fontSize: 11, background: '#ca8a04', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✗</button>
                    )}
                    <button onClick={() => deleteComment(c.id)}
                      style={{ padding: '2px 8px', fontSize: 11, background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>🗑</button>
                  </div>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Comment form */}
      <form onSubmit={handleSubmit} style={{ padding: 16, border: '1px solid var(--pico-border-color)', borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--pico-muted-color)', marginBottom: 10 }}>
          Оставьте комментарий. Ссылки запрещены. Все комментарии проходят модерацию.
        </div>

        {/* Honeypot — hidden from users, bots fill it */}
        <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
          <input type="text" name="website" tabIndex={-1} autoComplete="off"
            value={honeypot} onChange={e => setHoneypot(e.target.value)} />
        </div>

        <input type="text" placeholder="Ваше имя" value={author}
          onChange={e => setAuthor(e.target.value.slice(0, 50))}
          maxLength={50}
          style={{ width: '100%', marginBottom: 8, fontSize: 14 }} />
        <textarea placeholder="Ваш комментарий..." value={text}
          onChange={e => setText(e.target.value.slice(0, 2000))}
          maxLength={2000} rows={4}
          style={{ width: '100%', marginBottom: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--pico-muted-color)' }}>{text.length}/2000</span>
          <button type="submit" style={{ fontSize: 13, padding: '6px 20px' }}>Отправить</button>
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>}
        {success && <p style={{ color: 'var(--color-success)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{success}</p>}
      </form>
    </div>
  );
};

/* ═══════════════════ Export ═══════════════════ */

export { BlogList, BlogPostView };
export default BlogList;
