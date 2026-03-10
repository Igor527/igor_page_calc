# Инструкция для ИИ: генерация JSON-схем калькуляторов

Эту инструкцию можно скопировать целиком в ChatGPT, Claude, Copilot или любой другой ИИ-ассистент.
Результат вставляется в редактор через кнопку **«Вставить JSON»**.

---

## Задача

Сгенерировать JSON-бандл калькулятора для конструктора Igor.Page Calc.
Бандл содержит два поля: `blocks` (массив блоков — логика и данные) и `reportHtml` (HTML-отчёт с токенами подстановки).

## Формат вывода

```json
{
  "blocks": [ ... ],
  "reportHtml": "<h3>Заголовок</h3><table>...</table>"
}
```

Допустим также массив только блоков `[...]` без отчёта — тогда reportHtml не обновляется.

---

## Типы блоков

### input — ввод пользователя

```json
{
  "id": "inputArea",
  "type": "input",
  "label": "Площадь квартиры",
  "inputType": "number",
  "defaultValue": 50,
  "unit": "м²",
  "min": 0,
  "max": 10000,
  "step": 1
}
```

Для выпадающего списка:
```json
{
  "id": "inputZone",
  "type": "input",
  "inputType": "select",
  "label": "Зона",
  "options": ["A", "B", "C"],
  "defaultValue": "A"
}
```

### constant — фиксированное значение

```json
{ "id": "rate", "type": "constant", "value": 120 }
```

### formula — формула (math.js)

```json
{
  "id": "totalCost",
  "type": "formula",
  "label": "Стоимость",
  "formula": "inputArea * rate",
  "dependencies": ["inputArea", "rate"]
}
```

