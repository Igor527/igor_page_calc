import React, { useState, useEffect, useCallback, memo } from 'react';
import { Tldraw, Editor, createShapeId, AssetRecordType } from 'tldraw';
import 'tldraw/tldraw.css';
import { getFile, putFile, deleteFile } from '@/lib/githubSync';
import { AiDiagramPanel } from './AiDiagramPanel';

const SNAPSHOT_COMMENT_START = '<!-- tldraw-snapshot:';
const SNAPSHOT_COMMENT_END = ' -->';

/** Извлекает payload снимка из SVG: последний маркер (наш при сохранении), граница по первому ` -->` после него. */
function extractTldrawSnapshotPayload(svgText: string): string | null {
  const start = svgText.lastIndexOf(SNAPSHOT_COMMENT_START);
  if (start < 0) return null;
  const payloadFrom = start + SNAPSHOT_COMMENT_START.length;
  const end = svgText.indexOf(SNAPSHOT_COMMENT_END, payloadFrom);
  if (end <= payloadFrom) return null;
  return svgText.slice(payloadFrom, end);
}

type GitHubAssetRow = { name: string; path: string; sha: string; url: string };

/**
 * Список файлов из GitHub — в отдельном memo-компоненте, чтобы `setAssets` после сети
 * не ре-рендерил родителя с `<Tldraw />` (иначе через ~1–2 с канва могла «гаснуть»).
 */
