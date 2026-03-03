/**
 * Генерирует dist/feed.xml (RSS 2.0) из public/data/posts.json.
 * Запускать после npm run build. SITE_BASE_URL — базовый URL сайта (по умолчанию https://urbanplanner.page).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const postsPath = join(root, 'public', 'data', 'posts.json');
const outPath = join(root, 'dist', 'feed.xml');

const BASE_URL = (process.env.SITE_BASE_URL || 'https://urbanplanner.page').replace(/\/$/, '');
const SITE_TITLE = process.env.SITE_TITLE || 'Блог Igor.Page';
const SITE_DESC = process.env.SITE_DESC || 'Новости, статьи и заметки.';

function escapeXml(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function toRfc822(ms) {
  const d = new Date(ms);
  return d.toUTCString().replace(/GMT$/, 'GMT');
}

let posts = [];
if (existsSync(postsPath)) {
  try {
    const raw = readFileSync(postsPath, 'utf8');
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data.posts || []);
    posts = list
      .filter((p) => p.published && !p.deleted)
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 50);
  } catch (e) {
    console.warn('generate-feed: could not read posts.json', e.message);
  }
}

const items = posts
  .map((p) => {
    const link = `${BASE_URL}/blog/${encodeURIComponent(p.slug || p.id)}`;
    const desc = escapeXml(stripHtml(p.content || ''));
    const pubDate = toRfc822(p.updatedAt || p.createdAt || Date.now());
    const title = escapeXml((p.title || 'Без названия').trim());
    return `  <item>
    <title>${title}</title>
    <link>${escapeXml(link)}</link>
    <description>${desc}</description>
    <pubDate>${pubDate}</pubDate>
    <guid isPermaLink="true">${escapeXml(link)}</guid>
  </item>`;
  })
  .join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(BASE_URL)}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>ru</language>
    <lastBuildDate>${toRfc822(Date.now())}</lastBuildDate>
    <atom:link href="${escapeXml(BASE_URL + '/feed.xml')}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

const outDir = dirname(outPath);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, rss, 'utf8');
console.log('generate-feed: wrote', outPath, `(${posts.length} items)`);
