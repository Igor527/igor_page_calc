import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { LANG_OPTIONS, detectLanguage, translate, TRANSLATION_SERVERS_INFO, testMistralAccess, normalizeLangCode } from '@/lib/dictionaryApi';
import { schedulePush, pushDictionary, getDictionaryFromRepo, getSyncConfig } from '@/lib/githubSync';

const STORAGE_KEY = 'igor-dictionary-entries';
const PRIORITY_STORAGE_KEY = 'igor-dictionary-priority';

const DEFAULT_PRIORITY: string[] = ['en', 'sr', 'de', 'es', 'pt', 'it', 'fr'];

export interface DictionaryEntry {
  id: string;
  source: string;
  translation: string;
  transcription?: string;
  fromLang: string;
  toLang: string;
  addedAt: number;
}

function loadEntries(): DictionaryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: DictionaryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadPriorityLanguages(): string[] {
  try {
    const raw = localStorage.getItem(PRIORITY_STORAGE_KEY);
    if (!raw) return DEFAULT_PRIORITY;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_PRIORITY;
  } catch {
    return DEFAULT_PRIORITY;
  }
}

function savePriorityLanguages(list: string[]) {
  localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(list));
}

/** Данные словаря для экспорта в репо. */
export function getDictionaryBundle(): { entries: DictionaryEntry[]; priorityLangs: string[] } {
  return { entries: loadEntries(), priorityLangs: loadPriorityLanguages() };
}

/** Подставить данные из репо. */
export function setDictionaryFromBundle(data: { entries?: DictionaryEntry[]; priorityLangs?: string[] }): void {
  if (data.entries && Array.isArray(data.entries)) saveEntries(data.entries);
  if (data.priorityLangs && Array.isArray(data.priorityLangs)) savePriorityLanguages(data.priorityLangs);
}

/** Загрузить словарь из data/dictionary.json (статический файл сайта). */
export async function loadDictionaryBundle(): Promise<boolean> {
  try {
    const res = await fetch('./data/dictionary.json');
    if (!res.ok) return false;
    const data = await res.json();
    setDictionaryFromBundle(data);
    return true;
  } catch {
    return false;
  }
}

/** Загрузить словарь из репо по API и применить. Возвращает данные для обновления UI. */
export async function loadDictionaryFromRepo(): Promise<{ ok: boolean; entries?: DictionaryEntry[]; priorityLangs?: string[] }> {
  const data = await getDictionaryFromRepo();
  if (!data) return { ok: false };
  setDictionaryFromBundle(data);
  return { ok: true, entries: data.entries as DictionaryEntry[], priorityLangs: data.priorityLangs };
}

function langName(code: string): string {
  return LANG_OPTIONS.find(o => o.code === code)?.name ?? code;
}