const DrawingAssetsList = memo(function DrawingAssetsList({
  onPickAsset,
  refreshKey,
}: {
  onPickAsset: (path: string, name: string) => void;
  refreshKey: number;
}) {
  const [assets, setAssets] = useState<GitHubAssetRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const fetchAssets = useCallback(async () => {
    setListLoading(true);
    try {
      const cfgStr = localStorage.getItem('igor-github-sync-config');
      if (!cfgStr) return;
      const cfg = JSON.parse(cfgStr) as { token?: string; owner?: string; repo?: string; branch?: string };
      if (!cfg.token || !cfg.owner || !cfg.repo) return;

      const res = await fetch(
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/public/assets?ref=${encodeURIComponent(cfg.branch || 'main')}`,
        { headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${cfg.token}` } }
      );
      if (!res.ok) throw new Error('Ошибка сети');
      const data: unknown = await res.json();
      if (Array.isArray(data)) {
        setAssets(
          data.filter(
            (f): f is GitHubAssetRow =>
              typeof f === 'object' &&
              f !== null &&
              'name' in f &&
              typeof (f as GitHubAssetRow).name === 'string' &&
              ((f as GitHubAssetRow).name.endsWith('.svg') || (f as GitHubAssetRow).name.endsWith('.png'))
          )
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets, refreshKey]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Assets</span>
        <button
          type="button"
          onClick={() => void fetchAssets()}
          style={{ fontSize: '10px', background: 'transparent', color: 'var(--pico-primary)', border: 'none', cursor: 'pointer' }}
        >
          Обновить
        </button>
      </div>
      {listLoading && <p style={{ fontSize: '10px', color: 'var(--pico-muted-color)', margin: '0 0 8px' }}>Загрузка списка…</p>}
      {!listLoading && assets.length === 0 && (
        <p style={{ fontSize: '10px', color: 'var(--pico-muted-color)', margin: '0 0 8px' }}>Нет файлов или не настроен GitHub.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {assets.map((a) => (
          <div
            key={a.sha}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 8px',
              background: 'var(--pico-card-background-color)',
              border: '1px solid var(--pico-border-color)',
              borderRadius: '4px',
            }}
          >
            <span
              role="button"
              tabIndex={0}
              onClick={() => onPickAsset(a.path, a.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPickAsset(a.path, a.name);
                }
              }}
              style={{ fontSize: '11px', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {a.name}
            </span>
            <button
              type="button"
              onClick={async () => {
                if (confirm('Удалить?')) {
                  await deleteFile(a.path, a.sha, 'Remove');
                  void fetchAssets();
                }
              }}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '0 4px', cursor: 'pointer' }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});

const DrawingPage: React.FC = () => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [fileName, setFileName] = useState('scheme-' + Date.now().toString().slice(-6) + '.svg');
  const [fileLoading, setFileLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [svgStr, setSvgStr] = useState('');
  const [assetsRefreshKey, setAssetsRefreshKey] = useState(0);

  const handleEditorMount = useCallback((api: Editor) => {
    setEditor(api);
  }, []);

  const loadAssetToCanvas = useCallback(
    async (path: string, name: string) => {
      if (!editor) return;
      setFileLoading(true);
      try {
        const file = await getFile(path);
        if (!file?.content) return;

        const encoded = extractTldrawSnapshotPayload(file.content);
        if (encoded) {
          try {
            const snapshot = JSON.parse(decodeURIComponent(encoded.trim()));
            editor.loadSnapshot(snapshot);
            setFileName(name);
            return;
          } catch {
            /* снимок в комментарии битый — грузим как картинку */
          }
        }

        setFileName(name);
        const assetId = AssetRecordType.createId();
        await editor.createAssets([
          {
            id: assetId,
            type: 'image',
            typeName: 'asset',
            props: {
              name: name,
              src: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(file.content)))}`,
              w: 800,
              h: 600,
              mimeType: 'image/svg+xml',
              isAnimated: false,
            },
            meta: {},
          },
        ]);
        editor.createShape({
          type: 'image',
          x: 0,
          y: 0,
          props: {
            assetId,
            w: 800,
            h: 600,
          },
        });
      } catch (e) {
        alert('Ошибка загрузки файла');
      } finally {
        setFileLoading(false);
      }
    },
    [editor]
  );

  const handleSaveToGitHub = async () => {
    if (!editor || !fileName) return;
    setIsSaving(true);
    try {
      const svg = await editor.getSvgString(Array.from(editor.getCurrentPageShapeIds()), {
        padding: 32,
        scale: 1,
        background: true,
      });
      if (!svg) throw new Error('Failed to generate SVG');

      const snapshot = editor.getSnapshot();
      const finalSvg = svg.svg + `\n<!-- tldraw-snapshot: ${encodeURIComponent(JSON.stringify(snapshot))} -->`;

      const path = `public/assets/${fileName.endsWith('.svg') ? fileName : fileName + '.svg'}`;
      const res = await putFile(path, finalSvg, `Добавлена схема ${path}`);

      if (res.ok) {
        alert(`Сохранено: /assets/${fileName}`);
        setAssetsRefreshKey((k) => k + 1);
      } else {
        alert('Ошибка: ' + res.error);
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportSVG = async (svg: string) => {
    if (!editor) return;
    const assetId = AssetRecordType.createId();
    await editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: 'ai-generated.svg',
          src: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
          w: 800,
          h: 600,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
        meta: {},
      },
    ]);
    editor.createShape({
      type: 'image',
      x: editor.getViewportPageBounds().center.x - 400,
      y: editor.getViewportPageBounds().center.y - 300,
      props: {
        assetId,
        w: 800,
        h: 600,
      },
    });
  };

  const addShape = (type: string, props: Record<string, unknown> = {}) => {
    if (!editor) return;
    const { x, y } = editor.getViewportPageBounds().center;
    editor.createShape({
      type: 'geo',
      x: x - 50,
      y: y - 25,
      props: {
        geo: type,
        w: 100,
        h: 50,
        ...props,
      },
    });
  };

  return (
    <div
      className="drawing-page-root"
      style={{
        display: 'flex',
        height: 'calc(100vh - var(--content-offset-from-header, 112px) - var(--site-footer-height, 56px))',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        background: 'var(--pico-background-color)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          width: '280px',
          flexShrink: 0,
          borderRight: '1px solid var(--pico-border-color)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid var(--pico-border-color)', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href="/" style={{ fontSize: '11px', textDecoration: 'none' }}>
              ← На главную
            </a>
            <span>Рисование</span>
          </h2>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              style={{ flex: 1, fontSize: '11px', padding: '4px 8px', margin: 0 }}
            />
            <button
              type="button"
              onClick={() => void handleSaveToGitHub()}
              disabled={isSaving}
              style={{ padding: '4px 8px', fontSize: '11px', margin: 0, background: '#10b981' }}
            >
              {isSaving ? '...' : 'Пуш'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              editor?.clearPage();
              setFileName('scheme-' + Date.now().toString().slice(-6) + '.svg');
            }}
            className="outline"
            style={{ width: '100%', fontSize: '11px', padding: '4px', margin: 0 }}
          >
            Новый файл
          </button>
          {fileLoading && <p style={{ fontSize: '10px', color: 'var(--pico-muted-color)', margin: '8px 0 0' }}>Загрузка файла…</p>}
        </div>
        <DrawingAssetsList onPickAsset={loadAssetToCanvas} refreshKey={assetsRefreshKey} />
      </div>

      <div
        style={{
          flex: 1,
          position: 'relative',
          borderRight: '1px solid var(--pico-border-color)',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <Tldraw onMount={handleEditorMount} inferDarkMode={true} />
      </div>

      <div
        style={{
          width: '320px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '16px',
          background: 'var(--pico-background-color)',
          minHeight: 0,
        }}
      >
        <AiDiagramPanel svgStr={svgStr} setSvgStr={setSvgStr} onImportToCanvas={handleImportSVG} />

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--pico-border-color)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Топ-10 блоков</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <button type="button" onClick={() => addShape('rectangle', { text: 'Процесс' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              ⬜ Процесс
            </button>
            <button type="button" onClick={() => addShape('rhombus', { text: 'Условие' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              🔶 Условие
            </button>
            <button type="button" onClick={() => addShape('oval', { text: 'Начало' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              🟢 Старт/Конец
            </button>
            <button type="button" onClick={() => addShape('trapezoid', { text: 'Данные' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              ▱ Данные
            </button>
            <button type="button" onClick={() => addShape('rectangle', { dash: 'dashed', text: 'Заметка' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              📝 Заметка
            </button>
            <button type="button" onClick={() => addShape('diamond', { text: 'Решение' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              💎 Решение
            </button>
            <button type="button" onClick={() => addShape('cloud', { text: 'Облако' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              ☁️ Облако
            </button>
            <button type="button" onClick={() => editor?.createShape({ type: 'arrow', x: 0, y: 0, props: { text: 'Связь' } })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              ↗️ Стрелка
            </button>
            <button type="button" onClick={() => editor?.createShape({ type: 'text', props: { text: 'Заголовок' } })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              🔤 Текст
            </button>
            <button type="button" onClick={() => addShape('ellipse', { text: 'Инфо' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">
              ⭕ Круг
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrawingPage;
