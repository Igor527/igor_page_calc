В этой папке можно хранить заготовки конфигов (без реальных ключей). В git не попадают файлы с ключами.

Реальные ключи и секреты задаются в корне проекта в файле .env (он в .gitignore):

  1. Скопируйте .env.example в .env.
  2. Заполните:
     - VITE_MISTRAL_API_KEY — ключ Mistral AI для перевода в словаре (https://console.mistral.ai/).
     - VITE_FIREBASE_* и VITE_ADMIN_EMAIL — для входа в режим админа через Firebase Auth (https://console.firebase.google.com/).
  3. При локальном запуске (npm run dev) Mistral в dev идёт через прокси Vite, ключ не уходит в браузер.
  4. Для продакшена: при сборке (npm run build) переменные из .env подставляются в бандл. Задайте их в настройках билда (Cloudflare Pages / Vercel / и т.д.) или в .env перед build. Firebase конфиг и VITE_ADMIN_EMAIL тоже задаются через .env или переменные окружения билда.

Итог: всё, что в .gitignore (.env, secrets с ключами), не коммитится. Авторизация админа — через Firebase (настраивается в .env). Синхронизация с GitHub — токен вводится в интерфейсе и хранится в localStorage (не в репо).
