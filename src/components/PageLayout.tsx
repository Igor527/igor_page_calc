import React, { useState, useCallback, useEffect } from 'react';
import type { PageSection, SectionType } from '@/lib/pageLayouts';
import {
  loadPageSections,
  savePageSections,
  resetPageSections,
  getDefaults,
  getAllLayouts,
  loadLayoutsFromRepo,
} from '@/lib/pageLayouts';
import { pushLayouts, getSyncConfig } from '@/lib/githubSync';
import { sanitizeHtml } from '@/lib/security';
import { attachCodeCopyButtons } from '@/lib/useCodeCopyButtons';
import { getPublishedCalculators } from '@/lib/calculatorStorage';
import { useLang } from '@/lib/i18n';

const LazyRTE = React.lazy(() => import('./editor/RichTextEditor'));

const linkBtnClass =
  'block w-full py-4 px-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-transparent text-gray-900 dark:text-gray-100 no-underline text-center font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500';

interface Props {
  pageId: string;
  isAdmin: boolean;
  /** Ограниченный гость: видит только секции с showForGuest (планировщик, метеостанция). */
  isLimitedGuest?: boolean;
  dataVersion?: number;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

/* ═══════════════════ Section renderers ═══════════════════ */

function HeroSection({ section, isWelcome }: { section: PageSection; isWelcome?: boolean }) {
  const { lang, setLang } = useLang();
  const title = (lang === 'ru' ? section.titleRu : section.titleEn) || section.title;
  const subtitle = (lang === 'ru' ? section.subtitleRu : section.subtitleEn) || section.subtitle;

  const paragraphs = subtitle
    ? subtitle.includes('\n\n')
      ? subtitle.split('\n\n')
      : subtitle.split('\n')
    : [];

  return (
    <header className="text-center mb-6">
      
      {title && (
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-3 whitespace-pre-line">
          {title}
        </h1>
      )}
      {paragraphs.map((line, i) => (
        <p
          key={i}
          className="text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-3 text-sm sm:text-base leading-relaxed text-left sm:text-center"
        >
          {line}
        </p>
      ))}
      
    </header>
  );
}

function TextSection({ section }: { section: PageSection }) {
  const { lang } = useLang();
  const rawHtml = (lang === 'ru' ? section.htmlRu : section.htmlEn) || section.html || '';
  return (
    <div
      className="blog-content"
      style={{ lineHeight: 1.7, fontSize: 15 }}
      ref={(el) => {
        if (el) attachCodeCopyButtons(el);
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawHtml) }}
    />
  );
}

function getLinkDefaultLabel(url?: string, lang: 'en' | 'ru' = 'en'): string {
  if (url === '/projects') return lang === 'ru' ? 'Проекты' : 'Projects';
  if (url === '/blog') return lang === 'ru' ? 'Блог' : 'Blog';
  if (url === '/cv') return 'CV';
  if (url === '/calculators') return lang === 'ru' ? 'Калькуляторы' : 'Calculators';
  if (url === '/editor') return lang === 'ru' ? 'Редактор' : 'Editor';
  if (url === '/planner') return lang === 'ru' ? 'Планировщик' : 'Planner';
  return '';
}

function LinkSection({ section }: { section: PageSection }) {
  const { lang } = useLang();
  const defaultLabel = getLinkDefaultLabel(section.linkUrl, lang);
  const label =
    (lang === 'ru' ? section.linkLabelRu : section.linkLabelEn) ||
    defaultLabel ||
    section.linkLabel ||
    (lang === 'ru' ? 'Ссылка' : 'Link');
  return (
    <a href={section.linkUrl || '#'} role="button" className={linkBtnClass}>
      {label}
    </a>
  );
}

function DividerSection() {
  return <hr className="my-4 border-gray-300 dark:border-gray-600" />;
}

function CalculatorsWidget() {
  const { lang } = useLang();
  const published = getPublishedCalculators();
  if (published.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center py-8">
        {lang === 'ru' ? 'Пока нет опубликованных калькуляторов.' : 'No published calculators yet.'}
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      {published.map((calc) => (
        <a
          key={calc.id}
          href={`/calculators/${calc.slug || calc.id}`}
          className={linkBtnClass}
        >
          {calc.title}
        </a>
      ))}
    </div>
  );
}

/* ═══════════════════ Inline section editor ═══════════════════ */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--pico-form-element-border-color)',
  background: 'var(--pico-form-element-background-color)',
  color: 'var(--pico-color)',
  fontSize: 14,
  marginBottom: 8,
};

