# Деплой на GitHub Pages через GitHub Actions

Пошаговая настройка: сборка на GitHub Actions и публикация сайта на GitHub Pages (при необходимости — с своим доменом).

---

## 1. Репозиторий на GitHub

- Создайте репозиторий (или используйте существующий). Может быть **приватным**.
- Запушьте код. Ветка по умолчанию — обычно `main` (в workflow указана она; если у вас `master`, отредактируйте в `.github/workflows/deploy.yml` строку `branches: [main]` на `branches: [master]`).

---

## 2. Секреты репозитория

Чтобы при сборке подставлялись Firebase и админские данные, задайте **Actions secrets**:

**Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

### Вариант А: один секрет (проще)

Создайте один секрет с именем **`ENV_FILE`** и вставьте в него **целиком содержимое** вашего `.env` (все строки как есть, например):

```
VITE_FIREBASE_API_KEY=ваш_api_key
VITE_FIREBASE_AUTH_DOMAIN=ваш-проект.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ваш-проект
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_ADMIN_EMAIL=your@email.com
VITE_ADMIN_GITHUB_IDS=12345678
```

При сборке workflow создаст из этого файл `.env`, и Vite подставит значения. Остальные секреты создавать не нужно.

### Вариант Б: отдельный секрет на каждую переменную

Создайте по одному секрету для каждого значения:

| Имя секрета | Что подставлять (из `.env`) |
|-------------|----------------------------|
| `VITE_FIREBASE_API_KEY` | Ключ API Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Домен вида `ваш-проект.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ID проекта Firebase |
| `VITE_FIREBASE_APP_ID` | App ID веб-приложения Firebase |
| `VITE_ADMIN_EMAIL` | Ваш email (или несколько через запятую) |
| `VITE_ADMIN_GITHUB_IDS` | Опционально: GitHub User ID админов через запятую |
| `VITE_MISTRAL_API_KEY` | Опционально: ключ Mistral для словаря |

Минимум для входа в админку: все `VITE_FIREBASE_*` и один из `VITE_ADMIN_EMAIL` или `VITE_ADMIN_GITHUB_IDS`.

---

## 3. Включить GitHub Pages из Actions

1. В том же репозитории: **Settings** → **Pages** (в левой колонке).
2. В блоке **Build and deployment**:
   - **Source:** выберите **GitHub Actions** (не "Deploy from a branch").

После первого успешного запуска workflow сайт будет доступен по адресу вида:

- `https://<ваш-username>.github.io/<имя-репо>/` — если репо не `username.github.io`;
- или `https://<ваш-username>.github.io/` — если репо называется `<username>.github.io`.

Если сайт в подпапке (`.../имя-репо/`), в проекте нужно задать `base` в Vite (см. раздел 6).

---

## 4. Запуск деплоя

- **Автоматически:** при каждом `push` в ветку `main` (или в ту, что указана в workflow) запускается сборка и публикация.
- **Вручную:** вкладка **Actions** → workflow **Deploy to GitHub Pages** → **Run workflow** → выбрать ветку и запустить.

Первый раз после включения Pages может понадобиться один ручной запуск или пуш в `main`. Статус смотрите во вкладке **Actions**; при успехе в **Settings → Pages** появится ссылка на сайт.

---

## 5. Свой домен urbanplanner.page и DNS

### 5.1. Указать домен в GitHub

1. Репозиторий → **Settings** → **Pages**.
2. В блоке **Custom domain** введите **urbanplanner.page** (без www) и нажмите **Save**.
3. GitHub покажет, что домен нужно настроить в DNS (статус «Unverified» или «DNS check is still in progress» — это нормально до настройки записей).

### 5.2. Настроить DNS у регистратора домена

Зайдите в панель управления доменом **urbanplanner.page** (там, где покупали домен: Reg.ru, Cloudflare, Namecheap, GoDaddy, и т.п.) и откройте раздел **DNS** / **Управление зоной** / **DNS records**.

Подставьте вместо **ВАШ_USERNAME** ваш логин GitHub (тот, что в ссылке `https://github.com/ВАШ_USERNAME/`).

**Вариант А: только основной домен urbanplanner.page (без www)**

| Тип  | Имя / Host / Поддомен | Значение / Target / Points to | TTL (если спрашивают) |
|------|------------------------|--------------------------------|------------------------|
| A    | `@` или пусто          | `185.199.108.153`              | 3600 или по умолчанию |
| A    | `@` или пусто          | `185.199.109.153`              | 3600                   |
| A    | `@` или пусто          | `185.199.110.153`              | 3600                   |
| A    | `@` или пусто          | `185.199.111.153`              | 3600                   |

Итого: **четыре A-записи** с разными IP, имя — корень домена (`@` или оставить пустым).

**Вариант Б: основной домен + www**

- Для **urbanplanner.page** (корень) — те же четыре A-записи, как в варианте А.
- Для **www.urbanplanner.page** — одна запись:

| Тип   | Имя / Host | Значение / Target           | TTL  |
|-------|------------|-----------------------------|------|
| CNAME | `www`      | `ВАШ_USERNAME.github.io`    | 3600 |

**Подсказка:** в разных панелях поле «имя» может называться «Name», «Host», «Subdomain», «Имя». Для корня домена часто указывают `@` или оставляют пустым; для www — именно `www`.

После сохранения подождите 5–30 минут (иногда до 24 часов). В **Settings → Pages → Custom domain** статус сменится на зелёный, появится возможность включить **Enforce HTTPS** — включите её.

### 5.3. Firebase

В **Firebase Console** → **Project settings** → **Authorized domains** добавьте **urbanplanner.page** и при необходимости **www.urbanplanner.page**, иначе вход через Google/GitHub на этом домене не сработает.

---

## 6. Проверка

- Откройте **https://urbanplanner.page** (или ссылку из Settings → Pages до настройки домена).
- Главная, калькуляторы, блог должны открываться.
- Переход по прямой ссылке (например `.../welcome_me`) должен открывать ту же SPA (для этого в workflow добавлено копирование `index.html` в `404.html`).
- Вход в админку: **https://urbanplanner.page/welcome_me** — после настройки Firebase и секретов должен работать вход через Google/GitHub или email.

---

## Итог

| Шаг | Действие |
|-----|----------|
| 1 | Репо на GitHub (приватный — можно). Код запушен. |
| 2 | Settings → Secrets and variables → Actions: добавить все нужные `VITE_*` секреты. |
| 3 | Settings → Pages → Source: **GitHub Actions**. |
| 4 | Пуш в `main` или ручной Run workflow в Actions. |
| 5 | (По желанию) Custom domain в Pages + DNS + домен в Firebase Authorized domains. |
| 6 | Сайт открывается по **https://urbanplanner.page**; в проекте `base: '/'` (vite.config.ts). |

Файл workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
