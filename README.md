# Igor Page Calc

Веб-конструктор инженерных калькуляторов, блог, заметки и словарь. SPA на React + Vite. Хостинг — GitHub Pages / Cloudflare Pages.

## Возможности

- **Калькуляторы** — конструктор из блоков (16 типов: input, formula, data_table, chart и др.), публикация по ссылке `/calculators/:slug`
- **Блог** — посты с обложками, тегами, опросы; экспорт/автосинхронизация с репо
- **Заметки** — папки, теги, импорт из файлов/Telegram; только для админа
- **Словарь** — перевод (Mistral AI, MyMemory, Lingva), транскрипция, добавление в словарь; только для админа
- **Порядок окон** — редактируемые секции на главной (кнопки, виджеты)
- Планировщик (Гантт), визуализация зависимостей, экспорт/импорт JSON, светлая и тёмная тема, XSS-защита

## Запуск

```sh
npm install
cp .env.example .env    # заполните ключи (см. ниже)
npm run dev             # http://localhost:5173
npm run build           # сборка в dist/
npm test                # тесты (vitest)
```

## Секреты и переменные окружения

Файл **`.env`** в git не попадает (см. `.gitignore`). Всё чувствительное — только в `.env` или в переменных билда на хостинге.

1. Скопируйте **`.env.example`** в **`.env`**.
2. Заполните:
   - **VITE_MISTRAL_API_KEY** — ключ [Mistral AI](https://console.mistral.ai/) для перевода в словаре. В dev запрос идёт через прокси Vite (ключ не уходит в браузер).
   - **VITE_FIREBASE_*** и **VITE_ADMIN_EMAIL** — для входа в режим админа через Firebase Auth (см. ниже). Если не заданы, админ включается по ссылке `/welcome_me` (localStorage).
3. Папка **`secrets/`** — только заготовки; реальные ключи в `.env`. Подробнее: [secrets/README.txt](secrets/README.txt).

## Режим админа и Firebase

- **Без Firebase** (по умолчанию): переход по ссылке `/welcome_me` включает режим админа (флаг в localStorage). Выход — `/?admin=0`.
- **С Firebase Auth**: создайте проект в [Firebase Console](https://console.firebase.google.com/), в Authentication → Sign-in method включите **Google**, **GitHub** (и при необходимости Email/Password). В **Project settings → Authorized domains** добавьте `localhost` и ваш домен (например `urbanplanner.page`). В [GitHub](https://github.com/settings/developers) создайте OAuth App, callback URL возьмите из Firebase (типа `https://PROJECT.firebaseapp.com/__/auth/handler`). В `.env` укажите `VITE_FIREBASE_*` и хотя бы один из: `VITE_ADMIN_EMAIL` (email через запятую) или `VITE_ADMIN_GITHUB_IDS` (GitHub user ID через запятую). По адресу `/welcome_me` откроется экран входа; при успешном входе админский режим включается.

  **Вход через Google (пошагово):**
  1. [Firebase Console](https://console.firebase.google.com/) → ваш проект → **Authentication** → вкладка **Sign-in method**.
  2. Нажмите **Google** → переключатель **Enable** в положение «включено» → **Save**. Дополнительно создавать OAuth-приложение в Google Cloud не обязательно (Firebase использует свой клиент).
  3. **Project settings** (шестерёнка) → **Authorized domains** — убедитесь, что есть `localhost` и ваш продакшен-домен (например `urbanplanner.page`).
  4. В `.env` задайте `VITE_ADMIN_EMAIL=ваш@gmail.com` (тот же Google-аккаунт, которым будете входить). Несколько админов — через запятую.
  5. Откройте `/welcome_me`, нажмите «Войти через Google» — откроется окно выбора аккаунта Google, после входа вы окажетесь в режиме админа.

## Синхронизация с GitHub

На главной в режиме админа: блок «Синхронизация с GitHub» (owner, repo, ветка, Personal Access Token). После настройки изменения в заметках, блоге, словаре, калькуляторах и порядке окон автоматически пушатся в репо (`public/data/*.json`). Данные при загрузке сайта подтягиваются из этих файлов. См. [public/data/README.txt](public/data/README.txt).

## Перед публикацией

1. **Тесты и сборка:** `npm run test:run` и `npm run build` — без ошибок.
2. **Секреты:** в `.env` (или в переменных билда на хостинге) заданы нужные ключи; `.env` не коммитить.
3. **GitHub Pages:** если сайт в подпапке (например `username.github.io/igor_page_calc`), в `vite.config.ts` задайте `base: '/igor_page_calc/'`.
4. **Данные:** при первом деплое в `public/data/` можно положить пустые или заготовки `*.json`; после настройки синхронизации они будут обновляться автоматически.

## Роутинг

| Путь | Доступ |
|------|--------|
| `/` | Главная |
| `/editor` | Редактор калькуляторов |
| `/calculators`, `/calculators/:slug` | Список и публичный калькулятор |
| `/blog`, `/blog/:slug` | Блог |
| `/admin/notes` | Заметки (админ) |
| `/dictionary` | Словарь (админ) |
| `/cv` | CV (админ, без ссылки с публичного сайта) |
| `/planner` | Планировщик Гантт (админ) |
| `/welcome_me` | Вход в режим админа (прямая ссылка, на сайте не показывается) |
| `/?admin=0` | Выход из режима админа |

## Документация

| Файл | Содержание |
|------|------------|
| [.env.example](.env.example) | Шаблон переменных (Mistral, Firebase) |
| [secrets/README.txt](secrets/README.txt) | Где хранить ключи, что не коммитить |
| [public/data/README.txt](public/data/README.txt) | Файлы данных и автосинхронизация с репо |
| [AI_CALCULATOR_PROMPT.md](AI_CALCULATOR_PROMPT.md) | Инструкция для ИИ по генерации схем калькуляторов |
| [CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md) | Защита админки через Cloudflare Access (опционально) |
| [WORKFLOW.md](WORKFLOW.md) | Рабочий процесс |
| [UI_RULES.md](UI_RULES.md) | Правила UI |
| [CHANGELOG.md](CHANGELOG.md) | История изменений |
| [PUBLISH_CHECKLIST.md](PUBLISH_CHECKLIST.md) | Чеклист перед публикацией |

## Контакты

- [Telegram](https://t.me/igor_chevela)
