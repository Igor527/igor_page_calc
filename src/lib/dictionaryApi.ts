/**
 * Языковая детекция и перевод для словаря.
 * По умолчанию: Mistral AI (если задан VITE_MISTRAL_API_KEY), иначе MyMemory и Lingva.
 */

export const LANG_OPTIONS: { code: string; name: string }[] = [
  { code: 'en', name: 'Английский' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Немецкий' },
  { code: 'fr', name: 'Французский' },
  { code: 'es', name: 'Испанский' },
  { code: 'it', name: 'Итальянский' },
  { code: 'pt', name: 'Португальский' },
  { code: 'uk', name: 'Украинский' },
  { code: 'pl', name: 'Польский' },
  { code: 'sr', name: 'Сербский' },
  { code: 'hr', name: 'Хорватский' },
  { code: 'bs', name: 'Боснийский' },
  { code: 'el', name: 'Греческий' },
  { code: 'zh', name: 'Китайский' },
  { code: 'ja', name: 'Японский' },
  { code: 'ko', name: 'Корейский' },
  { code: 'ar', name: 'Арабский' },
  { code: 'tr', name: 'Турецкий' },
  { code: 'nl', name: 'Голландский' },
  { code: 'sv', name: 'Шведский' },
  { code: 'la', name: 'Латынь' },
];

const LANG_CODES = new Set(LANG_OPTIONS.map((o) => o.code));

/** 3-буквенные коды ISO 639-2 → 2-буквенные для совпадения с LANG_OPTIONS */
const ISO3_TO_2: Record<string, string> = {
  eng: 'en', rus: 'ru', deu: 'de', fra: 'fr', spa: 'es', ita: 'it', por: 'pt', ukr: 'uk', pol: 'pl',
  srp: 'sr', hrv: 'hr', bos: 'bs', ell: 'el', zho: 'zh', jpn: 'ja', kor: 'ko', ara: 'ar', tur: 'tr',
  nld: 'nl', swe: 'sv', lat: 'la',
};

/** Нормализовать код языка от Mistral: привести к одному из LANG_OPTIONS. */
export function normalizeLangCode(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase().slice(0, 6).replace(/\s*\(.*\)$/, '');
  const two = s.slice(0, 2);
  const three = s.slice(0, 3);
  if (LANG_CODES.has(two)) return two;
  if (LANG_CODES.has(three)) return three;
  if (ISO3_TO_2[three]) return ISO3_TO_2[three];
  return LANG_CODES.has(s) ? s : undefined;
}

function hasScript(text: string, regex: RegExp): boolean {
  return regex.test(text);
}

const CYRILLIC = /[\u0400-\u04FF]/;
const GREEK = /[\u0370-\u03FF]/;
const CJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/;
const HANGUL = /[\uac00-\ud7af]/;
const ARABIC = /[\u0600-\u06FF]/;

/**
 * Эвристическое определение языка по скрипту.
 */
export function detectLanguage(word: string): string {
  const t = word.trim();
  if (!t) return 'en';
  if (hasScript(t, CYRILLIC)) return 'ru';
  if (hasScript(t, GREEK)) return 'el';
  if (hasScript(t, CJK)) return /[\u3040-\u309f\u30a0-\u30ff]/.test(t) ? 'ja' : 'zh';
  if (hasScript(t, HANGUL)) return 'ko';
  if (hasScript(t, ARABIC)) return 'ar';
  return 'en';
}

function langNameForPrompt(code: string): string {
  return LANG_OPTIONS.find(o => o.code === code)?.name ?? code;
}

/** Названия провайдеров для UI */
export const PROVIDER_MISTRAL = 'Mistral AI';
export const PROVIDER_MYMEMORY = 'MyMemory (mymemory.translated.net)';
export const PROVIDER_LINGVA = 'Lingva (Google Translate)';

/** Строка для отображения списка сервисов */
export const TRANSLATION_SERVERS_INFO = 'Mistral AI (по умолчанию), запасные: MyMemory, Lingva';

const MISTRAL_MODELS = ['mistral-small-latest', 'open-mistral-7b'] as const;

/** Извлекает текст из message.content (строка или массив chunk'ов с type: "text") */
function extractMistralContent(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() || null;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'text' && typeof part.text === 'string') return part.text.trim() || null;
    }
  }
  return null;
}

/** В dev запрос идёт через прокси Vite (обход CORS), ключ подставляет сервер */
function getMistralApiUrl(): string {
  return import.meta.env.DEV ? '/api/mistral' : 'https://api.mistral.ai/v1/chat/completions';
}

/** В dev ключ не отправляем из браузера — его подставляет прокси в vite.config */
function useMistralProxy(): boolean {
  return import.meta.env.DEV;
}