const DictionaryPage: React.FC = () => {
  const [text, setText] = useState('');
  const [fromLang, setFromLang] = useState('ru');
  const [toLang, setToLang] = useState('ru'); // по умолчанию перевод на русский
  const [autoFrom, setAutoFrom] = useState(true);
  const [addToDict, setAddToDict] = useState(true); // птичка «Добавить в словарь»
  const [result, setResult] = useState<string | null>(null);
  const [resultTranscription, setResultTranscription] = useState<string | null>(null);
  const [resultProvider, setResultProvider] = useState<string | null>(null);
  const [resultDetectedLang, setResultDetectedLang] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mistralTest, setMistralTest] = useState<string | null>(null);
  const [entries, setEntries] = useState<DictionaryEntry[]>(() => loadEntries());
  const [priorityLangs, setPriorityLangs] = useState<string[]>(() => loadPriorityLanguages());
  const [selectedDictLang, setSelectedDictLang] = useState<string | null>(null);
  const [pullLoading, setPullLoading] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [manualSource, setManualSource] = useState('');
  const [manualTranslation, setManualTranslation] = useState('');
  const [manualFromLang, setManualFromLang] = useState('en');
  const [manualToLang, setManualToLang] = useState('ru');
  const [manualTranscription, setManualTranscription] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [editFromLang, setEditFromLang] = useState('en');
  const [editToLang, setEditToLang] = useState('ru');
  const [editTranscription, setEditTranscription] = useState('');

  useEffect(() => {
    savePriorityLanguages(priorityLangs);
  }, [priorityLangs]);
  useEffect(() => {
    schedulePush('dictionary', () => pushDictionary(entries, priorityLangs));
  }, [entries, priorityLangs]);

  const entriesByLang = useMemo(() => {
    const byLang = new Map<string, DictionaryEntry[]>();
    const list = selectedDictLang ? entries.filter(e => e.fromLang === selectedDictLang) : entries;
    for (const e of list) {
      const arr = byLang.get(e.fromLang) ?? [];
      arr.push(e);
      byLang.set(e.fromLang, arr);
    }
    const prioritySet = new Set(priorityLangs);
    const ordered: { lang: string; items: DictionaryEntry[] }[] = [];
    for (const code of priorityLangs) {
      const items = byLang.get(code);
      if (items?.length) ordered.push({ lang: code, items: items.sort((a, b) => b.addedAt - a.addedAt) });
    }
    for (const [code, items] of byLang) {
      if (!prioritySet.has(code)) ordered.push({ lang: code, items: items.sort((a, b) => b.addedAt - a.addedAt) });
    }
    return ordered;
  }, [entries, priorityLangs, selectedDictLang]);

  const handleTestMistral = useCallback(async () => {
    setMistralTest('Проверка...');
    const result = await testMistralAccess();
    setMistralTest(result.ok ? 'Mistral доступен.' : result.message);
  }, []);

  useEffect(() => {
    saveEntries(entries);
  }, [entries]);

  const handleTranslate = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Введите слово или фразу');
      setResult(null);
      setResultTranscription(null);
      return;
    }
    setError(null);
    setResult(null);
    setResultTranscription(null);
    setResultProvider(null);
    setResultDetectedLang(null);
    const from = autoFrom ? 'auto' : fromLang;

    const existing = autoFrom
      ? entries.find(e => e.source === trimmed && e.toLang === toLang)
      : entries.find(e => e.source === trimmed && e.fromLang === fromLang && e.toLang === toLang);
    if (existing) {
      setResult(existing.translation);
      setResultTranscription(existing.transcription ?? null);
      setResultProvider('Мой словарь');
      setResultDetectedLang(existing.fromLang ? langName(existing.fromLang) : null);
      return;
    }

    setLoading(true);
    const res = await translate(trimmed, from, toLang);
    setLoading(false);
    if (res !== null) {
      const rawDetected = res.detectedFromLang ?? (autoFrom ? detectLanguage(trimmed) : fromLang);
      const savedFrom = normalizeLangCode(rawDetected) ?? rawDetected;
      setResult(res.text);
      setResultTranscription(res.transcription ?? null);
      setResultProvider(res.provider);
      setResultDetectedLang(langName(savedFrom));
      if (addToDict) {
        const id = `e${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const newEntry: DictionaryEntry = {
          id, source: trimmed, translation: res.text, transcription: res.transcription,
          fromLang: savedFrom, toLang, addedAt: Date.now(),
        };
        setEntries(prev => {
          const filtered = prev.filter(e => !(e.source === trimmed && e.fromLang === savedFrom && e.toLang === toLang));
          return [newEntry, ...filtered];
        });
      }
    } else {
      setError(`Не удалось перевести (${TRANSLATION_SERVERS_INFO}). Проверьте соединение или попробуйте позже.`);
    }
  }, [text, fromLang, toLang, autoFrom, addToDict, entries]);

  const swapLangs = useCallback(() => {
    setFromLang(toLang);
    setToLang(fromLang);
    setAutoFrom(false);
    setResult(null);
    setResultTranscription(null);
    setResultDetectedLang(null);
  }, [fromLang, toLang]);

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const addManualEntry = useCallback(() => {
    const src = manualSource.trim();
    const tr = manualTranslation.trim();
    if (!src || !tr) return;
    const from = normalizeLangCode(manualFromLang) ?? manualFromLang;
    const to = normalizeLangCode(manualToLang) ?? manualToLang;
    const id = `e${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEntry: DictionaryEntry = {
      id,
      source: src,
      translation: tr,
      transcription: manualTranscription.trim() || undefined,
      fromLang: from,
      toLang: to,
      addedAt: Date.now(),
    };
    setEntries(prev => [newEntry, ...prev]);
    setManualSource('');
    setManualTranslation('');
    setManualTranscription('');
    setShowManualForm(false);
  }, [manualSource, manualTranslation, manualFromLang, manualToLang, manualTranscription]);

  const updateEntry = useCallback((id: string, patch: Partial<Pick<DictionaryEntry, 'source' | 'translation' | 'transcription' | 'fromLang' | 'toLang'>>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    setEditingEntryId(null);
  }, []);

  const startEdit = useCallback((entry: DictionaryEntry) => {
    setEditingEntryId(entry.id);
    setEditSource(entry.source);
    setEditTranslation(entry.translation);
    setEditFromLang(entry.fromLang);
    setEditToLang(entry.toLang);
    setEditTranscription(entry.transcription ?? '');
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingEntryId) return;
    const from = normalizeLangCode(editFromLang) ?? editFromLang;
    const to = normalizeLangCode(editToLang) ?? editToLang;
    updateEntry(editingEntryId, {
      source: editSource.trim(),
      translation: editTranslation.trim(),
      transcription: editTranscription.trim() || undefined,
      fromLang: from,
      toLang: to,
    });
  }, [editingEntryId, editSource, editTranslation, editFromLang, editToLang, editTranscription, updateEntry]);

  const cancelEdit = useCallback(() => {
    setEditingEntryId(null);
  }, []);

  const movePriority = useCallback((index: number, delta: number) => {
    setPriorityLangs(prev => {
      const i = index + delta;
      if (i < 0 || i >= prev.length) return prev;
      const next = [...prev];
      const t = next[index];
      next[index] = next[i];
      next[i] = t;
      return next;
    });
  }, []);

  const removeFromPriority = useCallback((code: string) => {
    setPriorityLangs(prev => prev.filter(c => c !== code));
  }, []);

  const addToPriority = useCallback((code: string) => {
    setPriorityLangs(prev => prev.includes(code) ? prev : [...prev, code]);
  }, []);

  const dictFilterOptions = useMemo(() => {
    const codes = new Set(entries.map(e => e.fromLang));
    const result: { value: string; label: string }[] = [{ value: '', label: 'Все языки' }];
    for (const code of priorityLangs) {
      if (codes.has(code)) result.push({ value: code, label: langName(code) });
    }
    for (const code of codes) {
      if (!priorityLangs.includes(code)) result.push({ value: code, label: langName(code) });
    }
    return result;
  }, [entries, priorityLangs]);

  const fillFromEntry = useCallback((e: DictionaryEntry) => {
    setText(e.source);
    setFromLang(e.fromLang);
    setToLang(e.toLang);
    setAutoFrom(false);
    setResult(e.translation);
    setResultTranscription(e.transcription ?? null);
    setResultProvider('Мой словарь');
  }, []);

  const handlePullFromRepo = useCallback(async () => {
    setPullError(null);
    setPullLoading(true);
    try {
      const result = await loadDictionaryFromRepo();
      if (result.ok && result.entries != null && result.priorityLangs != null) {
        setEntries(result.entries);
        setPriorityLangs(result.priorityLangs);
      } else {
        setPullError('Не удалось загрузить словарь из репо.');
      }
    } catch (e) {
      setPullError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setPullLoading(false);
    }
  }, []);

  return (
    <main className="max-w-[600px] mx-auto px-4 py-8">
      <h1 style={{ marginBottom: 8 }}>Словарь / Перевод</h1>
      <p style={{ color: 'var(--pico-muted-color)', fontSize: 14, marginBottom: 8 }}>
        Введите слово или фразу. Язык исходного текста — авто или вручную. По умолчанию перевод на русский; с русского — на выбранный язык.
      </p>
      <p style={{ color: 'var(--pico-muted-color)', fontSize: 12, marginBottom: 12 }}>
        Сервисы: {TRANSLATION_SERVERS_INFO}
      </p>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {getSyncConfig() && (
          <>
            <button type="button" className="outline" style={{ fontSize: 12 }} onClick={handlePullFromRepo} disabled={pullLoading}>
              {pullLoading ? 'Загрузка…' : 'Выгрузить последний сэйв из репо'}
            </button>
            <button type="button" className="outline" style={{ fontSize: 12 }} onClick={() => pushDictionary(entries, priorityLangs).then(() => {})}>
              Загрузить в репо
            </button>
            {pullError && <span style={{ fontSize: 12, color: 'var(--pico-del-color)' }}>{pullError}</span>}
          </>
        )}
        <button type="button" className="outline" style={{ fontSize: 12 }} onClick={handleTestMistral}>
          Проверить доступ к Mistral
        </button>
        {mistralTest !== null && (
          <span style={{ fontSize: 12, color: mistralTest.startsWith('Mistral доступен') ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {mistralTest}
          </span>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 4 }}>
          Текст
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Слово или фраза для перевода..."
          rows={2}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 16,
            border: '1px solid var(--pico-border-color)',
            borderRadius: 8,
            background: 'var(--pico-form-element-background-color)',
            color: 'var(--pico-color)',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={autoFrom}
            onChange={e => setAutoFrom(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>Авто язык</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Сохранять перевод в «Мой словарь»">
          <input
            type="checkbox"
            checked={addToDict}
            onChange={e => setAddToDict(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>Добавить в словарь</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={fromLang}
            onChange={e => setFromLang(e.target.value)}
            disabled={autoFrom}
            style={{
              padding: '6px 10px',
              fontSize: 13,
              border: '1px solid var(--pico-border-color)',
              borderRadius: 6,
              background: 'var(--pico-form-element-background-color)',
              color: 'var(--pico-color)',
              minWidth: 140,
            }}
          >
            {LANG_OPTIONS.map(opt => (
              <option key={opt.code} value={opt.code}>{opt.name}</option>
            ))}
          </select>
          <button type="button" onClick={swapLangs} title="Поменять языки местами" style={{ padding: '6px 10px' }}>
            ⇄
          </button>
          <select
            value={toLang}
            onChange={e => setToLang(e.target.value)}
            style={{
              padding: '6px 10px',
              fontSize: 13,
              border: '1px solid var(--pico-border-color)',
              borderRadius: 6,
              background: 'var(--pico-form-element-background-color)',
              color: 'var(--pico-color)',
              minWidth: 140,
            }}
          >
            {LANG_OPTIONS.map(opt => (
              <option key={opt.code} value={opt.code}>{opt.name}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={handleTranslate} disabled={loading}>
          {loading ? '…' : 'Перевести'}
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}
      {result !== null && (
        <div
          style={{
            padding: 16,
            border: '1px solid var(--pico-border-color)',
            borderRadius: 8,
            background: 'var(--pico-card-background-color)',
            fontSize: 18,
          }}
        >
          {result}
          {resultTranscription && (
            <p style={{ fontSize: 14, color: 'var(--pico-muted-color)', marginTop: 6, marginBottom: 0, fontStyle: 'italic' }}>
              Произношение (исходное): [{resultTranscription}]
            </p>
          )}
          {(resultDetectedLang || resultProvider) && (
            <p style={{ fontSize: 11, color: 'var(--pico-muted-color)', marginTop: 8, marginBottom: 0 }}>
              {resultDetectedLang && <>Язык: {resultDetectedLang}. </>}
              {resultProvider && <>Через: {resultProvider}</>}
            </p>
          )}
        </div>
      )}

      <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--pico-border-color)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Приоритет языков</h2>
          <p style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 12 }}>
            Порядок разделов в словаре. Добавьте или уберите язык, двигайте вверх/вниз.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            {priorityLangs.map((code, idx) => (
              <span
                key={code}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  border: '1px solid var(--pico-border-color)',
                  borderRadius: 6,
                  fontSize: 13,
                  background: 'var(--pico-card-background-color)',
                }}
              >
                <button type="button" onClick={() => movePriority(idx, -1)} title="Выше" style={{ padding: '2px 4px', fontSize: 11 }} disabled={idx === 0}>↑</button>
                <button type="button" onClick={() => movePriority(idx, 1)} title="Ниже" style={{ padding: '2px 4px', fontSize: 11 }} disabled={idx === priorityLangs.length - 1}>↓</button>
                {langName(code)}
                <button type="button" onClick={() => removeFromPriority(code)} title="Убрать из приоритета" style={{ padding: '2px 4px', fontSize: 11 }}>✕</button>
              </span>
            ))}
            <select
              value=""
              onChange={e => { const v = e.target.value; if (v) addToPriority(v); e.target.value = ''; }}
              style={{ fontSize: 12, padding: '4px 8px', minWidth: 120 }}
              title="Добавить язык в приоритет"
            >
              <option value="">+ язык</option>
              {LANG_OPTIONS.filter(o => !priorityLangs.includes(o.code)).map(o => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
            </select>
          </div>

          <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>Мой словарь</h2>
                <select
                  value={selectedDictLang ?? ''}
                  onChange={e => setSelectedDictLang(e.target.value || null)}
                  style={{ fontSize: 13, padding: '4px 8px' }}
                >
                  {dictFilterOptions.map(opt => (
                    <option key={opt.value || '_all'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="outline"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setShowManualForm(v => !v)}
                >
                  {showManualForm ? 'Скрыть форму' : 'Добавить вручную'}
                </button>
              </div>
              {showManualForm && (
                <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--pico-border-color)', borderRadius: 8, background: 'var(--pico-card-background-color)' }}>
                  <p style={{ fontSize: 12, color: 'var(--pico-muted-color)', marginBottom: 8 }}>Добавить запись без перевода: исходное слово, перевод и языки.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text"
                      value={manualSource}
                      onChange={e => setManualSource(e.target.value)}
                      placeholder="Исходное слово/фраза"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                    />
                    <input
                      type="text"
                      value={manualTranslation}
                      onChange={e => setManualTranslation(e.target.value)}
                      placeholder="Перевод"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                    />
                    <input
                      type="text"
                      value={manualTranscription}
                      onChange={e => setManualTranscription(e.target.value)}
                      placeholder="Произношение (IPA, необязательно)"
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={manualFromLang} onChange={e => setManualFromLang(e.target.value)} style={{ fontSize: 13, padding: '4px 8px' }}>
                        {LANG_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                      </select>
                      <span style={{ color: 'var(--pico-muted-color)' }}>→</span>
                      <select value={manualToLang} onChange={e => setManualToLang(e.target.value)} style={{ fontSize: 13, padding: '4px 8px' }}>
                        {LANG_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                      </select>
                      <button type="button" className="primary" onClick={addManualEntry} style={{ fontSize: 13 }}>Сохранить</button>
                    </div>
                  </div>
                </div>
              )}
              {entries.length === 0 && !showManualForm && (
                <p style={{ fontSize: 13, color: 'var(--pico-muted-color)', marginBottom: 12 }}>Пока записей нет. Переведите с галочкой «Добавить в словарь» или нажмите «Добавить вручную».</p>
              )}
              {entriesByLang.map(({ lang, items }) => (
                <div key={lang} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, color: 'var(--pico-muted-color)', marginBottom: 8, fontWeight: 600 }}>
                    — {langName(lang)} —
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {items.map(entry => (
                      <li
                        key={entry.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          borderBottom: '1px solid var(--pico-border-color)',
                          flexWrap: 'wrap',
                        }}
                      >
                        {editingEntryId === entry.id ? (
                          <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--pico-card-background-color)', borderRadius: 6 }}>
                            <input type="text" value={editSource} onChange={e => setEditSource(e.target.value)} placeholder="Исходное" style={{ padding: '6px 8px', fontSize: 13 }} />
                            <input type="text" value={editTranslation} onChange={e => setEditTranslation(e.target.value)} placeholder="Перевод" style={{ padding: '6px 8px', fontSize: 13 }} />
                            <input type="text" value={editTranscription} onChange={e => setEditTranscription(e.target.value)} placeholder="Произношение (IPA)" style={{ padding: '6px 8px', fontSize: 12 }} />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <select value={editFromLang} onChange={e => setEditFromLang(e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}>
                                {LANG_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                              </select>
                              <span style={{ color: 'var(--pico-muted-color)' }}>→</span>
                              <select value={editToLang} onChange={e => setEditToLang(e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}>
                                {LANG_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                              </select>
                              <button type="button" className="primary" onClick={saveEdit} style={{ fontSize: 12 }}>Сохранить</button>
                              <button type="button" className="outline" onClick={cancelEdit} style={{ fontSize: 12 }}>Отмена</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="outline"
                              style={{ textAlign: 'left', flex: '1 1 200px', minWidth: 0, fontSize: 14, display: 'block' }}
                              onClick={() => fillFromEntry(entry)}
                            >
                              <span>
                                <strong>{entry.source}</strong>
                                <span style={{ color: 'var(--pico-muted-color)', margin: '0 6px' }}>→</span>
                                {entry.translation}
                              </span>
                              {entry.transcription && (
                                <span style={{ display: 'block', fontSize: 12, color: 'var(--pico-muted-color)', fontStyle: 'italic', marginTop: 2 }}>
                                  Произношение: [{entry.transcription}]
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: 'var(--pico-muted-color)', marginLeft: 6 }}>
                                {langName(entry.fromLang)} → {langName(entry.toLang)}
                              </span>
                            </button>
                            <button type="button" className="outline" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => startEdit(entry)} title="Изменить (в т.ч. язык)">✎</button>
                            <button
                              type="button"
                              className="outline secondary"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              onClick={() => removeEntry(entry.id)}
                              title="Удалить"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
        </section>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--pico-muted-color)' }}>
        <a href="/" style={{ color: 'var(--pico-primary)' }}>← На главную</a>
      </p>
    </main>
  );
};

export default DictionaryPage;
