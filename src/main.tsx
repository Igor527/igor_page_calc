import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import WelcomePage from './app/welcome/WelcomePage';
import CalculatorsListPage from './app/calculators/CalculatorsListPage';
import { AdminLogin } from './components/AdminLogin';

const EditorPage = React.lazy(() => import('./app/admin/editor/page'));
const PublicCalculator = React.lazy(() => import('./app/public/PublicCalculator'));
const ReviewPanel = React.lazy(() => import('./app/admin/review/ReviewPanel'));
const PlannerPage = React.lazy(() => import('./app/planner/PlannerPage'));
const NotesPage = React.lazy(() => import('./app/admin/notes/NotesPage'));
const DictionaryPage = React.lazy(() => import('./app/dictionary/DictionaryPage'));
const CvPage = React.lazy(() => import('./app/cv/CvPage'));
import { BlogList, BlogPostView, loadBlogBundle } from './app/blog/BlogPage';
import { loadDictionaryBundle } from './app/dictionary/DictionaryPage';
import { loadNotesBundle } from './app/admin/notes/NotesPage';
import { loadCalculator, getCalculatorBySlug, loadPublishedBundle } from './lib/calculatorStorage';
import { loadLayoutsBundle } from './lib/pageLayouts';
import {
  subscribeToAuth,
  isAdminUser,
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
  if (useFirebaseAdmin()) return !!(firebaseUser && isAdminUser(firebaseUser as import('firebase/auth').User));
  return getLegacyAdminFlag();
}

function App() {
  const path = window.location.pathname;
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);

  useEffect(() => {
    const unsub = subscribeToAuth(setFirebaseUser);
    return () => unsub?.();
  }, []);

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
      if (firebaseUser && isAdminUser(firebaseUser)) {
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

  // Загружаем данные из репо (calculators, posts, notes, layouts, dictionary)
  const [bundleTick, setBundleTick] = useState(0);
  useEffect(() => {
    Promise.all([
      loadPublishedBundle(),
      loadBlogBundle(),
      loadNotesBundle(),
      loadLayoutsBundle(),
      loadDictionaryBundle(),
    ]).then(() => setBundleTick((n) => n + 1));
  }, []);

  if (path.startsWith('/admin/notes')) {
    if (!isAdmin) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ только для админа</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>Заметки доступны только в режиме админа.</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><NotesPage dataVersion={bundleTick} /></React.Suspense>;
  }
  if (path.startsWith('/admin/review')) {
    window.location.replace('/editor');
    return null;
  }
  if (path.startsWith('/editor')) {
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><EditorPage isAdmin={true} /></React.Suspense>;
  }
  if (path.startsWith('/planner')) {
    if (!isAdmin) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ только для админа</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>Планировщик (Гантт) виден только в режиме админа.</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><PlannerPage /></React.Suspense>;
  }
  if (path === '/dictionary') {
    if (!isAdmin) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ только для админа</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>Словарь доступен только в режиме админа.</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><DictionaryPage /></React.Suspense>;
  }
  if (path === '/cv') {
    if (!isAdmin) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>Доступ только для админа</h2>
          <p style={{ color: 'var(--color-muted-text)' }}>CV доступно только в режиме админа.</p>
          {linkToHome}
        </div>
      );
    }
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><CvPage /></React.Suspense>;
  }
  if (path === '/blog') {
    return <BlogList isAdmin={isAdmin} />;
  }
  if (path.startsWith('/blog/')) {
    const blogSlug = path.slice('/blog/'.length);
    return <BlogPostView slug={blogSlug} isAdmin={isAdmin} />;
  }
  if (path === '/calculators') {
    return <CalculatorsListPage isAdmin={isAdmin} />;
  }
  // Калькулятор по имени: /calculators/:id или /calculators/:slug
  if (path.startsWith('/calculators/')) {
    const idOrSlug = path.slice('/calculators/'.length);
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
  return <WelcomePage isAdmin={isAdmin} dataVersion={bundleTick} />;
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
