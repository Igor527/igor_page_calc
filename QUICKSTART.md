# Igor Page Calc — Быстрый старт

## Установка и запуск

1. Клонируйте репозиторий:
   ```sh
   git clone https://github.com/your-repo/igor_page_calc.git
   cd igor_page_calc
   ```
2. Установите зависимости:
   ```sh
   npm install
   ```
3. Запустите dev-сервер:
   ```sh
   [[2026-02-15]]
   ```

## Основные зависимости
- react
- react-dom
- zustand
- mathjs
- vite (или next)
- typescript
- @types/react, @types/react-dom

## Alias для импортов (tsconfig.json)
```json
"baseUrl": "./src",
"paths": {
  "@/*": ["*"],
  "@components/*": ["components/*"],
  "@lib/*": ["lib/*"],
  "@types/*": ["types/*"]
}
```

## Пример package.json
(см. в корне проекта)

## Пример tsconfig.json
(см. в корне проекта)

## Важно
- Для корректной работы alias используйте VSCode или настройте IDE на поддержку paths.
- Если используете Next.js, настройте next.config.js аналогично.

## Контакты
- [GitHub](https://github.com/your-repo)
