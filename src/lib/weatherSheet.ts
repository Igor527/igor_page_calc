/**
 * Загрузка данных метеостанции из Google Таблицы (опубликованный CSV).
 * Ожидаемые колонки (регистр и название гибкие): дата/время, температура, давление, pm1, pm2.5, pm10, номер станции.
 */

export interface WeatherRow {
  date: number; // timestamp для графика
  dateLabel: string; // для подписи оси
  temperature?: number;
  pressure?: number;
  pm1?: number;
  pm25?: number;
  pm10?: number;
  station?: string;
}

function getEnv(name: string): string {
  try {
    return String((import.meta.env as Record<string, unknown>)[name] ?? '').trim();
  } catch {
    return '';
  }
}

/** Парсинг одной строки CSV с учётом кавычек. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\t' && !inQuotes)) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '.')
    .trim();
}

/** Найти индекс колонки по возможным названиям. */
function findCol(headers: string[], names: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const n = normalizeHeader(name);
    const i = normalized.findIndex((h) => h === n || h.includes(n) || n.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function parseNumber(s: string): number | undefined {
  if (s == null || s === '') return undefined;
  const t = String(s).replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
  if (t === 'nan' || t === 'n/a' || t === '-') return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

/** Парсинг даты: ISO, DD.MM.YYYY, DD.MM.YYYY HH:mm, DD/MM/YYYY и т.д. */
function parseDate(s: string): number | undefined {
  if (s == null || s === '') return undefined;
  const t = String(s).trim();
  const iso = /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/;
  if (iso.test(t)) {
    const d = new Date(t.replace(' ', 'T'));
    return isNaN(d.getTime()) ? undefined : d.getTime();
  }
  const dmy = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(\s+(\d{1,2}):(\d{2})(:(\d{2}))?)?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10) <= 99 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    const hour = dmy[5] ? parseInt(dmy[5], 10) : 0;
    const min = dmy[6] ? parseInt(dmy[6], 10) : 0;
    const sec = dmy[8] ? parseInt(dmy[8], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? undefined : d.getTime();
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

export function getWeatherSheetUrl(): string {
  return getEnv('VITE_WEATHER_SHEET_CSV_URL');
}

/** Конфиг для загрузки лога из Firebase Realtime Database (Google Script пушит туда данные). */
export function getWeatherFirebaseConfig(): { databaseUrl: string; dataKey: string } | null {
  const url = getEnv('VITE_FIREBASE_DATABASE_URL').replace(/\/$/, '');
  const key = getEnv('VITE_WEATHER_DATA_KEY');
  if (!url || !key) return null;
  return { databaseUrl: url, dataKey: key };
}

export function getWeatherStationId(): string {
  return getEnv('VITE_WEATHER_STATION_ID');
}

/** Первая строка похожа на данные (дата/число), а не на заголовки. */
function looksLikeDataRow(cells: string[]): boolean {
  const c0 = cells[0]?.trim() ?? '';
  const c1 = cells[1]?.trim() ?? '';
  if (parseDate(c1)) return true;
  if (parseDate(c0)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(c0) || /^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(c0)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(c1) || /^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(c1)) return true;
  return false;
}

const CORS_PROXIES: { name: string; getUrl: (target: string) => string; parse: (res: Response) => Promise<string> }[] = [
  {
    name: 'cors.lol',
    getUrl: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    parse: (res) => res.text(),
  },
  {
    name: 'corsfix',
    getUrl: (u) => `https://proxy.corsfix.com/?${encodeURIComponent(u)}`,
    parse: (res) => res.text(),
  },
  {
    name: 'allorigins-raw',
    getUrl: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    parse: (res) => res.text(),
  },
  {
    name: 'allorigins-get',
    getUrl: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    parse: async (res) => {
      const data = (await res.json()) as { contents?: string };
      return data?.contents ?? '';
    },
  },
  {
    name: 'corsproxy',
    getUrl: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    parse: (res) => res.text(),
  },
  {
    name: 'corsproxy-direct',
    getUrl: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    parse: (res) => res.text(),
  },
  {
    name: 'crossorigin',
    getUrl: (u) => `https://crossorigin.me/${u}`,
    parse: (res) => res.text(),
  },
];

/** Загрузить текст по URL; при CORS — пробуем dev-прокси (только в dev), затем публичные прокси. */
async function fetchText(url: string): Promise<string> {
  const fetchOpts: RequestInit = { cache: 'no-store', redirect: 'follow' };

  // В режиме разработки (npm run dev) запрос идёт через Vite-прокси — CORS не мешает
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    try {
      const proxyUrl = `/api/weather-csv?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, fetchOpts);
      if (res.ok) {
        const text = await res.text();
        if (text?.trim()) return text;
      }
    } catch {
      // fallback на прямую загрузку и публичные прокси
    }
  }

  try {
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text?.trim()) return text;
    throw new Error('Пустой ответ');
  } catch (e) {
    const isCorsOrNetwork =
      e instanceof TypeError ||
      (e instanceof Error && (e.message === 'Failed to fetch' || e.message.includes('NetworkError') || e.message === 'Пустой ответ'));
    if (!isCorsOrNetwork) throw e;

    const errors: string[] = [];
    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = proxy.getUrl(url);
        const res = await fetch(proxyUrl, fetchOpts);
        if (!res.ok) {
          errors.push(`${proxy.name}: ${res.status}`);
          continue;
        }
        const text = await proxy.parse(res);
        if (text?.trim()) return text;
        errors.push(`${proxy.name}: пусто`);
      } catch (err) {
        errors.push(`${proxy.name}: ${err instanceof Error ? err.message : 'ошибка'}`);
      }
    }
    throw new Error(
      'Не удалось загрузить данные (CORS). Варианты: 1) Запустите сайт через npm run dev — в dev режиме CSV грузится через локальный прокси без CORS. 2) Откройте ссылку CSV в новой вкладке → скопируйте весь текст (Ctrl+A, Ctrl+C) → вставьте в блок «Вставьте CSV вручную» ниже. 3) Проверьте URL: нужна «Публикация в интернете» (Файл → Публикация в интернете → CSV). Прокси: ' +
        errors.join('; ')
    );
  }
}

/**
 * Разобрать текст CSV в массив WeatherRow (без загрузки по сети).
 * Поддерживается формат с заголовками и без (AirStationLog).
 */
export function parseWeatherCsv(csvText: string): WeatherRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 1) return [];

  const firstCells = parseCsvLine(lines[0]);
  const noHeader = looksLikeDataRow(firstCells);

  let iDate = -1;
  let iTemp = -1;
  let iPressure = -1;
  let iPm1 = -1;
  let iPm25 = -1;
  let iPm10 = -1;
  let iStation = -1;
  let startRow: number;

  if (noHeader) {
    // Формат AirStationLog: A=№, B=дата, C=дата2, D=статус, E=температура, F=PM2.5, G=PM10, H/I=давление(nan)
    iDate = 1; // колонка B (или 2 для C)
    iTemp = 4;  // E
    iPressure = 7; // H
    iPm25 = 5;  // F
    iPm10 = 6;  // G
    startRow = 0;
  } else {
    const headers = firstCells;
    iDate = findCol(headers, [
      'date',
      'datetime',
      'timestamp',
      'time',
      'дата',
      'время',
      'дата и время',
    ]);
    iTemp = findCol(headers, ['temp', 'temperature', 't', 'температура', '°c', 'c']);
    iPressure = findCol(headers, ['pressure', 'p', 'давление', 'hpa', 'мм']);
    iPm1 = findCol(headers, ['pm1', 'pm 1']);
    iPm25 = findCol(headers, ['pm2.5', 'pm2,5', 'pm25', 'pm2_5', 'pm 2.5']);
    iPm10 = findCol(headers, ['pm10', 'pm 10']);
    iStation = findCol(headers, ['station', 'station_id', 'станция', 'номер', 'id']);
    startRow = 1;
  }

  const rows: WeatherRow[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    let dateRaw = iDate >= 0 ? cells[iDate] : '';
    if (!dateRaw && iDate === 1 && cells[2]) dateRaw = cells[2]; // fallback на колонку C
    const ts = parseDate(dateRaw);
    if (ts == null && iDate >= 0) continue;
    const date = ts ?? Date.now();
    const dateLabel = new Date(date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    rows.push({
      date,
      dateLabel,
      temperature: iTemp >= 0 ? parseNumber(cells[iTemp]) : undefined,
      pressure: iPressure >= 0 ? parseNumber(cells[iPressure]) : undefined,
      pm1: iPm1 >= 0 ? parseNumber(cells[iPm1]) : undefined,
      pm25: iPm25 >= 0 ? parseNumber(cells[iPm25]) : undefined,
      pm10: iPm10 >= 0 ? parseNumber(cells[iPm10]) : undefined,
      station: iStation >= 0 ? cells[iStation]?.trim() || undefined : undefined,
    });
  }
  rows.sort((a, b) => a.date - b.date);
  return rows;
}

/**
 * Загрузить лог из Firebase Realtime Database (данные туда отправляет Google Apps Script из таблицы).
 * REST: GET .../weather/{dataKey}/rows.json (последние 10000 точек по дате).
 */
export async function fetchWeatherFromFirebase(config: { databaseUrl: string; dataKey: string }): Promise<WeatherRow[]> {
  const { databaseUrl, dataKey } = config;
  const path = `weather/${encodeURIComponent(dataKey)}/rows.json`;
  const url = `${databaseUrl}/${path}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Firebase: ${res.status}`);
  const raw = (await res.json()) as Record<string, { date: number; temperature?: number; pressure?: number; pm1?: number; pm25?: number; pm10?: number; station?: string }> | null;
  if (!raw || typeof raw !== 'object') return [];
  const MAX_POINTS = 10000;
  const rows: WeatherRow[] = Object.values(raw)
    .filter((r) => r && typeof r.date === 'number')
    .sort((a, b) => a.date - b.date)
    .slice(-MAX_POINTS)
    .map((r) => {
    const date = r?.date ?? 0;
    return {
      date,
      dateLabel: new Date(date).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      temperature: r.temperature,
      pressure: r.pressure,
      pm1: r.pm1,
      pm25: r.pm25,
      pm10: r.pm10,
      station: r.station,
    };
  });
  return rows;
}

/**
 * Загрузить CSV по URL (с повтором через CORS-прокси при ошибке).
 */
export async function fetchWeatherFromSheet(csvUrl: string): Promise<WeatherRow[]> {
  const text = await fetchText(csvUrl);
  return parseWeatherCsv(text);
}
