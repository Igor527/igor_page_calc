import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SyncBadge from '@/components/SyncBadge';
import { getSyncConfig } from '@/lib/githubSync';
import { useLang } from '@/lib/i18n';

type NavItem = { href: string; label: string; match?: (path: string) => boolean };

function isActivePath(path: string, href: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

function getActiveSection(path: string): string {
  if (path === '/') return 'home';
  if (path.startsWith('/projects')) return 'projects';
  if (path.startsWith('/calculators')) return 'calculators';
  if (path.startsWith('/blog')) return 'blog';
  if (path === '/cv') return 'cv';
  if (path.startsWith('/admin/notes')) return 'notes';
  if (path.startsWith('/editor')) return 'editor';
  if (path.startsWith('/planner')) return 'planner';
  if (path.startsWith('/weather')) return 'weather';
  if (path.startsWith('/rss')) return 'rss';
  if (path === '/dictionary') return 'dictionary';
  if (path.startsWith('/admin/drawing')) return 'drawing';
  return '';
}

export const SiteHeader: React.FC<{
  path: string;
  isAdmin: boolean;
  isLimitedGuest: boolean;
}> = ({ path, isAdmin, isLimitedGuest }) => {
  const { lang, isEn, setLang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>(undefined);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );
  const active = getActiveSection(path);

  const publicNav: NavItem[] = useMemo(
    () => [
      { href: '/', label: lang === 'ru' ? 'Главная' : 'Home' },
      { href: '/projects', label: lang === 'ru' ? 'Проекты' : 'Projects' },
      { href: '/blog', label: lang === 'ru' ? 'Блог' : 'Blog' },
      { href: '/cv', label: 'CV' },
    ],
    [lang]
  );

  const extraNav: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { href: '/calculators', label: lang === 'ru' ? 'Калькуляторы' : 'Calculators' },
    ];
    if (isAdmin) {
      items.push(
        { href: '/admin/notes', label: lang === 'ru' ? 'Заметки' : 'Notes' },
        { href: '/editor', label: lang === 'ru' ? 'Редактор' : 'Editor' },
        { href: '/planner', label: lang === 'ru' ? 'Планировщик' : 'Planner' },
        { href: '/weather', label: lang === 'ru' ? 'Метео' : 'Weather' },
        { href: '/rss', label: 'RSS' },
        { href: '/dictionary', label: lang === 'ru' ? 'Словарь' : 'Dictionary' },
        { href: '/admin/drawing', label: lang === 'ru' ? 'Рисование' : 'Drawing' }
      );
    }
    return items;
  }, [isAdmin, lang]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [path, closeMenu]);

  useEffect(() => {
    const bar = document.getElementById('header-inner');
    if (!bar) return;
    const MIN = 48;
    const MAX = 72;
    let last = 0;
    const apply = () => {
      const raw = Math.ceil(bar.getBoundingClientRect().height);
      const h = Math.min(MAX, Math.max(MIN, raw));
      if (h === last) return;
      last = h;
      document.documentElement.style.setProperty('--site-header-height', `${h}px`);
      document.documentElement.style.setProperty('--content-offset-from-header', `${h + 8}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, closeMenu]);

  const updateMenuAnchor = useCallback(() => {
    const btn = burgerRef.current;
    if (!btn || !window.matchMedia('(min-width: 769px)').matches) {
      setMenuStyle(undefined);
      return;
    }
    const rect = btn.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left,
      right: 'auto',
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuStyle(undefined);
      return;
    }
    updateMenuAnchor();
    window.addEventListener('resize', updateMenuAnchor);
    window.addEventListener('scroll', updateMenuAnchor, true);
    return () => {
      window.removeEventListener('resize', updateMenuAnchor);
      window.removeEventListener('scroll', updateMenuAnchor, true);
    };
  }, [menuOpen, updateMenuAnchor]);

  const showSyncBadge = isAdmin && !!getSyncConfig();
  const allNav = useMemo(() => [...publicNav, ...extraNav], [publicNav, extraNav]);

  const renderLink = (item: NavItem) => {
    const section = getActiveSection(item.href === '/' ? '/' : item.href);
    const isCurrent = item.match ? item.match(path) : active === section || isActivePath(path, item.href);
    return (
      <a
        key={item.href}
        href={item.href}
        className={`site-nav__link${isCurrent ? ' is-active' : ''}`}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={closeMenu}
      >
        {item.label}
      </a>
    );
  };

  const menuLayer =
    menuOpen &&
    createPortal(
      <>
        <div
          id="site-nav-menu"
          className={`site-nav__links is-open${menuStyle ? ' site-nav__links--anchored' : ''}`}
          style={menuStyle}
          role="navigation"
          aria-label={lang === 'ru' ? 'Разделы сайта' : 'Site navigation'}
        >
          {allNav.map(renderLink)}
        </div>
        <button
          type="button"
          className="site-nav__backdrop is-visible"
          aria-label={lang === 'ru' ? 'Закрыть меню' : 'Close menu'}
          onClick={closeMenu}
        />
      </>,
      document.body
    );

  return (
    <>
      <nav className="site-nav" aria-label={lang === 'ru' ? 'Основная навигация' : 'Main navigation'}>
        <button
          ref={burgerRef}
          type="button"
          className="site-nav__burger"
          aria-expanded={menuOpen}
          aria-controls="site-nav-menu"
          aria-label={menuOpen ? (lang === 'ru' ? 'Закрыть меню' : 'Close menu') : (lang === 'ru' ? 'Открыть меню' : 'Open menu')}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>
      <div className="site-header__actions">
        {showSyncBadge && <SyncBadge />}
        {path !== '/' && (
          <button
            type="button"
            className="site-header__btn"
            aria-label={lang === 'ru' ? 'Назад в истории браузера' : 'Back in browser history'}
            onClick={() => window.history.back()}
          >
            {lang === 'ru' ? 'Назад' : 'Back'}
          </button>
        )}
        {/* Rounded EN / RU pill switcher */}
        <div
          className="inline-flex items-center p-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-xs font-medium shadow-xs"
          role="group"
          aria-label={lang === 'en' ? 'Language switch' : 'Переключатель языка'}
        >
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-150 leading-none ${
              isEn
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
            style={isEn ? { backgroundColor: '#2563eb', color: '#ffffff' } : undefined}
            aria-pressed={isEn}
            title="English"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('ru')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-150 leading-none ${
              !isEn
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
            style={!isEn ? { backgroundColor: '#2563eb', color: '#ffffff' } : undefined}
            aria-pressed={!isEn}
            title="Русский"
          >
            RU
          </button>
        </div>
        <button
          type="button"
          id="themeBtn"
          className="site-header__btn"
          aria-label="Переключить светлую/тёмную тему"
          aria-pressed={isDark ? 'true' : 'false'}
          onClick={() => {
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
            setIsDark(document.documentElement.classList.contains('dark'));
          }}
        >
          {isDark ? '🌙' : '☀️'}
        </button>
      </div>
      {menuLayer}
    </>
  );
};

export function SiteHeaderPortal(props: { path: string; isAdmin: boolean; isLimitedGuest: boolean }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById('header-inner'));
    const mode = parseInt(localStorage.getItem('themeMode') ?? '1', 10);
    const theme = Number.isNaN(mode) || mode === 1 ? 'dark' : 'light';
    if (typeof window.updateThemeBtn === 'function') window.updateThemeBtn(theme);
  }, []);

  if (!container) return null;
  return createPortal(
    <SiteHeader {...props} />,
    container
  );
}

declare global {
  interface Window {
    toggleTheme?: () => void;
    updateThemeBtn?: (theme: string) => void;
  }
}

export default SiteHeader;
