/**
 * Страница CV: для админа — двуязычный редактор (RU/EN) с картинками (обтекание, зум, поворот, ч/б) и окно Mistral AI (запрос–ответ).
 * Для остальных — готовая страница без редактора и без AI с поддержкой переключения языков.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/security';
import { applyImageFocusStyles } from '@/lib/imageFocusStyles';
import RichTextEditor from '@/components/editor/RichTextEditor';
import { mistralChat } from '@/lib/dictionaryApi';
import { getSyncConfig, getCvFromRepo, pushCv, schedulePush, cancelScheduledPush } from '@/lib/githubSync';
import { getFirebaseApp } from '@/lib/firebaseAuth';
import * as fb from '@/lib/firebaseData';
import { useLang } from '@/lib/i18n';

const STORAGE_KEY_RU = 'igor-cv-html';
const STORAGE_KEY_EN = 'igor-cv-html-en';
const CV_VERSION_KEY = 'igor-cv-version';
const CURRENT_CV_VERSION = '5';

interface CvDataState {
  ru: string;
  en: string;
}

function loadCvContent(): CvDataState {
  try {
    const ru = localStorage.getItem(STORAGE_KEY_RU) ?? '';
    const en = localStorage.getItem(STORAGE_KEY_EN) ?? '';
    return { ru, en };
  } catch {
    return { ru: '', en: '' };
  }
}

function saveCvContent(ru: string, en: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_RU, ru);
    localStorage.setItem(STORAGE_KEY_EN, en);
    localStorage.setItem(CV_VERSION_KEY, CURRENT_CV_VERSION);
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

interface CvViewProps {
  contentRu: string;
  contentEn: string;
  initialized?: boolean;
}

/** Публичный вид: готовая страница CV без редактора. Загружает данные из Firebase или cv.json. */
const CvView: React.FC<CvViewProps> = ({ contentRu, contentEn, initialized }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fetchedData, setFetchedData] = useState<{ html?: string; htmlEn?: string } | null>(null);
  const { lang } = useLang();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (getFirebaseApp()) {
        try {
          const fbCv = await fb.getCvFromFirebase();
          if (!cancelled && fbCv) {
            if (typeof fbCv === 'string') {
              setFetchedData({ html: fbCv, htmlEn: '' });
            } else {
              setFetchedData({ html: fbCv.html || '', htmlEn: fbCv.htmlEn || '' });
            }
            return;
          }
        } catch {
          // ignore, fallback to fetch
        }
      }
      fetch('/data/cv.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { html?: string; htmlEn?: string } | null) => {
          if (!cancelled && data) setFetchedData(data);
        })
        .catch(() => {});
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const isEn = lang === 'en';
  const effectiveRu = (fetchedData?.html != null ? fetchedData.html : contentRu) || '';
  const effectiveEn = (fetchedData?.htmlEn != null ? fetchedData.htmlEn : contentEn) || '';

  const displayHtml = isEn
    ? (effectiveEn || effectiveRu)
    : (effectiveRu || effectiveEn);
  const safeHtml = sanitizeHtml(displayHtml);

  useEffect(() => {
    applyImageFocusStyles(containerRef.current);
  }, [displayHtml]);

  if (!initialized) {
    return <div style={{ padding: 24, textAlign: 'center' }}>{isEn ? 'Loading…' : 'Загрузка…'}</div>;
  }

  return (
    <div className="cv-page-public" style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
      {safeHtml ? (
        <div
          ref={containerRef}
          className="cv-view"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
          style={{ lineHeight: 1.5 }}
        />
      ) : (
        <p style={{ color: 'var(--pico-muted-color)' }}>
          {isEn ? 'CV is not filled in yet.' : 'Резюме пока не заполнено.'}
        </p>
      )}
    </div>
  );
};

interface CvPageProps {
  isAdmin: boolean;
}

const CV_NARROW_MQ = '(max-width: 768px)';

