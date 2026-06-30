import React, { useState, useEffect, useCallback, memo, useRef, Suspense } from 'react';
import { getFile, putFile, deleteFile } from '@/lib/githubSync';
import { AiDiagramPanel } from './AiDiagramPanel';
import { EnglishLlmPanel } from './EnglishLlmPanel';
import type { ExcalidrawCanvasHandle } from './ExcalidrawCanvas';
import {
  extractEmbeddedScenePayload,
  parseScenePayload,
  buildSvgWithScene,
} from './excalidrawScene';
type ExcalidrawElementSkeleton = any;
import {
  getBoardsMetadata,
  getBoardScene,
  saveBoardToFirebase,
  deleteBoardFromFirebase,
  type BoardMetadata
} from '@/lib/firebaseData';

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

function sanitizeExcalidrawElements(elements: any[]): any[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((el) => {
    if (!el) return el;
    return {
      ...el,
      groupIds: el.groupIds || [],
      boundElements: el.boundElements || null,
    };
  });
}

function applyPendingScene(canvas: ExcalidrawCanvasHandle) {
  const pending = pendingSceneRef.current;
  if (!pending) return;
  const api = canvas.getApi();
  if (!api) return;
  pendingSceneRef.current = null;
  api.updateScene({
    elements: sanitizeExcalidrawElements(pending.elements || []),
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', borderTop: '1px solid var(--pico-border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>SVG в GitHub</span>
        <button
          type="button"
          onClick={() => void fetchAssets()}
          style={{ fontSize: '9px', background: 'transparent', color: 'var(--pico-primary)', border: 'none', cursor: 'pointer', padding: 0, width: 'auto' }}
        >
          Обновить
        </button>
      </div>
      {listLoading && <p style={{ fontSize: '10px', color: 'var(--pico-muted-color)', margin: '0 0 8px' }}>Загрузка списка…</p>}
      {!listLoading && assets.length === 0 && (
        <p style={{ fontSize: '10px', color: 'var(--pico-muted-color)', margin: '0 0 8px' }}>Нет файлов на GitHub.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
        {assets.map((a) => (
          <div
            key={a.sha}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '3px 6px',
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
              style={{ fontSize: '10px', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {a.name}
            </span>
            <button
              type="button"
              onClick={async () => {
                if (confirm('Удалить файл с GitHub?')) {
                  await deleteFile(a.path, a.sha, 'Remove asset');
                  void fetchAssets();
                }
              }}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '0 2px', cursor: 'pointer', fontSize: '10px', width: 'auto' }}
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
  onCanvasChange,
}: {
  canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null>;
  onCanvasChange: (elements: any, appState: any, files: any) => void;
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
      <ExcalidrawCanvas canvasRef={canvasRef} onApiReady={onApiReady} onChange={onCanvasChange} />
    </Suspense>
  );
});

interface LeftColumnProps {
  canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null>;
  boards: Record<string, BoardMetadata>;
  currentBoardId: string | null;
  currentBoardName: string;
  setCurrentBoardName: (name: string) => void;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (name: string) => void;
  onDeleteBoard: (boardId: string) => void;
  onRenameBoard: (newName: string) => void;
  boardsLoading: boolean;
  isSaving: boolean;
  fileLoading: boolean;
  loadAssetToCanvas: (path: string, name: string) => Promise<void>;
  assetsRefreshKey: number;
}

function DrawingLeftColumn({
  canvasRef,
  boards,
  currentBoardId,
  currentBoardName,
  setCurrentBoardName,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
  onRenameBoard,
  boardsLoading,
  isSaving,
  fileLoading,
  loadAssetToCanvas,
  assetsRefreshKey
}: LeftColumnProps) {
  const [newBoardName, setNewBoardName] = useState('');
  const [githubFileName, setGithubFileName] = useState('scheme-' + Date.now().toString().slice(-6) + '.svg');
  const [isGithubSaving, setIsGithubSaving] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    setRenameValue(currentBoardName);
  }, [currentBoardName]);

  const handleCreate = () => {
    if (!newBoardName.trim()) return;
    onCreateBoard(newBoardName.trim());
    setNewBoardName('');
  };

  const handleRename = () => {
    if (!renameValue.trim() || renameValue === currentBoardName) return;
    onRenameBoard(renameValue.trim());
  };

  const handleExportToGitHub = async () => {
    const api = canvasRef.current?.getApi();
    if (!api || !githubFileName) return;
    setIsGithubSaving(true);
    try {
      const finalSvg = await buildSvgWithScene(api);
      const path = `public/assets/${githubFileName.endsWith('.svg') ? githubFileName : githubFileName + '.svg'}`;
      const res = await putFile(path, finalSvg, `Добавлена схема ${path}`);

      if (res.ok) {
        alert(`Экспортировано на GitHub: /assets/${githubFileName}`);
      } else {
        alert('Ошибка экспорта: ' + res.error);
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении на GitHub');
    } finally {
      setIsGithubSaving(false);
    }
  };

  return (
    <div
      style={{
        width: '280px',
        flexShrink: 0,
        borderRight: '1px solid var(--pico-border-color)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '16px',
        gap: '12px',
        overflowY: 'auto'
      }}
    >
      <h2 style={{ fontSize: '15px', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ fontSize: '11px', textDecoration: 'none' }}>
          ← На главную
        </a>
        <span>Рабочие доски</span>
      </h2>

      {/* Создание доски */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <input
          type="text"
          placeholder="Новая доска..."
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          style={{ flex: 1, fontSize: '11px', padding: '4px 8px', margin: 0 }}
        />
        <button
          type="button"
          onClick={handleCreate}
          style={{ padding: '4px 8px', fontSize: '11px', margin: 0, width: 'auto' }}
        >
          ＋
        </button>
      </div>

      {/* Переименование текущей доски */}
      {currentBoardId && (
        <div style={{ background: 'var(--pico-card-background-color)', padding: '8px', borderRadius: '6px', border: '1px solid var(--pico-border-color)' }}>
          <label style={{ fontSize: '9px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
            Имя текущей доски
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              style={{ flex: 1, fontSize: '11px', padding: '4px 8px', margin: 0 }}
            />
            <button
              type="button"
              onClick={handleRename}
              style={{ padding: '4px 8px', fontSize: '11px', margin: 0, background: '#3b82f6', color: '#fff', width: 'auto' }}
            >
              💾
            </button>
          </div>
          <div style={{ fontSize: '9px', color: isSaving ? 'var(--pico-primary)' : 'var(--pico-muted-color)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{isSaving ? '⏳ Автосохранение...' : '✅ Сохранено в Firebase'}</span>
          </div>
        </div>
      )}

      {/* Список досок */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Список досок</span>
        {boardsLoading && <p style={{ fontSize: '10px', color: 'var(--pico-muted-color)' }}>Загрузка досок...</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '200px' }}>
          {Object.values(boards).map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                background: currentBoardId === b.id ? 'rgba(37, 99, 235, 0.08)' : 'var(--pico-card-background-color)',
                border: currentBoardId === b.id ? '1px solid #2563eb' : '1px solid var(--pico-border-color)',
                borderRadius: '4px',
              }}
            >
              <span
                role="button"
                tabIndex={0}
                onClick={() => onSelectBoard(b.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectBoard(b.id);
                  }
                }}
                style={{
                  fontSize: '11px',
                  cursor: 'pointer',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: currentBoardId === b.id ? 'bold' : 'normal',
                  color: currentBoardId === b.id ? '#2563eb' : 'inherit'
                }}
              >
                {b.name}
              </span>
              <button
                type="button"
                onClick={() => void onDeleteBoard(b.id)}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '0 4px', cursor: 'pointer', fontSize: '10px', width: 'auto' }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Резервный экспорт на GitHub */}
      <div style={{ marginTop: '12px', borderTop: '1px solid var(--pico-border-color)', paddingTop: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Экспорт на GitHub (SVG)</span>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <input
            type="text"
            value={githubFileName}
            onChange={(e) => setGithubFileName(e.target.value)}
            style={{ flex: 1, fontSize: '10px', padding: '4px 6px', margin: 0 }}
          />
          <button
            type="button"
            onClick={() => void handleExportToGitHub()}
            disabled={isGithubSaving}
            style={{ padding: '4px 8px', fontSize: '10px', margin: 0, background: '#10b981', width: 'auto' }}
          >
            {isGithubSaving ? '...' : 'Экспорт'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            canvasRef.current?.resetScene();
          }}
          className="outline"
          style={{ width: '100%', fontSize: '10px', padding: '3px', margin: 0 }}
        >
          Очистить текущий холст
        </button>
      </div>

      <DrawingAssetsList onPickAsset={loadAssetToCanvas} refreshKey={assetsRefreshKey} />
    </div>
  );
}

function DrawingRightColumn({
  canvasRef,
  activeTab,
  setActiveTab
}: {
  canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null>;
  activeTab: 'diagrams' | 'english';
  setActiveTab: (t: 'diagrams' | 'english') => void;
}) {
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
        borderLeft: '1px solid var(--pico-border-color)'
      }}
    >
      {/* Вкладки переключения функционала */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--pico-border-color)', marginBottom: '16px', gap: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('english')}
          style={{
            flex: 1,
            fontSize: '11px',
            padding: '6px 4px',
            margin: 0,
            background: activeTab === 'english' ? 'var(--pico-primary)' : 'transparent',
            color: activeTab === 'english' ? 'var(--pico-primary-inverse)' : 'var(--pico-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0'
          }}
        >
          🇬🇧 English Agent
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('diagrams')}
          style={{
            flex: 1,
            fontSize: '11px',
            padding: '6px 4px',
            margin: 0,
            background: activeTab === 'diagrams' ? 'var(--pico-primary)' : 'transparent',
            color: activeTab === 'diagrams' ? 'var(--pico-primary-inverse)' : 'var(--pico-color)',
            border: 'none',
            borderRadius: '4px 4px 0 0'
          }}
        >
          🤖 AI Схемы
        </button>
      </div>

      {activeTab === 'english' ? (
        <EnglishLlmPanel canvasRef={canvasRef} />
      ) : (
        <>
          <AiDiagramPanel svgStr={svgStr} setSvgStr={setSvgStr} onImportToCanvas={handleImportSVG} />

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--pico-border-color)' }}>
            <h3 style={{ fontSize: '13px', marginBottom: '12px', fontWeight: 'bold' }}>Топ-10 блоков</h3>
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
        </>
      )}
    </div>
  );
}

const DrawingPage: React.FC = () => {
  const canvasRef = useRef<ExcalidrawCanvasHandle | null>(null);
  
  // Доски из Firebase
  const [boards, setBoards] = useState<Record<string, BoardMetadata>>({});
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [currentBoardName, setCurrentBoardName] = useState('');
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'diagrams' | 'english'>('english');
  const [assetsRefreshKey, setAssetsRefreshKey] = useState(0);

  const currentBoardIdRef = useRef<string | null>(null);
  const currentBoardNameRef = useRef<string>('');
  const ignoreChangeRef = useRef<boolean>(false);
  const latestSceneRef = useRef<{ elements: any; appState: any; files: any } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Синхронизация рефов
  useEffect(() => {
    currentBoardIdRef.current = currentBoardId;
    currentBoardNameRef.current = currentBoardName;
  }, [currentBoardId, currentBoardName]);

  // Загрузка конкретной доски из Firebase
  const loadBoard = async (boardId: string, customMap?: Record<string, BoardMetadata>) => {
    setFileLoading(true);
    ignoreChangeRef.current = true; // Блокируем автосохранение на время рендеринга сцены
    try {
      const map = customMap || boards;
      const meta = map[boardId];
      if (!meta) return;

      const scene = await getBoardScene(boardId);
      const canvas = canvasRef.current;
      
      if (canvas && scene) {
        const api = canvas.getApi();
        if (api) {
          api.updateScene({
            elements: sanitizeExcalidrawElements(scene.elements || []),
            appState: scene.appState || {},
            files: scene.files || {},
          });
          api.scrollToContent();
        } else {
          pendingSceneRef.current = scene;
        }
      } else {
        canvasRef.current?.resetScene();
      }
      
      setCurrentBoardId(boardId);
      setCurrentBoardName(meta.name);
    } catch (e) {
      console.error(e);
      alert('Ошибка при загрузке доски');
    } finally {
      setFileLoading(false);
      setTimeout(() => {
        ignoreChangeRef.current = false;
      }, 600);
    }
  };

  // Получение списка досок при старте
  const fetchBoardsList = useCallback(async (selectFirst = false) => {
    setBoardsLoading(true);
    try {
      const data = await getBoardsMetadata();
      if (data) {
        setBoards(data);
        const list = Object.values(data);
        if (list.length > 0 && (selectFirst || !currentBoardIdRef.current)) {
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          void loadBoard(list[0].id, data);
        }
      } else {
        // Создаем доску по умолчанию
        const boardId = 'board-default';
        await saveBoardToFirebase(boardId, 'Основная доска', { elements: [], appState: {}, files: {} });
        const fresh = await getBoardsMetadata();
        if (fresh) {
          setBoards(fresh);
          void loadBoard(boardId, fresh);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBoardsLoading(false);
    }
  }, [boards]);

  useEffect(() => {
    void fetchBoardsList(true);
  }, []);

  // Автосохранение с дебаунсом при изменении холста
  const onCanvasChange = useCallback((elements: any, appState: any, files: any) => {
    if (ignoreChangeRef.current || !currentBoardIdRef.current) return;
    
    if (!latestSceneRef.current) {
      setIsSaving(true);
    }
    latestSceneRef.current = { elements, appState, files };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const boardId = currentBoardIdRef.current;
      const name = currentBoardNameRef.current;
      const scene = latestSceneRef.current;
      if (!boardId || !name || !scene) {
        setIsSaving(false);
        return;
      }

      await saveBoardToFirebase(boardId, name, {
        elements: scene.elements,
        appState: {
          theme: scene.appState.theme,
          viewBackgroundColor: scene.appState.viewBackgroundColor,
          scrollX: scene.appState.scrollX,
          scrollY: scene.appState.scrollY,
          zoom: scene.appState.zoom,
        },
        files: scene.files
      });

      setIsSaving(false);
      latestSceneRef.current = null;
    }, 1500);
  }, []);

  const handleCreateBoard = async (name: string) => {
    const boardId = 'board-' + Date.now();
    setFileLoading(true);
    try {
      await saveBoardToFirebase(boardId, name, { elements: [], appState: {}, files: {} });
      await fetchBoardsList();
      await loadBoard(boardId);
    } catch (e) {
      console.error(e);
      alert('Не удалось создать доску');
    } finally {
      setFileLoading(false);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (Object.keys(boards).length <= 1) {
      alert('Нельзя удалить последнюю доску!');
      return;
    }
    if (!confirm('Вы уверены, что хотите удалить эту доску? Все элементы будут потеряны.')) return;
    
    setFileLoading(true);
    try {
      await deleteBoardFromFirebase(boardId);
      const data = await getBoardsMetadata();
      if (data) {
        setBoards(data);
        if (currentBoardId === boardId) {
          const list = Object.values(data);
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          await loadBoard(list[0].id, data);
        }
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка при удалении');
    } finally {
      setFileLoading(false);
    }
  };

  const handleRenameBoard = async (newName: string) => {
    const boardId = currentBoardId;
    if (!boardId || !newName.trim()) return;
    try {
      currentBoardNameRef.current = newName;
      setCurrentBoardName(newName);

      const api = canvasRef.current?.getApi();
      const scene = api ? {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles()
      } : { elements: [], appState: {}, files: {} };

      await saveBoardToFirebase(boardId, newName, scene);
      await fetchBoardsList();
    } catch (e) {
      console.error(e);
      alert('Ошибка при переименовании');
    }
  };

  // Импорт SVG с GitHub
  const loadAssetToCanvas = useCallback(
    async (path: string, name: string) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        alert('Редактор ещё не готов.');
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
                elements: sanitizeExcalidrawElements(scene.elements || []),
                appState: scene.appState,
                files: scene.files,
              });
              api.scrollToContent();
            } else {
              pendingSceneRef.current = scene;
            }
            return;
          }
        }
        canvas.embedSvg(file.content, name);
      } catch {
        alert('Ошибка загрузки файла');
      } finally {
        setFileLoading(false);
      }
    },
    [canvasRef]
  );

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
      <DrawingLeftColumn
        canvasRef={canvasRef}
        boards={boards}
        currentBoardId={currentBoardId}
        currentBoardName={currentBoardName}
        setCurrentBoardName={setCurrentBoardName}
        onSelectBoard={(id) => void loadBoard(id)}
        onCreateBoard={(name) => void handleCreateBoard(name)}
        onDeleteBoard={(id) => void handleDeleteBoard(id)}
        onRenameBoard={(name) => void handleRenameBoard(name)}
        boardsLoading={boardsLoading}
        isSaving={isSaving}
        fileLoading={fileLoading}
        loadAssetToCanvas={loadAssetToCanvas}
        assetsRefreshKey={assetsRefreshKey}
      />
      
      <DrawingExcalidrawIsland canvasRef={canvasRef} onCanvasChange={onCanvasChange} />
      
      <DrawingRightColumn
        canvasRef={canvasRef}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
};

export default DrawingPage;