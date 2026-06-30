import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envFile = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) env[key.trim()] = rest.join('=').trim();
  }
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  databaseURL: 'https://urban-planner-b6b13-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = getDatabase(app);

async function check() {
  console.log('Подключение к Firebase...');
  try {
    const snap = await get(ref(db, 'data'));
    if (!snap.exists()) {
      console.log('БД пуста (нет узла "data").');
      process.exit(0);
    }

    const data = snap.val();
    console.log('✅ Данные в Firebase найдены!');
    console.log('---');

    for (const [key, value] of Object.entries(data)) {
      let info = '';
      if (Array.isArray(value)) {
        info = `(Массив из ${value.length} элементов)`;
      } else if (typeof value === 'object' && value !== null) {
        if (key === 'notes' && value.notes) {
          info = `(${value.notes.length} заметок, ${value.folders?.length || 0} папок)`;
        } else if (key === 'dictionary' && value.entries) {
          info = `(${value.entries.length} слов)`;
        } else if (key === 'planner' && value.tasks) {
          info = `(${value.tasks.length} задач)`;
        } else if (key === 'rssLists' && value.lists) {
          info = `(${value.lists.length} списков)`;
        } else {
          info = `(Объект, ключи: ${Object.keys(value).length})`;
        }
      } else if (typeof value === 'string') {
        info = `(Строка, длина: ${value.length} симв.)`;
      }
      console.log(`- ${key}: ${info}`);
    }

  } catch (err) {
    console.error('Ошибка доступа:', err.message);
  }
  process.exit(0);
}

check();
