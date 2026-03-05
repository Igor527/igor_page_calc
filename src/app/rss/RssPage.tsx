import React, { useState, useCallback, useEffect } from 'react';
import { fetchRssFeed, parseFeedXml, type RssEntry } from '@/lib/rssFetch';
import { getRssListsFromRepo, pushRssLists, getSyncConfig, schedulePush } from '@/lib/githubSync';

const STORAGE_KEY = 'igor-rss-lists';

export interface RssFeedItem {
  id: string;
  title: string;
  url: string;
}

export interface RssList {
  id: string;
  title: string;
  items: RssFeedItem[];
}

function loadLists(): RssList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLists(lists: RssList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

/** Данные для экспорта в репо. */
export function getRssListsBundle(): { lists: RssList[] } {
  return { lists: loadLists() };
}

/** Подставить данные из репо. */
export function setRssListsFromBundle(data: { lists?: RssList[] }): void {
  if (data.lists && Array.isArray(data.lists)) saveLists(data.lists);
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const RssPage: React.FC = () => {
  const [lists, setLists] = useState<RssList[]>(() => loadLists());
  const [newListTitle, setNewListTitle] = useState('');
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');
  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemUrl, setEditItemUrl] = useState('');
  const [feedCache, setFeedCache] = useState<Record<string, { loading: boolean; error?: string; entries?: RssEntry[] }>>({});
  const [expandedFeedUrl, setExpandedFeedUrl] = useState<string | null>(null);
  const [pullLoading, setPullLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pasteXml, setPasteXml] = useState('');
  const [pasteXmlForUrl, setPasteXmlForUrl] = useState<string | null>(null);

  /** Объединённая лента: все записи всех подписок с подписью источника, сортировка по дате */
  type CombinedEntry = { entry: RssEntry; listTitle: string; feedTitle: string };
  const [combinedEntries, setCombinedEntries] = useState<CombinedEntry[]>([]);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [combinedError, setCombinedError] = useState<string | null>(null);

  const loadAllFeeds = useCallback(async () => {
    const items: { listTitle: string; feedTitle: string; url: string }[] = [];
    lists.forEach((list) => {
      list.items.forEach((item) => {
        items.push({ listTitle: list.title, feedTitle: item.title, url: item.url });
      });
    });
    if (items.length === 0) {
      setCombinedEntries([]);
      setCombinedError('Нет ни одной подписки. Добавьте RSS-ленты в списки выше.');
      return;
    }
    setCombinedLoading(true);
    setCombinedError(null);
    try {
      const results = await Promise.allSettled(
        items.map(async ({ listTitle, feedTitle, url }) => {
          const entries = await fetchRssFeed(url);
          return entries.map((entry) => ({ entry, listTitle, feedTitle }));
        })
      );
      const combined: CombinedEntry[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled') combined.push(...r.value);
      });
      combined.sort((a, b) => {
        const dateA = a.entry.pubDate ? new Date(a.entry.pubDate).getTime() : 0;
        const dateB = b.entry.pubDate ? new Date(b.entry.pubDate).getTime() : 0;
        return dateB - dateA;
      });
      setCombinedEntries(combined);
    } catch (e) {
      setCombinedError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setCombinedEntries([]);
    } finally {
      setCombinedLoading(false);
    }
  }, [lists]);

  useEffect(() => {
    saveLists(lists);
  }, [lists]);

  useEffect(() => {
    if (getSyncConfig()) schedulePush('rss', () => pushRssLists(lists));
  }, [lists]);

  const addList = useCallback(() => {
    const title = newListTitle.trim();
    if (!title) return;
    setLists(prev => [...prev, { id: genId(), title, items: [] }]);
    setNewListTitle('');
  }, [newListTitle]);

  const removeList = useCallback((listId: string) => {
    setLists(prev => prev.filter(l => l.id !== listId));
    if (expandedListId === listId) setExpandedListId(null);
  }, [expandedListId]);

  const addItem = useCallback((listId: string) => {
    const title = newItemTitle.trim();
    const url = newItemUrl.trim();
    if (!title || !url) return;
    setLists(prev => prev.map(l =>
      l.id === listId
        ? { ...l, items: [...l.items, { id: genId(), title, url }] }
        : l
    ));
    setNewItemTitle('');
    setNewItemUrl('');
    setAddingToListId(null);
  }, [newItemTitle, newItemUrl]);

  const removeItem = useCallback((listId: string, itemId: string) => {
    setLists(prev => prev.map(l =>
      l.id === listId ? { ...l, items: l.items.filter(i => i.id !== itemId) } : l
    ));
    if (editingItemId === itemId) setEditingItemId(null);
  }, [editingItemId]);

  const startEditItem = useCallback((item: RssFeedItem) => {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemUrl(item.url);
  }, []);

  const saveEditItem = useCallback((listId: string, itemId: string) => {
    const title = editItemTitle.trim();
    const url = editItemUrl.trim();
    if (!title || !url) return;
    setLists(prev => prev.map(l =>
      l.id === listId
        ? { ...l, items: l.items.map(i => i.id === itemId ? { ...i, title, url } : i) }
        : l
    ));
    setEditingItemId(null);
  }, [editItemTitle, editItemUrl]);

  const cancelEdit = useCallback(() => {
    setEditingItemId(null);
  }, []);

  const loadFeed = useCallback(async (url: string) => {
    setFeedCache(prev => ({ ...prev, [url]: { ...prev[url], loading: true, error: undefined } }));
    setExpandedFeedUrl(url);
    try {
      const entries = await fetchRssFeed(url);
      setFeedCache(prev => ({ ...prev, [url]: { loading: false, entries } }));
    } catch (e) {
      setFeedCache(prev => ({ ...prev, [url]: { loading: false, error: e instanceof Error ? e.message : 'Ошибка загрузки' } }));
    }
  }, []);

  const blogRssUrl = typeof window !== 'undefined' ? `${window.location.origin}/feed.xml` : '/feed.xml';

  const handlePullFromRepo = useCallback(async () => {
    setSyncError(null);
    setPullLoading(true);
    try {
      const data = await getRssListsFromRepo();
      if (data?.lists && data.lists.length >= 0) {
        setRssListsFromBundle(data);
        setLists(data.lists as RssList[]);
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setPullLoading(false);
    }
  }, []);

  const handlePushToRepo = useCallback(async () => {
    setSyncError(null);
    setPushLoading(true);
    try {
      const res = await pushRssLists(lists);
      if (!res.ok) setSyncError(res.error ?? 'Ошибка отправки');
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setPushLoading(false);
    }
  }, [lists]);

  const copyBlogRss = useCallback(() => {
    navigator.clipboard.writeText(blogRssUrl).catch(() => {});
  }, [blogRssUrl]);

  return (
    <main className="max-w-[640px] mx-auto px-4 py-8">
      <h1 style={{ marginBottom: 8 }}>RSS подписки</h1>
      <p style={{ color: 'var(--pico-muted-color)', fontSize: 14, marginBottom: 24 }}>
        Списки людей, сайтов и других источников с RSS. Ниже — ссылка на ленту этого блога, которую можно дать подписчикам.
      </p>

      {/* Ссылка на RSS блога — для выдачи другим */}
      <section style={{ marginBottom: 32, padding: 16, border: '1px solid var(--pico-border-color)', borderRadius: 8, background: 'var(--pico-card-background-color)' }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Подписаться на этот блог (RSS)</h2>
        <p style={{ fontSize: 13, color: 'var(--pico-muted-color)', marginBottom: 10 }}>
          Эту ссылку можно отдать другим: в ридерах (Feedly, Inoreader и т.п.) добавьте её как новую подписку.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <a href={blogRssUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all', color: 'var(--pico-primary)' }}>
            {blogRssUrl}
          </a>
          <button type="button" className="outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={copyBlogRss}>
            Копировать ссылку
          </button>
        </div>
        {getSyncConfig() && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--pico-border-color)' }}>
            <button type="button" className="outline" style={{ fontSize: 12 }} onClick={handlePullFromRepo} disabled={pullLoading}>
              {pullLoading ? 'Загрузка…' : 'Выгрузить последний сэйв из репо'}
            </button>
            <button type="button" className="outline" style={{ fontSize: 12 }} onClick={handlePushToRepo} disabled={pushLoading}>
              {pushLoading ? 'Отправка…' : 'Загрузить в репо'}
            </button>
            {syncError && <span style={{ fontSize: 12, color: 'var(--pico-del-color)' }}>{syncError}</span>}
          </div>
        )}
      </section>

      {/* Объединённая лента: все записи всех подписок по дате */}
      <section style={{ marginBottom: 32, padding: 16, border: '1px solid var(--pico-border-color)', borderRadius: 8, background: 'var(--pico-card-background-color)' }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Все записи по дате</h2>
        <p style={{ fontSize: 13, color: 'var(--pico-muted-color)', marginBottom: 12 }}>
          Одна лента из всех сохранённых RSS: записи всех подписок в одном списке, сортировка по дате. Под каждой записью — подпись, чья это лента (список и название подписки).
        </p>
        <button
          type="button"
          className="primary"
          style={{ fontSize: 13, padding: '8px 14px' }}
          onClick={loadAllFeeds}
          disabled={combinedLoading || lists.every((l) => l.items.length === 0)}
        >
          {combinedLoading ? 'Загрузка…' : combinedEntries.length ? 'Обновить ленту' : 'Показать все записи'}
        </button>
        {combinedError && (
          <p style={{ fontSize: 12, color: 'var(--pico-del-color)', marginTop: 8 }}>{combinedError}</p>
        )}
        {combinedEntries.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', borderTop: '1px solid var(--pico-border-color)', paddingTop: 12 }}>
            {combinedEntries.map(({ entry, listTitle, feedTitle }, idx) => (
              <li
                key={`${entry.link}-${idx}`}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid var(--pico-border-color)',
                }}
              >
                <a
                  href={entry.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 4 }}
                >
                  {entry.title}
                </a>
                <span style={{ fontSize: 11, color: 'var(--pico-muted-color)' }} title={`Список: ${listTitle}, подписка: ${feedTitle}`}>
                  {feedTitle} ← {listTitle}
                </span>
                {entry.description && (
                  <p style={{ fontSize: 12, color: 'var(--pico-muted-color)', margin: '6px 0 0', lineHeight: 1.4 }}>
                    {entry.description}
                  </p>
                )}
                {entry.pubDate && (
                  <time style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginTop: 4 }}>
                    {new Date(entry.pubDate).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Списки подписок */}
      <section>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Мои списки</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newListTitle}
            onChange={e => setNewListTitle(e.target.value)}
            placeholder="Название списка (люди, сайты…)"
            style={{ flex: '1 1 200px', minWidth: 0, padding: '8px 12px', fontSize: 14 }}
          />
          <button type="button" className="primary" onClick={addList}>Добавить список</button>
        </div>

        {lists.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--pico-muted-color)' }}>Пока нет списков. Создайте список и добавляйте в него ссылки на RSS-ленты.</p>
        )}

        {lists.map(list => (
          <div
            key={list.id}
            style={{
              marginBottom: 16,
              border: '1px solid var(--pico-border-color)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--pico-card-background-color)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                cursor: 'pointer',
                background: 'var(--pico-background-color)',
              }}
              onClick={() => setExpandedListId(prev => prev === list.id ? null : list.id)}
            >
              <span style={{ fontWeight: 600, fontSize: 15 }}>{list.title}</span>
              <span style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>
                {list.items.length} {list.items.length === 1 ? 'подписка' : list.items.length < 5 ? 'подписки' : 'подписок'}
              </span>
              <button
                type="button"
                className="outline secondary"
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={e => { e.stopPropagation(); removeList(list.id); }}
                title="Удалить список"
              >
                ✕
              </button>
            </div>
            {expandedListId === list.id && (
              <div style={{ padding: '12px 12px 16px' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                  {list.items.map(item => (
                    <li key={item.id} style={{ marginBottom: 8 }}>
                      {editingItemId === item.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input
                            type="text"
                            value={editItemTitle}
                            onChange={e => setEditItemTitle(e.target.value)}
                            placeholder="Название"
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          />
                          <input
                            type="url"
                            value={editItemUrl}
                            onChange={e => setEditItemUrl(e.target.value)}
                            placeholder="URL ленты"
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="primary" style={{ fontSize: 12 }} onClick={() => saveEditItem(list.id, item.id)}>Сохранить</button>
                            <button type="button" className="outline" style={{ fontSize: 12 }} onClick={cancelEdit}>Отмена</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginBottom: expandedFeedUrl === item.url ? 12 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 200px', minWidth: 0, wordBreak: 'break-all' }}>
                              {item.title}
                            </a>
                            <button
                              type="button"
                              className="outline"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => {
                                if (expandedFeedUrl === item.url) setExpandedFeedUrl(null);
                                else loadFeed(item.url);
                              }}
                              disabled={feedCache[item.url]?.loading}
                              title={expandedFeedUrl === item.url ? 'Свернуть' : 'Загрузить и показать ленту'}
                            >
                              {feedCache[item.url]?.loading ? '…' : expandedFeedUrl === item.url ? 'Свернуть' : 'Показать ленту'}
                            </button>
                            <button type="button" className="outline" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => startEditItem(item)} title="Изменить">✎</button>
                            <button type="button" className="outline secondary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => removeItem(list.id, item.id)} title="Удалить">✕</button>
                          </div>
                          {expandedFeedUrl === item.url && feedCache[item.url] && (
                            <div style={{ marginTop: 10, padding: '12px 0 0', borderTop: '1px solid var(--pico-border-color)' }}>
                              {feedCache[item.url].error && (
                                <>
                                  <p style={{ fontSize: 12, color: 'var(--pico-del-color)', marginBottom: 8 }}>{feedCache[item.url].error}</p>
                                  <details style={{ marginBottom: 10, fontSize: 12 }}>
                                    <summary style={{ cursor: 'pointer', color: 'var(--pico-muted-color)' }}>Вставить XML вручную</summary>
                                    <p style={{ margin: '8px 0 4px', color: 'var(--pico-muted-color)' }}>Откройте ссылку на ленту в новой вкладке, скопируйте весь код (Ctrl+A, Ctrl+C) и вставьте ниже.</p>
                                    <textarea
                                      value={pasteXmlForUrl === item.url ? pasteXml : ''}
                                      onChange={e => { setPasteXmlForUrl(item.url); setPasteXml(e.target.value); }}
                                      placeholder="Вставьте RSS/Atom XML..."
                                      rows={6}
                                      style={{ width: '100%', padding: 8, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
                                    />
                                    <button
                                      type="button"
                                      className="primary"
                                      style={{ marginTop: 6, fontSize: 12 }}
                                      onClick={() => {
                                        try {
                                          const entries = parseFeedXml(pasteXml);
                                          setFeedCache(prev => ({ ...prev, [item.url]: { ...prev[item.url], loading: false, error: undefined, entries } }));
                                          setPasteXml('');
                                          setPasteXmlForUrl(null);
                                        } catch (err) {
                                          setFeedCache(prev => ({ ...prev, [item.url]: { ...prev[item.url], error: err instanceof Error ? err.message : 'Ошибка разбора XML' } }));
                                        }
                                      }}
                                    >
                                      Применить
                                    </button>
                                  </details>
                                </>
                              )}
                              {feedCache[item.url].entries && (
                                <button type="button" className="outline" style={{ fontSize: 11, marginBottom: 10 }} onClick={() => loadFeed(item.url)}>Обновить</button>
                              )}
                              {feedCache[item.url].entries && feedCache[item.url].entries!.length > 0 && (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                  {feedCache[item.url].entries!.map((entry, idx) => (
                                    <li
                                      key={idx}
                                      style={{
                                        padding: '10px 12px',
                                        marginBottom: 8,
                                        background: 'var(--pico-background-color)',
                                        borderRadius: 8,
                                        border: '1px solid var(--pico-border-color)',
                                      }}
                                    >
                                      <a
                                        href={entry.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 4 }}
                                      >
                                        {entry.title}
                                      </a>
                                      {entry.description && (
                                        <p style={{ fontSize: 13, color: 'var(--pico-muted-color)', margin: '4px 0 0', lineHeight: 1.45 }}>
                                          {entry.description}
                                        </p>
                                      )}
                                      {entry.pubDate && (
                                        <time style={{ fontSize: 11, color: 'var(--pico-muted-color)', display: 'block', marginTop: 4 }}>
                                          {new Date(entry.pubDate).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                                        </time>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {feedCache[item.url].entries?.length === 0 && !feedCache[item.url].loading && (
                                <p style={{ fontSize: 12, color: 'var(--pico-muted-color)' }}>В ленте нет записей.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {addingToListId === list.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text"
                      value={newItemTitle}
                      onChange={e => setNewItemTitle(e.target.value)}
                      placeholder="Название (человек, сайт…)"
                      style={{ padding: '6px 8px', fontSize: 13 }}
                    />
                    <input
                      type="url"
                      value={newItemUrl}
                      onChange={e => setNewItemUrl(e.target.value)}
                      placeholder="URL RSS-ленты"
                      style={{ padding: '6px 8px', fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="primary" style={{ fontSize: 12 }} onClick={() => addItem(list.id)}>Добавить</button>
                      <button type="button" className="outline" style={{ fontSize: 12 }} onClick={() => setAddingToListId(null)}>Отмена</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="outline" style={{ fontSize: 12 }} onClick={() => setAddingToListId(list.id)}>
                    + Добавить подписку в список
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--pico-muted-color)' }}>
        <a href="/" style={{ color: 'var(--pico-primary)' }}>← На главную</a>
      </p>
    </main>
  );
};

export default RssPage;