const CvPage: React.FC<CvPageProps> = ({ isAdmin }) => {
  const { lang } = useLang();
  const [contentRu, setContentRu] = useState('');
  const [contentEn, setContentEn] = useState('');
  const [editLang, setEditLang] = useState<'ru' | 'en'>(() => (lang === 'en' ? 'en' : 'ru'));
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
      const savedVer = localStorage.getItem(CV_VERSION_KEY);

      if (getSyncConfig() || getFirebaseApp()) {
        try {
          const fromRepo = await getCvFromRepo();
          if (!cancelled && fromRepo) {
            const ru = typeof fromRepo === 'string' ? fromRepo : (fromRepo.html || '');
            const en = typeof fromRepo === 'string' ? '' : (fromRepo.htmlEn || '');
            setContentRu(ru);
            setContentEn(en);
            saveCvContent(ru, en);
            setInitialized(true);
            return;
          }
        } catch {
          /* use local */
        }
      }

      if (!cancelled) {
        let ru = local.ru;
        let en = local.en;

        if ((!ru && !en) || savedVer !== CURRENT_CV_VERSION) {
          try {
            const r = await fetch('/data/cv.json');
            if (r.ok) {
              const d = await r.json();
              if (d?.html || d?.htmlEn) {
                ru = d.html || '';
                en = d.htmlEn || '';
                saveCvContent(ru, en);
              }
            }
          } catch {
            /* ignore */
          }
        }
        setContentRu(ru);
        setContentEn(en);
        setInitialized(true);
      }
    };
    void init();
    return () => { cancelled = true; };
  }, []);

  const handleChange = useCallback((html: string) => {
    if (editLang === 'ru') {
      setContentRu(html);
      saveCvContent(html, contentEn);
      if (getSyncConfig() || getFirebaseApp()) {
        schedulePush('cv', () => pushCv({ html, htmlEn: contentEn }));
      }
    } else {
      setContentEn(html);
      saveCvContent(contentRu, html);
      if (getSyncConfig() || getFirebaseApp()) {
        schedulePush('cv', () => pushCv({ html: contentRu, htmlEn: html }));
      }
    }
  }, [editLang, contentRu, contentEn]);

  const handleSave = useCallback(async () => {
    cancelScheduledPush('cv');
    saveCvContent(contentRu, contentEn);
    if (getSyncConfig() || getFirebaseApp()) {
      const r = await pushCv({ html: contentRu, htmlEn: contentEn });
      setSaveMessage(r.ok ? (editLang === 'en' ? 'Saved & Synced' : 'Сохранено и выгружено') : (r.error || (editLang === 'en' ? 'Sync error' : 'Ошибка выгрузки')));
    } else {
      setSaveMessage(editLang === 'en' ? 'Saved' : 'Сохранено');
    }
    setTimeout(() => setSaveMessage(null), 3000);
  }, [contentRu, contentEn, editLang]);

  const handlePushToRepo = useCallback(async () => {
    if (!getSyncConfig()) {
      setPushStatus(editLang === 'en' ? 'Configure GitHub sync' : 'Настройте синхронизацию с GitHub');
      return;
    }
    cancelScheduledPush('cv');
    setPushStatus(editLang === 'en' ? 'Sending…' : 'Отправка…');
    const r = await pushCv({ html: contentRu, htmlEn: contentEn });
    setPushStatus(r.ok ? (editLang === 'en' ? 'Pushed to repo' : 'Выгружено в репо') : (r.error || (editLang === 'en' ? 'Error' : 'Ошибка')));
  }, [contentRu, contentEn, editLang]);

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
    return <CvView contentRu={contentRu} contentEn={contentEn} initialized={initialized} />;
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
        <a href="/" className="cv-admin-home">← {editLang === 'en' ? 'Home' : 'Главная'}</a>
        <span className="cv-admin-title">CV — {editLang === 'en' ? 'Edit Mode' : 'режим редактирования'}</span>

        <div
          className="cv-admin-lang-tabs"
          style={{
            display: 'inline-flex',
            borderRadius: 6,
            border: '1px solid var(--pico-border-color)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setEditLang('ru')}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: editLang === 'ru' ? 600 : 400,
              background: editLang === 'ru' ? 'var(--pico-primary-background)' : 'transparent',
              color: editLang === 'ru' ? 'var(--pico-primary-inverse)' : 'inherit',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🇷🇺 Русский
          </button>
          <button
            type="button"
            onClick={() => setEditLang('en')}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: editLang === 'en' ? 600 : 400,
              background: editLang === 'en' ? 'var(--pico-primary-background)' : 'transparent',
              color: editLang === 'en' ? 'var(--pico-primary-inverse)' : 'inherit',
              border: 'none',
              borderLeft: '1px solid var(--pico-border-color)',
              cursor: 'pointer',
            }}
          >
            🇬🇧 English
          </button>
        </div>

        <button type="button" onClick={handleSave} className="cv-admin-save">
          <span className="cv-save-long">{editLang === 'en' ? 'Save (Ctrl+S)' : 'Сохранить (Ctrl+S)'}</span>
          <span className="cv-save-short">{editLang === 'en' ? 'Save' : 'Сохранить'}</span>
        </button>
        {saveMessage != null && <span className="cv-admin-status">{saveMessage}</span>}
        {getSyncConfig() && (
          <button type="button" onClick={handlePushToRepo} className="secondary cv-admin-push">
            {editLang === 'en' ? 'Push to Repo' : 'Выгрузить в репо'}
          </button>
        )}
        {pushStatus != null && <span className="cv-admin-status cv-admin-status--muted">{pushStatus}</span>}
      </header>
      <div className="cv-admin-layout" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div className="cv-admin-editor">
          <RichTextEditor
            key={editLang}
            value={initialized ? (editLang === 'ru' ? contentRu : contentEn) : ''}
            onChange={handleChange}
            placeholder={
              editLang === 'ru'
                ? 'Введите резюме на русском. Можно вставлять картинки, настраивать обтекание, зум, поворот, ч/б.'
                : 'Enter CV in English. You can insert images, adjust wrapping, zoom, rotation, grayscale.'
            }
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
