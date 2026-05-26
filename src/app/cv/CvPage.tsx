/**
 * Страница CV: для админа — редактор с картинками (обтекание, зум, поворот, ч/б) и окно Mistral AI (запрос–ответ).
 * Для остальных — готовая страница без редактора и без AI.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/security';
import { applyImageFocusStyles } from '@/lib/imageFocusStyles';
import RichTextEditor from '@/components/editor/RichTextEditor';
import { mistralChat } from '@/lib/dictionaryApi';
import { getSyncConfig, getCvFromRepo, pushCv, schedulePush } from '@/lib/githubSync';

const STORAGE_KEY = 'igor-cv-html';

function loadCvContent(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ?? '';
  } catch {
    return '';
  }
}

function saveCvContent(html: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, html);
  } catch {
    /* ignore */
  }
}

/** Панель Mistral: один запрос — один ответ (проверка текста, правки и т.п.). */
const MistralPanel: React.FC = () => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResponse('');
    const result = await mistralChat(trimmed);
    setLoading(false);
    if (result.ok) {
      setResponse(result.text);
    } else {
      setError(result.message);
    }
  }, [input, loading]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 280,
        background: 'var(--pico-card-background-color)',
        border: '1px solid var(--pico-border-color)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--pico-border-color)', fontWeight: 600, fontSize: 14 }}>
        Mistral AI — запрос и ответ
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 10 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Вставьте текст на проверку или задайте вопрос..."
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: 8,
            fontSize: 13,
            border: '1px solid var(--pico-border-color)',
            borderRadius: 6,
            background: 'var(--pico-background-color)',
            color: 'var(--pico-color)',
            marginBottom: 8,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 16px',
            fontSize: 13,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Отправка…' : 'Отправить'}
        </button>
        {(error || response) && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              flex: 1,
              overflow: 'auto',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--pico-background-color)',
              border: '1px solid var(--pico-border-color)',
              borderRadius: 6,
              color: error ? 'var(--pico-del-color)' : 'var(--pico-color)',
            }}
          >
            {error ?? response}
          </div>
        )}
      </div>
    </div>
  );
};

/** Публичный вид: готовая страница CV без редактора. Загружает cv.json из статики, если есть. */
const CvView: React.FC<{ content: string; initialized?: boolean }> = ({ content, initialized }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/cv.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { html?: string } | null) => {
        if (!cancelled && data && typeof data.html === 'string') setFetchedHtml(data.html);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    applyImageFocusStyles(containerRef.current);
  }, [content, fetchedHtml]);

  const displayHtml = (fetchedHtml != null ? fetchedHtml : content) || '';
  const safeHtml = sanitizeHtml(displayHtml);

  if (!initialized) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Загрузка…</div>;
  }

  return (
    <div className="cv-page-public" style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      <p style={{ marginBottom: 16 }}>
        <a href="/" style={{ color: 'var(--pico-primary)', textDecoration: 'underline' }}>← На главную</a>
      </p>
      {safeHtml ? (
        <div
          ref={containerRef}
          className="cv-view"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
          style={{ lineHeight: 1.5 }}
        />
      ) : (
        <p style={{ color: 'var(--pico-muted-color)' }}>Резюме пока не заполнено.</p>
      )}
    </div>
  );
};

interface CvPageProps {
  isAdmin: boolean;
}

const CV_NARROW_MQ = '(max-width: 768px)';

const CvPage: React.FC<CvPageProps> = ({ isAdmin }) => {
  const [content, setContent] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CV_NARROW_MQ).matches
  );
  const [mistralOpen, setMistralOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(CV_NARROW_MQ);
    const onChange = () => {
      setIsNarrow(mq.matches);
      if (!mq.matches) setMistralOpen(true);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const local = loadCvContent();
      if (getSyncConfig()) {
        try {
          const fromRepo = await getCvFromRepo();
          if (!cancelled && typeof fromRepo === 'string' && fromRepo) {
            setContent(fromRepo);
            saveCvContent(fromRepo);
            setInitialized(true);
            return;
          }
        } catch {
          /* use local */
        }
      }
      if (!cancelled) {
        setContent(local);
      }
      setInitialized(true);
    };
    void init();
    return () => { cancelled = true; };
  }, []);

  const handleChange = useCallback((html: string) => {
    setContent(html);
    saveCvContent(html);
    if (getSyncConfig()) {
      schedulePush('cv', () => pushCv(html));
    }
  }, []);

  const handleSave = useCallback(async () => {
    saveCvContent(content);
    if (getSyncConfig()) {
      const r = await pushCv(content);
      setSaveMessage(r.ok ? 'Сохранено и выгружено в репо' : (r.error || 'Ошибка выгрузки'));
    } else {
      setSaveMessage('Сохранено');
    }
    setTimeout(() => setSaveMessage(null), 3000);
  }, [content]);

  const handlePushToRepo = useCallback(async () => {
    if (!getSyncConfig()) {
      setPushStatus('Настройте синхронизацию с GitHub');
      return;
    }
    setPushStatus('Отправка…');
    const r = await pushCv(content);
    setPushStatus(r.ok ? 'Выгружено в репо' : (r.error || 'Ошибка'));
  }, [content]);

  // Ctrl+S — явное сохранение
  useEffect(() => {
    if (!isAdmin) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdmin, handleSave]);

  if (!isAdmin) {
    return <CvView content={content} initialized={initialized} />;
  }

  const showMistral = !isNarrow || mistralOpen;

  return (
    <div
      className="cv-admin-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100dvh - var(--content-offset-from-header) - var(--site-footer-height))',
        maxHeight: 'calc(100dvh - var(--content-offset-from-header) - var(--site-footer-height))',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <header className="cv-admin-header">
        <a href="/" className="cv-admin-home">← Главная</a>
        <span className="cv-admin-title">CV — режим редактирования</span>
        <button type="button" onClick={handleSave} className="cv-admin-save">
          <span className="cv-save-long">Сохранить (Ctrl+S)</span>
          <span className="cv-save-short">Сохранить</span>
        </button>
        {saveMessage != null && <span className="cv-admin-status">{saveMessage}</span>}
        {getSyncConfig() && (
          <button type="button" onClick={handlePushToRepo} className="secondary cv-admin-push">
            Выгрузить в репо
          </button>
        )}
        {pushStatus != null && <span className="cv-admin-status cv-admin-status--muted">{pushStatus}</span>}
      </header>
      <div className="cv-admin-layout" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div className="cv-admin-editor">
          <RichTextEditor
            value={initialized ? content : ''}
            onChange={handleChange}
            placeholder="Введите резюме. Можно вставлять картинки, настраивать обтекание, зум, поворот, ч/б."
            minHeight={360}
            cvMode
            stickyToolbar
          />
        </div>
        {isNarrow && (
          <button
            type="button"
            className="cv-admin-mistral-toggle"
            onClick={() => setMistralOpen((v) => !v)}
            aria-expanded={mistralOpen}
          >
            {mistralOpen ? 'Скрыть Mistral AI ▲' : 'Mistral AI ▼'}
          </button>
        )}
        {showMistral && (
          <div className="cv-admin-mistral">
            <MistralPanel />
          </div>
        )}
      </div>
    </div>
  );
};

export default CvPage;
