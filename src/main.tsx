import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import WelcomePage from './app/welcome/WelcomePage';
import CalculatorsListPage from './app/calculators/CalculatorsListPage';
import { AdminLogin } from './components/AdminLogin';
import AdminSessionBanner from './components/AdminSessionBanner';
import AdminAccessDenied from './components/AdminAccessDenied';

const EditorPage = React.lazy(() => import('./app/admin/editor/page'));
const PublicCalculator = React.lazy(() => import('./app/public/PublicCalculator'));
const ReviewPanel = React.lazy(() => import('./app/admin/review/ReviewPanel'));
const PlannerPage = React.lazy(() => import('./app/planner/PlannerPage'));
const NotesPage = React.lazy(() => import('./app/admin/notes/NotesPage'));
const DrawingPage = React.lazy(() => import('./app/admin/drawing/DrawingPage'));
const DictionaryPage = React.lazy(() => import('./app/dictionary/DictionaryPage'));
const CvPage = React.lazy(() => import('./app/cv/CvPage'));
const WeatherPage = React.lazy(() => import('./app/weather/WeatherPage'));
const RssPage = React.lazy(() => import('./app/rss/RssPage'));
import { BlogList, BlogPostView, loadBlogBundle } from './app/blog/BlogPage';
import { loadDictionaryBundle, setDictionaryFromBundle } from './app/dictionary/DictionaryPage';
import { loadNotesBundle, applyNotesFromRepoData } from './app/admin/notes/NotesPage';
import { loadCalculator, getCalculatorBySlug, loadPublishedBundle, loadPublishedBundleFromContent } from './lib/calculatorStorage';
import { loadLayoutsBundle, setAllLayoutsFromBundle } from './lib/pageLayouts';
import { applyPlannerFromRepoData } from './app/planner/PlannerPage';
import {
  fetchNotesFromRepo,
  fetchPostsFromRepo,
  getDictionaryFromRepo,
  getLayoutsFromRepo,
  getPlannerFromRepo,
  getCalculatorsJsonFromRepo,
  getRssListsFromRepo,
  getCvFromRepo,
  getSyncConfig,
  cancelScheduledPush,
  testConnection,
} from './lib/githubSync';
import { GITHUB_SYNC_NOT_CONFIGURED } from './lib/syncAuthMessages';
import { setRssListsFromBundle } from './app/rss/RssPage';
import {
  subscribeToAuth,
  isAdminUser,
  isLimitedGuestUser,
  useFirebaseAdmin,
  setLegacyAdminFlag,
  getLegacyAdminFlag,
  signOut,
  handleGitHubRedirectResult,
} from './lib/firebaseAuth';

const ADMIN_REDIRECT_ERROR_KEY = 'adminLoginRedirectError';
const ADMIN_REDIRECT_PROVIDER_KEY = 'adminLoginRedirectProvider';

const linkStyle = { color: 'var(--color-accent)', textDecoration: 'underline' };
const linkToEditor = <a href="/editor" style={{ ...linkStyle, marginTop: 16, display: 'inline-block' }}>Вернуться в редактор</a>;
const linkToHome = <a href="/" style={linkStyle}>На главную</a>;

function getIsAdmin(firebaseUser: unknown): boolean {
  // Если залогинен админ через Firebase — безусловный успех
  if (useFirebaseAdmin() && firebaseUser && isAdminUser(firebaseUser as import('firebase/auth').User)) return true;
  // Иначе (для локальной разработки или гостевых сессий) проверяем локальный флаг
  return getLegacyAdminFlag();
}

/** Ограниченный гость: видит только планировщик и метеостанцию. */
function getIsLimitedGuest(firebaseUser: unknown): boolean {
  if (!useFirebaseAdmin() || !firebaseUser) return false;
  return isLimitedGuestUser(firebaseUser as import('firebase/auth').User);
}

