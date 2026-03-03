import React, { useState, useCallback, useEffect } from 'react';

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

  useEffect(() => {
    saveLists(lists);
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

  const blogRssUrl = typeof window !== 'undefined' ? `${window.location.origin}/feed.xml` : '/feed.xml';

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 200px', minWidth: 0, wordBreak: 'break-all' }}>
                            {item.title}
                          </a>
                          <button type="button" className="outline" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => startEditItem(item)} title="Изменить">✎</button>
                          <button type="button" className="outline secondary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => removeItem(list.id, item.id)} title="Удалить">✕</button>
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
