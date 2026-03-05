/**
 * Страница CV: для админа — редактор с картинками (обтекание, зум, поворот, ч/б) и окно Mistral AI (запрос–ответ).
 * Для остальных — готовая страница без редактора и без AI.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/security';
import { applyImageFocusStyles } from '@/lib/imageFocusStyles';
import RichTextEditor from '@/components/editor/RichTextEditor';
import { mistralChat } from '@/lib/dictionaryApi';

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

/** Публичный вид: готовая страница CV без редактора. */
const CvView: React.FC<{ content: string }> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyImageFocusStyles(containerRef.current);
  }, [content]);

  const safeHtml = sanitizeHtml(content || '');

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

  useEffect(() => {
    setContent(loadCvContent());
    setInitialized(true);
  }, []);

  const handleChange = useCallback((html: string) => {
    setContent(html);
    saveCvContent(html);
  }, []);

  if (!isAdmin) {
    if (!initialized) return <div style={{ padding: 24, textAlign: 'center' }}>Загрузка…</div>;
    return <CvView content={content} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ flexShrink: 0, padding: '12px 20px', borderBottom: '1px solid var(--pico-border-color)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" style={{ color: 'var(--pico-primary)', textDecoration: 'underline' }}>← Главная</a>
        <span style={{ fontWeight: 600 }}>CV — режим редактирования</span>
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px', minWidth: 0, overflow: 'auto', padding: 16 }}>
          <RichTextEditor
            value={initialized ? content : ''}
            onChange={handleChange}
            placeholder="Введите резюме. Можно вставлять картинки, настраивать обтекание, зум, поворот, ч/б."
            minHeight={360}
            cvMode
          />
        </div>
        <div style={{ width: 360, maxWidth: '100%', flexShrink: 0, padding: 16, borderLeft: '1px solid var(--pico-border-color)' }}>
          <MistralPanel />
        </div>
      </div>
    </div>
  );
};

export default CvPage;