export function getMistralApiKey(): string {
  try {
    return (import.meta.env?.VITE_MISTRAL_API_KEY as string)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Результат проверки доступа к Mistral */
export type MistralTestResult = { ok: true } | { ok: false; message: string };

/**
 * Проверка доступа к Mistral: есть ли ключ, отвечает ли API.
 * Вызывайте со страницы словаря для диагностики.
 */
export async function testMistralAccess(): Promise<MistralTestResult> {
  const useProxy = useMistralProxy();
  const key = getMistralApiKey();
  if (!useProxy && !key) {
    return { ok: false, message: 'Ключ не задан. Добавьте VITE_MISTRAL_API_KEY в .env и перезапустите dev-сервер.' };
  }
  if (useProxy && !key) {
    return { ok: false, message: 'Ключ не задан в .env. Добавьте VITE_MISTRAL_API_KEY и перезапустите npm run dev.' };
  }

  const url = getMistralApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!useProxy && key) headers['Authorization'] = `Bearer ${key}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MISTRAL_MODELS[0],
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 10,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        return { ok: true };
      }
      return { ok: false, message: `API вернул пустой ответ (status ${res.status}).` };
    }

    const status = res.status;
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }

    if (status === 401) {
      return { ok: false, message: '401 — неверный или просроченный ключ. Проверьте ключ в .env и консоль Mistral.' };
    }
    if (status === 403) {
      return { ok: false, message: '403 — доступ запрещён (ключ без прав или модель недоступна).' };
    }
    if (status === 429) {
      return { ok: false, message: '429 — превышен лимит запросов. Подождите или проверьте квоту в Mistral.' };
    }
    if (status >= 500) {
      return { ok: false, message: `${status} — ошибка сервера Mistral. Попробуйте позже.` };
    }

    return { ok: false, message: `${status} — ${body || res.statusText}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
      return { ok: false, message: 'Нет доступа к api.mistral.ai (сеть, CORS или фаервол).' };
    }
    return { ok: false, message: `Ошибка: ${msg}` };
  }
}

/** Результат запроса к Mistral (простой запрос–ответ для CV и др.). */
export type MistralChatResult = { ok: true; text: string } | { ok: false; message: string };

/**
 * Один запрос – один ответ через Mistral Chat. Для CV: проверка текста, правки и т.п.
 */
export async function mistralChat(userMessage: string): Promise<MistralChatResult> {
  const trimmed = userMessage?.trim();
  if (!trimmed) return { ok: false, message: 'Введите запрос.' };

  const useProxy = useMistralProxy();
  const key = getMistralApiKey();
  if (!useProxy && !key) return { ok: false, message: 'Добавьте VITE_MISTRAL_API_KEY в .env.' };
  if (useProxy && !key) return { ok: false, message: 'Добавьте VITE_MISTRAL_API_KEY в .env и перезапустите dev.' };

  const url = getMistralApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!useProxy && key) headers['Authorization'] = `Bearer ${key}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MISTRAL_MODELS[0],
        messages: [{ role: 'user', content: trimmed }],
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401) return { ok: false, message: 'Неверный ключ Mistral.' };
      if (res.status === 429) return { ok: false, message: 'Лимит запросов. Подождите.' };
      return { ok: false, message: `${res.status} — ${body || res.statusText}` };
    }

    const data = await res.json();
    const content = extractMistralContent(data.choices?.[0]?.message?.content);
    if (content) return { ok: true, text: content };
    return { ok: false, message: 'Пустой ответ от модели.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { ok: false, message: 'Нет доступа к API (сеть или CORS).' };
    }
    return { ok: false, message: msg };
  }
}

/**
 * Перевод через Mistral AI Chat Completions.
 */
export type MistralTranslationResult = { text: string; transcription?: string; detectedFromLang?: string };

function parseTranslationWithTranscription(content: string): MistralTranslationResult {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const text = lines[0] ?? '';
  let transcription: string | undefined;
  if (lines.length > 1) {
    const second = lines[1];
    transcription = /^transcription\s*:\s*/i.test(second)
      ? second.replace(/^transcription\s*:\s*/i, '').trim()
      : second;
    if (transcription === '—' || transcription === '-' || !transcription) transcription = undefined;
  }
  return { text, transcription };
}

/** Парсит ответ с автоопределением языка: строка 1 — код языка (ISO 639-1), строка 2 — перевод, строка 3 — транскрипция. Категория языка приводится к одному из LANG_OPTIONS. */
function parseDetectAndTranslate(content: string): MistralTranslationResult | null {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const rawCode = (lines[0] ?? '').trim();
  const detectedFromLang = normalizeLangCode(rawCode);
  const text = lines[1] ?? '';
  let transcription: string | undefined;
  if (lines.length > 2) {
    const third = lines[2];
    transcription = /^transcription\s*:\s*/i.test(third)
      ? third.replace(/^transcription\s*:\s*/i, '').trim()
      : third;
    if (transcription === '—' || transcription === '-' || !transcription) transcription = undefined;
  }
  return { text, transcription, detectedFromLang: detectedFromLang ?? undefined };
}

async function translateMistral(text: string, fromLang: string, toLang: string): Promise<MistralTranslationResult | null> {
  const useProxy = useMistralProxy();
  const key = getMistralApiKey();
  if (!key && !useProxy) return null;
  if (useProxy && !key) return null;

  const toName = langNameForPrompt(toLang);
  const isAuto = fromLang === 'auto';

  let systemPrompt: string;
  let userPrompt: string;
  if (isAuto) {
    systemPrompt = 'You are a translation API. First detect the source language (ISO 639-1 code). Then translate to the target. Also give IPA transcription of the SOURCE (original) text. Output exactly three lines. Line 1: only the 2-letter language code (e.g. sr). Line 2: only the translation. Line 3: "Transcription: [IPA of the SOURCE/original text]" or "Transcription: —".';
    userPrompt = `Detect the language of this text, then translate it to ${toName}. Reply with exactly three lines:\n1. Only the ISO 639-1 code (e.g. sr, en, de).\n2. Only the translation.\n3. Transcription: [IPA of the SOURCE text, i.e. how the original is pronounced]\n\nText: ${text}`;
  } else {
    const fromName = langNameForPrompt(fromLang);
    systemPrompt = 'You are a translation API. Output exactly two lines. Line 1: only the translation, no preamble. Line 2: "Transcription: [IPA or phonetic transcription of the SOURCE/original text]" (how the input is pronounced). If not applicable, write "Transcription: —". Use IPA.';
    userPrompt = `Translate from ${fromName} to ${toName}. Reply with exactly two lines:\n1. The translation only.\n2. Transcription: [IPA of the SOURCE text, i.e. pronunciation of the original]\n\nText: ${text}`;
  }

  const url = getMistralApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!useProxy && key) headers['Authorization'] = `Bearer ${key}`;

  for (const model of MISTRAL_MODELS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 500,
          temperature: 0.2,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 403) continue;
        return null;
      }
      const rawContent = data.choices?.[0]?.message?.content;
      const content = extractMistralContent(rawContent);
      if (content) {
        const parsed = isAuto ? parseDetectAndTranslate(content) : parseTranslationWithTranscription(content);
        if (parsed && parsed.text) return parsed;
      }
    } catch {
      /* try next model */
    }
  }
  return null;
}

/**
 * Перевод через MyMemory. Langpair: from|to (например en|ru).
 */
async function translateMyMemory(text: string, fromLang: string, toLang: string): Promise<string | null> {
  const pair = `${fromLang}|${toLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}&mt=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return null;
    const translated = data.responseData?.translatedText?.trim();
    if (translated) return translated;
    const match = data.matches?.[0];
    if (match?.translation?.trim()) return match.translation.trim();
    return null;
  } catch {
    return null;
  }
}

