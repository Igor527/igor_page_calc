# Changelog

## [3.0.0] - 2026-02-25

### Рефакторинг и очистка

**Удалены неиспользуемые компоненты (~177 КБ мёртвого кода):**
- `DynamoNodeEditor.tsx` (131 КБ), `VisualNodeEditor.tsx`, `BlueprintPanel.tsx`, `ErrorDisplay.tsx`, `performance.ts`, `types/nodes.ts`, `app/page.html`

**Удалены устаревшие документы:**
- `DYNAMO_GUIDE.md`, `VISUAL_EDITOR_GUIDE.md`, `TODO.md`, `ANALYSIS.md`, `LIMITATIONS.md`, `.project-engine-instructions.md`, `.project-structure.md`, `.foam/`, `SECURITY.md`, `QUICKSTART.md`, `COPILOT_RULES.md`, `PROJECT_GUIDELINES.md`

**Оптимизация кода:**
- Удалены все `console.log`/`console.warn`/`console.error` из продакшн-кода
- Исправлены `catch(e)` → `catch` где переменная не используется
- Удалена отладочная логика `__validationLogged`

**Документация:**
- Полностью переписаны `README.md`, `.project-instructions.md`, `.github/copilot-instructions.md`
- Создан `AI_CALCULATOR_PROMPT.md` — инструкция для ИИ по генерации JSON-схем калькуляторов
- Обновлён `WORKFLOW.md`

### Исправления

- Исправлена перезапись калькуляторов: после «Отправить на ревью» сбрасывается `current-id` и ставится `forceNew`, следующее сохранение/отправка создаёт НОВЫЙ калькулятор
- Тесты обновлены под актуальный API (localStorage mock с `length`/`key()`)

## [2.5.0] - 2026-02-22

### Добавлено
- Кастомные адреса (slug) для калькуляторов (`/calculators/:slug`)
- Список опубликованных калькуляторов (`/calculators`)
- Режим админа (`/?admin=1` / `/?admin=0`)
- Планировщик задач (Гантт) для админа
- Публикация и ревью калькуляторов
- Экспорт/импорт JSON-схем
- Визуализация зависимостей между блоками
- Автодополнение формул
- Drag-and-drop блоков
- Светлая/тёмная тема
- XSS защита, валидация URL и формул
- 53 юнит-теста (Vitest)

## [2.1.0] - 2026-02-16

### Добавлено
- Блок `table_viewer` для промежуточного просмотра таблиц
- Блок `chart` для графиков (line, bar, pie, area)
- Блок `text` для форматированного текста
- Отчёт (reportHtml) с токенами подстановки (`@id`, `@id.stepsCalculations`)

## [2.0.0] - 2026-02-16

### Добавлено
- Визуальный редактор блоков
- PropertyEditor для настройки блоков
- Двухпанельный интерфейс (блоки + отчёт)
- Контекстное меню для создания блоков
- PicoCSS для стилизации
- Сохранение/загрузка схемы калькулятора
- Генерация отчёта (ReportPanel)