function SectionEditorForm({
  section,
  onUpdate,
  onClose,
}: {
  section: PageSection;
  onUpdate: (u: Partial<PageSection>) => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const currentTitle = (lang === 'ru' ? section.titleRu : section.titleEn) ?? section.title ?? '';
  const currentSubtitle = (lang === 'ru' ? section.subtitleRu : section.subtitleEn) ?? section.subtitle ?? '';
  const currentLinkLabel = (lang === 'ru' ? section.linkLabelRu : section.linkLabelEn) ?? section.linkLabel ?? '';

  return (
    <div
      style={{
        padding: 12,
        margin: '8px 0 0',
        borderRadius: 8,
        background: 'var(--pico-card-background-color)',
        border: '1px solid var(--pico-primary)',
      }}
    >
      {section.type === 'hero' && (
        <>
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
            {lang === 'ru' ? 'Заголовок' : 'Title'}
          </label>
          <input
            style={inputStyle}
            value={currentTitle}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate(lang === 'ru' ? { titleRu: val, title: section.title || val } : { titleEn: val, title: val });
            }}
          />
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
            {lang === 'ru' ? 'Подзаголовок (переносы строк сохраняются)' : 'Subtitle (line breaks preserved)'}
          </label>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={currentSubtitle}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate(lang === 'ru' ? { subtitleRu: val, subtitle: section.subtitle || val } : { subtitleEn: val, subtitle: val });
            }}
          />
        </>
      )}

      {section.type === 'text' && (
        <React.Suspense fallback={<div style={{ padding: 12, color: 'var(--pico-muted-color)' }}>{lang === 'ru' ? 'Загрузка редактора…' : 'Loading editor…'}</div>}>
          <LazyRTE
            value={section.html || ''}
            onChange={(html) => onUpdate({ html })}
            minHeight={100}
          />
        </React.Suspense>
      )}

      {section.type === 'link' && (
        <>
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
            {lang === 'ru' ? 'Текст кнопки' : 'Button text'}
          </label>
          <input
            style={inputStyle}
            value={currentLinkLabel}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate(lang === 'ru' ? { linkLabelRu: val, linkLabel: section.linkLabel || val } : { linkLabelEn: val, linkLabel: val });
            }}
          />
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>URL</label>
          <input
            style={inputStyle}
            value={section.linkUrl || ''}
            onChange={(e) => onUpdate({ linkUrl: e.target.value })}
          />
          <label
            style={{
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--pico-muted-color)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={!!section.adminOnly}
              onChange={(e) => onUpdate({ adminOnly: e.target.checked })}
            />
            {lang === 'ru' ? 'Только для админа' : 'Admin only'}
          </label>
        </>
      )}

      {section.type === 'widget' && (
        <>
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
            {lang === 'ru' ? 'Тип виджета' : 'Widget type'}
          </label>
          <select
            style={inputStyle}
            value={section.widgetType || 'calculators'}
            onChange={(e) => onUpdate({ widgetType: e.target.value })}
          >
            <option value="calculators">{lang === 'ru' ? 'Список калькуляторов' : 'Calculators list'}</option>
            <option value="page-content">{lang === 'ru' ? 'Контент страницы' : 'Page content'}</option>
          </select>
        </>
      )}

      {section.type === 'divider' && (
        <p style={{ fontSize: 13, color: 'var(--pico-muted-color)', margin: 0 }}>
          {lang === 'ru' ? 'Разделитель — без настроек.' : 'Divider — no settings.'}
        </p>
      )}

      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            border: '1px solid var(--pico-border-color)',
            background: 'var(--pico-card-background-color)',
            color: 'var(--pico-color)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {lang === 'ru' ? 'Готово' : 'Done'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ Add-section palette ═══════════════════ */

const SECTION_TYPES_RU: { type: SectionType; label: string; icon: string }[] = [
  { type: 'hero', label: 'Заголовок', icon: 'H' },
  { type: 'text', label: 'Текст', icon: '¶' },
  { type: 'link', label: 'Кнопка', icon: '🔗' },
  { type: 'widget', label: 'Виджет', icon: '⚙' },
  { type: 'divider', label: 'Линия', icon: '—' },
];

const SECTION_TYPES_EN: { type: SectionType; label: string; icon: string }[] = [
  { type: 'hero', label: 'Header', icon: 'H' },
  { type: 'text', label: 'Text', icon: '¶' },
  { type: 'link', label: 'Button', icon: '🔗' },
  { type: 'widget', label: 'Widget', icon: '⚙' },
  { type: 'divider', label: 'Divider', icon: '—' },
];

/* ═══════════════════ Main component ═══════════════════ */

const ctrlBtn: React.CSSProperties = {
  padding: '2px 7px',
  fontSize: 14,
  cursor: 'pointer',
  border: '1px solid var(--pico-border-color)',
  borderRadius: 4,
  background: 'var(--pico-card-background-color)',
  color: 'var(--pico-color)',
  lineHeight: 1.2,
};

