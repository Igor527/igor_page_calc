import React, { useState, useCallback, useEffect } from 'react';
import type { PageSection, SectionType } from '@/lib/pageLayouts';
import {
  loadPageSections,
  savePageSections,
  resetPageSections,
  getDefaults,
  getAllLayouts,
} from '@/lib/pageLayouts';
import { pushLayouts } from '@/lib/githubSync';
import { sanitizeHtml } from '@/lib/security';
import { attachCodeCopyButtons } from '@/lib/useCodeCopyButtons';
import { getPublishedCalculators } from '@/lib/calculatorStorage';

const LazyRTE = React.lazy(() => import('./editor/RichTextEditor'));

const linkBtnClass =
  'block w-full py-4 px-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-transparent text-gray-900 dark:text-gray-100 no-underline text-center font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500';

interface Props {
  pageId: string;
  isAdmin: boolean;
  dataVersion?: number;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

/* ═══════════════════ Section renderers ═══════════════════ */

function HeroSection({ section }: { section: PageSection }) {
  return (
    <header className="text-center mb-2">
      {section.title && (
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {section.title}
        </h1>
      )}
      {section.subtitle &&
        section.subtitle.split('\n').map((line, i) => (
          <p key={i} className="text-gray-600 dark:text-gray-400">
            {line}
          </p>
        ))}
    </header>
  );
}

function TextSection({ section }: { section: PageSection }) {
  return (
    <div
      className="blog-content"
      style={{ lineHeight: 1.7, fontSize: 15 }}
      ref={(el) => {
        if (el) attachCodeCopyButtons(el);
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html || '') }}
    />
  );
}

function LinkSection({ section }: { section: PageSection }) {
  return (
    <a href={section.linkUrl || '#'} role="button" className={linkBtnClass}>
      {section.linkLabel || 'Ссылка'}
    </a>
  );
}

function DividerSection() {
  return <hr className="my-4 border-gray-300 dark:border-gray-600" />;
}

function CalculatorsWidget() {
  const published = getPublishedCalculators();
  if (published.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-center py-8">
        Пока нет опубликованных калькуляторов.
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
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>Заголовок</label>
          <input
            style={inputStyle}
            value={section.title || ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
            Подзаголовок (переносы строк сохраняются)
          </label>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={section.subtitle || ''}
            onChange={(e) => onUpdate({ subtitle: e.target.value })}
          />
        </>
      )}

      {section.type === 'text' && (
        <React.Suspense fallback={<div style={{ padding: 12, color: 'var(--pico-muted-color)' }}>Загрузка редактора…</div>}>
          <LazyRTE
            value={section.html || ''}
            onChange={(html) => onUpdate({ html })}
            minHeight={100}
          />
        </React.Suspense>
      )}

      {section.type === 'link' && (
        <>
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>Текст кнопки</label>
          <input
            style={inputStyle}
            value={section.linkLabel || ''}
            onChange={(e) => onUpdate({ linkLabel: e.target.value })}
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
            Только для админа
          </label>
        </>
      )}

      {section.type === 'widget' && (
        <>
          <label style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>Тип виджета</label>
          <select
            style={inputStyle}
            value={section.widgetType || 'calculators'}
            onChange={(e) => onUpdate({ widgetType: e.target.value })}
          >
            <option value="calculators">Список калькуляторов</option>
            <option value="page-content">Контент страницы</option>
          </select>
        </>
      )}

      {section.type === 'divider' && (
        <p style={{ fontSize: 13, color: 'var(--pico-muted-color)', margin: 0 }}>
          Разделитель — без настроек.
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
          Готово
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ Add-section palette ═══════════════════ */

const SECTION_TYPES: { type: SectionType; label: string; icon: string }[] = [
  { type: 'hero', label: 'Заголовок', icon: 'H' },
  { type: 'text', label: 'Текст', icon: '¶' },
  { type: 'link', label: 'Кнопка', icon: '🔗' },
  { type: 'widget', label: 'Виджет', icon: '⚙' },
  { type: 'divider', label: 'Линия', icon: '—' },
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

const PageLayout: React.FC<Props> = ({ pageId, isAdmin, dataVersion, children, footer }) => {
  const [editing, setEditing] = useState(false);
  const [sections, setSections] = useState<PageSection[]>(() => loadPageSections(pageId));
  const [editId, setEditId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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
    if (!confirm('Сбросить страницу к стандартному виду?')) return;
    resetPageSections(pageId);
    setSections(getDefaults(pageId));
    setEditing(false);
    setEditId(null);
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
        ? { title: 'Заголовок', subtitle: '' }
        : type === 'text'
          ? { html: '<p></p>' }
          : type === 'link'
            ? { linkLabel: 'Кнопка', linkUrl: '/' }
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
    if (section.adminOnly && !isAdmin && !editing) return null;
    switch (section.type) {
      case 'hero':
        return <HeroSection section={section} />;
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

  const sectionTypeLabel = (s: PageSection) =>
    s.type === 'hero'
      ? '🏷 Заголовок'
      : s.type === 'text'
        ? '¶ Текст'
        : s.type === 'link'
          ? '🔗 Кнопка'
          : s.type === 'widget'
            ? '⚙ Виджет'
            : '— Разделитель';

  return (
    <main className="max-w-[750px] mx-auto pt-20 pb-20 px-4">
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
            Редактирование страницы
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={handleReset}
              style={{ ...ctrlBtn, color: 'var(--color-danger)', fontSize: 12 }}
            >
              Сброс
            </button>
            <button type="button" onClick={handleCancel} style={{ ...ctrlBtn, fontSize: 12 }}>
              Отмена
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
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* ─── Sections ─── */}
      <div className="grid gap-4">
        {sections.map((section, idx) => {
          const hidden = section.adminOnly && !isAdmin && !editing;
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
                    {section.adminOnly ? ' (админ)' : ''}
                  </span>
                  <button
                    type="button"
                    style={ctrlBtn}
                    onClick={() => move(idx, -1)}
                    title="Вверх"
                    disabled={idx === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    style={ctrlBtn}
                    onClick={() => move(idx, 1)}
                    title="Вниз"
                    disabled={idx === sections.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    style={ctrlBtn}
                    onClick={() => setEditId(editId === section.id ? null : section.id)}
                    title="Редактировать"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    style={{ ...ctrlBtn, color: 'var(--color-danger)' }}
                    onClick={() => remove(section.id)}
                    title="Удалить"
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
            Добавить секцию
          </span>
          {SECTION_TYPES.map((st) => (
            <button
              key={st.type}
              type="button"
              onClick={() => add(st.type)}
              style={{
                ...ctrlBtn,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                fontSize: 13,
              }}
            >
              {st.icon} {st.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── Optional footer (admin link, etc.) ─── */}
      {footer && <div className="mt-6">{footer}</div>}

      {/* ─── Back link for non-welcome pages ─── */}
      {pageId !== 'welcome' && !editing && (
        <p className="mt-8 text-center">
          <a
            href="/"
            className="text-gray-600 dark:text-gray-400 underline hover:no-underline"
          >
            На главную
          </a>
        </p>
      )}

      {/* ─── Floating edit button (admin only) ─── */}
      {isAdmin && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Редактировать страницу"
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