function App() {
  const path = window.location.pathname;
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const wasFirebaseAdminRef = useRef(false);
  const [adminSessionExpired, setAdminSessionExpired] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAuth((user) => {
      setFirebaseUser(user);
      setIsAuthLoading(false);
    });
    
    // Если Firebase не настроен, subscribeToAuth вернет null. 
    // В этом случае мы сразу снимаем флаг загрузки, чтобы не застрять на экране проверки.
    if (!unsub) {
      setIsAuthLoading(false);
    }
    
    // Глобальный фоллбэк для картинок. Если картинка из /assets/ не найдена (404, например на localhost 
    // до скачивания, или на проде до окончания деплоя), мы подменяем src на сырой GitHub URL.
    const handleImageError = (e: ErrorEvent) => {
      const target = e.target as HTMLImageElement;
      if (target && target.tagName === 'IMG' && target.src && target.src.includes('/assets/') && !target.dataset.fallbackAttempted) {
        target.dataset.fallbackAttempted = "true";
        try {
          const cfgStr = localStorage.getItem('igor-github-sync-config');
          if (cfgStr) {
            const cfg = JSON.parse(cfgStr);
            if (cfg.owner && cfg.repo && cfg.token) {
              const filename = target.src.substring(target.src.lastIndexOf('/assets/') + '/assets/'.length);
              fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/public/assets/${encodeURIComponent(filename)}?ref=${encodeURIComponent(cfg.branch || 'main')}`, {
                headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${cfg.token}` }
              }).then(res => res.json()).then(data => {
                if (data && data.content) {
                  // GitHub API возвращает контент в base64
                  const mime = filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
                  target.src = `data:${mime};base64,${data.content.replace(/\\n/g, '')}`;
                }
              }).catch(() => {});
            }
          }
        } catch {}
      }
    };
    window.addEventListener('error', handleImageError as EventListener, true); // capture phase

    return () => {
      unsub?.();
      window.removeEventListener('error', handleImageError as EventListener, true);
    };
  }, []);

  useEffect(() => {
    if (!useFirebaseAdmin()) return;
    const isFirebaseAdminNow = !!(firebaseUser && isAdminUser(firebaseUser));
    if (wasFirebaseAdminRef.current && !isFirebaseAdminNow && !isAuthLoading) {
      setAdminSessionExpired(true);
    }
    if (isFirebaseAdminNow) {
      wasFirebaseAdminRef.current = true;
      setAdminSessionExpired(false);
    }
  }, [firebaseUser, isAuthLoading]);

  const withSessionBanner = (content: React.ReactNode) => (
    <>
      {adminSessionExpired && (
        <AdminSessionBanner onDismiss={() => setAdminSessionExpired(false)} />
      )}
      {content}
    </>
  );

  // Обработка возврата с GitHub после редиректа (на любой странице)
  useEffect(() => {
    if (!useFirebaseAdmin()) return;
    handleGitHubRedirectResult().then((res) => {
      if (res?.ok) window.location.replace('/');
      if (res && !res.ok && res.error) {
        try {
          sessionStorage.setItem(ADMIN_REDIRECT_ERROR_KEY, res.error);
          if (res.provider) sessionStorage.setItem(ADMIN_REDIRECT_PROVIDER_KEY, res.provider);
        } catch {}
        window.location.replace('/welcome_me');
      }
    });
  }, []);

  // Выход из режима админа: дожидаемся signOut, затем редирект
  if (path === '/' && search === '?admin=0') {
    signOut()
      .then(() => window.location.replace('/'))
      .catch(() => window.location.replace('/'));
    return null;
  }

  // Редрект старой ссылки входа на новый адрес
  if (path === '/' && search === '?admin=1') {
    window.location.replace('/welcome_me');
    return null;
  }

  // Вход в админку: /welcome_me (прямая ссылка, на сайте не светится)
  if (path === '/welcome_me') {
    if (useFirebaseAdmin()) {
      if (firebaseUser && (isAdminUser(firebaseUser) || isLimitedGuestUser(firebaseUser))) {
        window.location.replace('/');
        return null;
      }
      return (
        <div style={{ padding: '40px 20px' }}>
          <AdminLogin
            onSuccess={() => window.location.replace('/')}
            onCancel={() => window.location.replace('/')}
          />
        </div>
      );
    }
    // Без Firebase: legacy-режим только на localhost (для разработки). На проде — не даём админку по прямой ссылке
    const isLocalhost = typeof window !== 'undefined' && /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname);
    if (isLocalhost) {
      setLegacyAdminFlag(true);
      window.location.replace('/');
      return null;
    }
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 16 }}>Вход в режим админа</h2>
        <p style={{ color: 'var(--pico-muted-color)', marginBottom: 24 }}>
          На продакшене нужна настройка Firebase (VITE_FIREBASE_* и VITE_ADMIN_EMAIL в секретах сборки). Локально на localhost админка включается автоматически по этой ссылке.
        </p>
        <a href="/" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>На главную</a>
      </div>
    );
  }

  const isAdmin = getIsAdmin(firebaseUser);
  const isLimitedGuest = getIsLimitedGuest(firebaseUser);

  // Загружаем данные: сначала статические файлы сайта, затем при админе и настроенной синхронизации — из репо по API (источник истины при входе в админку)
  const [bundleTick, setBundleTick] = useState(0);
  useEffect(() => {
    // При настроенной синхронизации словарь грузим только из репо (pullAllFromRepo), иначе статический файл перезатрёт данные из репо после обновления страницы
    const dictLoad = getSyncConfig() ? Promise.resolve() : loadDictionaryBundle();
    Promise.all([
      loadPublishedBundle(),
      loadBlogBundle(),
      loadNotesBundle(),
      loadLayoutsBundle(),
      dictLoad,
    ]).then(() => {
      startTransition(() => setBundleTick((n) => n + 1));
    });
  }, []);

  const pullAllFromRepo = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!getSyncConfig()) return { ok: false, error: GITHUB_SYNC_NOT_CONFIGURED };
    const conn = await testConnection();
    if (!conn.ok) return { ok: false, error: conn.error };

    const notesR = await fetchNotesFromRepo();
    if (!notesR.ok) return { ok: false, error: notesR.error };
    applyNotesFromRepoData(notesR);

    const cv = await getCvFromRepo();
    if (typeof cv === 'string') {
      try { localStorage.setItem('igor-cv-html', cv); } catch {}
    }
    const postsR = await fetchPostsFromRepo();
    if (!postsR.ok) return { ok: false, error: postsR.error };
    try { localStorage.setItem('igor-blog', JSON.stringify(postsR.posts)); } catch {}

    const dict = await getDictionaryFromRepo();
    if (dict) setDictionaryFromBundle(dict);
    const layouts = await getLayoutsFromRepo();
    if (layouts) setAllLayoutsFromBundle(layouts as Record<string, import('./lib/pageLayouts').PageSection[]>);
    const planner = await getPlannerFromRepo();
    if (planner) applyPlannerFromRepoData(planner);
    const calcJson = await getCalculatorsJsonFromRepo();
    if (calcJson) loadPublishedBundleFromContent(calcJson);
    const rssData = await getRssListsFromRepo();
    if (rssData) setRssListsFromBundle(rssData);
    ['notes', 'dictionary', 'planner', 'cv', 'blog', 'rss'].forEach(cancelScheduledPush);
    startTransition(() => setBundleTick((n) => n + 1));
    return { ok: true };
  }, []);

  useEffect(() => {
    if (!isAdmin || !getSyncConfig()) return;
    void pullAllFromRepo();
  }, [isAdmin, pullAllFromRepo]);

  if (isAuthLoading && path !== '/') {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--pico-muted-color)' }}>Проверка авторизации...</div>;
  }

  if (path.startsWith('/admin/notes')) {
    if (!isAdmin) {
      return withSessionBanner(
        <AdminAccessDenied resourceLabel="Заметки" sessionExpired={adminSessionExpired} linkToHome={linkToHome} />
      );
    }
    return withSessionBanner(
      <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Загрузка...</div>}><NotesPage dataVersion={bundleTick} /></React.Suspense>
    );
  }
  if (path.startsWith('/admin/drawing')) {
    if (!isAdmin) {
      return withSessionBanner(
        <AdminAccessDenied resourceLabel="Страница рисования" sessionExpired={adminSessionExpired} linkToHome={linkToHome} />
      );
    }
    return withSessionBanner(
      <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Загрузка...</div>}><DrawingPage /></React.Suspense>
    );
  }
  if (path.startsWith('/admin/review')) {
    window.location.replace('/editor');
    return null;
  }
  if (path.startsWith('/editor')) {
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><EditorPage isAdmin={true} /></React.Suspense>;
  }
  if (path.startsWith('/planner')) {
    if (!isAdmin && !isLimitedGuest) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ по входу</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>Планировщик (списки дел) доступен после входа (админ или гостевой аккаунт).</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><PlannerPage /></React.Suspense>;
  }
  if (path === '/dictionary') {
    if (!isAdmin) {
      return withSessionBanner(
        <AdminAccessDenied resourceLabel="Словарь" sessionExpired={adminSessionExpired} linkToHome={linkToHome} />
      );
    }
    return withSessionBanner(
      <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Загрузка...</div>}><DictionaryPage dataVersion={bundleTick} /></React.Suspense>
    );
  }
  if (path === '/cv') {
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><CvPage isAdmin={isAdmin} /></React.Suspense>;
  }
  if (path === '/weather') {
    if (!isAdmin && !isLimitedGuest) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ по входу</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>Метеостанция доступна после входа (админ или гостевой аккаунт).</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><WeatherPage /></React.Suspense>;
  }
  if (path === '/rss') {
    if (!isAdmin) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ по входу</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>RSS подписки доступны только в режиме админа.</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><RssPage /></React.Suspense>;
  }
  if (path === '/blog') {
    return withSessionBanner(<BlogList isAdmin={isAdmin} adminSessionExpired={adminSessionExpired} />);
  }
  if (path.startsWith('/blog/')) {
    const blogSlug = decodeURIComponent(path.slice('/blog/'.length));
    return <BlogPostView slug={blogSlug} isAdmin={isAdmin} />;
  }
  if (path === '/calculators') {
    return <CalculatorsListPage isAdmin={isAdmin} />;
  }
  // Калькулятор по имени: /calculators/:id или /calculators/:slug
  if (path.startsWith('/calculators/')) {
    const idOrSlug = decodeURIComponent(path.slice('/calculators/'.length));
    if (!idOrSlug) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Страница не найдена</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>Не указан адрес калькулятора.</p>
          {linkToHome}
        </div>
      );
    }
    const calculator = loadCalculator(idOrSlug) ?? getCalculatorBySlug(idOrSlug);
    const calculatorId = calculator?.id ?? idOrSlug;
    if (calculator && calculator.status === 'published') {
      return (
        <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}>
          <PublicCalculator
            calculatorId={calculator.id}
            blocks={calculator.blocks}
            reportHtml={calculator.reportHtml}
          />
        </React.Suspense>
      );
    }
    if (calculator) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Калькулятор недоступен</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>
            {calculator.status === 'review'
              ? 'Калькулятор на ревью.'
              : calculator.status === 'rejected'
              ? 'Калькулятор отклонён.'
              : 'Калькулятор не опубликован.'}
          </p>
          {linkToEditor}
        </div>
      );
    }
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h2>Страница не найдена</h2>
        <p style={{ color: 'var(--color-muted-text)' }}>Калькулятор с ID "{calculatorId}" не найден.</p>
        {linkToEditor}
      </div>
    );
  }

  // Главная: welcome
  return withSessionBanner(
    <WelcomePage
      isAdmin={isAdmin}
      isLimitedGuest={isLimitedGuest}
      dataVersion={bundleTick}
      onPullAllFromRepo={pullAllFromRepo}
      adminSessionExpired={adminSessionExpired}
    />
  );
}

// При падении приложения показываем сообщение вместо пустого экрана
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  state = { hasError: false, error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      const err = this.state.error as Error | undefined;
      return (
        <div style={{ padding: 40, maxWidth: 600, margin: '0 auto', fontFamily: 'system-ui' }}>
          <h2 style={{ color: 'var(--color-danger)' }}>Ошибка загрузки</h2>
          <p style={{ color: 'var(--color-muted-text)', marginBottom: 16 }}>
            Откройте консоль (F12 → Console) и проверьте сообщение об ошибке.
          </p>
          <pre style={{ background: 'var(--pico-code-background-color)', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 13 }}>
            {err?.message ?? String(this.state.error)}
          </pre>
          <a href="/" style={{ color: 'var(--color-accent)', marginTop: 16, display: 'inline-block' }}>На главную</a>
        </div>
      );
    }
    return this.props.children;
  }
}

// Рендерим приложение
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}
