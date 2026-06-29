import React, { useState } from 'react';
import {
  getNotesFromRepo, getPostsFromRepo, getDictionaryFromRepo,
  getLayoutsFromRepo, getPlannerFromRepo, getCalculatorsJsonFromRepo,
  getCvFromRepo, getRssListsFromRepo
} from '../lib/githubSync';
import {
  pushNotesToFirebase, pushPostsToFirebase, pushDictionaryToFirebase,
  pushLayoutsToFirebase, pushPlannerToFirebase, pushCalculatorsToFirebase,
  pushCvToFirebase, pushRssListsToFirebase
} from '../lib/firebaseData';
import { getDatabase, ref, get } from 'firebase/database';
import { getFirebaseApp } from '../lib/firebaseAuth';

export const FirebaseMigration: React.FC = () => {
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const downloadBackup = async () => {
    setLoading(true);
    setLog(['Начало создания резервной копии...']);
    
    try {
      const backup: any = {};
      
      addLog('Скачивание заметок...');
      backup.notes = await getNotesFromRepo();
      
      addLog('Скачивание постов блога...');
      backup.posts = await getPostsFromRepo();
      
      addLog('Скачивание словаря...');
      backup.dictionary = await getDictionaryFromRepo();
      
      addLog('Скачивание Layouts...');
      backup.layouts = await getLayoutsFromRepo();
      
      addLog('Скачивание Planner...');
      backup.planner = await getPlannerFromRepo();
      
      addLog('Скачивание Calculators...');
      const calcsStr = await getCalculatorsJsonFromRepo();
      backup.calculators = calcsStr ? JSON.parse(calcsStr) : null;
      
      addLog('Скачивание CV...');
      backup.cv = await getCvFromRepo();
      
      addLog('Скачивание RSS...');
      backup.rss = await getRssListsFromRepo();
      
      addLog('Формирование файла...');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `igor_site_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addLog('✅ Резервная копия успешно скачана!');
    } catch (e) {
      addLog(`💥 Ошибка при скачивании: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const withTimeout = <T,>(promise: Promise<T>, ms = 10000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Превышено время ожидания. Проверьте правильность VITE_FIREBASE_DATABASE_URL в .env и перезапустите сервер npm run dev')), ms))
    ]);
  };

  const runMigration = async () => {
    if (!window.confirm('Внимание! Это скачает все данные из GitHub и загрузит их в Firebase Realtime Database. Убедитесь, что вы прописали VITE_FIREBASE_DATABASE_URL в .env.')) {
      return;
    }
    
    setLoading(true);
    setLog(['Начало миграции...']);
    
    // Debug info
    const dbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL;
    addLog(`URL базы: ${dbUrl ? dbUrl : 'НЕ НАЙДЕН (пусто)'}`);
    if (!dbUrl) {
      addLog('ОШИБКА: Браузер не видит VITE_FIREBASE_DATABASE_URL. Точно перезапустили терминал?');
    }

    try {
      const app = getFirebaseApp();
      if (!app) throw new Error('Firebase не инициализирован');
      
      // Проверка авторизации
      const auth = getDatabase ? (await import('firebase/auth')).getAuth(app) : null;
      const user = auth ? auth.currentUser : null;
      addLog(`Пользователь в Firebase: ${user ? `${user.email} (UID: ${user.uid})` : 'НЕ АВТОРИЗОВАН (гость)'}`);

      addLog('Проверка подключения к Firebase (тестовое чтение)...');
      const db = getDatabase(app, dbUrl || undefined);
      const testRef = ref(db, 'data');
      await withTimeout(get(testRef), 5000);
      addLog('✅ Подключение успешно установлено!');

      addLog('Загрузка заметок с GitHub...');
      const notesData = await getNotesFromRepo();
      if (notesData) {
        const res = await withTimeout(pushNotesToFirebase(notesData.notes, notesData.folders));
        addLog(res.ok ? '✅ Заметки перенесены' : `❌ Ошибка заметок: ${res.error}`);
      }

      addLog('Загрузка постов блога...');
      const posts = await getPostsFromRepo();
      if (posts) {
        const res = await withTimeout(pushPostsToFirebase(posts));
        addLog(res.ok ? '✅ Посты перенесены' : `❌ Ошибка постов: ${res.error}`);
      }

      addLog('Загрузка словаря...');
      const dict = await getDictionaryFromRepo();
      if (dict) {
        const res = await withTimeout(pushDictionaryToFirebase(dict.entries, dict.priorityLangs));
        addLog(res.ok ? '✅ Словарь перенесен' : `❌ Ошибка словаря: ${res.error}`);
      }

      addLog('Загрузка Layouts...');
      const layouts = await getLayoutsFromRepo();
      if (layouts) {
        const res = await withTimeout(pushLayoutsToFirebase(layouts));
        addLog(res.ok ? '✅ Layouts перенесены' : `❌ Ошибка Layouts: ${res.error}`);
      }

      addLog('Загрузка Planner...');
      const planner = await getPlannerFromRepo();
      if (planner) {
        const res = await withTimeout(pushPlannerToFirebase(planner.tasks, planner.labels || []));
        addLog(res.ok ? '✅ Planner перенесен' : `❌ Ошибка Planner: ${res.error}`);
      }

      addLog('Загрузка Calculators...');
      const calcs = await getCalculatorsJsonFromRepo();
      if (calcs) {
        const res = await withTimeout(pushCalculatorsToFirebase(calcs));
        addLog(res.ok ? '✅ Calculators перенесены' : `❌ Ошибка Calculators: ${res.error}`);
      }

      addLog('Загрузка CV...');
      const cv = await getCvFromRepo();
      if (cv) {
        const res = await withTimeout(pushCvToFirebase(cv));
        addLog(res.ok ? '✅ CV перенесено' : `❌ Ошибка CV: ${res.error}`);
      }

      addLog('Загрузка RSS...');
      const rss = await getRssListsFromRepo();
      if (rss) {
        const res = await withTimeout(pushRssListsToFirebase(rss.lists));
        addLog(res.ok ? '✅ RSS перенесен' : `❌ Ошибка RSS: ${res.error}`);
      }

      addLog('🎉 Миграция завершена!');
    } catch (e) {
      addLog(`💥 Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--pico-muted-border-color)', borderRadius: 8 }}>
      <h3 style={{ marginBottom: 12 }}>Управление данными</h3>
      <p style={{ fontSize: 13, marginBottom: 12 }}>
        Вы можете создать локальную резервную копию всех данных с GitHub (скачается в виде JSON файла).
      </p>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: 16 }}>
        <button onClick={downloadBackup} disabled={loading} style={{ fontSize: 13, padding: '6px 12px', background: 'var(--pico-secondary-background)', color: 'var(--pico-secondary-inverse)', border: 'none' }}>
          {loading ? 'Обработка...' : '💾 Скачать бэкап данных'}
        </button>
        <button onClick={runMigration} disabled={loading} style={{ fontSize: 13, padding: '6px 12px' }}>
          {loading ? 'Обработка...' : '🚀 Запустить миграцию в Firebase'}
        </button>
      </div>
      
      {log.length > 0 && (
        <div style={{ marginTop: 16, background: 'var(--pico-code-background-color)', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
};
