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
    fetch('./data/cv.json')
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
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      <p style={{ marginBottom: 16 }}>
        <a href="/" style={{ color: 'var(--pico-primary)', textDecoration: 'underline' }}>← На главную</a>
      </p>
      {safeHtml ? (
        <div
          ref={containerRef}
          className="cv-view rte-body"
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

const CvPage: React.FC<CvPageProps> = ({ isAdmin }) => {
  const [content, setContent] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  const handleSave = useCallback(() => {
    saveCvContent(content);
    if (getSyncConfig()) {
      schedulePush('cv', () => pushCv(content));
    }
    setSaveMessage('Сохранено');
    setTimeout(() => setSaveMessage(null), 2000);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header
        style={{
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '12px 20px',
          borderBottom: '1px solid var(--pico-border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          background: 'var(--pico-background-color)',
        }}
      >
        <a href="/" style={{ color: 'var(--pico-primary)', textDecoration: 'underline' }}>← Главная</a>
        <span style={{ fontWeight: 600 }}>CV — режим редактирования</span>
        <button
          type="button"
          onClick={handleSave}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 32,
            padding: '0 12px',
            background: 'var(--color-success-bg)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Сохранить (Ctrl+S)
        </button>
        {saveMessage != null && <span style={{ fontSize: 12, color: 'var(--pico-primary)' }}>{saveMessage}</span>}
        {getSyncConfig() && (
          <button type="button" onClick={handlePushToRepo} className="secondary" style={{ marginLeft: 'auto', fontSize: 13, padding: '6px 12px' }}>
            Выгрузить в репо
          </button>
        )}
        {pushStatus != null && <span style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>{pushStatus}</span>}
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div
          style={{
            flex: '1 1 400px',
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <div style={{ minHeight: 'min-content' }}>
            <RichTextEditor
              value={initialized ? content : ''}
              onChange={handleChange}
              placeholder="Введите резюме. Можно вставлять картинки, настраивать обтекание, зум, поворот, ч/б."
              minHeight={360}
              cvMode
              stickyToolbar
            />
          </div>
        </div>
        <div
          style={{
            width: 360,
            minWidth: 280,
            maxWidth: '100%',
            flexShrink: 0,
            padding: 16,
            borderLeft: '1px solid var(--pico-border-color)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            background: 'var(--pico-background-color)',
          }}
        >
          <MistralPanel />
        </div>
      </div>
    </div>
  );
};

export default CvPage;
