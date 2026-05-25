import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/security';
import {
  schedulePushWithDelay,
  cancelScheduledPush,
  fetchNotesFromRepo,
  mergeNotes,
  pushNotesMerged,
  getSyncConfig,
} from '@/lib/githubSync';
import { toastError } from '@/lib/toast';
import { attachCodeCopyButtons } from '@/lib/useCodeCopyButtons';
import { applyImageFocusStyles } from '@/lib/imageFocusStyles';
import RichTextEditor from '@/components/editor/RichTextEditor';

/* ═══════════════════ Types ═══════════════════ */

interface NoteFolder {
  id: string;
  name: string;
  parentId: string | null;
}

interface NoteTodoItem {
  id: string;
  text: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  pinned?: boolean;
  tags: string[];
  color?: string;
  archived?: boolean;
  todos?: NoteTodoItem[];
  createdAt: number;
  updatedAt: number;
  /** Мягкое удаление: при синхронизации с репо удаление не теряется при пушах с другого устройства */
  deleted?: boolean;
}

function normalizeNote(n: Note): Note {
  return {
    ...n,
    tags: n.tags ?? [],
    color: n.color ?? 'none',
    archived: n.archived ?? false,
    todos: n.todos ?? [],
    deleted: n.deleted ?? false,
  };
}

type SortMode = 'date' | 'title' | 'color';

const NOTE_COLORS = [
  { id: 'none', label: 'Без цвета', css: 'transparent' },
  { id: 'red', label: 'Красный', css: '#ef4444' },
  { id: 'orange', label: 'Оранжевый', css: '#f97316' },
  { id: 'yellow', label: 'Жёлтый', css: '#eab308' },
  { id: 'green', label: 'Зелёный', css: '#22c55e' },
  { id: 'blue', label: 'Синий', css: '#3b82f6' },
  { id: 'purple', label: 'Фиолетовый', css: '#a855f7' },
  { id: 'pink', label: 'Розовый', css: '#ec4899' },
];

function colorCss(id?: string): string {
  return NOTE_COLORS.find(c => c.id === id)?.css ?? 'transparent';
}

const NOTES_VIEW_MODE_KEY = 'igor-notes-view-mode';
type NotesViewMode = 'list' | 'grid';

function loadNotesViewMode(): NotesViewMode {
  try {
    const v = localStorage.getItem(NOTES_VIEW_MODE_KEY);
    return v === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function htmlToPlainExcerpt(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const NotesInlineConfirm: React.FC<{
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ message, confirmLabel = 'Удалить', onConfirm, onCancel }) => (
  <div className="notes-inline-confirm" role="group" aria-label={message}>
    <p>{message}</p>
    <div className="notes-inline-confirm__actions">
      <button type="button" className="notes-touch-btn" style={{ fontSize: 11 }} onClick={onConfirm}>{confirmLabel}</button>
      <button type="button" className="notes-touch-btn secondary" style={{ fontSize: 11 }} onClick={onCancel}>Отмена</button>
    </div>
  </div>
);

/* ═══════════════════ Storage ═══════════════════ */

const NOTES_KEY = 'igor-notes-v2';
const FOLDERS_KEY = 'igor-notes-folders';
const NOTESTODOS_CHECKED_KEY = 'igor-notes-todos-checked';

function getNotesTodosChecked(): Record<string, Record<string, boolean>> {
  try { return JSON.parse(localStorage.getItem(NOTESTODOS_CHECKED_KEY) || '{}'); } catch { return {}; }
}
function setNoteTodoChecked(noteId: string, todoId: string, checked: boolean) {
  const o = getNotesTodosChecked();
  if (!o[noteId]) o[noteId] = {};
  o[noteId][todoId] = checked;
  localStorage.setItem(NOTESTODOS_CHECKED_KEY, JSON.stringify(o));
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key: string, value: unknown): string | null {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'QuotaExceededError') {
      return 'Недостаточно места в хранилище браузера. Удалите картинки из заметок или очистите данные сайта.';
    }
    return e instanceof Error ? e.message : 'Не удалось сохранить заметки локально';
  }
}

/** Загружает data/notes.json из репо (статический файл сайта) и подставляет в localStorage. */
export function loadNotesBundle(): Promise<boolean> {
  return fetch('/data/notes.json')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data: { notes?: Note[]; folders?: NoteFolder[] }) => {
      const notes = Array.isArray(data.notes) ? data.notes : [];
      const folders = Array.isArray(data.folders) ? data.folders : [];
      if (notes.length > 0 || folders.length > 0) {
        applyNotesFromRepoData({ notes, folders });
        return true;
      }
      return false;
    })
    .catch(() => false);
}

/** Подставить данные из репо в localStorage (нормализация полей). Вызывается при «загрузить с репо» и при глобальном pull. */
export function applyNotesFromRepoData(data: { notes: unknown[]; folders: unknown[] }): void {
  const notes = (data.notes ?? []).map((n) => normalizeNote(n as Note));
  const folders = (data.folders ?? []) as NoteFolder[];
  save(NOTES_KEY, notes);
  save(FOLDERS_KEY, folders);
}

/** Загрузить заметки из репо по API (GitHub) и применить к localStorage. Возвращает успех и данные для обновления UI. */
export async function loadNotesFromRepo(): Promise<{ ok: boolean; notes?: Note[]; folders?: NoteFolder[]; error?: string }> {
  const data = await fetchNotesFromRepo();
  if (!data.ok) return { ok: false, error: data.error };
  applyNotesFromRepoData(data);
  const notes = (data.notes as Note[]).map((n) => normalizeNote(n));
  const folders = data.folders as NoteFolder[];
  return { ok: true, notes, folders };
}

/** Скачивает notes.json из текущего localStorage для размещения в public/data/ */
export function downloadNotesBundle(): void {
  const notes = load<Note[]>(NOTES_KEY, []);
  const folders = load<NoteFolder[]>(FOLDERS_KEY, []);
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: Date.now(), notes, folders }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'notes.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function makeNoteId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function makeFolderId(): string {
  return 'f_' + Math.random().toString(36).slice(2, 8);
}

