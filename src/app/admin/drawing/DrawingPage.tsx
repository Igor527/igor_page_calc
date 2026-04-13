import React, { useState, useEffect, useRef } from 'react';
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw';
import { getFile, putFile, deleteFile } from '@/lib/githubSync';
import { loadFromBlob } from '@excalidraw/excalidraw';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px', marginBottom: '8px', borderRadius: '4px',
  border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)',
  color: 'var(--pico-color)', fontSize: '11px', lineHeight: '1.4'
};
const buttonStyle: React.CSSProperties = {
  padding: '6px 12px', backgroundColor: 'var(--pico-primary)', color: 'var(--pico-primary-inverse)',
  border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%',
  marginBottom: '8px', fontWeight: 'bold', fontSize: '12px'
};

const DrawingPage: React.FC = () => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [fileName, setFileName] = useState('scheme-' + Date.now().toString().slice(-6) + '.svg');
  const [assets, setAssets] = useState<{ name: string; path: string; sha: string; url: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const fetchAssets = async () => {
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
  };

  useEffect(() => { fetchAssets(); }, []);

  const handleSaveToGitHub = async () => {
    if (!excalidrawAPI || !fileName) {
      alert('Укажите имя файла!');
      return;
    }
    setIsSaving(true);
    try {
      // Экспорт в SVG (встраивает меты внутри для дальнейшего редактирования)
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      
      const svgDOMElement = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: false,
        },
        files,
        exportPadding: 20,
      });

      // Вручную встраиваем scene данные, т.к. exportToSvg может их не встраивать, 
      // в отличие от функций которые работают с blob (в Excalidraw это хитрая логика)
      const sceneData = JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "urban-planner-page",
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
        files
      });
      
      // Вкидываем JSON в коммент в самом конце SVG, это позволит 100% его извлечь
      const finalSvg = svgDOMElement.outerHTML + `\n<!-- excalidraw-json-data: ${encodeURIComponent(sceneData)} -->`;

      const path = `public/assets/${fileName.endsWith('.svg') ? fileName : fileName + '.svg'}`;
      const res = await putFile(path, finalSvg, `Добавлена схема ${path}`);
      
      if (res.ok) {
        alert(`Успешно сохранено!\n\nПуть: /assets/${fileName}`);
        fetchAssets();
      } else {
        alert('Ошибка при сохранении: ' + res.error);
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка при генерации/сохранении!');
    } finally {
      setIsSaving(false);
    }
  };

  const loadAssetToCanvas = async (path: string, name: string) => {
    setIsLoading(true);
    try {
      const file = await getFile(path);
      if (file && file.content) {
        const match = file.content.match(/<!-- excalidraw-json-data: (.*?) -->/s);
        if (match && match[1]) {
          const sceneParams = JSON.parse(decodeURIComponent(match[1]));
          excalidrawAPI.updateScene(sceneParams);
          setFileName(name);
        } else {
          // Пытаемся загрузить нативной функцией Excalidraw (если был сохранен через нативный интерфейс)
          try {
            const blob = new Blob([file.content], { type: "image/svg+xml" });
            const scene = await loadFromBlob(blob, null, null);
            excalidrawAPI.updateScene(scene);
            setFileName(name);
          } catch(e) {
            alert('Не найдены исходные редактируемые слои (Возможно это обычный плоский SVG, не созданный в редакторе)');
            setFileName(name);
          }
        }
      }
    } catch (e) {
      alert('Ошибка загрузки файла');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (path: string, sha: string) => {
    if (!confirm('Точно удалить эту схему из репозитория?')) return;
    const res = await deleteFile(path, sha, `Удален ассет ${path}`);
    if (res.ok) fetchAssets();
    else alert('Ошибка: ' + res.error);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Левая панель с файлами */}
      <div style={{ width: '380px', flexShrink: 0, borderRight: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--pico-border-color)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <a href="/" style={{ fontSize: '12px', textDecoration: 'none' }}>← На главную</a>
            Рисование
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--pico-muted-color)', marginBottom: '16px' }}>
            Рисуйте схемы. Они сохраняются в <code>public/assets/</code> в формате `.svg`, который содержит все слои.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input 
              type="text" 
              value={fileName} 
              onChange={e => setFileName(e.target.value)} 
              placeholder="schema.svg"
              style={{ ...inputStyle, marginBottom: 0 }}
            />
            <button onClick={handleSaveToGitHub} disabled={isSaving} style={{ ...buttonStyle, width: 'auto', marginBottom: 0, backgroundColor: '#10b981' }}>
              {isSaving ? '...' : '💾 Пуш в репо'}
            </button>
          </div>
          <button 
            type="button" 
            onClick={() => {
              excalidrawAPI?.resetScene();
              setFileName('scheme-' + Date.now().toString().slice(-6) + '.svg');
            }} 
            style={{ ...buttonStyle, backgroundColor: 'transparent', color: 'var(--pico-color)', border: '1px solid var(--pico-muted-color)' }}
          >
            Очистить холст (Новый файл)
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '13px', margin: 0 }}>Репозиторий (assets)</h3>
            <button onClick={fetchAssets} disabled={isLoading} style={{ background: 'transparent', border: 'none', color: 'var(--pico-primary)', cursor: 'pointer', fontSize: '12px' }}>
              🔄 {isLoading ? '...' : 'Обновить'}
            </button>
          </div>
          {assets.length === 0 && !isLoading && <p style={{ fontSize: '11px', color: 'var(--pico-muted-color)' }}>Пусто</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {assets.map(asset => (
              <div key={asset.sha} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '6px' }}>
                <span onClick={() => loadAssetToCanvas(asset.path, asset.name)} style={{ fontSize: '11px', cursor: 'pointer', color: 'var(--pico-primary)', wordBreak: 'break-all', flex: 1 }}>{asset.name}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => handleDelete(asset.path, asset.sha)} style={{ padding: '2px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }} title="Удалить">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Сам Excalidraw */}
      <div style={{ flex: 1, position: 'relative' }}>
         {/* @ts-ignore - Excalidraw UI takes full width/height of relative parent */}
        <Excalidraw 
          excalidrawAPI={(api: any) => setExcalidrawAPI(api)} 
          langCode="ru-RU"
          theme={document.documentElement.classList.contains('dark') ? "dark" : "light"}
        />
      </div>
      
    </div>
  );
};

export default DrawingPage;
