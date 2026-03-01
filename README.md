# Igor Page Calc

Веб-конструктор инженерных калькуляторов с публикацией и ревью. SPA на React + Vite, хостинг — Cloudflare Pages.

## Возможности

- Конструктор калькуляторов из блоков (16 типов: input, formula, data_table, chart и др.)
- Подача на публикацию и ручное ревью
- Публичные калькуляторы по ссылке (`/calculators/:slug`)
- Админ-панель для ревью (`/admin/review`)
- Планировщик задач (Гантт, только для админа)
- Визуализация зависимостей между блоками
- Автодополнение в формулах
- Drag-and-drop для перестановки блоков
- Экспорт/импорт схем в JSON
- Светлая и тёмная тема
- XSS защита, валидация URL и формул

## Технологии

- **React 18** + **Vite** (SPA)
- **Zustand** (состояние)
- **math.js** (расчёты — арифметика, округления, min/max/sum, тернарные условия)
- **TypeScript**
- **PicoCSS** (UI)
- **Cloudflare Pages** (хостинг)

## Запуск

```sh
npm install
npm run dev      # dev-сервер http://localhost:5173
npm run build    # сборка в dist/
npm test         # юнит-тесты (vitest)
```

## Деплой

Push в main → автодеплой на Cloudflare Pages. Защита админки через Cloudflare Access — см. [CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md).

## Структура проекта

```
src/
├── app/                          # Страницы (роутинг по pathname)
│   ├── admin/editor/page.tsx     # Редактор калькуляторов
│   ├── admin/review/ReviewPanel.tsx  # Панель ревью
│   ├── calculators/CalculatorsListPage.tsx  # Список опубликованных
│   ├── planner/PlannerPage.tsx   # Планировщик (Гантт)
│   ├── public/PublicCalculator.tsx  # Публичный вид калькулятора
│   └── welcome/WelcomePage.tsx   # Главная
├── components/editor/            # UI-компоненты редактора
│   ├── PropertyEditor.tsx        # Редактор свойств блока
│   ├── ReportPanel.tsx           # Панель отчёта
│   ├── NodesList.tsx             # Список блоков
│   ├── DataVisualization.tsx     # Визуализация данных
│   ├── TableVisualEditor.tsx     # Редактор таблиц
│   ├── ChartRenderer.tsx         # Рендер графиков
│   ├── ValidationErrors.tsx      # Ошибки валидации
│   └── DependencyGraph.tsx       # Граф зависимостей
├── lib/                          # Ядро
│   ├── engine.ts                 # Расчётный движок (math.js)
│   ├── store.ts                  # Zustand-стейт (blocks + values)
│   ├── calculatorStorage.ts      # Сохранение/загрузка в localStorage
│   ├── reportHtml.ts             # Подстановка токенов в отчёт
│   ├── validation.ts             # Валидация блоков
│   ├── security.ts               # XSS, URL, формулы
│   ├── formula.ts                # Парсинг формул
│   ├── tableData.ts              # Нормализация таблиц
│   └── errors.ts                 # Сообщения об ошибках
├── types/
│   └── blocks.ts                 # Типы всех блоков
├── data/                         # Демо-данные
│   ├── parking_demo.json         # Блоки демо-калькулятора
│   └── parking_demo_bundle.json  # Бандл (блоки + reportHtml)
├── main.tsx                      # Точка входа, роутинг
└── index.css                     # Стили + PicoCSS + темы
```

## Роутинг

| Путь | Страница | Доступ |
|------|----------|--------|
| `/` | Главная | Все |
| `/editor` | Редактор калькуляторов | Все |
| `/admin/review` | Панель ревью | Все (кнопки действий — только админ) |
| `/calculators` | Список опубликованных | Все |
| `/calculators/:slug` | Публичный калькулятор | Все |
| `/planner` | Планировщик (Гантт) | Только админ |
| `/?admin=1` | Включить режим админа | — |
| `/?admin=0` | Выключить режим админа | — |

## Документация

| Файл | Содержание |
|------|------------|
| [AI_CALCULATOR_PROMPT.md](AI_CALCULATOR_PROMPT.md) | Инструкция для ИИ по генерации JSON-схем калькуляторов |
| [CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md) | Настройка защиты админки через Cloudflare Access |
| [WORKFLOW.md](WORKFLOW.md) | Рабочий процесс: от черновика до публикации |
| [UI_RULES.md](UI_RULES.md) | Правила оформления UI |
| [CHANGELOG.md](CHANGELOG.md) | История изменений |

## Контакты

- [Telegram](https://t.me/IGOR_CHEVELA)