const PageLayout: React.FC<Props> = ({ pageId, isAdmin, isLimitedGuest = false, dataVersion, children, footer }) => {
  const { lang } = useLang();
  const [editing, setEditing] = useState(false);
  const [sections, setSections] = useState<PageSection[]>(() => loadPageSections(pageId));
  const [editId, setEditId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [pullLoading, setPullLoading] = useState(false);

  useEffect(() => {
    if (dataVersion != null) setSections(loadPageSections(pageId));
  }, [dataVersion, pageId]);

  /* persistence */
  const handleSave = useCallback(() => {
    savePageSections(pageId, sections);
    setEditing(false);
    setEditId(null);
    pushLayouts(getAllLayouts()).catch(() => {});
  }, [pageId, sections]);

  const handleCancel = useCallback(() => {
    setSections(loadPageSections(pageId));
    setEditing(false);
    setEditId(null);
  }, [pageId]);

  const handleReset = useCallback(() => {
    if (!confirm(lang === 'ru' ? 'Сбросить страницу к стандартному виду?' : 'Reset page to default layout?')) return;
    resetPageSections(pageId);
    setSections(getDefaults(pageId));
    setEditing(false);
    setEditId(null);
  }, [pageId, lang]);

  const handlePullFromRepo = useCallback(async () => {
    setPullLoading(true);
    try {
      const ok = await loadLayoutsFromRepo();
      if (ok) setSections(loadPageSections(pageId));
    } finally {
      setPullLoading(false);
    }
  }, [pageId]);

  /* mutations */
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= sections.length) return;
    const arr = [...sections];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setSections(arr);
  };

  const remove = (id: string) => {
    setSections((s) => s.filter((sec) => sec.id !== id));
    if (editId === id) setEditId(null);
  };

  const add = (type: SectionType) => {
    const defaults: Partial<PageSection> =
      type === 'hero'
        ? { title: lang === 'ru' ? 'Заголовок' : 'Header', subtitle: '' }
        : type === 'text'
          ? { html: '<p></p>' }
          : type === 'link'
            ? { linkLabel: lang === 'ru' ? 'Кнопка' : 'Button', linkUrl: '/' }
            : type === 'widget'
              ? { widgetType: 'calculators' }
              : {};
    const s: PageSection = { id: `s${Date.now()}`, type, ...defaults };
    setSections((prev) => [...prev, s]);
    setEditId(s.id);
  };

  const update = (id: string, updates: Partial<PageSection>) => {
    setSections((s) => s.map((sec) => (sec.id === id ? { ...sec, ...updates } : sec)));
  };

  /* drag-and-drop */
  const onDragStart = (idx: number) => setDragIdx(idx);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      return;
    }
    const arr = [...sections];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(targetIdx, 0, moved);
    setSections(arr);
    setDragIdx(null);
  };

  /* render one section */
  const renderSection = (section: PageSection) => {
    const canSeeRestricted = isAdmin || (isLimitedGuest && section.showForGuest);
    if (section.adminOnly && !canSeeRestricted && !editing) return null;
    switch (section.type) {
      case 'hero':
        return <HeroSection section={section} isWelcome={pageId === 'welcome'} />;
      case 'text':
        return <TextSection section={section} />;
      case 'link':
        return <LinkSection section={section} />;
      case 'divider':
        return <DividerSection />;
      case 'widget':
        if (section.widgetType === 'page-content') return <>{children}</>;
        if (section.widgetType === 'calculators') return <CalculatorsWidget />;
        return null;
      default:
        return null;
    }
  };

  const sectionTypeLabel = (s: PageSection) => {
    if (lang === 'ru') {
      return s.type === 'hero'
        ? '🏷 Заголовок'
        : s.type === 'text'
          ? '¶ Текст'
          : s.type === 'link'
            ? '🔗 Кнопка'
            : s.type === 'widget'
              ? '⚙ Виджет'
              : '— Разделитель';
    }
    return s.type === 'hero'
      ? '🏷 Header'
      : s.type === 'text'
        ? '¶ Text'
        : s.type === 'link'
          ? '🔗 Button'
          : s.type === 'widget'
            ? '⚙ Widget'
            : '— Divider';
  };

  const sectionTypes = lang === 'ru' ? SECTION_TYPES_RU : SECTION_TYPES_EN;

  return (
    <main className="max-w-[750px] mx-auto pb-20 px-4">
      {/* ─── Edit-mode top bar ─── */}
      {editing && (
        <div
          style={{
            position: 'sticky',
            top: 56,
            zIndex: 40,
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            marginBottom: 16,
            borderRadius: 8,
            background: 'var(--pico-card-background-color)',
            border: '2px solid var(--pico-primary)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--pico-color)' }}>
            {lang === 'ru' ? 'Редактирование страницы' : 'Page Editor'}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {getSyncConfig() && (
              <>
                <button
                  type="button"
                  onClick={handlePullFromRepo}
                  disabled={pullLoading}
                  style={{ ...ctrlBtn, fontSize: 12 }}
                >
                  {pullLoading ? (lang === 'ru' ? 'Загрузка…' : 'Loading…') : (lang === 'ru' ? 'Выгрузить последний сэйв из репо' : 'Pull latest save')}
                </button>
                <button type="button" onClick={() => pushLayouts(getAllLayouts()).catch(() => {})} style={{ ...ctrlBtn, fontSize: 12 }}>
                  {lang === 'ru' ? 'Загрузить в репо' : 'Push to repo'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleReset}
              style={{ ...ctrlBtn, color: 'var(--color-danger)', fontSize: 12 }}
            >
              {lang === 'ru' ? 'Сброс' : 'Reset'}
            </button>
            <button type="button" onClick={handleCancel} style={{ ...ctrlBtn, fontSize: 12 }}>
              {lang === 'ru' ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                ...ctrlBtn,
                background: 'var(--pico-primary)',
                color: '#fff',
                border: 'none',
                fontSize: 12,
              }}
            >
              {lang === 'ru' ? 'Сохранить' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Sections ─── */}
      <div className="grid gap-4">
        {sections.map((section, idx) => {
          const canSeeRestricted = isAdmin || (isLimitedGuest && section.showForGuest);
          const hidden = section.adminOnly && !canSeeRestricted && !editing;
          const isDictLink = section.type === 'link' && section.linkUrl === '/dictionary';
          if (hidden || (isDictLink && !isAdmin)) return null;
          return (
            <div
              key={section.id}
              draggable={editing}
              onDragStart={() => onDragStart(idx)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(idx)}
              onDragEnd={() => setDragIdx(null)}
              style={
                editing
                  ? {
                      border: '1px dashed var(--pico-border-color)',
                      borderRadius: 8,
                      padding: 8,
                      position: 'relative',
                      opacity: dragIdx === idx ? 0.35 : 1,
                      cursor: 'grab',
                      transition: 'opacity .15s',
                    }
                  : undefined
              }
            >
              {/* section controls */}
              {editing && (
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                    marginBottom: 6,
                    fontSize: 12,
                    color: 'var(--pico-muted-color)',
                  }}
                >
                  <span style={{ fontWeight: 600, marginRight: 'auto' }}>
                    {sectionTypeLabel(section)}
                    {section.adminOnly ? (lang === 'ru' ? ' (админ)' : ' (admin)') : ''}
                  </span>
                  <button
                    type="button"
                    style={ctrlBtn}
                    onClick={() => move(idx, -1)}
                    title={lang === 'ru' ? 'Вверх' : 'Up'}
                    disabled={idx === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    style={ctrlBtn}
                    onClick={() => move(idx, 1)}
                    title={lang === 'ru' ? 'Вниз' : 'Down'}
                    disabled={idx === sections.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    style={ctrlBtn}
                    onClick={() => setEditId(editId === section.id ? null : section.id)}
                    title={lang === 'ru' ? 'Редактировать' : 'Edit'}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    style={{ ...ctrlBtn, color: 'var(--color-danger)' }}
                    onClick={() => remove(section.id)}
                    title={lang === 'ru' ? 'Удалить' : 'Delete'}
                  >
                    ✕
                  </button>
                </div>
              )}

              {renderSection(section)}

              {editing && editId === section.id && (
                <SectionEditorForm
                  section={section}
                  onUpdate={(u) => update(section.id, u)}
                  onClose={() => setEditId(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Add-section palette ─── */}
      {editing && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            flexWrap: 'wrap',
            padding: 12,
            marginTop: 16,
            borderRadius: 8,
            border: '2px dashed var(--pico-border-color)',
          }}
        >
          <span
            style={{
              width: '100%',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--pico-muted-color)',
              marginBottom: 4,
            }}
          >
            {lang === 'ru' ? 'Добавить секцию' : 'Add section'}
          </span>
          {sectionTypes.map((st) => (
            <button
              key={st.type}
              type="button"
              onClick={() => add(st.type)}
              style={{
                ...ctrlBtn,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
              }}
            >
              <span>{st.icon}</span>
              <span>{st.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ─── Optional footer (admin link, etc.) ─── */}
      {footer && <div className="mt-6">{footer}</div>}

      {/* ─── Back link for non-welcome pages ─── */}
      {pageId !== 'welcome' && !editing && (
        <p className="mt-12 text-center">
          <a
            href="/"
            className="text-sm text-gray-500 hover:underline"
          >
            {lang === 'ru' ? '← На главную' : '← Back to Home'}
          </a>
        </p>
      )}

      {/* ─── Floating edit button (admin only) ─── */}
      {isAdmin && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={lang === 'ru' ? 'Редактировать страницу' : 'Edit page'}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 50,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--pico-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform .15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          ✏️
        </button>
      )}
    </main>
  );
};

export default PageLayout;
