import { getStorage, ref, uploadString, listAll, getDownloadURL, deleteObject, getBytes } from 'firebase/storage';
import { getFirebaseApp } from './firebaseAuth';

export interface SyncResult {
  ok: boolean;
  error?: string;
}

function getStore() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase не инициализирован');
  return getStorage(app);
}

/** 
 * Загрузить файл в Firebase Storage.
 * @param path Путь внутри Storage (например 'assets/schema.svg')
 * @param content Строка с содержимым (для текста)
 * @param contentType MIME тип (например 'image/svg+xml')
 */
export async function uploadAsset(path: string, content: string, contentType: string = 'text/plain'): Promise<SyncResult> {
  try {
    const storageRef = ref(getStore(), path);
    await uploadString(storageRef, content, 'raw', { contentType });
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Получить список файлов в папке Storage.
 * Возвращает массив объектов с именем файла и путем.
 */
export async function listAssets(folderPath: string): Promise<Array<{ name: string; path: string; fullPath: string; url?: string }> | null> {
  try {
    const folderRef = ref(getStore(), folderPath);
    const res = await listAll(folderRef);
    const items = await Promise.all(res.items.map(async (itemRef) => {
      return {
        name: itemRef.name,
        path: itemRef.fullPath,
        fullPath: itemRef.fullPath
      };
    }));
    return items;
  } catch (e) {
    console.error('Firebase listAssets error:', e);
    return null;
  }
}

/**
 * Удалить файл из Firebase Storage.
 */
export async function deleteAsset(path: string): Promise<SyncResult> {
  try {
    const storageRef = ref(getStore(), path);
    await deleteObject(storageRef);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Получить публичную ссылку на скачивание файла.
 */
export async function getAssetDownloadUrl(path: string): Promise<string | null> {
  try {
    const storageRef = ref(getStore(), path);
    return await getDownloadURL(storageRef);
  } catch (e) {
    console.error('Firebase getAssetDownloadUrl error:', e);
    return null;
  }
}

/**
 * Скачать текстовое содержимое файла из Storage.
 */
export async function getAssetContent(path: string): Promise<string | null> {
  try {
    const storageRef = ref(getStore(), path);
    const bytes = await getBytes(storageRef);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error('Firebase getAssetContent error:', e);
    return null;
  }
}
