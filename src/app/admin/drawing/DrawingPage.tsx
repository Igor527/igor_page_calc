import React, { useState, useEffect, useCallback } from 'react';
import { Tldraw, Editor, createShapeId, AssetRecordType } from 'tldraw';
import 'tldraw/tldraw.css';
import { getFile, putFile, deleteFile } from '@/lib/githubSync';
import { AiDiagramPanel } from './AiDiagramPanel';

const DrawingPage: React.FC = () => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [fileName, setFileName] = useState('scheme-' + Date.now().toString().slice(-6) + '.svg');
  const [assets, setAssets] = useState<{ name: string; path: string; sha: string; url: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [svgStr, setSvgStr] = useState('');

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const cfgStr = localStorage.getItem('igor-github-sync-config');
      if (!cfgStr) return;
      const cfg = JSON.parse(cfgStr);
      if (!cfg.token || !cfg.owner || !cfg.repo) return;
      
      const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/public/assets?ref=${encodeURIComponent(cfg.branch || 'main')}`, {
        headers: { Accept: 'application/vnd.github.v3+json', Authorization: `token ${cfg.token}` }
      });
      if (!res.ok) throw new Error('Ошибка сети');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAssets(data.filter((f: any) => f.name.endsWith('.svg') || f.name.endsWith('.png')));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleSaveToGitHub = async () => {
    if (!editor || !fileName) return;
    setIsSaving(true);
    try {
      // Export to SVG
      const svg = await editor.getSvgString(Array.from(editor.getCurrentPageShapeIds()), {
        padding: 32,
        scale: 1,
        background: true,
      });
      if (!svg) throw new Error('Failed to generate SVG');

      // Add tldraw snapshot as metadata for future editing
      const snapshot = editor.getSnapshot();
      const finalSvg = svg.svg + `\n<!-- tldraw-snapshot: ${encodeURIComponent(JSON.stringify(snapshot))} -->`;

      const path = `public/assets/${fileName.endsWith('.svg') ? fileName : fileName + '.svg'}`;
      const res = await putFile(path, finalSvg, `Добавлена схема ${path}`);
      
      if (res.ok) {
        alert(`Сохранено: /assets/${fileName}`);
        fetchAssets();
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

  const loadAssetToCanvas = async (path: string, name: string) => {
    if (!editor) return;
    setIsLoading(true);
    try {
      const file = await getFile(path);
      if (file && file.content) {
        const match = file.content.match(/<!-- tldraw-snapshot: (.*?) -->/s);
        if (match && match[1]) {
          const snapshot = JSON.parse(decodeURIComponent(match[1]));
          editor.loadSnapshot(snapshot);
          setFileName(name);
        } else {
          // Fallback: load as flat SVG image
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
        }
      }
    } catch (e) {
      alert('Ошибка загрузки файла');
    } finally {
      setIsLoading(false);
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

  const addShape = (type: string, props: any = {}) => {
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
        ...props
      }
    });
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--pico-background-color)' }}>
      
      {/* LEFT: Assets */}
      <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--pico-border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--pico-border-color)' }}>
          <h2 style={{ fontSize: '16px', margin: '0 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href="/" style={{ fontSize: '11px', textDecoration: 'none' }}>← На главную</a>
            <span>Рисование</span>
          </h2>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            <input type="text" value={fileName} onChange={e => setFileName(e.target.value)} style={{ flex: 1, fontSize: '11px', padding: '4px 8px', margin: 0 }} />
            <button onClick={handleSaveToGitHub} disabled={isSaving} style={{ padding: '4px 8px', fontSize: '11px', margin: 0, background: '#10b981' }}>
              {isSaving ? '...' : 'Пуш'}
            </button>
          </div>
          <button onClick={() => { editor?.clearPage(); setFileName('scheme-' + Date.now().toString().slice(-6) + '.svg'); }} 
            className="outline" style={{ width: '100%', fontSize: '11px', padding: '4px', margin: 0 }}>
            Новый файл
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 0 8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Assets</span>
            <button onClick={fetchAssets} style={{ fontSize: '10px', background: 'transparent', color: 'var(--pico-primary)', border: 'none', cursor: 'pointer' }}>Обновить</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {assets.map(a => (
              <div key={a.sha} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '4px' }}>
                <span onClick={() => loadAssetToCanvas(a.path, a.name)} style={{ fontSize: '11px', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                <button onClick={async () => { if (confirm('Удалить?')) { await deleteFile(a.path, a.sha, 'Remove'); fetchAssets(); } }} style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '0 4px', cursor: 'pointer' }}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER: Canvas */}
      <div style={{ flex: 1, position: 'relative', borderRight: '1px solid var(--pico-border-color)' }}>
        <Tldraw 
          onMount={(api) => setEditor(api)}
          inferDarkMode={true}
        />
      </div>

      {/* RIGHT: AI & Code */}
      <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '16px', background: 'var(--pico-background-color)' }}>
        <AiDiagramPanel 
          svgStr={svgStr} 
          setSvgStr={setSvgStr} 
          onImportToCanvas={handleImportSVG} 
        />
        
        {/* Favorites: Top 10 Blocks */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--pico-border-color)' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Топ-10 блоков</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <button onClick={() => addShape('rectangle', { text: 'Процесс' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">⬜ Процесс</button>
            <button onClick={() => addShape('rhombus', { text: 'Условие' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">🔶 Условие</button>
            <button onClick={() => addShape('oval', { text: 'Начало' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">🟢 Старт/Конец</button>
            <button onClick={() => addShape('trapezoid', { text: 'Данные' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">▱ Данные</button>
            <button onClick={() => addShape('rectangle', { dash: 'dashed', text: 'Заметка' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">📝 Заметка</button>
            <button onClick={() => addShape('diamond', { text: 'Решение' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">💎 Решение</button>
            <button onClick={() => addShape('cloud', { text: 'Облако' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">☁️ Облако</button>
            <button onClick={() => editor?.createShape({ type: 'arrow', x: 0, y: 0, props: { text: 'Связь' } })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">↗️ Стрелка</button>
            <button onClick={() => editor?.createShape({ type: 'text', props: { text: 'Заголовок' } })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">🔤 Текст</button>
            <button onClick={() => addShape('ellipse', { text: 'Инфо' })} style={{ fontSize: '10px', padding: '6px', margin: 0 }} className="outline">⭕ Круг</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrawingPage;