const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://translate.igna.wtf',
  'https://translate.plausibility.cloud',
];

/**
 * Перевод через Lingva (Google Translate). GET /api/v1/:source/:target/:query
 */
async function translateLingva(text: string, fromLang: string, toLang: string): Promise<string | null> {
  const path = `api/v1/${fromLang}/${toLang}/${encodeURIComponent(text)}`;
  for (const base of LINGVA_INSTANCES) {
    try {
      const res = await fetch(`${base}/${path}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      const t = data.translation?.trim();
      if (t) return t;
    } catch {
      continue;
    }
  }
  return null;
}

export type TranslateResult = { text: string; provider: string; transcription?: string; detectedFromLang?: string } | null;

/**
 * Переводит текст. При fromLang === 'auto' язык определяет Mistral (только он поддерживает авто).
 * Возвращает { text, provider, transcription?, detectedFromLang? } или null.
 */
export async function translate(
  text: string,
  fromLang: string,
  toLang: string
): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (fromLang !== 'auto' && fromLang === toLang) return { text: trimmed, provider: '' };

  const isAuto = fromLang === 'auto';

  const mistralResult = await translateMistral(trimmed, fromLang, toLang);
  if (mistralResult) {
    return {
      text: mistralResult.text,
      provider: PROVIDER_MISTRAL,
      transcription: mistralResult.transcription,
      detectedFromLang: mistralResult.detectedFromLang,
    };
  }

  if (isAuto) {
    const fallbackFrom = detectLanguage(trimmed);
    const mymem = await translateMyMemory(trimmed, fallbackFrom, toLang);
    if (mymem) return { text: mymem, provider: PROVIDER_MYMEMORY };
    const lingva = await translateLingva(trimmed, fallbackFrom, toLang);
    if (lingva) return { text: lingva, provider: PROVIDER_LINGVA };
    return null;
  }

  const mymem = await translateMyMemory(trimmed, fromLang, toLang);
  if (mymem) return { text: mymem, provider: PROVIDER_MYMEMORY };

  const lingva = await translateLingva(trimmed, fromLang, toLang);
  if (lingva) return { text: lingva, provider: PROVIDER_LINGVA };

  return null;
}