function makeTodoId(): string {
  return 'todo_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
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

/* ═══════════════════ Image helpers ═══════════════════ */

const MAX_IMG_W = 800;

function resizeImage(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= MAX_IMG_W) { resolve(dataUrl); return; }
      const r = MAX_IMG_W / img.width;
      const c = document.createElement('canvas');
      c.width = MAX_IMG_W; c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
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

/* ═══════════════════ Import: Telegram ═══════════════════ */

interface TgMessage {
  id?: number;
  type?: string;
  date?: string;
  text?: string | Array<string | { type: string; text: string }>;
}

function parseTelegramExport(json: string): Note[] {
  const data = JSON.parse(json);
  const messages: TgMessage[] = data.messages ?? data;
  if (!Array.isArray(messages)) return [];
  const byDate = new Map<string, string[]>();
  for (const msg of messages) {
    if (msg.type && msg.type !== 'message') continue;
    let text = '';
    if (typeof msg.text === 'string') text = msg.text;
    else if (Array.isArray(msg.text)) text = msg.text.map(t => typeof t === 'string' ? t : t.text ?? '').join('');
    if (!text.trim()) continue;
    const dk = msg.date ? msg.date.slice(0, 10) : 'unknown';
    const arr = byDate.get(dk) ?? [];
    const time = msg.date ? msg.date.slice(11, 16) : '';
    arr.push(time ? `<strong>${time}</strong> ${text}` : text);
    byDate.set(dk, arr);
  }
  const notes: Note[] = [];
  for (const [date, lines] of byDate) {
    const now = Date.now();
    notes.push({ id: date + '_tg-' + Math.random().toString(36).slice(2, 6), title: `Telegram ${date}`, content: lines.join('<br><br>'), folderId: null, tags: ['telegram'], createdAt: now, updatedAt: now });
  }
  return notes;
}

/* ═══════════════════ Import: folder with nested files ═══════════════════ */

async function importFolderFiles(files: FileList, baseFolderId: string | null, existingFolders: NoteFolder[]): Promise<{ notes: Note[]; folders: NoteFolder[] }> {
  const folderMap = new Map<string, string>(); // path -> folderId
  const newFolders: NoteFolder[] = [];
  const newNotes: Note[] = [];

  const sortedFiles = [...files].sort((a, b) => {
    const pa = (a as any).webkitRelativePath || a.name;
    const pb = (b as any).webkitRelativePath || b.name;
    return pa.localeCompare(pb);
  });

  for (const file of sortedFiles) {
    const relPath: string = (file as any).webkitRelativePath || file.name;
    const parts = relPath.split('/');

    if (parts.length < 2) continue;
    // parts[0] is root folder name; parts[1..n-1] are subfolders; parts[n-1] is filename
    let currentParent = baseFolderId;
    let pathSoFar = '';

    for (let i = 0; i < parts.length - 1; i++) {
      pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i];
      if (!folderMap.has(pathSoFar)) {
        const existing = existingFolders.find(f => f.name === parts[i] && f.parentId === currentParent);
        if (existing) {
          folderMap.set(pathSoFar, existing.id);
          currentParent = existing.id;
        } else {
          const fid = makeFolderId();
          newFolders.push({ id: fid, name: parts[i], parentId: currentParent });
          folderMap.set(pathSoFar, fid);
          currentParent = fid;
        }
      } else {
        currentParent = folderMap.get(pathSoFar)!;
      }
    }

    const fileName = parts[parts.length - 1];
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext || !['md', 'txt', 'json'].includes(ext)) continue;

    const text = await file.text();
    if (ext === 'json') {
      try {
        const parsed = parseTelegramExport(text);
        for (const n of parsed) { n.folderId = currentParent; }
        newNotes.push(...parsed);
      } catch { /* skip non-telegram json */ }
    } else {
      const now = Date.now();
      newNotes.push({
        id: makeNoteId() + '_' + Math.random().toString(36).slice(2, 5),
        title: fileName.replace(/\.(md|txt)$/i, ''),
        content: `<p>${text.replace(/\n/g, '</p><p>')}</p>`,
        folderId: currentParent,
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return { notes: newNotes, folders: newFolders };
}

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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', padding: '3px 6px', border: '1px solid var(--pico-border-color)', borderRadius: 4, minHeight: 28, background: 'var(--pico-form-element-background-color)' }}>
      {tags.map(t => (
        <span key={t} className="tag-chip">
          #{t}
          <span className="tag-chip-remove" onClick={() => onChange(tags.filter(x => x !== t))}>✕</span>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
        placeholder={tags.length === 0 ? '#тег' : ''} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 11, flex: 1, minWidth: 50, padding: '1px 0', color: 'var(--pico-color)' }} />
    </div>
  );
};

/* ═══════════════════ FolderTree (with notes inline) ═══════════════════ */

const FolderTree: React.FC<{
  folders: NoteFolder[];
  notes: Note[];
  selectedFolder: string | null;
  expandedFolders: Set<string>;
  editingId: string | null;
  onSelectFolder: (id: string | null) => void;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onScrollToNote: (id: string) => void;
  onMoveNote: (noteId: string, targetFolderId: string | null) => void;
  onMoveFolder: (folderId: string, targetParentId: string | null) => void;
}> = ({ folders, notes, selectedFolder, expandedFolders, editingId, onSelectFolder, onToggle, onRename, onDeleteFolder, onScrollToNote, onMoveNote, onMoveFolder }) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder id or '__root__'
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renamingId) inputRef.current?.focus(); }, [renamingId]);

  const childFolders = (pid: string | null) => folders.filter(f => f.parentId === pid);
  const notesInFolder = (fid: string | null) => notes.filter(n => !n.deleted && n.folderId === fid);

  // Prevent dropping a folder into itself or any of its descendants
  const isDescendant = useCallback((parentId: string, childId: string): boolean => {
    let cur: string | null = childId;
    while (cur) {
      if (cur === parentId) return true;
      const f = folders.find(x => x.id === cur);
      cur = f?.parentId ?? null;
    }
    return false;
  }, [folders]);

  const handleDragStart = useCallback((e: React.DragEvent, type: 'note' | 'folder', id: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(targetId ?? '__root__');
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDropTarget(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type === 'note') {
        onMoveNote(data.id, targetFolderId);
      } else if (data.type === 'folder') {
        if (data.id === targetFolderId) return;
        if (targetFolderId && isDescendant(data.id, targetFolderId)) return;
        onMoveFolder(data.id, targetFolderId);
      }
    } catch { /* invalid drag data */ }
  }, [onMoveNote, onMoveFolder, isDescendant]);

  const dropHighlight = (id: string | null): React.CSSProperties => {
    const key = id ?? '__root__';
    if (dropTarget !== key) return {};
    return { outline: '2px dashed var(--pico-primary)', outlineOffset: -2, borderRadius: 4 };
  };

  const renderNote = (n: Note, depth: number): React.ReactNode => (
    <div key={n.id}
      draggable
      onDragStart={e => handleDragStart(e, 'note', n.id)}
      onClick={() => onScrollToNote(n.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingLeft: depth * 14 + 4 + 14,
        paddingTop: 2, paddingBottom: 2, paddingRight: 4,
        cursor: 'grab', fontSize: 12, whiteSpace: 'nowrap',
        opacity: editingId === n.id ? 1 : 0.7,
        borderLeft: n.color && n.color !== 'none' ? `3px solid ${colorCss(n.color)}` : '3px solid transparent',
        borderRadius: 3,
      }}>
      <span style={{ fontSize: 11, flexShrink: 0 }}>{n.pinned ? '📌' : '📄'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {n.title || n.id}
      </span>
    </div>
  );

  const renderFolder = (f: NoteFolder, depth: number): React.ReactNode => {
    const expanded = expandedFolders.has(f.id);
    const selected = selectedFolder === f.id;
    const kids = childFolders(f.id);
    const fNotes = notesInFolder(f.id);
    const totalCount = fNotes.length;
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={e => handleDragStart(e, 'folder', f.id)}
          onDragOver={e => handleDragOver(e, f.id)}
          onDragLeave={handleDragLeave}
          onDrop={e => { handleDrop(e, f.id); if (!expandedFolders.has(f.id)) onToggle(f.id); }}
          onClick={() => { onSelectFolder(f.id); onToggle(f.id); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, paddingLeft: depth * 14 + 4, paddingTop: 3, paddingBottom: 3, cursor: 'grab',
            background: selected ? 'var(--pico-primary-background)' : 'transparent', borderRadius: 4,
            ...dropHighlight(f.id),
          }}>
          <span style={{ width: 14, textAlign: 'center', fontSize: 10, opacity: 0.5 }}>{(kids.length > 0 || fNotes.length > 0) ? (expanded ? '▼' : '▶') : '·'}</span>
          {renamingId === f.id ? (
            <input ref={inputRef} value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={() => { if (renameVal.trim()) onRename(f.id, renameVal.trim()); setRenamingId(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { if (renameVal.trim()) onRename(f.id, renameVal.trim()); setRenamingId(null); } if (e.key === 'Escape') setRenamingId(null); }}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 12, padding: '1px 4px', flex: 1, background: 'transparent', border: '1px solid var(--pico-border-color)' }} />
          ) : (
            <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onDoubleClick={e => { e.stopPropagation(); setRenamingId(f.id); setRenameVal(f.name); }}>
              📁 {f.name} {totalCount > 0 && <span style={{ opacity: 0.4 }}>({totalCount})</span>}
            </span>
          )}
          <button type="button" title={confirmDeleteFolderId === f.id ? 'Отменить удаление' : 'Удалить папку'}
            onClick={e => { e.stopPropagation(); setConfirmDeleteFolderId(confirmDeleteFolderId === f.id ? null : f.id); }}
            style={{ background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer', fontSize: 10, opacity: confirmDeleteFolderId === f.id ? 0.8 : 0.3, color: confirmDeleteFolderId === f.id ? 'var(--pico-del-color)' : 'inherit' }}>✕</button>
        </div>
        {confirmDeleteFolderId === f.id && (
          <div onClick={e => e.stopPropagation()} style={{ paddingLeft: depth * 14 + 22, paddingRight: 4, paddingBottom: 4 }}>
            <NotesInlineConfirm
              message={`Удалить папку «${f.name}»? Заметки переместятся в родительскую папку.`}
              onConfirm={() => { onDeleteFolder(f.id); setConfirmDeleteFolderId(null); }}
              onCancel={() => setConfirmDeleteFolderId(null)}
            />
          </div>
        )}
        {expanded && (
          <>
            {kids.map(c => renderFolder(c, depth + 1))}
            {fNotes.map(n => renderNote(n, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const rootNotes = notesInFolder(null);
  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
      <div
        onDragOver={e => handleDragOver(e, null)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, null)}
        onClick={() => onSelectFolder(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px', cursor: 'pointer',
          background: selectedFolder === null ? 'var(--pico-primary-background)' : 'transparent',
          borderRadius: 4, fontSize: 13, fontWeight: 500,
          ...dropHighlight(null),
        }}>
        📋 Все заметки <span style={{ opacity: 0.4 }}>({notes.length})</span>
      </div>
      {childFolders(null).map(f => renderFolder(f, 0))}
      {rootNotes.map(n => renderNote(n, 0))}
    </div>
  );
};

/* ═══════════════════ NoteTodoBlock (список дел в заметке) ═══════════════════ */

const NoteTodoBlock: React.FC<{ noteId: string; todos: NoteTodoItem[] }> = ({ noteId, todos }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const stored = getNotesTodosChecked()[noteId] ?? {};
    return { ...stored };
  });

  const toggle = (todoId: string) => {
    const next = !checked[todoId];
    setChecked(prev => ({ ...prev, [todoId]: next }));
    setNoteTodoChecked(noteId, todoId, next);
  };

  if (!todos?.length) return null;

  return (
    <div className="todo-block" style={{
      margin: '16px 0 0',
      padding: 12,
      border: '1px solid var(--pico-border-color)',
      borderRadius: 8,
      background: 'var(--pico-card-background-color)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Список дел</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map(t => (
          <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--pico-border-color)' }}>
            <label className="todo-item-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
              <input type="checkbox" checked={!!checked[t.id]} onChange={() => toggle(t.id)} style={{ flexShrink: 0 }} />
              <span style={{ textDecoration: checked[t.id] ? 'line-through' : 'none', color: checked[t.id] ? 'var(--pico-muted-color)' : 'var(--pico-color)' }}>
                {t.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ═══════════════════ Note preview (grid) ═══════════════════ */

const NotePreviewTile: React.FC<{
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ note, isSelected, onSelect }) => {
  const excerpt = useMemo(() => htmlToPlainExcerpt(note.content), [note.content]);
  const previewLabel = useMemo(() => {
    const title = note.title || note.id;
    const date = new Date(note.updatedAt).toLocaleDateString('ru-RU');
    return `Заметка: ${title}, обновлена ${date}`;
  }, [note.title, note.id, note.updatedAt]);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={previewLabel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`note-card note-card--preview${note.archived ? ' note-card--archived' : ''}${isSelected ? ' note-card--preview-selected' : ''}`}
      style={{
        borderLeft: note.color && note.color !== 'none' ? `4px solid ${colorCss(note.color)}` : undefined,
      }}
      onClick={onSelect}
    >
      <div className="note-card__body">
        <div className="note-card__title">{note.title || note.id}</div>
        {excerpt ? (
          <p className="note-card__excerpt">{excerpt}</p>
        ) : (
          <p className="note-card__excerpt note-card__empty">Пустая заметка</p>
        )}
        <div className="note-card__preview-meta">
          {note.pinned && <span title="Закреплена">📌 </span>}
          {new Date(note.updatedAt).toLocaleDateString('ru-RU')}
          {note.tags && note.tags.length > 0 && (
            <span>{` · ${note.tags.slice(0, 3).map(t => `#${t}`).join(' ')}`}</span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════ NoteCard ═══════════════════ */

const NoteCard: React.FC<{
  note: Note;
  folders: NoteFolder[];
  isEditing: boolean;
  editTitle: string;
  editContent: string;
  editTags: string[];
  editColor: string;
  editTodos: NoteTodoItem[];
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onMove: (folderId: string | null) => void;
  onExport: () => void;
  onEditTitleChange: (v: string) => void;
  onEditContentChange: (v: string) => void;
  onEditTagsChange: (v: string[]) => void;
  onEditColorChange: (v: string) => void;
  onEditTodosChange: (v: NoteTodoItem[]) => void;
  cardRef?: React.Ref<HTMLDivElement | null>;
}> = ({ note, folders, isEditing, editTitle, editContent, editTags, editColor, editTodos, onStartEdit, onSave, onCancel, onDelete, onArchive, onTogglePin, onDuplicate, onMove, onExport, onEditTitleChange, onEditContentChange, onEditTagsChange, onEditColorChange, onEditTodosChange, cardRef }) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const overflowRef = useRef<HTMLDetailsElement | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeOverflow = () => {
    const d = overflowRef.current;
    if (d) d.open = false;
    setOverflowOpen(false);
    setConfirmDelete(false);
  };

  const wordCount = useMemo(() => {
    const text = (isEditing ? editContent : note.content).replace(/<[^>]*>/g, ' ');
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [isEditing, editContent, note.content]);

  useEffect(() => {
    if (!isEditing && contentRef.current && note.content) {
      attachCodeCopyButtons(contentRef.current);
      applyImageFocusStyles(contentRef.current);
    }
  }, [isEditing, note.content]);

  const cardClass =
    'note-card' +
    (note.archived ? ' note-card--archived' : '') +
    (isEditing ? ' note-card--editing' : '');

  return (
    <div
      ref={cardRef}
      id={`note-${note.id}`}
      className={cardClass}
      style={{
        borderLeft: note.color && note.color !== 'none' ? `4px solid ${colorCss(note.color)}` : undefined,
      }}
    >
      <div className="note-card__toolbar">
        <span className="note-card__id" title={note.id}>{note.id}</span>
        {note.pinned && <span title="Закреплена">📌</span>}
        {note.archived && <span title="В архиве">📦</span>}
        <span className="note-card__toolbar-spacer" />
        {isEditing ? (
          <>
            <button type="button" onClick={onSave} className="notes-touch-btn" style={{ fontSize: 12 }}>Сохранить</button>
            <button type="button" onClick={onCancel} className="notes-touch-btn secondary" style={{ fontSize: 12 }}>Отмена</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onStartEdit} className="outline notes-touch-btn" style={{ fontSize: 12 }} title="Редактировать">✎</button>
            <button type="button" onClick={onTogglePin} className="outline notes-touch-btn" style={{ fontSize: 12 }} title={note.pinned ? 'Открепить' : 'Закрепить'}>{note.pinned ? '📌' : '📍'}</button>
            <details
              ref={overflowRef}
              className="note-card__overflow"
              open={overflowOpen}
              onToggle={(e) => setOverflowOpen((e.target as HTMLDetailsElement).open)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeOverflow();
                }
              }}
            >
              <summary title="Ещё действия" aria-expanded={overflowOpen} aria-haspopup="menu">
                ⋯
              </summary>
              <div className="note-card__overflow-panel">
                <button type="button" onClick={() => { onDuplicate(); closeOverflow(); }} className="notes-touch-btn outline" style={{ fontSize: 12 }} title="Дублировать">📋 Дублировать</button>
                <button type="button" onClick={() => { onExport(); closeOverflow(); }} className="notes-touch-btn outline" style={{ fontSize: 12 }} title="Скачать">⬇ Скачать</button>
                <label style={{ fontSize: 11, color: 'var(--pico-muted-color)' }}>Папка</label>
                <select
                  value={note.folderId ?? '__root__'}
                  onChange={(e) => {
                    onMove(e.target.value === '__root__' ? null : e.target.value);
                    closeOverflow();
                  }}
                  className="notes-touch-btn"
                  style={{ fontSize: 11 }}
                  title="Переместить"
                >
                  <option value="__root__">/ корень</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button type="button" onClick={() => { onArchive(); closeOverflow(); }} className="notes-touch-btn outline" style={{ fontSize: 12 }} title={note.archived ? 'Разархивировать' : 'Архивировать'}>📦 {note.archived ? 'Разархивировать' : 'В архив'}</button>
                {confirmDelete ? (
                  <NotesInlineConfirm
                    message="Удалить эту заметку?"
                    onConfirm={() => { onDelete(); closeOverflow(); }}
                    onCancel={() => setConfirmDelete(false)}
                  />
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="notes-touch-btn outline secondary" style={{ fontSize: 12 }} title="Удалить">✕ Удалить</button>
                )}
              </div>
            </details>
          </>
        )}
      </div>
      <div className="note-card__body">
        {isEditing ? (
          <>
            <input type="text" placeholder="Заголовок" value={editTitle} onChange={e => onEditTitleChange(e.target.value)}
              style={{ width: '100%', marginBottom: 8, fontSize: 18, fontWeight: 600, border: 'none', borderBottom: '1px solid var(--pico-border-color)', background: 'transparent', padding: '4px 0', color: 'var(--pico-color)' }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <TagInput tags={editTags} onChange={onEditTagsChange} />
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {NOTE_COLORS.map(c => (
                  <span key={c.id} onClick={() => onEditColorChange(c.id)} title={c.label}
                    style={{ width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', border: editColor === c.id ? '2px solid var(--pico-primary)' : '1px solid var(--pico-border-color)', background: c.css === 'transparent' ? 'var(--pico-card-background-color)' : c.css }} />
                ))}
              </div>
            </div>
            <RichTextEditor key={note.id} value={editContent} onChange={onEditContentChange} placeholder="Текст заметки..." minHeight={180} />
            <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--pico-border-color)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Список дел</div>
              {editTodos.map((todo, ti) => (
                <div key={todo.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={todo.text}
                    onChange={e => onEditTodosChange(editTodos.map((t, i) => i === ti ? { ...t, text: e.target.value } : t))}
                    placeholder="Пункт"
                    style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
                  />
                  <button type="button" onClick={() => onEditTodosChange(editTodos.filter((_, i) => i !== ti))} className="notes-touch-btn outline" style={{ fontSize: 12, color: 'var(--color-danger)' }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => onEditTodosChange([...editTodos, { id: makeTodoId(), text: '' }])} className="outline notes-touch-btn" style={{ fontSize: 12, padding: '6px 12px', marginTop: 4 }}>+ Добавить пункт</button>
            </div>
          </>
        ) : (
          <>
            {note.title && <h2 className="note-card__title">{note.title}</h2>}
            <div className="note-card__meta">
              <span>{new Date(note.updatedAt).toLocaleString('ru-RU')}</span>
              <span>{wordCount} слов</span>
            </div>
            {note.tags && note.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
                {note.tags.map(t => <span key={t} className="tag-chip">#{t}</span>)}
              </div>
            )}
            {note.content ? (
              <div
                ref={contentRef}
                className="note-content"
                style={{ lineHeight: 1.7, fontSize: 15 }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }}
              />
            ) : (
              <p className="note-card__empty">Пустая заметка</p>
            )}
            {note.todos && note.todos.length > 0 && <NoteTodoBlock noteId={note.id} todos={note.todos} />}
          </>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════ Main NotesPage ═══════════════════ */

const NOTES_PUSH_DELAY_MS = 6000;

const NotesPage: React.FC<{ dataVersion?: number }> = ({ dataVersion }) => {
  const [notes, setNotes] = useState<Note[]>(() => load<Note[]>(NOTES_KEY, []).map(normalizeNote));
  const [folders, setFolders] = useState<NoteFolder[]>(() => load(FOLDERS_KEY, []));
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editColor, setEditColor] = useState('none');
  const [editTodos, setEditTodos] = useState<NoteTodoItem[]>([]);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [showArchived, setShowArchived] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [notesViewMode, setNotesViewModeState] = useState<NotesViewMode>(() => loadNotesViewMode());
  const [gridFocusId, setGridFocusId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'loading' | 'sending' | 'ok' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const importInputRef = useRef<HTMLInputElement>(null);
  const folderImportRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const detailPaneRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingSyncRef = useRef(false);
  const justPushedRef = useRef(false);

  const markDirty = useCallback(() => {
    pendingSyncRef.current = true;
  }, []);

  const showBanner = useCallback((kind: 'ok' | 'err', text: string) => {
    setBanner({ kind, text });
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (newFolderOpen) newFolderInputRef.current?.focus();
  }, [newFolderOpen]);

  const setNotesViewMode = useCallback((m: NotesViewMode) => {
    setNotesViewModeState(m);
    try {
      localStorage.setItem(NOTES_VIEW_MODE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const err = save(NOTES_KEY, notes);
    setSaveError(err);
  }, [notes]);
  useEffect(() => { save(FOLDERS_KEY, folders); }, [folders]);

  const runPullMergePush = useCallback(async () => {
    setSyncStatus('loading');
    setSyncError(null);
    const remoteR = await fetchNotesFromRepo();
    if (!remoteR.ok) {
      const err = remoteR.error ?? 'Ошибка загрузки из репозитория';
      setSyncStatus('error');
      setSyncError(err);
      toastError(err);
      return;
    }
    setSyncStatus('sending');
    const merged = mergeNotes(
      remoteR.notes as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
      remoteR.folders as Array<{ id?: string; [k: string]: unknown }>,
      notes as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
      folders as Array<{ id?: string; [k: string]: unknown }>
    );
    const result = await pushNotesMerged(merged.notes, merged.folders);
    if (result.ok) {
      const normalized = (merged.notes as Note[]).map(normalizeNote);
      setNotes(normalized);
      setFolders(merged.folders as NoteFolder[]);
      pendingSyncRef.current = false;
      justPushedRef.current = true;
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
      setSyncStatus('error');
      const err = result.error ?? 'Ошибка сохранения в репозиторий';
      setSyncError(err);
      toastError(err);
    }
  }, [notes, folders]);

  useEffect(() => {
    if (justPushedRef.current) {
      justPushedRef.current = false;
      return;
    }
    if (!getSyncConfig() || !pendingSyncRef.current) return;
    setSyncStatus('pending');
    schedulePushWithDelay('notes', NOTES_PUSH_DELAY_MS, runPullMergePush);
  }, [notes, folders, runPullMergePush]);

  const handleSyncNow = useCallback(() => {
    cancelScheduledPush('notes');
    setSyncStatus('pending');
    void runPullMergePush();
  }, [runPullMergePush]);

  const handlePullFromRepo = useCallback(async () => {
    cancelScheduledPush('notes');
    setSyncStatus('loading');
    setSyncError(null);
    const remoteR = await fetchNotesFromRepo();
    if (remoteR.ok) {
      const merged = mergeNotes(
        remoteR.notes as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
        remoteR.folders as Array<{ id?: string; [k: string]: unknown }>,
        notes as Array<{ id?: string; updatedAt?: number; [k: string]: unknown }>,
        folders as Array<{ id?: string; [k: string]: unknown }>
      );
      const normalized = (merged.notes as Note[]).map(normalizeNote);
      justPushedRef.current = true;
      setNotes(normalized);
      setFolders(merged.folders as NoteFolder[]);
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } else {
      const err = remoteR.error ?? 'Ошибка загрузки из репозитория';
      setSyncStatus('error');
      setSyncError(err);
      toastError(err);
    }
  }, [notes, folders]);

  const handleCancelPush = useCallback(() => {
    cancelScheduledPush('notes');
    setSyncStatus('idle');
    setSyncError(null);
  }, []);

  // При первом открытии подгрузить data/notes.json (только без настроенной синхронизации)
  useEffect(() => {
    if (getSyncConfig()) return;
    loadNotesBundle().then((seeded) => {
      if (seeded) {
        justPushedRef.current = true;
        setNotes(load<Note[]>(NOTES_KEY, []).map(normalizeNote));
        setFolders(load(FOLDERS_KEY, []));
      }
    });
  }, []);

  // После загрузки бандла в main — подтянуть данные из localStorage
  useEffect(() => {
    if (dataVersion == null) return;
    justPushedRef.current = true;
    setNotes(load<Note[]>(NOTES_KEY, []).map(normalizeNote));
    setFolders(load(FOLDERS_KEY, []));
    pendingSyncRef.current = false;
  }, [dataVersion]);

  // Migrate old v1
  useEffect(() => {
    const old = localStorage.getItem('igor-notes');
    if (old) {
      try {
        const arr: Note[] = JSON.parse(old);
        if (Array.isArray(arr) && arr.length > 0) {
          setNotes(prev => { const ids = new Set(prev.map(n => n.id)); return [...prev, ...arr.filter(n => !ids.has(n.id)).map(n => normalizeNote({ ...n, archived: false }))]; });
        }
      } catch { /* skip */ }
      localStorage.removeItem('igor-notes');
    }
  }, []);

  const activeNotes = useMemo(() => notes.filter((n) => !n.deleted), [notes]);

  // All tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of activeNotes) for (const t of (n.tags ?? [])) set.add(t);
    return [...set].sort();
  }, [activeNotes]);

  // Filtered + sorted notes
  const visibleNotes = useMemo(() => {
    let list = activeNotes;
    if (!showArchived) list = list.filter(n => !n.archived);
    else list = list.filter(n => n.archived);
    if (selectedFolder !== null) list = list.filter(n => n.folderId === selectedFolder);
    if (filterTag) list = list.filter(n => n.tags?.includes(filterTag));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.content.replace(/<[^>]*>/g, ' ').toLowerCase().includes(q) || n.tags?.some(t => t.includes(q)));
    }
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (sortMode === 'title') return (a.title || a.id).localeCompare(b.title || b.id);
      if (sortMode === 'color') return (a.color ?? '').localeCompare(b.color ?? '') || b.updatedAt - a.updatedAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [activeNotes, selectedFolder, search, sortMode, showArchived, filterTag]);

  useEffect(() => {
    if (notesViewMode !== 'grid') return;
    setGridFocusId((prev) => {
      if (prev && visibleNotes.some((n) => n.id === prev)) return prev;
      return visibleNotes[0]?.id ?? null;
    });
  }, [notesViewMode, visibleNotes]);

  const treeNotes = useMemo(() => activeNotes.filter(n => !n.archived), [activeNotes]);

  // CRUD
  const createNote = useCallback((initialContent = '') => {
    const note: Note = { id: makeNoteId(), title: '', content: initialContent, folderId: selectedFolder, createdAt: Date.now(), updatedAt: Date.now(), tags: [], color: 'none', todos: [] };
    markDirty();
    setNotes(prev => [note, ...prev]);
    setEditingId(note.id);
    setEditTitle(''); setEditContent(initialContent); setEditTags([]); setEditColor('none'); setEditTodos([]);
    setGridFocusId(note.id);
    setTimeout(() => {
      if (notesViewMode === 'grid') {
        detailPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        cardRefs.current.get(note.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  }, [selectedFolder, notesViewMode, markDirty]);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const autoTags = extractTags(editContent);
    const finalTags = mergeTags(editTags, autoTags);
    const todosToSave = editTodos.filter(t => (t.text || '').trim()).map(t => ({ ...t, text: t.text.trim() }));
    markDirty();
    setNotes(prev => prev.map(n => n.id === editingId ? { ...n, title: editTitle.trim() || 'Без заголовка', content: editContent, tags: finalTags, color: editColor, todos: todosToSave.length > 0 ? todosToSave : undefined, updatedAt: Date.now() } : n));
    setEditingId(null);
  }, [editingId, editTitle, editContent, editTags, editColor, editTodos]);

  const startEdit = useCallback((note: Note) => {
    if (editingId && editingId !== note.id) saveEdit();
    setEditingId(note.id);
    setEditTitle(note.title); setEditContent(note.content); setEditTags(note.tags ?? []); setEditColor(note.color ?? 'none'); setEditTodos(note.todos ?? []);
  }, [editingId, saveEdit]);

  const cancelEdit = useCallback(() => { setEditingId(null); }, []);

  const deleteNote = useCallback((id: string) => {
    markDirty();
    const now = Date.now();
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, deleted: true, updatedAt: now } : n)));
    if (editingId === id) setEditingId(null);
  }, [editingId, markDirty]);

  const archiveNote = useCallback((id: string) => {
    markDirty();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, archived: !n.archived, updatedAt: Date.now() } : n));
  }, [markDirty]);

  const togglePin = useCallback((id: string) => {
    markDirty();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n));
  }, [markDirty]);

  const duplicateNote = useCallback((id: string) => {
    const src = notes.find(n => n.id === id);
    if (!src) return;
    const copy: Note = { ...src, id: makeNoteId() + '_dup', title: src.title + ' (копия)', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, deleted: false, todos: src.todos?.length ? src.todos.map(t => ({ ...t, id: makeTodoId() })) : undefined };
    markDirty();
    setNotes(prev => [copy, ...prev]);
  }, [notes, markDirty]);

  const moveToFolder = useCallback((noteId: string, folderId: string | null) => {
    markDirty();
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folderId, updatedAt: Date.now() } : n));
  }, [markDirty]);

  const moveFolderTo = useCallback((folderId: string, targetParentId: string | null) => {
    markDirty();
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, parentId: targetParentId } : f));
    if (targetParentId) {
      setExpandedFolders(prev => { const s = new Set(prev); s.add(targetParentId); return s; });
    }
  }, [markDirty]);

  const exportNote = useCallback((note: Note) => {
    const text = note.content.replace(/<[^>]*>/g, '');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (note.title || note.id) + '.txt'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (editingId) saveEdit(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editingId, saveEdit]);

  // Global paste: image → new note
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (editingId) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const dataUrl = await fileToDataUrl(file);
          const resized = await resizeImage(dataUrl);
          createNote(`<img src="${resized}" alt="image" />`);
          break;
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [editingId, createNote]);

  // Folders
  const submitNewFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) {
      setNewFolderOpen(false);
      setNewFolderName('');
      return;
    }
    markDirty();
    const folder: NoteFolder = { id: makeFolderId(), name, parentId: selectedFolder };
    setFolders(prev => [...prev, folder]);
    setExpandedFolders(prev => { const s = new Set(prev); s.add(folder.id); return s; });
    setNewFolderOpen(false);
    setNewFolderName('');
  }, [newFolderName, selectedFolder, markDirty]);

  const cancelNewFolder = useCallback(() => {
    setNewFolderOpen(false);
    setNewFolderName('');
  }, []);

  const renameFolder = (id: string, name: string) => { markDirty(); setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f)); };

  const deleteFolder = (id: string) => {
    const f = folders.find(x => x.id === id);
    if (!f) return;
    markDirty();
    setNotes(prev => prev.map(n => n.folderId === id ? { ...n, folderId: f.parentId } : n));
    setFolders(prev => prev.map(x => x.parentId === id ? { ...x, parentId: f.parentId } : x).filter(x => x.id !== id));
    if (selectedFolder === id) setSelectedFolder(f.parentId);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  // Import files
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const imported: Note[] = [];
    for (const file of files) {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        try { imported.push(...parseTelegramExport(text)); } catch { showBanner('err', `Ошибка импорта: ${file.name}`); }
      } else {
        const now = Date.now();
        imported.push({ id: makeNoteId() + '_' + Math.random().toString(36).slice(2, 5), title: file.name.replace(/\.(md|txt)$/i, ''), content: `<p>${text.replace(/\n/g, '</p><p>')}</p>`, folderId: selectedFolder, tags: [], createdAt: now, updatedAt: now });
      }
    }
    if (imported.length > 0) {
      for (const n of imported) n.folderId = selectedFolder;
      markDirty();
      setNotes(prev => [...imported, ...prev]);
      showBanner('ok', `Импортировано: ${imported.length} заметок`);
    }
    e.target.value = '';
  };

  // Import folder (webkitdirectory)
  const handleFolderImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const result = await importFolderFiles(files, selectedFolder, folders);
      if (result.folders.length > 0 || result.notes.length > 0) {
        markDirty();
        setFolders(prev => [...prev, ...result.folders]);
        setNotes(prev => [...result.notes, ...prev]);
        const newExpanded = new Set(expandedFolders);
        for (const f of result.folders) newExpanded.add(f.id);
        setExpandedFolders(newExpanded);
        showBanner('ok', `Импортировано: ${result.folders.length} папок, ${result.notes.length} заметок`);
      } else {
        showBanner('err', 'Не найдено подходящих файлов (.md, .txt, .json)');
      }
    } catch {
      showBanner('err', 'Ошибка при импорте папки');
    }
    e.target.value = '';
  };

  const scrollToNote = useCallback((id: string) => {
    if (editingId && editingId !== id) saveEdit();
    const note = notes.find(n => n.id === id);
    if (note) {
      if (selectedFolder !== null && note.folderId !== selectedFolder) {
        setSelectedFolder(null);
      }
      if (note.archived && !showArchived) {
        setShowArchived(true);
      }
    }
    if (notesViewMode === 'grid') {
      setGridFocusId(id);
      setTimeout(() => {
        detailPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }
    setTimeout(() => {
      const el = cardRefs.current.get(id) ?? document.getElementById(`note-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [editingId, saveEdit, notes, selectedFolder, showArchived, notesViewMode]);

  const renderNoteCard = (note: Note) => (
    <NoteCard
      key={note.id}
      note={note}
      folders={folders}
      isEditing={editingId === note.id}
      editTitle={editTitle}
      editContent={editContent}
      editTags={editTags}
      editColor={editColor}
      editTodos={editTodos}
      onStartEdit={() => startEdit(note)}
      onSave={saveEdit}
      onCancel={cancelEdit}
      onDelete={() => deleteNote(note.id)}
      onArchive={() => archiveNote(note.id)}
      onTogglePin={() => togglePin(note.id)}
      onDuplicate={() => duplicateNote(note.id)}
      onMove={(fid) => moveToFolder(note.id, fid)}
      onExport={() => exportNote(note)}
      onEditTitleChange={setEditTitle}
      onEditContentChange={setEditContent}
      onEditTagsChange={setEditTags}
      onEditColorChange={setEditColor}
      onEditTodosChange={setEditTodos}
      cardRef={(el) => {
        if (el) cardRefs.current.set(note.id, el);
        else cardRefs.current.delete(note.id);
      }}
    />
  );

  /* ═══════════════════ Render ═══════════════════ */

  return (
    <div className="notes-layout">
      {/* Sidebar */}
      <div className="notes-sidebar notes-sidebar-width">
        <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid var(--pico-border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <a href="/" style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>← Главная</a>
            <strong style={{ fontSize: 13 }}>Заметки</strong>
          </div>
          <input type="search" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 6, padding: '8px 10px', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button type="button" onClick={() => createNote()} className="notes-touch-btn" style={{ flex: 1, fontSize: 12 }}>+ Заметка</button>
            <button type="button" onClick={() => { setNewFolderOpen(true); setNewFolderName(''); }} className="notes-touch-btn secondary" style={{ flex: 1, fontSize: 12 }} disabled={newFolderOpen}>+ Папка</button>
          </div>
          {newFolderOpen && (
            <div className="notes-new-folder">
              <input
                ref={newFolderInputRef}
                type="text"
                placeholder="Название папки"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitNewFolder();
                  if (e.key === 'Escape') cancelNewFolder();
                }}
              />
              <div className="notes-new-folder__actions">
                <button type="button" className="notes-touch-btn" onClick={submitNewFolder}>Создать</button>
                <button type="button" className="notes-touch-btn secondary" onClick={cancelNewFolder}>Отмена</button>
              </div>
            </div>
          )}
          {banner && (
            <p className={`notes-banner notes-banner--${banner.kind}`} role="status">{banner.text}</p>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <button onClick={() => importInputRef.current?.click()} className="notes-touch-btn outline" style={{ flex: 1, fontSize: 11 }}>
              Импорт файлов
            </button>
            <button onClick={() => folderImportRef.current?.click()} className="notes-touch-btn outline" style={{ flex: 1, fontSize: 11 }}>
              Импорт папки
            </button>
          </div>
          {getSyncConfig() && (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--pico-muted-color)' }}>
                Изменения с телефона и с компьютера объединяются по времени; удаления сохраняются в репо.
              </p>
              {(syncStatus !== 'idle' || syncError) && (
                <div
                  aria-live="polite"
                  style={{ marginBottom: 6, fontSize: 11, color: syncStatus === 'error' ? 'var(--pico-del-color)' : 'var(--pico-muted-color)' }}
                >
                  {syncStatus === 'pending' && `Через ${NOTES_PUSH_DELAY_MS / 1000} сек сохранение в репо (сначала загрузка из репо и объединение).`}
                  {syncStatus === 'loading' && 'Загрузка из репо…'}
                  {syncStatus === 'sending' && 'Сохранение в репо…'}
                  {syncStatus === 'ok' && 'Сохранено в репо.'}
                  {syncStatus === 'error' && syncError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {syncStatus === 'pending' && (
                  <>
                    <button type="button" onClick={handleSyncNow} className="notes-touch-btn" style={{ flex: 1, fontSize: 11 }}>Сохранить в репо</button>
                    <button type="button" onClick={handleCancelPush} className="notes-touch-btn secondary" style={{ flex: 1, fontSize: 11 }}>Отменить</button>
                  </>
                )}
                <button type="button" onClick={() => void handlePullFromRepo()} disabled={syncStatus === 'loading'} className="notes-touch-btn outline" style={{ flex: 1, fontSize: 11 }} title="Загрузить из репо и объединить с локальными">
                  {syncStatus === 'loading' ? 'Загрузка…' : 'Загрузить из репо'}
                </button>
              </div>
            </>
          )}
          {saveError && <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--pico-del-color)' }}>{saveError}</p>}
          <button onClick={downloadNotesBundle} className="notes-touch-btn outline" style={{ width: '100%', marginBottom: 4, fontSize: 11 }} title="Скачать notes.json для public/data/">
            Экспорт для GitHub
          </button>
          <input ref={importInputRef} type="file" accept=".md,.txt,.json" multiple onChange={handleImport} style={{ display: 'none' }} />
          <input ref={folderImportRef} type="file" onChange={handleFolderImport} style={{ display: 'none' }}
            {...{ webkitdirectory: '', directory: '' } as any} />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
            <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} style={{ flex: 1, padding: '2px 4px', fontSize: 11 }}>
              <option value="date">По дате</option>
              <option value="title">По заголовку</option>
              <option value="color">По цвету</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} style={{ width: 14, height: 14 }} />
              📦
            </label>
          </div>
        </div>

        {/* Tag cloud */}
        {allTags.length > 0 && (
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--pico-border-color)', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <button type="button" className="tag-chip" onClick={() => setFilterTag(null)}
              style={filterTag === null ? { background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)' } : {}}>все</button>
            {allTags.map(t => (
              <button key={t} type="button" className="tag-chip" onClick={() => setFilterTag(filterTag === t ? null : t)}
                style={filterTag === t ? { background: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)' } : {}}>#{t}</button>
            ))}
          </div>
        )}

        {/* Folder tree with inline notes */}
        <FolderTree folders={folders} notes={treeNotes} selectedFolder={selectedFolder} expandedFolders={expandedFolders}
          editingId={editingId} onSelectFolder={setSelectedFolder} onToggle={toggleFolder} onRename={renameFolder} onDeleteFolder={deleteFolder}
          onScrollToNote={scrollToNote} onMoveNote={moveToFolder} onMoveFolder={moveFolderTo} />
      </div>

      {/* Main: list or grid + detail */}
      <div ref={feedRef} className="notes-feed-bg">
        <div className="notes-view-toggle">
          <span className="notes-view-toggle-label">Вид</span>
          <button type="button" className={notesViewMode === 'list' ? 'is-active' : ''} onClick={() => { if (editingId) saveEdit(); setNotesViewMode('list'); }}>
            Список
          </button>
          <button type="button" className={notesViewMode === 'grid' ? 'is-active' : ''} onClick={() => { if (editingId) saveEdit(); setNotesViewMode('grid'); }}>
            Плитка
          </button>
        </div>

        {visibleNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--pico-muted-color)' }}>
            <span style={{ fontSize: 48, opacity: 0.3, display: 'block', marginBottom: 12 }}>📝</span>
            <p>{search ? 'Ничего не найдено' : showArchived ? 'Нет архивных заметок.' : 'Нет заметок. Создайте первую или вставьте картинку (Ctrl+V).'}</p>
            {!showArchived && <button type="button" onClick={() => createNote()} style={{ fontSize: 13 }}>+ Новая заметка</button>}
          </div>
        ) : notesViewMode === 'list' ? (
          <div className="notes-feed notes-feed--list">
            {visibleNotes.map((note) => renderNoteCard(note))}
          </div>
        ) : (
          <div className="notes-main-inner notes-main--split">
            <div className="notes-feed--grid-wrap">
              <div className="notes-feed--grid">
                {visibleNotes.map((note) => (
                  <NotePreviewTile
                    key={note.id}
                    note={note}
                    isSelected={gridFocusId === note.id}
                    onSelect={() => {
                      if (editingId && editingId !== note.id) saveEdit();
                      setGridFocusId(note.id);
                    }}
                  />
                ))}
              </div>
            </div>
            <div ref={detailPaneRef} className="notes-detail-pane">
              {(() => {
                const detail = gridFocusId ? visibleNotes.find((n) => n.id === gridFocusId) : null;
                if (!detail) {
                  return <div className="notes-detail-empty">Выберите заметку в плитке.</div>;
                }
                return renderNoteCard(detail);
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesPage;
