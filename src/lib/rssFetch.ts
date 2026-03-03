/**
 * Загрузка и парсинг RSS/Atom лент. При CORS — fallback на прокси.
 */

export interface RssEntry {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
}

const CORS_PROXIES: { name: string; getUrl: (target: string) => string; parse: (res: Response) => Promise<string> }[] = [
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

async function fetchText(url: string): Promise<string> {
  const fetchOpts: RequestInit = { cache: 'no-store', redirect: 'follow' };
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
        errors.push(`${proxy.name}: пустой ответ`);
      } catch (err) {
        errors.push(`${proxy.name}: ${err instanceof Error ? err.message : 'ошибка'}`);
      }
    }
    throw new Error('Не удалось загрузить ленту (CORS). Попробуйте вставить XML/ RSS вручную или позже. Прокси: ' + errors.join('; '));
  }
}

function textContent(el: Element | null, tag: string): string {
  if (!el) return '';
  const child = el.querySelector(tag);
  return child?.textContent?.trim() ?? '';
}

function stripHtml(html: string): string {
  if (!html?.trim()) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 400) ?? '';
}

/** Парсинг RSS 2.0 (channel/item) и Atom (feed/entry). Можно вызывать для вставленного вручную XML. */
export function parseFeedXml(xmlText: string): RssEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const entries: RssEntry[] = [];

  const rssItems = doc.querySelectorAll('channel item');
  if (rssItems.length > 0) {
    rssItems.forEach((item) => {
      const title = textContent(item as Element, 'title') || '(без названия)';
      let link = textContent(item as Element, 'link');
      if (!link) {
        const guid = item.querySelector('guid');
        if (guid?.getAttribute('isPermaLink') !== 'false') link = guid?.textContent?.trim() ?? '';
      }
      const rawDesc = textContent(item as Element, 'description');
      const description = rawDesc ? stripHtml(rawDesc) : undefined;
      const pubDate = textContent(item as Element, 'pubDate');
      if (link) entries.push({ title, link, description: description || undefined, pubDate: pubDate || undefined });
    });
    return entries;
  }

  const atomEntries = doc.querySelectorAll('feed entry');
  atomEntries.forEach((entry) => {
    const title = textContent(entry as Element, 'title') || '(без названия)';
    let link = '';
    const linkEl = entry.querySelector('link[href]');
    if (linkEl) link = linkEl.getAttribute('href') ?? '';
    if (!link) {
      const idEl = entry.querySelector('id');
      if (idEl?.textContent) link = idEl.textContent.trim();
    }
    const rawContent = textContent(entry as Element, 'content') || textContent(entry as Element, 'summary');
    const content = rawContent ? stripHtml(rawContent) : undefined;
    const updated = textContent(entry as Element, 'updated') || textContent(entry as Element, 'published');
    if (link) entries.push({ title, link, description: content || undefined, pubDate: updated || undefined });
  });

  return entries;
}

/** Загрузить ленту по URL и вернуть массив записей. */
export async function fetchRssFeed(url: string): Promise<RssEntry[]> {
  const text = await fetchText(url);
  const entries = parseFeedXml(text);
  return entries.slice(0, 50);
}
