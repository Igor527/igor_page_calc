import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SyncBadge from '@/components/SyncBadge';
import { getSyncConfig } from '@/lib/githubSync';

type NavItem = { href: string; label: string; match?: (path: string) => boolean };

function isActivePath(path: string, href: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

function getActiveSection(path: string): string {
  if (path === '/') return 'home';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | undefined>(undefined);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );
  const active = getActiveSection(path);

  const publicNav: NavItem[] = useMemo(
    () => [
      { href: '/', label: 'Главная' },
      { href: '/calculators', label: 'Калькуляторы' },
      { href: '/blog', label: 'Блог' },
      { href: '/cv', label: 'CV' },
    ],
    []
  );

  const extraNav: NavItem[] = useMemo(() => {
    if (isAdmin) {
      return [
        { href: '/admin/notes', label: 'Заметки' },
        { href: '/editor', label: 'Редактор' },
        { href: '/planner', label: 'Планировщик' },
        { href: '/weather', label: 'Метео' },
        { href: '/rss', label: 'RSS' },
        { href: '/dictionary', label: 'Словарь' },
        { href: '/admin/drawing', label: 'Рисование' },
      ];
    }
    return [];
  }, [isAdmin]);

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
          aria-label="Разделы сайта"
        >
          {allNav.map(renderLink)}
        </div>
        <button
          type="button"
          className="site-nav__backdrop is-visible"
          aria-label="Закрыть меню"
          onClick={closeMenu}
        />
      </>,
      document.body
    );

  return (
    <>
      <nav className="site-nav" aria-label="Основная навигация">
        <button
          ref={burgerRef}
          type="button"
          className="site-nav__burger"
          aria-expanded={menuOpen}
          aria-controls="site-nav-menu"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>
      <div className="site-header__actions">
        {showSyncBadge && <SyncBadge />}
        <button
          type="button"
          className="site-header__btn"
          aria-label="Назад в истории браузера"
          onClick={() => window.history.back()}
        >
          Назад
        </button>
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
