import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLang } from '@/lib/i18n';
import {
  LegalNoticeContent,
  LegalDataBundle,
  DEFAULT_LEGAL_BUNDLE,
} from '@/lib/legalDefaults';
import {
  getSyncConfig,
  getLegalFromRepo,
  pushLegal,
  schedulePush,
  cancelScheduledPush,
} from '@/lib/githubSync';
import { getFirebaseApp } from '@/lib/firebaseAuth';

const STORAGE_KEY = 'igor-legal-data';

function loadLegalFromLocal(): LegalDataBundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LEGAL_BUNDLE;
    const parsed = JSON.parse(raw);
    const ru = { ...DEFAULT_LEGAL_BUNDLE.ru, ...(parsed.ru || {}) };
    if (ru.title === 'Справка о форме деятельности') {
      ru.title = 'Справка о деятельности';
    }
    return {
      version: parsed.version || 1,
      ru,
      en: { ...DEFAULT_LEGAL_BUNDLE.en, ...(parsed.en || {}) },
    };
  } catch {
    return DEFAULT_LEGAL_BUNDLE;
  }
}

function saveLegalToLocal(bundle: LegalDataBundle): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

interface LegalPageProps {
  isAdmin?: boolean;
}

export const LegalPage: React.FC<LegalPageProps> = ({ isAdmin = false }) => {
  const { lang, isEn } = useLang();
  const [bundle, setBundle] = useState<LegalDataBundle>(loadLegalFromLocal);
  const [isEditing, setIsEditing] = useState(false);
  const [editLang, setEditLang] = useState<'ru' | 'en'>(() => (isEn ? 'en' : 'ru'));
  const [initialized, setInitialized] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  // Load latest data from Firebase or repo / public json
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (getSyncConfig() || getFirebaseApp()) {
        try {
          const remote = await getLegalFromRepo();
          if (!cancelled && remote?.ru && remote?.en) {
            const merged: LegalDataBundle = {
              version: remote.version || 1,
              ru: { ...DEFAULT_LEGAL_BUNDLE.ru, ...remote.ru },
              en: { ...DEFAULT_LEGAL_BUNDLE.en, ...remote.en },
            };
            setBundle(merged);
            saveLegalToLocal(merged);
            setInitialized(true);
            return;
          }
        } catch {
          /* fallback to local/fetch */
        }
      }

      try {
        const res = await fetch('/data/legal.json');
        if (res.ok) {
          const d = await res.json();
          if (!cancelled && d?.ru && d?.en) {
            const merged: LegalDataBundle = {
              version: d.version || 1,
              ru: { ...DEFAULT_LEGAL_BUNDLE.ru, ...d.ru },
              en: { ...DEFAULT_LEGAL_BUNDLE.en, ...d.en },
            };
            setBundle(merged);
            saveLegalToLocal(merged);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setInitialized(true);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update specific language content
  const updateContent = useCallback(
    (updater: (prev: LegalNoticeContent) => LegalNoticeContent) => {
      setBundle((prev) => {
        const targetLang = editLang;
        const updatedLangContent = updater(prev[targetLang]);
        const updatedBundle: LegalDataBundle = {
          ...prev,
          [targetLang]: updatedLangContent,
        };
        saveLegalToLocal(updatedBundle);
        if (getSyncConfig() || getFirebaseApp()) {
          schedulePush('legal', () => pushLegal(updatedBundle));
        }
        return updatedBundle;
      });
    },
    [editLang]
  );

  // Manual save
  const handleSave = useCallback(async () => {
    cancelScheduledPush('legal');
    saveLegalToLocal(bundle);
    if (getSyncConfig() || getFirebaseApp()) {
      const r = await pushLegal(bundle);
      setSaveMessage(
        r.ok
          ? editLang === 'en'
            ? 'Saved & Synced'
            : 'Сохранено и выгружено'
          : r.error || (editLang === 'en' ? 'Sync error' : 'Ошибка синхронизации')
      );
    } else {
      setSaveMessage(editLang === 'en' ? 'Saved locally' : 'Сохранено локально');
    }
    setTimeout(() => setSaveMessage(null), 3000);
  }, [bundle, editLang]);

  // Push to GitHub Repo
  const handlePushToRepo = useCallback(async () => {
    if (!getSyncConfig()) {
      setPushStatus(
        editLang === 'en' ? 'Configure GitHub sync' : 'Настройте синхронизацию с GitHub'
      );
      return;
    }
    cancelScheduledPush('legal');
    setPushStatus(editLang === 'en' ? 'Sending…' : 'Отправка…');
    const r = await pushLegal(bundle);
    setPushStatus(
      r.ok
        ? editLang === 'en'
          ? 'Pushed to repo'
          : 'Выгружено в репо'
        : r.error || (editLang === 'en' ? 'Error' : 'Ошибка')
    );
    setTimeout(() => setPushStatus(null), 3500);
  }, [bundle, editLang]);

  // Reset to default
  const handleResetToDefault = useCallback(() => {
    const confirmMsg =
      editLang === 'en'
        ? 'Reset legal notice to default values for both languages?'
        : 'Сбросить справку о деятельности к исходным значениям для обоих языков?';
    if (!window.confirm(confirmMsg)) return;

    cancelScheduledPush('legal');
    setBundle(DEFAULT_LEGAL_BUNDLE);
    saveLegalToLocal(DEFAULT_LEGAL_BUNDLE);
    if (getSyncConfig() || getFirebaseApp()) {
      void pushLegal(DEFAULT_LEGAL_BUNDLE);
    }
    setSaveMessage(editLang === 'en' ? 'Reset to defaults' : 'Сброшено к исходным');
    setTimeout(() => setSaveMessage(null), 3000);
  }, [editLang]);

  // Keyboard shortcut Ctrl+S
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

  // Current content to display or edit
  const displayLang = isAdmin ? (isEditing ? editLang : editLang) : isEn ? 'en' : 'ru';
  const current = useMemo(() => bundle[displayLang] || DEFAULT_LEGAL_BUNDLE[displayLang], [
    bundle,
    displayLang,
  ]);

  if (!initialized) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-500">
        {isEn ? 'Loading legal notice…' : 'Загрузка справки о деятельности…'}
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Admin Control Bar */}
      {isAdmin && (
        <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <a
                href="/"
                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                ← {editLang === 'en' ? 'Home' : 'Главная'}
              </a>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">
                {editLang === 'en' ? 'Legal Notice Admin' : 'Справка о деятельности — панель управления'}
              </span>
            </div>

            {/* Mode switch */}
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  !isEditing
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                👁 {editLang === 'en' ? 'Preview' : 'Просмотр'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  isEditing
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                ✏️ {editLang === 'en' ? 'Edit' : 'Редактировать'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Language tabs */}
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setEditLang('ru')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  editLang === 'ru'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                🇷🇺 Русский
              </button>
              <button
                type="button"
                onClick={() => setEditLang('en')}
                className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  editLang === 'en'
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                🇬🇧 English
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 shadow-sm"
              >
                <span>💾</span>
                <span>{editLang === 'en' ? 'Save (Ctrl+S)' : 'Сохранить (Ctrl+S)'}</span>
              </button>

              {getSyncConfig() && (
                <button
                  type="button"
                  onClick={handlePushToRepo}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700 transition-colors"
                >
                  {editLang === 'en' ? 'Push to Repo' : 'Выгрузить в репо'}
                </button>
              )}

              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={editLang === 'en' ? 'Reset to defaults' : 'Сбросить к исходным'}
              >
                ↺ {editLang === 'en' ? 'Reset' : 'Сброс'}
              </button>
            </div>
          </div>

          {(saveMessage || pushStatus) && (
            <div className="text-xs pt-1 flex items-center gap-2">
              {saveMessage && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ {saveMessage}
                </span>
              )}
              {pushStatus && (
                <span className="text-blue-600 dark:text-blue-400">{pushStatus}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Legal Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Header */}
        <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          {isAdmin && isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  {editLang === 'en' ? 'Page Title' : 'Заголовок страницы'}
                </label>
                <input
                  type="text"
                  value={current.title}
                  onChange={(e) =>
                    updateContent((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  {editLang === 'en' ? 'Subtitle' : 'Подзаголовок'}
                </label>
                <input
                  type="text"
                  value={current.subtitle}
                  onChange={(e) =>
                    updateContent((prev) => ({ ...prev, subtitle: e.target.value }))
                  }
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 m-0">
                {current.title}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-0">
                {current.subtitle}
              </p>
            </>
          )}
        </div>

        {/* Content sections */}
        <div className="space-y-6 text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300">
          {/* Section 1: Entity Details */}
          <section className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80">
            {isAdmin && isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-base sm:text-lg">🏛</span>
                    <input
                      type="text"
                      value={current.entityTitle}
                      onChange={(e) =>
                        updateContent((prev) => ({ ...prev, entityTitle: e.target.value }))
                      }
                      className="bg-transparent border-b border-gray-300 dark:border-gray-600 px-1 py-0.5 font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-base"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent((prev) => ({
                        ...prev,
                        entityItems: [...prev.entityItems, { label: 'Новое поле:', value: '' }],
                      }))
                    }
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    + {editLang === 'en' ? 'Add row' : 'Добавить строку'}
                  </button>
                </div>

                <div className="space-y-2">
                  {current.entityItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateContent((prev) => {
                            const items = [...prev.entityItems];
                            items[idx] = { ...items[idx], label: val };
                            return { ...prev, entityItems: items };
                          });
                        }}
                        className="w-1/3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1 text-xs font-semibold text-gray-900 dark:text-gray-100"
                        placeholder="Метка"
                      />
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateContent((prev) => {
                            const items = [...prev.entityItems];
                            items[idx] = { ...items[idx], value: val };
                            return { ...prev, entityItems: items };
                          });
                        }}
                        className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200 font-mono"
                        placeholder="Значение"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateContent((prev) => ({
                            ...prev,
                            entityItems: prev.entityItems.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span>🏛</span> {current.entityTitle}
                </h2>
                <div className="space-y-2 text-sm">
                  {current.entityItems.map((item, idx) => (
                    <p key={idx} className="m-0">
                      <strong>{item.label} </strong>
                      <span
                        className={
                          idx === 0
                            ? 'font-mono font-medium text-gray-900 dark:text-gray-100'
                            : ''
                        }
                      >
                        {item.value}
                      </span>
                    </p>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Section 2: Scope of Services */}
          <section>
            {isAdmin && isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-base sm:text-lg">📐</span>
                    <input
                      type="text"
                      value={current.servicesTitle}
                      onChange={(e) =>
                        updateContent((prev) => ({ ...prev, servicesTitle: e.target.value }))
                      }
                      className="bg-transparent border-b border-gray-300 dark:border-gray-600 px-1 py-0.5 font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-base"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent((prev) => ({
                        ...prev,
                        servicesItems: [...prev.servicesItems, ''],
                      }))
                    }
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    + {editLang === 'en' ? 'Add service' : 'Добавить пункт'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    {editLang === 'en' ? 'Introductory text' : 'Вводный текст'}
                  </label>
                  <textarea
                    rows={2}
                    value={current.servicesIntro}
                    onChange={(e) =>
                      updateContent((prev) => ({ ...prev, servicesIntro: e.target.value }))
                    }
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200"
                  />
                </div>

                <div className="space-y-2">
                  {current.servicesItems.map((svc, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 mt-2">•</span>
                      <textarea
                        rows={2}
                        value={svc}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateContent((prev) => {
                            const items = [...prev.servicesItems];
                            items[idx] = val;
                            return { ...prev, servicesItems: items };
                          });
                        }}
                        className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200"
                        placeholder="Описание услуги"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateContent((prev) => ({
                            ...prev,
                            servicesItems: prev.servicesItems.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-gray-400 hover:text-red-500 p-1 mt-1"
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span>📐</span> {current.servicesTitle}
                </h2>
                {current.servicesIntro && (
                  <p className="text-sm sm:text-base mb-2">{current.servicesIntro}</p>
                )}
                <ul className="list-disc pl-5 space-y-1.5 text-sm">
                  {current.servicesItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Section 3: Invoicing, Banking & Taxation */}
          <section className="bg-blue-50/50 dark:bg-blue-950/20 rounded-xl p-5 border border-blue-100 dark:border-blue-900/50">
            {isAdmin && isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-base sm:text-lg">💳</span>
                    <input
                      type="text"
                      value={current.financeTitle}
                      onChange={(e) =>
                        updateContent((prev) => ({ ...prev, financeTitle: e.target.value }))
                      }
                      className="bg-transparent border-b border-gray-300 dark:border-gray-600 px-1 py-0.5 font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-base"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateContent((prev) => ({
                        ...prev,
                        financeParagraphs: [...prev.financeParagraphs, ''],
                      }))
                    }
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    + {editLang === 'en' ? 'Add paragraph' : 'Добавить абзац'}
                  </button>
                </div>

                <div className="space-y-2">
                  {current.financeParagraphs.map((para, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <textarea
                        rows={3}
                        value={para}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateContent((prev) => {
                            const paras = [...prev.financeParagraphs];
                            paras[idx] = val;
                            return { ...prev, financeParagraphs: paras };
                          });
                        }}
                        className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200"
                        placeholder="Текст порядка расчетов, банковских реквизитов или налогового статуса"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateContent((prev) => ({
                            ...prev,
                            financeParagraphs: prev.financeParagraphs.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-gray-400 hover:text-red-500 p-1 mt-1"
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span>💳</span> {current.financeTitle}
                </h2>
                <div className="space-y-2 text-sm">
                  {current.financeParagraphs.map((para, idx) => (
                    <p key={idx} className="m-0">
                      {para}
                    </p>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Section 4: Contact Details */}
          <section>
            {isAdmin && isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg">📬</span>
                  <input
                    type="text"
                    value={current.contactsTitle}
                    onChange={(e) =>
                      updateContent((prev) => ({ ...prev, contactsTitle: e.target.value }))
                    }
                    className="bg-transparent border-b border-gray-300 dark:border-gray-600 px-1 py-0.5 font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-base"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                    <label className="block text-xs text-gray-500 mb-1">
                      {editLang === 'en' ? 'Primary Email' : 'Основная почта'}
                    </label>
                    <input
                      type="email"
                      value={current.contactEmail1}
                      onChange={(e) =>
                        updateContent((prev) => ({ ...prev, contactEmail1: e.target.value }))
                      }
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-blue-600 dark:text-blue-400 font-medium"
                    />
                  </div>

                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                    <label className="block text-xs text-gray-500 mb-1">
                      {editLang === 'en' ? 'Alternative Email' : 'Вторая почта'}
                    </label>
                    <input
                      type="email"
                      value={current.contactEmail2}
                      onChange={(e) =>
                        updateContent((prev) => ({ ...prev, contactEmail2: e.target.value }))
                      }
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-blue-600 dark:text-blue-400 font-medium"
                    />
                  </div>

                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 space-y-1.5">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Telegram (Ник)</label>
                      <input
                        type="text"
                        value={current.contactTelegram}
                        onChange={(e) =>
                          updateContent((prev) => ({ ...prev, contactTelegram: e.target.value }))
                        }
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-blue-600 dark:text-blue-400 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Ссылка</label>
                      <input
                        type="text"
                        value={current.contactTelegramUrl || ''}
                        onChange={(e) =>
                          updateContent((prev) => ({
                            ...prev,
                            contactTelegramUrl: e.target.value,
                          }))
                        }
                        placeholder="https://t.me/..."
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span>📬</span> {current.contactsTitle}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                    <span className="block text-xs text-gray-500 mb-1">
                      {isEn ? 'Primary Email' : 'Основная почта'}
                    </span>
                    <a
                      href={`mailto:${current.contactEmail1}`}
                      className="text-blue-600 dark:text-blue-400 font-medium hover:underline break-all"
                    >
                      {current.contactEmail1}
                    </a>
                  </div>
                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                    <span className="block text-xs text-gray-500 mb-1">
                      {isEn ? 'Alternative Email' : 'Вторая почта'}
                    </span>
                    <a
                      href={`mailto:${current.contactEmail2}`}
                      className="text-blue-600 dark:text-blue-400 font-medium hover:underline break-all"
                    >
                      {current.contactEmail2}
                    </a>
                  </div>
                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                    <span className="block text-xs text-gray-500 mb-1">Telegram</span>
                    <a
                      href={current.contactTelegramUrl || `https://t.me/${current.contactTelegram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                    >
                      {current.contactTelegram}
                    </a>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default LegalPage;
