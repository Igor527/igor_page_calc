/**
 * Firebase Authentication для режима админа.
 * Конфиг из .env: VITE_FIREBASE_* и VITE_ADMIN_EMAIL (кто считается админом).
 * Если Firebase не настроен, админка включается по ?admin=1 (localStorage).
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GithubAuthProvider,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';

const ADMIN_FLAG = 'igor-page-calc-admin';

function getEnv(name: string): string {
  try {
    return String((import.meta.env as Record<string, unknown>)[name] ?? '').trim();
  } catch {
    return '';
  }
}

function isFirebaseConfigured(): boolean {
  return !!(
    getEnv('VITE_FIREBASE_API_KEY') &&
    getEnv('VITE_FIREBASE_AUTH_DOMAIN') &&
    getEnv('VITE_FIREBASE_PROJECT_ID')
  );
}

/** Список email'ов админов (через запятую в VITE_ADMIN_EMAIL или один email). */
function getAdminEmails(): string[] {
  const raw = getEnv('VITE_ADMIN_EMAIL');
  if (!raw) return [];
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Является ли пользователь админом по email (или по GitHub UID, если задан VITE_ADMIN_GITHUB_IDS). */
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  const adminEmails = getAdminEmails();
  const githubIds = getAdminGitHubIds();
  if (user.email && adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase())) return true;
  const ghUid = user.providerData?.find((p) => p.providerId === 'github.com')?.uid;
  if (ghUid != null && githubIds.length > 0 && githubIds.includes(String(ghUid))) return true;
  return false;
}

/** Список GitHub user ID админов (VITE_ADMIN_GITHUB_IDS через запятую). */
function getAdminGitHubIds(): string[] {
  const raw = getEnv('VITE_ADMIN_GITHUB_IDS');
  if (!raw) return [];
  return raw.split(',').map((e) => e.trim()).filter(Boolean);
}

/** Список email'ов ограниченных гостей (VITE_GUEST_EMAIL через запятую). Им доступны только списки дел и метеостанция. */
function getGuestEmails(): string[] {
  const raw = getEnv('VITE_GUEST_EMAIL');
  if (!raw) return [];
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Ограниченный гость: вход есть, но видит только планировщик (списки дел) и метеостанцию. Не админ. */
export function isLimitedGuestUser(user: User | null): boolean {
  if (!user?.email) return false;
  if (isAdminUser(user)) return false;
  const guestEmails = getGuestEmails();
  return guestEmails.length > 0 && guestEmails.includes(user.email.toLowerCase());
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** Результат редиректа (GitHub/Google) — запрашиваем один раз при первой инициализации Auth. */
let pendingRedirectResult: Promise<import('firebase/auth').UserCredential | null> | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  if (auth) return auth;
  const apiKey = getEnv('VITE_FIREBASE_API_KEY');
  const authDomain = getEnv('VITE_FIREBASE_AUTH_DOMAIN');
  const projectId = getEnv('VITE_FIREBASE_PROJECT_ID');
  const appId = getEnv('VITE_FIREBASE_APP_ID') || undefined;
  const measurementId = getEnv('VITE_FIREBASE_MEASUREMENT_ID') || undefined;
  app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    appId,
    measurementId: measurementId || undefined,
  });
  auth = getAuth(app);
  pendingRedirectResult = Promise.resolve().then(() => getRedirectResult(auth));
  return auth;
}

// Как только модуль загрузился (возврат с GitHub) — сразу инициализируем Auth и запрашиваем результат редиректа, пока URL не тронут
if (typeof window !== 'undefined' && isFirebaseConfigured()) {
  getFirebaseAuth();
}

export function subscribeToAuth(callback: (user: User | null) => void): (() => void) | null {
  const a = getFirebaseAuth();
  if (!a) return null;
  return onAuthStateChanged(a, callback);
}

/** Вход через Google (popup). В Firebase Console включите провайдер Google. Админ по VITE_ADMIN_EMAIL. */
export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const a = getFirebaseAuth();
  if (!a) return { ok: false, error: 'Firebase не настроен' };
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(a, provider);
    if (isAdminUser(cred.user) || isLimitedGuestUser(cred.user)) return { ok: true };
    const email = cred.user.email ?? '';
    await firebaseSignOut(a);
    return {
      ok: false,
      error: email
        ? `Этот аккаунт не в списке. Админ: VITE_ADMIN_EMAIL. Гость (только списки дел и метео): VITE_GUEST_EMAIL=${email}`
        : 'Этот аккаунт не в списке админов или гостей.',
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'auth/popup-closed-by-user') return { ok: false, error: 'Окно входа закрыто.' };
    const msg = err.message || 'Ошибка входа через Google';
    return { ok: false, error: msg };
  }
}

/** Вход через Google по редиректу (если popup даёт auth/internal-error). */
export async function signInWithGoogleRedirect(): Promise<string | null> {
  const a = getFirebaseAuth();
  if (!a) return 'Firebase не настроен';
  try {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(a, provider);
    return null;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'auth/operation-not-allowed') return 'В Firebase Console включите провайдер Google (Authentication → Sign-in method).';
    return err?.message ?? 'Ошибка редиректа Google';
  }
}

