import { getDatabase, ref, get, set } from 'firebase/database';
import { getFirebaseApp } from './firebaseAuth';
import type { PlannerRepoData } from './githubSync';

export interface SyncResult {
  ok: boolean;
  error?: string;
}

function getDb() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase не инициализирован');
  const url = import.meta.env.VITE_FIREBASE_DATABASE_URL;
  return getDatabase(app, url || undefined);
}

function cleanUndefined<T>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null) return null as any;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as any;
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          res[key] = cleanUndefined(val);
        }
      }
    }
    return res;
  }
  return obj;
}

export async function getNotesFromFirebase(): Promise<{ notes: unknown[]; folders: unknown[] } | null> {
  try {
    const snap = await get(ref(getDb(), 'data/notes'));
    if (!snap.exists()) return null;
    return snap.val() as { notes: unknown[]; folders: unknown[] };
  } catch {
    return null;
  }
}

export async function pushNotesToFirebase(notes: unknown[], folders: unknown[]): Promise<SyncResult> {
  try {
    const data = cleanUndefined({ notes, folders, updatedAt: Date.now() });
    await set(ref(getDb(), 'data/notes'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getPostsFromFirebase(): Promise<unknown[] | null> {
  try {
    const snap = await get(ref(getDb(), 'data/posts'));
    if (!snap.exists()) return null;
    return snap.val() as unknown[];
  } catch {
    return null;
  }
}

export async function pushPostsToFirebase(posts: unknown[]): Promise<SyncResult> {
  try {
    const data = cleanUndefined(posts);
    await set(ref(getDb(), 'data/posts'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getDictionaryFromFirebase(): Promise<{ entries: unknown[]; priorityLangs: string[] } | null> {
  try {
    const snap = await get(ref(getDb(), 'data/dictionary'));
    if (!snap.exists()) return null;
    return snap.val() as { entries: unknown[]; priorityLangs: string[] };
  } catch {
    return null;
  }
}

export async function pushDictionaryToFirebase(entries: unknown[], priorityLangs: string[]): Promise<SyncResult> {
  try {
    const data = cleanUndefined({ entries, priorityLangs, updatedAt: Date.now() });
    await set(ref(getDb(), 'data/dictionary'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getLayoutsFromFirebase(): Promise<Record<string, unknown[]> | null> {
  try {
    const snap = await get(ref(getDb(), 'data/layouts'));
    if (!snap.exists()) return null;
    return snap.val() as Record<string, unknown[]>;
  } catch {
    return null;
  }
}

export async function pushLayoutsToFirebase(layouts: Record<string, unknown[]>): Promise<SyncResult> {
  try {
    const data = cleanUndefined(layouts);
    await set(ref(getDb(), 'data/layouts'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getPlannerFromFirebase(): Promise<PlannerRepoData | null> {
  try {
    const snap = await get(ref(getDb(), 'data/planner'));
    if (!snap.exists()) return null;
    return snap.val() as PlannerRepoData;
  } catch {
    return null;
  }
}

export async function pushPlannerToFirebase(tasks: unknown[], labels: unknown[] = []): Promise<SyncResult> {
  try {
    const data = cleanUndefined({ tasks, labels, updatedAt: Date.now() });
    await set(ref(getDb(), 'data/planner'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getCalculatorsJsonFromFirebase(): Promise<string | null> {
  try {
    const snap = await get(ref(getDb(), 'data/calculators'));
    if (!snap.exists()) return null;
    const data = snap.val();
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    return null;
  }
}

export async function pushCalculatorsToFirebase(bundleJson: string): Promise<SyncResult> {
  try {
    const parsed = JSON.parse(bundleJson);
    const data = cleanUndefined(parsed);
    await set(ref(getDb(), 'data/calculators'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getCvFromFirebase(): Promise<string | null> {
  try {
    const snap = await get(ref(getDb(), 'data/cv'));
    if (!snap.exists()) return null;
    return snap.val() as string;
  } catch {
    return null;
  }
}

export async function pushCvToFirebase(html: string): Promise<SyncResult> {
  try {
    const data = cleanUndefined(html);
    await set(ref(getDb(), 'data/cv'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getRssListsFromFirebase(): Promise<{ lists: unknown[] } | null> {
  try {
    const snap = await get(ref(getDb(), 'data/rssLists'));
    if (!snap.exists()) return null;
    return snap.val() as { lists: unknown[] };
  } catch {
    return null;
  }
}

export async function pushRssListsToFirebase(lists: unknown[]): Promise<SyncResult> {
  try {
    const data = cleanUndefined({ lists, updatedAt: Date.now() });
    await set(ref(getDb(), 'data/rssLists'), data);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface BoardMetadata {
  id: string;
  name: string;
  updatedAt: number;
}

export async function getBoardsMetadata(): Promise<Record<string, BoardMetadata> | null> {
  try {
    const snap = await get(ref(getDb(), 'data/boardsMetadata'));
    if (!snap.exists()) return null;
    return snap.val() as Record<string, BoardMetadata>;
  } catch {
    return null;
  }
}

export async function getBoardScene(boardId: string): Promise<any | null> {
  try {
    const snap = await get(ref(getDb(), `data/boards/${boardId}/scene`));
    if (!snap.exists()) return null;
    return snap.val();
  } catch {
    return null;
  }
}

export async function saveBoardToFirebase(boardId: string, name: string, scene: any): Promise<SyncResult> {
  try {
    const updatedAt = Date.now();
    const cleanScene = cleanUndefined(scene);
    
    // Сохраняем метаданные доски
    await set(ref(getDb(), `data/boardsMetadata/${boardId}`), { id: boardId, name, updatedAt });
    
    // Сохраняем саму доску со сценой
    await set(ref(getDb(), `data/boards/${boardId}`), {
      id: boardId,
      name,
      updatedAt,
      scene: cleanScene
    });
    
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBoardFromFirebase(boardId: string): Promise<SyncResult> {
  try {
    await set(ref(getDb(), `data/boardsMetadata/${boardId}`), null);
    await set(ref(getDb(), `data/boards/${boardId}`), null);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
