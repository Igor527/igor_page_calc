import React, { useState, useEffect, useCallback } from 'react';
import { putFile, listFiles, deleteFile, getFile } from '@/lib/githubSync';

const PROMPTS_FILE_PATH = 'public/data/ai-diagram-prompts.json';

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
  svg = svg.replace(/^```(html|svg|xml)?\n?/, '').replace(/\n?```$/, '');
  return svg;
}

export const AiDiagramPanel: React.FC<{ 
  svgStr: string; 
  setSvgStr: (s: string) => void;
  onImportToCanvas: (svg: string) => void;
}> = ({ svgStr, setSvgStr, onImportToCanvas }) => {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [fileName, setFileName] = useState('diagram-' + Date.now().toString().slice(-6) + '.svg');

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

  const handleSavePrompts = async () => {
    setIsSavingPrompt(true);
    const payload = JSON.stringify({ systemPrompt, userPrompt }, null, 2);
    const res = await putFile(PROMPTS_FILE_PATH, payload, 'Обновлены шаблоны AI-диаграмм');
    if (res.ok) alert('Промпты сохранены в репо.');
    setIsSavingPrompt(false);
  };

  const handleGenerate = async () => {
    if (!userPrompt.trim() || !apiKey) {
      alert('Введите промпт и API ключ');
      return;
    }
    localStorage.setItem('igor-mistral-api', apiKey);
    setIsGenerating(true);
    try {
      const generated = await generateSVGWithMistral(systemPrompt, userPrompt, apiKey);
      setSvgStr(generated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
          <span>AI Генератор</span>
          <button onClick={handleSavePrompts} disabled={isSavingPrompt} style={{ padding: '2px 8px', fontSize: '10px', width: 'auto', marginBottom: 0 }}>
            {isSavingPrompt ? '...' : '💾 Сохранить'}
          </button>
        </h3>
        
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} 
          placeholder="Mistral API Key" style={inputStyle} />

        <label style={{ fontSize: '10px', fontWeight: 600 }}>Системный пре-промпт</label>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} 
          style={{ ...inputStyle, minHeight: '120px' }} />

        <label style={{ fontSize: '10px', fontWeight: 600 }}>Что нарисовать?</label>
        <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} 
          style={{ ...inputStyle, minHeight: '60px' }} />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleGenerate} disabled={isGenerating} style={{ ...buttonStyle, flex: 2, marginBottom: 0 }}>
            {isGenerating ? 'Рисую...' : 'Сгенерировать'}
          </button>
          <button onClick={() => {
            setSvgStr('<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="600" fill="#fff"/></svg>');
            onImportToCanvas('<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="600" fill="#fff"/></svg>');
          }} style={{ ...buttonStyle, flex: 1, marginBottom: 0, background: 'transparent', border: '1px solid var(--pico-muted-color)', color: 'var(--pico-color)' }}>
            Пустой
          </button>
        </div>
      </div>

      {svgStr && (
        <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
          <label style={{ fontSize: '10px', fontWeight: 600 }}>Код SVG</label>
          <textarea value={svgStr} onChange={e => setSvgStr(e.target.value)} 
            style={{ ...inputStyle, minHeight: '150px', fontFamily: 'monospace' }} />
          <button onClick={() => onImportToCanvas(svgStr)} style={{ ...buttonStyle, background: '#3b82f6' }}>
            📥 Импорт на холст
          </button>
        </div>
      )}
    </div>
  );
};
