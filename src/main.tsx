import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import WelcomePage from './app/welcome/WelcomePage';
import CalculatorsListPage from './app/calculators/CalculatorsListPage';

const EditorPage = React.lazy(() => import('./app/admin/editor/page'));
const PublicCalculator = React.lazy(() => import('./app/public/PublicCalculator'));
const ReviewPanel = React.lazy(() => import('./app/admin/review/ReviewPanel'));
const PlannerPage = React.lazy(() => import('./app/planner/PlannerPage'));
const NotesPage = React.lazy(() => import('./app/admin/notes/NotesPage'));
const DictionaryPage = React.lazy(() => import('./app/dictionary/DictionaryPage'));
import { BlogList, BlogPostView } from './app/blog/BlogPage';
import { loadCalculator, getCalculatorBySlug } from './lib/calculatorStorage';

const linkStyle = { color: 'var(--color-accent)', textDecoration: 'underline' };
const linkToEditor = <a href="/editor" style={{ ...linkStyle, marginTop: 16, display: 'inline-block' }}>Вернуться в редактор</a>;
const linkToHome = <a href="/" style={linkStyle}>На главную</a>;

const ADMIN_FLAG = 'igor-page-calc-admin';
function getIsAdmin(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(ADMIN_FLAG) === '1';
}

function App() {
  const path = window.location.pathname;
  const search = typeof window !== 'undefined' ? window.location.search : '';

  // Включение/выключение режима админа по ссылке ?admin=1 или ?admin=0
  if (path === '/' && search === '?admin=1') {
    localStorage.setItem(ADMIN_FLAG, '1');
    window.location.replace('/');
    return null;
  }
  if (path === '/' && search === '?admin=0') {
    localStorage.removeItem(ADMIN_FLAG);
    window.location.replace('/');
    return null;
  }

  const isAdmin = getIsAdmin();

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
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><NotesPage /></React.Suspense>;
  }
  if (path.startsWith('/admin/review')) {
    return <React.Suspense fallback={<div style={{padding:'40px',textAlign:'center'}}>Загрузка...</div>}><ReviewPanel isAdmin={isAdmin} /></React.Suspense>;
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
  return <WelcomePage isAdmin={isAdmin} />;
}

// Рендерим приложение
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
