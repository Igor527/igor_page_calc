import React, { useState, useEffect, useCallback, memo, useRef, Suspense } from 'react';
import { getFile, putFile, deleteFile } from '@/lib/githubSync';
import { AiDiagramPanel } from './AiDiagramPanel';
import type { ExcalidrawCanvasHandle } from './ExcalidrawCanvas';
import {
  extractEmbeddedScenePayload,
  parseScenePayload,
  buildSvgWithScene,
} from './excalidrawScene';
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/types';

const ExcalidrawCanvas = React.lazy(() => import('./ExcalidrawCanvas'));

type GitHubAssetRow = { name: string; path: string; sha: string; url: string };

type PendingScene = NonNullable<ReturnType<typeof parseScenePayload>>;

const BLOCK_TEMPLATES: { label: string; skeleton: ExcalidrawElementSkeleton }[] = [
  { label: 'Процесс', skeleton: { type: 'rectangle', width: 160, height: 72, label: { text: 'Процесс' } } },
  { label: 'Условие', skeleton: { type: 'diamond', width: 120, height: 120, label: { text: 'Условие' } } },
  { label: 'Старт/Конец', skeleton: { type: 'ellipse', width: 140, height: 72, label: { text: 'Старт/Конец' } } },
  { label: 'Данные', skeleton: { type: 'rectangle', width: 160, height: 56, label: { text: 'Данные' } } },
  {
    label: 'Заметка',
    skeleton: { type: 'rectangle', width: 140, height: 64, strokeStyle: 'dashed', label: { text: 'Заметка' } },
  },
  { label: 'Решение', skeleton: { type: 'diamond', width: 110, height: 110, label: { text: 'Решение' } } },
  { label: 'Облако', skeleton: { type: 'ellipse', width: 150, height: 90, label: { text: 'Облако' } } },
  {
    label: 'Стрелка',
    skeleton: {
      type: 'arrow',
      x: 0,
      y: 0,
      start: { x: 0, y: 0 },
      end: { x: 120, y: 0 },
      label: { text: 'Связь' },
    },
  },
  { label: 'Текст', skeleton: { type: 'text', text: 'Заголовок', fontSize: 28 } },
  { label: 'Круг', skeleton: { type: 'ellipse', width: 100, height: 100, label: { text: 'Инфо' } } },
];

const pendingSceneRef: { current: PendingScene | null } = { current: null };

function applyPendingScene(canvas: ExcalidrawCanvasHandle) {
  const pending = pendingSceneRef.current;
  if (!pending) return;
  const api = canvas.getApi();
  if (!api) return;
  pendingSceneRef.current = null;
  api.updateScene({
    elements: pending.elements,
    appState: pending.appState,
    files: pending.files,
  });
  api.scrollToContent();
}

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

const DrawingExcalidrawIsland = memo(function DrawingExcalidrawIsland({
  canvasRef,
}: {
  canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null>;
}) {
  const onApiReady = useCallback(() => {
    const handle = canvasRef.current;
    if (handle) applyPendingScene(handle);
  }, [canvasRef]);

  return (
    <Suspense
      fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          Загрузка редактора…
        </div>
      }
    >
      <ExcalidrawCanvas canvasRef={canvasRef} onApiReady={onApiReady} />
    </Suspense>
  );
});

function DrawingLeftColumn({ canvasRef }: { canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null> }) {
  const [fileName, setFileName] = useState('scheme-' + Date.now().toString().slice(-6) + '.svg');
  const [fileLoading, setFileLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [assetsRefreshKey, setAssetsRefreshKey] = useState(0);

  const loadAssetToCanvas = useCallback(
    async (path: string, name: string) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        alert('Редактор ещё не готов. Подождите секунду и нажмите файл снова.');
        return;
      }
      setFileLoading(true);
      try {
        const file = await getFile(path);
        if (!file?.content) return;

        const embedded = extractEmbeddedScenePayload(file.content);
        if (embedded?.format === 'excalidraw') {
          const scene = parseScenePayload(embedded.payload);
          if (scene) {
            const api = canvas.getApi();
            if (api) {
              api.updateScene({
                elements: scene.elements,
                appState: scene.appState,
                files: scene.files,
              });
              api.scrollToContent();
            } else {
              pendingSceneRef.current = scene;
            }
            setFileName(name);
            return;
          }
        }

        setFileName(name);
        canvas.embedSvg(file.content, name);
      } catch {
        alert('Ошибка загрузки файла');
      } finally {
        setFileLoading(false);
      }
    },
    [canvasRef]
  );

  const handleSaveToGitHub = useCallback(async () => {
    const api = canvasRef.current?.getApi();
    if (!api || !fileName) return;
    setIsSaving(true);
    try {
      const finalSvg = await buildSvgWithScene(api);
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
  }, [canvasRef, fileName]);

  return (
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
            canvasRef.current?.resetScene();
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
  );
}

function DrawingRightColumn({ canvasRef }: { canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null> }) {
  const [svgStr, setSvgStr] = useState('');

  const handleImportSVG = useCallback(
    (svg: string) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        alert('Редактор ещё не готов.');
        return;
      }
      canvas.embedSvg(svg, 'ai-generated.svg');
    },
    [canvasRef]
  );

  const addBlock = useCallback(
    (skeleton: ExcalidrawElementSkeleton) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.appendSkeletons([skeleton]);
    },
    [canvasRef]
  );

  return (
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
          {BLOCK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => addBlock(t.skeleton)}
              style={{ fontSize: '10px', padding: '6px', margin: 0 }}
              className="outline"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const DrawingPage: React.FC = () => {
  const canvasRef = useRef<ExcalidrawCanvasHandle | null>(null);

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
      <DrawingLeftColumn canvasRef={canvasRef} />
      <DrawingExcalidrawIsland canvasRef={canvasRef} />
      <DrawingRightColumn canvasRef={canvasRef} />
    </div>
  );
};

export default DrawingPage;