/** Вход через GitHub (popup). Может давать auth/internal-error в части браузеров. */
export async function signInWithGitHub(): Promise<{ ok: boolean; error?: string }> {
  const a = getFirebaseAuth();
  if (!a) return { ok: false, error: 'Firebase не настроен' };
  try {
    const provider = new GithubAuthProvider();
    const cred = await signInWithPopup(a, provider);
    if (isAdminUser(cred.user) || isLimitedGuestUser(cred.user)) return { ok: true };
    const ghUid = cred.user.providerData?.find((p) => p.providerId === 'github.com')?.uid ?? '';
    await firebaseSignOut(a);
    return {
      ok: false,
      error: ghUid
        ? `Этот аккаунт не в списке. Админ: VITE_ADMIN_EMAIL или VITE_ADMIN_GITHUB_IDS. Гость: VITE_GUEST_EMAIL (email после входа).`
        : 'Этот аккаунт не в списке админов или гостей.',
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'auth/popup-closed-by-user') return { ok: false, error: 'Окно входа закрыто.' };
    const msg = err.message || 'Ошибка входа через GitHub';
    return { ok: false, error: msg };
  }
}

/** Вход через GitHub по редиректу (страница уйдёт на GitHub, затем вернётся). Возвращает текст ошибки или null, если редирект запущен. */
export async function signInWithGitHubRedirect(): Promise<string | null> {
  const a = getFirebaseAuth();
  if (!a) return 'Firebase не настроен. Проверьте VITE_FIREBASE_* в .env.';
  try {
    const provider = new GithubAuthProvider();
    await signInWithRedirect(a, provider);
    return null;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'auth/operation-not-allowed') {
      return 'GitHub отключён в Firebase. Включите: Authentication → Sign-in method → GitHub → Enable.';
    }
    return err.message || 'Не удалось перейти на GitHub. Проверьте: Firebase → Authentication → Sign-in method → GitHub (Enable, Client ID и Secret).';
  }
}

const REDIRECT_PROVIDER_KEY = 'adminLoginRedirectProvider';

/** Обработать возврат после signInWithRedirect (Google или GitHub). Результат запрашивается один раз при первой инициализации Auth. */
export async function handleGitHubRedirectResult(): Promise<{ ok: boolean; error?: string; provider?: 'google' | 'github' } | null> {
  const a = getFirebaseAuth();
  if (!a || !pendingRedirectResult) return null;

  try {
    const cred = await pendingRedirectResult;
    pendingRedirectResult = null;
    if (!cred) return null;
    if (isAdminUser(cred.user) || isLimitedGuestUser(cred.user)) return { ok: true };
    const isGoogle = cred.user.providerData?.some((p) => p.providerId === 'google.com');
    const ghUid = cred.user.providerData?.find((p) => p.providerId === 'github.com')?.uid ?? '';
    await firebaseSignOut(a);
    const email = cred.user.email ?? '';
    if (isGoogle) {
      return {
        ok: false,
        error: email
          ? `Этот аккаунт не в списке. Админ: VITE_ADMIN_EMAIL. Гость: VITE_GUEST_EMAIL=${email}`
          : 'Добавьте email в VITE_ADMIN_EMAIL или VITE_GUEST_EMAIL в .env.',
        provider: 'google',
      };
    }
    return {
      ok: false,
      error: email
        ? `Этот аккаунт не в списке. Админ: VITE_ADMIN_GITHUB_IDS или VITE_ADMIN_EMAIL. Гость: VITE_GUEST_EMAIL=${email}`
        : `Добавьте в .env VITE_ADMIN_EMAIL / VITE_ADMIN_GITHUB_IDS или VITE_GUEST_EMAIL (email после входа).`,
      provider: 'github',
    };
  } catch (e: unknown) {
    pendingRedirectResult = null;
    const err = e as { code?: string; message?: string };
    const msg = err.message || 'Ошибка входа';
    const isInternal = String(msg).includes('auth/internal-error');
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const hint = host === '127.0.0.1'
      ? ' Откройте по http://localhost:5173 или добавьте 127.0.0.1 в Firebase → Authorized domains.'
      : isInternal
        ? ' Попробуйте: режим инкогнито, Chrome; для GitHub — обновить Client Secret в Firebase.'
        : '';
    let provider: 'google' | 'github' | undefined;
    try {
      const p = typeof window !== 'undefined' ? sessionStorage.getItem(REDIRECT_PROVIDER_KEY) : null;
      if (p === 'google') provider = 'google';
      else if (p === 'github') provider = 'github';
    } catch {}
    return { ok: false, error: msg + hint, provider };
  }
}

/** Вызвать перед signInWithGoogleRedirect, чтобы при ошибке после возврата показать подсказку для Google. */
export function setRedirectProvider(provider: 'google' | 'github'): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(REDIRECT_PROVIDER_KEY, provider);
  } catch {}
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const a = getFirebaseAuth();
  if (!a) return { ok: false, error: 'Firebase не настроен' };
  try {
    const cred = await signInWithEmailAndPassword(a, email, password);
    if (isAdminUser(cred.user) || isLimitedGuestUser(cred.user)) return { ok: true };
    await firebaseSignOut(a);
    return { ok: false, error: 'Этот аккаунт не в списке админов (VITE_ADMIN_EMAIL) или гостей (VITE_GUEST_EMAIL).' };
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Ошибка входа';
    return { ok: false, error: msg };
  }
}

export async function signOut(): Promise<void> {
  const a = getFirebaseAuth();
  if (a) await firebaseSignOut(a);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(ADMIN_FLAG);
}

export function setLegacyAdminFlag(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  if (value) localStorage.setItem(ADMIN_FLAG, '1');
  else localStorage.removeItem(ADMIN_FLAG);
}

export function getLegacyAdminFlag(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(ADMIN_FLAG) === '1';
}

/** Нужно ли показывать форму входа (Firebase настроен и задан хотя бы один админ — email или GitHub ID). */
export function useFirebaseAdmin(): boolean {
  return isFirebaseConfigured() && (getAdminEmails().length > 0 || getAdminGitHubIds().length > 0);
}
