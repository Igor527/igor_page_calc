import React, { useState, useEffect, useCallback } from 'react';
import { putFile, listFiles, deleteFile, getFile } from '@/lib/githubSync';

const PROMPTS_FILE_PATH = 'public/data/ai-prompts.json';

const DEFAULT_SYSTEM_PROMPT = `Ты — эксперт по векторной графике, создающий красивые схемы в стиле "digital whiteboard sketch" или "Excalidraw style".

Стиль (The Aesthetic):
- hand-drawn (нарисованный от руки)
- low-fidelity (неформальный)
- casual diagram (казуальная диаграмма)
- Используй имитацию неровных линий для рамок (вместо идеальных прямоугольников делай слегка скошенные углы или viewBox с эффектом sketch).
- Цветовая палитра: пастельные тона (светло-желтый фон #fcfceb, черные линии #1e1e1e, акценты синего #a5d8ff, зелёного #b2f2bb).
- Шрифт: handwritten font. Указывай font-family="Comic Sans MS, 'Chalkboard SE', 'Comic Neue', cursive".
- Все контейнеры должны иметь толстую неровную обводку (stroke-width="2" или "3") и заливку (fill), чтобы они выделялись друг над другом.

Структура (The Layout):
- Вертикальный стикер: сделай основной прямоугольный фрейм (фон), внутри сверху крупно заголовок по центру.
- Под заголовком выведи блоки один под другим (вертикально), соединяя их линиями (strokes).
- Текст не должен вылезать за рамки блоков.
- КРИТИЧЕСКИ ВАЖНО: Размеры \`viewBox\` и фонового прямоугольника должны строго облегать контент с небольшим отступом (padding около 20-40px со всех сторон). НЕ оставляй пустое желтое пространство снизу или по бокам! Высота холста должна зависеть от количества блоков.

Формат вывода:
Выдай СТРОГО чистый и валидный SVG-код! Никакого текста до или после. Не оборачивай код в маркдаун-блок \`\`\`svg. Начинай сразу с <svg ...>.`;

const DEFAULT_USER_PROMPT = `ПЛАН РАБОТ
1. Тест
2. Завтра`;

