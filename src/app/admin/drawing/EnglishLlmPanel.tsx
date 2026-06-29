import React, { useState, useEffect, useRef } from 'react';
import { type ExcalidrawCanvasHandle } from './ExcalidrawCanvas';
import { sceneCenter } from './excalidrawScene';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';

interface Props {
  canvasRef: React.MutableRefObject<ExcalidrawCanvasHandle | null>;
}

type Provider = 'gemini' | 'mistral' | 'openai';

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px', marginBottom: '8px', borderRadius: '4px',
  border: '1px solid var(--pico-border-color)', background: 'var(--pico-background-color)',
  color: 'var(--pico-color)', fontSize: '11px'
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  padding: '6px 8px'
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer',
  width: '100%', fontWeight: 'bold', fontSize: '11px', display: 'flex',
  alignItems: 'center', justifyContent: 'center', gap: '6px', margin: 0
};

export const EnglishLlmPanel: React.FC<Props> = ({ canvasRef }) => {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('');
  const [errorText, setErrorText] = useState('');
  
  // Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [shouldSpeakBack, setShouldSpeakBack] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [spawnAsFlow, setSpawnAsFlow] = useState(false);
  
  const recognitionRef = useRef<any>(null);

  // Load saved keys from LocalStorage
  useEffect(() => {
    const savedProvider = localStorage.getItem('igor-llm-provider') as Provider;
    if (savedProvider) setProvider(savedProvider);
    
    const loadKey = (prov: Provider) => {
      const key = localStorage.getItem(`igor-llm-api-key-${prov}`) || '';
      setApiKey(key);
    };
    loadKey(savedProvider || 'gemini');
  }, []);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProv = e.target.value as Provider;
    setProvider(newProv);
    localStorage.setItem('igor-llm-provider', newProv);
    const key = localStorage.getItem(`igor-llm-api-key-${newProv}`) || '';
    setApiKey(key);
    setErrorText('');
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem(`igor-llm-api-key-${provider}`, val);
  };

  // Setup Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US'; // По умолчанию распознаем английскую речь
      
      rec.onstart = () => {
        setIsRecording(true);
        setStatus('Слушаю вас...');
        setErrorText('');
      };
      
      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setRecognizedText(text);
        setStatus('Распознано. Запрос к ИИ...');
        void runQuery(text);
      };
      
      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setStatus('');
        setErrorText(`Ошибка голоса: ${event.error}`);
      };
      
      rec.onend = () => {
        setIsRecording(false);
      };
      
      recognitionRef.current = rec;
    }
  }, [provider, apiKey, shouldSpeakBack]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Голосовое распознавание не поддерживается вашим браузером (рекомендуется Chrome/Zen с включенными флагами).');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      if (!apiKey) {
        alert('Введите API ключ для отправки запроса к ИИ');
        return;
      }
      recognitionRef.current.start();
    }
  };

  // TTS (Text-to-Speech)
  const speak = (text: string) => {
    if (!shouldSpeakBack || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    // Очищаем текст от markdown-разметки
    const cleanText = text.replace(/[*#`_\-]/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    
    // Пытаемся найти качественный голос Google или Microsoft
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))) || 
                  voices.find(v => v.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
    
    window.speechSynthesis.speak(utterance);
  };

  const getSelectedText = () => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    const api = canvas.getApi();
    if (!api) return '';
    
    const elements = api.getSceneElements().filter(el => el.isSelected);
    if (elements.length === 0) return '';
    
    const sorted = [...elements].sort((a, b) => {
      if (Math.abs(a.y - b.y) < 15) return a.x - b.x;
      return a.y - b.y;
    });
    
    const texts: string[] = [];
    sorted.forEach(el => {
      if (el.type === 'text') {
        texts.push((el as any).text || '');
      } else if ((el as any).label?.text) {
        texts.push((el as any).label.text);
      }
    });
    
    return texts.join('\n');
  };

  const callLLM = async (prompt: string, sysPrompt?: string): Promise<string> => {
    if (!apiKey) throw new Error('Не указан API-ключ');
    
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const fullText = sysPrompt ? `${sysPrompt}\n\n${prompt}` : prompt;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullText }] }]
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini Error: ${res.status}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    
    if (provider === 'mistral') {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: 0.5
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Mistral Error: ${res.status}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: 0.5
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI Error: ${res.status}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    throw new Error('Неизвестный провайдер');
  };

  const runQuery = async (queryText: string) => {
    setIsLoading(true);
    setErrorText('');
    try {
      const selected = getSelectedText();
      const sysPrompt = `You are a helpful English Language Teacher and assistant. 
Keep your explanations short and precise. If there is context from the board, use it to understand what the user is working on. 
If the user asks to generate nodes/flow/scenarios, generate them and format the response in structural nodes (we will parse them if you output JSON).`;
      
      const prompt = selected 
        ? `Context from selected whiteboard blocks:\n"""\n${selected}\n"""\n\nUser request: ${queryText}`
        : queryText;

      const response = await callLLM(prompt, sysPrompt);
      setAiResponse(response);
      speak(response);
      setStatus('');
    } catch (e: any) {
      console.error(e);
      setErrorText(e.message || 'Ошибка выполнения запроса');
      setStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = async (actionType: 'check' | 'dialogue' | 'quiz' | 'flow') => {
    const selected = getSelectedText();
    if (!selected && actionType !== 'flow') {
      alert('Пожалуйста, выделите на доске блоки с текстом для проведения анализа!');
      return;
    }
    
    if (!apiKey) {
      alert('Введите API ключ для доступа к ИИ');
      return;
    }

    setIsLoading(true);
    setErrorText('');
    setStatus('ИИ думает...');
    try {
      let prompt = '';
      let sysPrompt = 'You are a highly skilled English language teacher.';
      
      if (actionType === 'check') {
        prompt = `Проверь грамматические и орфографические ошибки в следующем тексте с доски, исправь их и кратко объясни правила на русском языке:\n\n"${selected}"`;
      } else if (actionType === 'dialogue') {
        prompt = `Создай короткий диалог (на английском с переводом ключевых фраз) на тему или с использованием слов из выделенной области:\n\n"${selected}"`;
      } else if (actionType === 'quiz') {
        prompt = `Создай короткий тест с вариантами ответов (3 вопроса) для проверки понимания следующего материала:\n\n"${selected}"`;
      } else if (actionType === 'flow') {
        sysPrompt = `You must return ONLY a JSON block containing nodes and connections to be built on the board. Keep the nodes logical. 
Return only a codeblock containing the JSON, matching this structure:
{
  "nodes": [
    { "id": "1", "text": "Lesson Intro: Past Simple", "type": "rectangle" },
    { "id": "2", "text": "Concept: ed suffix / irregular verbs", "type": "rectangle" },
    { "id": "3", "text": "Question: I (write) a book yesterday.", "type": "ellipse" }
  ],
  "connections": [
    { "from": "1", "to": "2" },
    { "from": "2", "to": "3" }
  ]
}`;
        prompt = selected 
          ? `Создай интерактивную цепочку обучения (Flow) на основе выделенных тем/заметок:\n\n"${selected}"`
          : `Создай цепочку обучения (Flow) для темы: "${customPrompt || 'English Grammar Basics'}"`;
      }

      const response = await callLLM(prompt, sysPrompt);
      setAiResponse(response);
      
      if (actionType === 'flow') {
        const flowData = parseNodesFromJson(response);
        if (flowData) {
          spawnNodes(flowData);
          setStatus('Успешно созданы блоки на холсте!');
        } else {
          setStatus('ИИ ответил, но не удалось распарсить JSON блоков.');
        }
      } else {
        speak(response);
        setStatus('');
      }
    } catch (e: any) {
      console.error(e);
      setErrorText(e.message || 'Ошибка ИИ');
      setStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  const parseNodesFromJson = (text: string) => {
    try {
      let jsonStr = text.trim();
      const match = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonStr = match[1];
      } else {
        const first = jsonStr.indexOf('{');
        const last = jsonStr.lastIndexOf('}');
        if (first >= 0 && last > first) {
          jsonStr = jsonStr.slice(first, last + 1);
        }
      }
      const data = JSON.parse(jsonStr);
      if (data && Array.isArray(data.nodes)) {
        return data as {
          nodes: Array<{ id: string; text: string; type?: string }>;
          connections?: Array<{ from: string; to: string }>;
        };
      }
    } catch (e) {
      console.error('JSON parse fail:', e);
    }
    return null;
  };

  const spawnNodes = (data: {
    nodes: Array<{ id: string; text: string; type?: string }>;
    connections?: Array<{ from: string; to: string }>;
  }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const api = canvas.getApi();
    if (!api) return;

    const { x, y } = sceneCenter(api);
    const nodes = data.nodes;
    const nodePositions = new Map<string, { x: number; y: number }>();
    
    // Layout nodes horizontally
    const startX = x - (nodes.length * 260) / 2 + 30;
    const startY = y - 45;

    const nodeSkeletons = nodes.map((node, i) => {
      const nodeX = startX + i * 260;
      const nodeY = startY;
      nodePositions.set(node.id, { x: nodeX, y: nodeY });

      return {
        type: node.type === 'ellipse' ? 'ellipse' : 'rectangle',
        x: nodeX,
        y: nodeY,
        width: 200,
        height: 90,
        strokeColor: '#2563eb',
        backgroundColor: node.type === 'ellipse' ? '#fef08a' : '#eff6ff',
        strokeStyle: 'solid',
        label: {
          text: node.text,
          fontSize: 14,
          strokeColor: '#1e3a8a',
        }
      } as any;
    });

    const connections = data.connections || [];
    const connectionSkeletons = connections.map(conn => {
      const fromPos = nodePositions.get(conn.from);
      const toPos = nodePositions.get(conn.to);
      if (!fromPos || !toPos) return null;

      const fX = fromPos.x + 200;
      const fY = fromPos.y + 45;
      const tX = toPos.x;
      const tY = toPos.y + 45;

      return {
        type: 'arrow',
        x: fX,
        y: fY,
        points: [[0, 0], [tX - fX, tY - fY]],
        strokeColor: '#3b82f6',
        strokeWidth: 2,
      } as any;
    }).filter(Boolean);

    const converted = convertToExcalidrawElements(
      [...nodeSkeletons, ...connectionSkeletons],
      { regenerateIds: true }
    );
    api.updateScene({ elements: [...api.getSceneElements(), ...converted] });
    api.scrollToContent();
  };

  const handleCustomSend = () => {
    if (!customPrompt.trim()) return;
    if (spawnAsFlow) {
      void handleQuickAction('flow');
    } else {
      void runQuery(customPrompt);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Настройка ключа */}
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold' }}>ИИ Конфигурация</h3>
        
        <select value={provider} onChange={handleProviderChange} style={selectStyle}>
          <option value="gemini">Google Gemini Flash (Рекомендуется)</option>
          <option value="mistral">Mistral AI</option>
          <option value="openai">OpenAI (GPT-4o-mini)</option>
        </select>
        
        <input 
          type="password" 
          value={apiKey} 
          onChange={handleKeyChange} 
          placeholder={`${provider.toUpperCase()} API Key`}
          style={inputStyle} 
        />
      </div>

      {/* Быстрые действия с выделением */}
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold' }}>Действия с выделением доски</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button 
            type="button" 
            onClick={() => void handleQuickAction('check')}
            disabled={isLoading}
            style={{ ...buttonStyle, background: '#ef4444', color: '#fff' }}
          >
            🔍 Ошибки
          </button>
          
          <button 
            type="button" 
            onClick={() => void handleQuickAction('dialogue')}
            disabled={isLoading}
            style={{ ...buttonStyle, background: '#8b5cf6', color: '#fff' }}
          >
            💬 Диалог
          </button>
          
          <button 
            type="button" 
            onClick={() => void handleQuickAction('quiz')}
            disabled={isLoading}
            style={{ ...buttonStyle, background: '#f59e0b', color: '#fff' }}
          >
            ✏️ Тест (Quiz)
          </button>
          
          <button 
            type="button" 
            onClick={() => void handleQuickAction('flow')}
            disabled={isLoading}
            style={{ ...buttonStyle, background: '#10b981', color: '#fff' }}
          >
            🌿 Сделать Flow
          </button>
        </div>
      </div>

      {/* Голосовой чат */}
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', textAlign: 'left' }}>🗣 Голосовая практика</h3>
        
        <button
          type="button"
          onClick={toggleRecording}
          style={{
            ...buttonStyle,
            background: isRecording ? '#ef4444' : 'var(--pico-primary)',
            color: '#fff',
            height: '44px',
            borderRadius: '22px',
            fontSize: '12px',
            boxShadow: isRecording ? '0 0 10px rgba(239, 68, 68, 0.6)' : 'none',
            transition: 'all 0.3s ease',
            marginBottom: '8px'
          }}
        >
          {isRecording ? '🛑 Остановить запись' : '🎤 Говорить на английском'}
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer', justifyContent: 'center' }}>
          <input 
            type="checkbox" 
            checked={shouldSpeakBack} 
            onChange={e => setShouldSpeakBack(e.target.checked)} 
            style={{ margin: 0 }}
          />
          Озвучивать ответ ИИ (Аудио-ответ)
        </label>
      </div>

      {/* Свободный чат / генератор */}
      <div style={{ padding: '12px', background: 'var(--pico-card-background-color)', border: '1px solid var(--pico-border-color)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold' }}>Спросить / Создать блоки</h3>
        <textarea
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder="Введите тему (например: 'Present Perfect vs Past Simple') или вопрос к ИИ..."
          style={{ ...inputStyle, minHeight: '50px' }}
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={spawnAsFlow} 
              onChange={e => setSpawnAsFlow(e.target.checked)} 
              style={{ margin: 0 }}
            />
            Сгенерировать блоки на доске
          </label>
        </div>

        <button 
          type="button" 
          onClick={handleCustomSend} 
          disabled={isLoading}
          style={{ ...buttonStyle, background: 'var(--pico-primary)', color: '#fff' }}
        >
          {isLoading ? 'Думаю...' : 'Отправить запрос'}
        </button>
      </div>

      {/* Логи статуса и ошибок */}
      {status && (
        <div style={{ fontSize: '11px', color: 'var(--pico-primary)', padding: '4px 8px', background: 'var(--pico-card-background-color)', borderRadius: '4px' }}>
          ℹ️ {status}
        </div>
      )}
      
      {errorText && (
        <div style={{ fontSize: '11px', color: '#ef4444', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          ⚠️ {errorText}
        </div>
      )}

      {/* Выводы */}
      {recognizedText && (
        <div style={{ padding: '8px', background: 'var(--pico-card-background-color)', borderRadius: '6px', border: '1px solid var(--pico-border-color)' }}>
          <div style={{ fontSize: '10px', color: 'var(--pico-muted-color)', fontWeight: 'bold' }}>Ваш голос:</div>
          <div style={{ fontSize: '11px', fontStyle: 'italic' }}>{recognizedText}</div>
        </div>
      )}

      {aiResponse && (
        <div style={{ padding: '8px', background: 'var(--pico-card-background-color)', borderRadius: '6px', border: '1px solid var(--pico-border-color)', maxHeight: '180px', overflowY: 'auto' }}>
          <div style={{ fontSize: '10px', color: 'var(--pico-muted-color)', fontWeight: 'bold' }}>Ответ ИИ:</div>
          <div style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{aiResponse}</div>
        </div>
      )}
    </div>
  );
};