**Правила формул:**
- Синтаксис: [math.js expressions](https://mathjs.org/docs/expressions/syntax.html)
- Доступны: `+`, `-`, `*`, `/`, `^`, `round(x)`, `roundup(x, digits)`, `rounddown(x, digits)`, `min(a,b)`, `max(a,b)`, `sum(...)`, `ceil(x)`, `floor(x)`, `abs(x)`, `sqrt(x)`
- Тернарные условия: `a > b ? a : b`
- **dependencies обязателен** — массив ID блоков, от которых зависит формула

### data_table — таблица данных

```json
{
  "id": "tariffs",
  "type": "data_table",
  "name": "Тарифы",
  "rows": [
    ["Зона", "Тариф", "Скидка"],
    ["A", 100, 0.1],
    ["B", 80, 0.15],
    ["C", 60, 0.2]
  ]
}
```

Первая строка `rows` — всегда заголовки столбцов. Остальные — данные.

### table_lookup — поиск значения в таблице

```json
{
  "id": "tariffLookup",
  "type": "table_lookup",
  "dataSource": "tariffs",
  "key_col": "Зона",
  "target_col": "Тариф",
  "selected_key": "A"
}
```

`selected_key` может ссылаться на id другого блока (например, `select_from_table`).

### table_range — поиск по диапазону

```json
{
  "id": "rangeResult",
  "type": "table_range",
  "dataSource": "rangeTable",
  "inputId": "inputDistance",
  "minColumn": "min",
  "maxColumn": "max",
  "valueColumn": "coefficient",
  "fallbackValue": 0
}
```

Находит строку, где `min ≤ inputDistance ≤ max`, и возвращает значение из `valueColumn`.

### select_from_table — выпадающий список из столбца таблицы

```json
{
  "id": "zoneSelect",
  "type": "select_from_table",
  "label": "Выберите зону",
  "dataSource": "tariffs",
  "column": "Зона",
  "defaultValue": "A"
}
```

### select_from_object — выпадающий список из объекта

```json
{
  "id": "optionSelect",
  "type": "select_from_object",
  "label": "Опция",
  "objectSource": "constantsBlock"
}
```

### condition — условная логика

```json
{
  "id": "condResult",
  "type": "condition",
  "if_exp": "inputArea > 100",
  "then_id": "formulaBig",
  "else_id": "formulaSmall"
}
```

### output — форматированный вывод

```json
{
  "id": "outputTotal",
  "type": "output",
  "sourceId": "totalCost",
  "format": "{value} руб."
}
```

### text — текстовый блок

```json
{
  "id": "intro",
  "type": "text",
  "content": "<p>Расчёт выполнен по <strong>СП 42.13330</strong></p>",
  "style": "p"
}
```

`style`: `p`, `h1`, `h2`, `h3`. HTML санитизируется.

### image — изображение

```json
{ "id": "logo", "type": "image", "url": "https://example.com/img.png", "alt": "Логотип" }
```

### chart — график

```json
{
  "id": "priceChart",
  "type": "chart",
  "chartType": "bar",
  "dataSource": "tariffs",
  "xKey": "Зона",
  "yKey": "Тариф",
  "label": "Тарифы по зонам"
}
```

`chartType`: `line`, `bar`, `pie`, `area`. `dataSource` — id блока `data_table`.

### group — группа блоков

```json
{ "id": "group1", "type": "group", "title": "Исходные данные", "children": ["inputArea", "inputRooms"] }
```

### button — кнопка

```json
{ "id": "calcBtn", "type": "button", "label": "Рассчитать", "action": "calculate" }
```

### table_viewer — просмотр таблицы

```json
{
  "id": "viewer1",
  "type": "table_viewer",
  "label": "Просмотр",
  "dataSource": "tariffs",
  "selectedColumn": "Тариф",
  "selectedRow": 1,
  "outputType": "cell"
}
```

---

## Отчёт (reportHtml)

### Токены подстановки

В HTML отчёта используются токены, которые автоматически заменяются значениями:

| Токен | Что подставляется | Пример |
|-------|-------------------|--------|
| `@id` | Значение блока | `@totalCost` → `5000` |
| `@id.stepsCalculations` | Колонка формулы: выражение с подставленными числами (без round/floor/ceil) | `@totalCost.stepsCalculations` → `50 * 100` |
| `@id:exprOnly` | То же, что `.stepsCalculations`; использовать только в колонке формулы | `@totalCost:exprOnly` → `50 * 100` |
| `@id:expr` | Формула = результат | `@totalCost:expr` → `50 * 100 = 5000` |

### Правило для таблиц отчёта

Для каждой формулы в таблице отчёта — **две ячейки**:
1. Ячейка формулы: `@id.stepsCalculations` или `@id:exprOnly` (показывает выражение с числами)
2. Ячейка значения: `@id` (показывает только результат)

Важно:
- `@id.stepsCalculations` и `@id:exprOnly` не использовать в колонке значения.
- В колонке значения всегда ставить `@id`.
- Если формула содержит `max`, `min`, `ceil`, `floor`, `round`, `roundup`, `rounddown` и т.п., в режиме значений всё равно должен показываться только итог, без текста функции.

```html
<table>
  <tr><th>Показатель</th><th>Формула</th><th>Значение</th></tr>
  <tr>
    <td>Стоимость</td>
    <td>= @totalCost.stepsCalculations</td>
    <td>@totalCost</td>
  </tr>
</table>
```

Результат на странице:
| Показатель | Формула | Значение |
|------------|---------|----------|
| Стоимость | = 50 * 100 | 5000 |

Если внутри формулы есть функции:

```html
<tr>
  <td>Норматив</td>
  <td>= @norm.stepsCalculations</td>
  <td>@norm</td>
</tr>
```

Тогда AI не должен ожидать вывод вроде `max(10, 20)` в колонке значения. В значении нужен только итог, например `20`.

### Пример полного reportHtml

```html
<h3>Расчёт стоимости ремонта</h3>
<table>
  <tr><th>Параметр</th><th>Значение</th></tr>
  <tr><td>Площадь</td><td>@inputArea м²</td></tr>
  <tr><td>Тариф</td><td>@rate руб./м²</td></tr>
</table>
<h4>Расчёт</h4>
<table>
  <tr><th>Показатель</th><th>Обозначение</th><th>Формула</th><th>Значение</th></tr>
  <tr><td>Стоимость работ</td><td>S</td><td>= @totalCost.stepsCalculations</td><td>@totalCost</td></tr>
  <tr><td>НДС 20%</td><td>НДС</td><td>= @vat.stepsCalculations</td><td>@vat</td></tr>
  <tr><td><strong>Итого</strong></td><td></td><td>= @total.stepsCalculations</td><td><strong>@total</strong></td></tr>
</table>
```

---

## Общие правила

1. **Уникальные ID** — каждый блок имеет уникальный `id` (латиница, цифры, `_`, `-`)
2. **dependencies обязателен** для формул — массив ID блоков, используемых в формуле
3. **Нет хардкодов** — все параметры через блоки, не встраивать числа в формулы напрямую
4. **Таблицы в матрице** — первая строка `rows` — заголовки, остальные — данные
5. **Формулы через math.js** — стандартный синтаксис, без JS-конструкций
6. **На выходе — только JSON** (или markdown с блоком кода), без пояснений

---

## Полный пример: калькулятор стоимости ремонта

```json
{
  "blocks": [
    {
      "id": "inputArea",
      "type": "input",
      "label": "Площадь помещения",
      "inputType": "number",
      "defaultValue": 50,
      "unit": "м²",
      "min": 1,
      "max": 10000
    },
    {
      "id": "inputType",
      "type": "input",
      "label": "Тип ремонта",
      "inputType": "select",
      "options": ["Косметический", "Капитальный", "Дизайнерский"],
      "defaultValue": "Косметический"
    },
    {
      "id": "priceTable",
      "type": "data_table",
      "name": "Цены по типу ремонта",
      "rows": [
        ["Тип", "Цена за м²"],
        ["Косметический", 3500],
        ["Капитальный", 7000],
        ["Дизайнерский", 15000]
      ]
    },
    {
      "id": "priceLookup",
      "type": "table_lookup",
      "dataSource": "priceTable",
      "key_col": "Тип",
      "target_col": "Цена за м²",
      "selected_key": "inputType"
    },
    {
      "id": "baseCost",
      "type": "formula",
      "label": "Базовая стоимость",
      "formula": "inputArea * priceLookup",
      "dependencies": ["inputArea", "priceLookup"]
    },
    {
      "id": "vat",
      "type": "formula",
      "label": "НДС 20%",
      "formula": "round(baseCost * 0.2)",
      "dependencies": ["baseCost"]
    },
    {
      "id": "totalCost",
      "type": "formula",
      "label": "Итого с НДС",
      "formula": "baseCost + vat",
      "dependencies": ["baseCost", "vat"]
    }
  ],
  "reportHtml": "<h3>Расчёт стоимости ремонта</h3>\n<table>\n  <tr><th>Параметр</th><th>Значение</th></tr>\n  <tr><td>Площадь</td><td>@inputArea м²</td></tr>\n  <tr><td>Тип ремонта</td><td>@inputType</td></tr>\n  <tr><td>Цена за м²</td><td>@priceLookup руб.</td></tr>\n</table>\n<h4>Расчёт</h4>\n<table>\n  <tr><th>Показатель</th><th>Формула</th><th>Значение</th></tr>\n  <tr><td>Базовая стоимость</td><td>= @baseCost.stepsCalculations</td><td>@baseCost руб.</td></tr>\n  <tr><td>НДС 20%</td><td>= @vat.stepsCalculations</td><td>@vat руб.</td></tr>\n  <tr><td><strong>Итого с НДС</strong></td><td>= @totalCost.stepsCalculations</td><td><strong>@totalCost руб.</strong></td></tr>\n</table>"
}
```

---

## Типичные связки блоков

### Выбор из таблицы → формула

```
data_table → select_from_table (выбор строки) → table_lookup (получить значение) → formula
```

### Диапазонный поиск

```
data_table (с колонками min/max/value) → table_range (inputId = id блока ввода) → formula
```

### Условная логика

```
input → condition (if_exp: "input > 100") → then_id / else_id (формулы) → output
```