async function generateSVGWithMistral(systemPrompt: string, userPrompt: string, apiKey: string) {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Ошибка API Mistral ' + res.status);
  }
  
  const data = await res.json();
  let svg = data.choices[0].message.content.trim();
  if (svg.startsWith('```html')) svg = svg.replace(/^```html\n?/, '');
  if (svg.startsWith('```svg')) svg = svg.replace(/^```svg\n?/, '');
  if (svg.startsWith('```xml')) svg = svg.replace(/^```xml\n?/, '');
  if (svg.endsWith('```')) svg = svg.replace(/\n?```$/, '');
  return svg;
}

export const AIGeneratorPanel: React.FC<{ postSlug?: string }> = ({ postSlug }) => {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userPrompt, setUserPrompt] = useState(DEFAULT_USER_PROMPT);
  const [apiKey, setApiKey] = useState('');
  
  const [svgStr, setSvgStr] = useState('');
  const [savedSvgStr, setSavedSvgStr] = useState('');
  const [fileName, setFileName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  
  const [assets, setAssets] = useState<Array<{name: string, path: string, sha: string}>>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // Загружаем сохраненный промпт из GitHub (чтобы он "деплоился" и между устройствами синхронизировался)
  useEffect(() => {
    getFile(PROMPTS_FILE_PATH).then(res => {
      if (res && res.content) {
        try {
          const data = JSON.parse(res.content);
          if (data.systemPrompt) setSystemPrompt(data.systemPrompt);
          if (data.userPrompt) setUserPrompt(data.userPrompt);
        } catch { /* ignore */ }
      }
    });

    const localApiKey = localStorage.getItem('igor-mistral-api');
    if (localApiKey) setApiKey(localApiKey);
  }, []);

  const fetchAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    const result = await listFiles('public/assets');
    if (result) setAssets(result.filter(a => a.name.endsWith('.svg')));
    setIsLoadingAssets(false);
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleSavePrompts = async () => {
    setIsSavingPrompt(true);
    const payload = JSON.stringify({ systemPrompt, userPrompt }, null, 2);
    const res = await putFile(PROMPTS_FILE_PATH, payload, 'Обновлены шаблоны AI-промптов');
    if (res.ok) {
      alert('Промпты успешно сохранены в репозиторий (deploy).');
    } else {
      alert('Ошибка: ' + res.error);
    }
    setIsSavingPrompt(false);
  };

  const handleGenerate = async () => {
    if (!userPrompt.trim() || !apiKey) {
      alert('Введите промпт и укажите API ключ Mistral');
      return;
    }
    localStorage.setItem('igor-mistral-api', apiKey);
    
    setIsGenerating(true);
    try {
      const generated = await generateSVGWithMistral(systemPrompt, userPrompt, apiKey);
      setSvgStr(generated);
      setFileName((postSlug ? `${postSlug}-` : '') + `schema_${Math.floor(Date.now() / 1000)}.svg`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToGitHub = async () => {
    if (!svgStr || !fileName) return;
    const fname = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_') + (fileName.endsWith('.svg') ? '' : '.svg');
    const path = `public/assets/${fname}`;
    const res = await putFile(path, svgStr, `Добавлен стикер ${fname}`);
    if (res.ok) {
      setSavedSvgStr(svgStr);
      alert(`Стикер сохранен и скопирован в буфер!\n\n/assets/${fname}`);
      fetchAssets();
      navigator.clipboard.writeText(`/assets/${fname}`);
      window.dispatchEvent(new CustomEvent('insert-image-to-editor', { detail: `/assets/${fname}` }));
    } else {
      alert('Ошибка: ' + res.error);
    }
  };

  const loadAssetToEditor = async (path: string, name: string) => {
    setIsLoadingAssets(true);
    try {
      const file = await getFile(path);
      if (file && file.content) {
        setSvgStr(file.content);
        setSavedSvgStr(file.content);
        setFileName(name);
      } else {
        alert('Не удалось загрузить содержимое файла');
      }
    } catch {
      alert('Ошибка при скачивании файла из репо');
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const handleDelete = async (path: string, sha: string) => {
    if (!confirm('Точно удалить этот стикер?')) return;
    const res = await deleteFile(path, sha, `Удален ассет ${path}`);
    if (res.ok) fetchAssets();
    else alert('Ошибка: ' + res.error);
  };

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
      
      {/* Секция AI */}
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>AI Генератор Стикеров</span>
          <button onClick={handleSavePrompts} disabled={isSavingPrompt} style={{ padding: '2px 8px', fontSize: '10px', width: 'auto', marginBottom: 0 }}>
            {isSavingPrompt ? 'Сохр...' : '💾 Сохранить пресеты'}
          </button>
        </h3>
        
        <input 
          type="password" 
          value={apiKey} 
          onChange={e => setApiKey(e.target.value)} 
          placeholder="Mistral API Key (или gsk_... для Groq)" 
          style={{ ...inputStyle, marginBottom: '12px' }}
        />

        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pico-h2-color)' }}>Типовой промпт (Стиль/Инструкция на сервере)</label>
        <textarea 
          value={systemPrompt} 
          onChange={e => setSystemPrompt(e.target.value)} 
          style={{ ...inputStyle, minHeight: '180px', resize: 'vertical' }}
        />

        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pico-h2-color)' }}>Контент блок-схемы (Переменные данные)</label>
        <textarea 
          value={userPrompt} 
          onChange={e => setUserPrompt(e.target.value)} 
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
        />

        <button onClick={handleGenerate} disabled={isGenerating} style={{ ...buttonStyle, marginTop: 4 }}>
          {isGenerating ? 'Нейронка рисует...' : 'Сгенерировать SVG'}
        </button>
      </div>

      {/* Editor & Preview */}
      {svgStr && (
        <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Предпросмотр визуального результата</label>
          <div 
            style={{ 
              background: '#fff', padding: '10px', borderRadius: '4px', border: '1px dashed #ccc', 
              marginBottom: '10px', display: 'flex', justifyContent: 'center'
            }}
            dangerouslySetInnerHTML={{ __html: svgStr }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', margin: 0 }}>Сырой код (можно править вручную)</label>
            {svgStr === savedSvgStr ? (
              <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold' }}>✅ В репо</span>
            ) : (
              <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 'bold' }}>⚠️ Есть несохраненные изменения</span>
            )}
          </div>
          <textarea 
            value={svgStr} 
            onChange={e => setSvgStr(e.target.value)} 
            style={{ ...inputStyle, minHeight: '200px', resize: 'vertical', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
          />

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              type="text" 
              value={fileName} 
              onChange={e => setFileName(e.target.value)} 
              placeholder="Имя-файла"
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            <button 
              onClick={svgStr === savedSvgStr ? () => window.dispatchEvent(new CustomEvent('insert-image-to-editor', { detail: `/assets/${fileName}` })) : handleSaveToGitHub} 
              style={{ ...buttonStyle, width: 'auto', marginBottom: 0, backgroundColor: svgStr === savedSvgStr ? 'transparent' : '#10b981', color: svgStr === savedSvgStr ? 'var(--pico-color)' : '#fff', border: svgStr === savedSvgStr ? '1px solid var(--pico-muted-color)' : 'none' }} 
              title={svgStr === savedSvgStr ? "Схема уже сохранена, просто вставить в текст" : "Сохранить на GitHub и вставить в текст"}
            >
               {svgStr === savedSvgStr ? '✅ В репо (вставить)' : '☁️ Сохранить и Вставить'}
            </button>
          </div>
        </div>
      )}

      {/* Assets Manager */}
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem' }}>📂 База стикеров</h4>
          <button onClick={fetchAssets} style={{ padding: '2px 8px', fontSize: '10px', cursor: 'pointer' }}>Обновить</button>
        </div>
        
        {isLoadingAssets ? (
          <div style={{ fontSize: '11px', color: 'var(--pico-muted-color)' }}>Ищем...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
            {assets.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--pico-muted-color)' }}>Пусто. Сохраняй стикеры!</div>
            ) : (
              assets.map(asset => (
                <div key={asset.sha} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', background: 'var(--pico-background-color)', padding: '6px', borderRadius: '4px', border: '1px solid var(--pico-cursor-color)' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={asset.name}>
                    {asset.name}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => loadAssetToEditor(asset.path, asset.name)} 
                      style={{ padding: '2px 4px', background: 'transparent', border: '1px solid var(--pico-muted-color)', color: 'var(--pico-color)', borderRadius: '4px', cursor: 'pointer' }}
                      title="Открыть редактор"
                    >✏️</button>
                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('insert-image-to-editor', { detail: `/assets/${asset.name}` }))} 
                      style={{ padding: '2px 4px', background: 'transparent', border: '1px solid var(--pico-primary)', color: 'var(--pico-primary)', borderRadius: '4px', cursor: 'pointer' }}
                      title="Вставить в редактор"
                    >📥</button>
                    <button 
                      onClick={() => navigator.clipboard.writeText(`/assets/${asset.name}`).then(() => alert(`Скопировано:\n/assets/${asset.name}`))} 
                      style={{ padding: '2px 4px', background: 'transparent', border: '1px solid var(--pico-muted-color)', borderRadius: '4px', cursor: 'pointer' }}
                      title="Копировать путь"
                    >🔗</button>
                    <button 
                      onClick={() => handleDelete(asset.path, asset.sha)} 
                      style={{ padding: '2px 4px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
                      title="Удалить"
                    >❌</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      
    </div>
  );
};
