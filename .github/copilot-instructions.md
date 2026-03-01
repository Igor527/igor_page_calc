# GitHub Copilot Instructions — Igor Page Calc

## Project Overview

**Igor Page Calc** — visual calculator builder (SPA) for engineering calculations. Users create calculators from composable blocks, submit for review, and publish publicly.

**Stack:** React 18 + Vite + Zustand + math.js + TypeScript + PicoCSS

## Architecture

### Block System

All calculator elements are immutable Block objects with a `type` property. 16 block types defined in `src/types/blocks.ts`:
`input`, `constant`, `formula`, `data_table`, `table_lookup`, `table_range`, `select_from_table`, `select_from_object`, `condition`, `group`, `output`, `image`, `button`, `table_viewer`, `text`, `chart`

### Data Flow

```
User Input → useCalcStore.updateValue(id, value)
  → recalculateValues(blocks, inputs)   // src/lib/engine.ts
  → Engine evaluates ALL formulas (respects dependencies)
  → Store updates values → React re-renders
```

Never bypass the engine. All calculations go through `recalculateValues()`.

### State (Zustand) — `src/lib/store.ts`

- `blocks[]` — schema (immutable)
- `values{}` — runtime values keyed by block ID
- Pattern: `setBlocks(blocks.map(b => b.id === id ? {...b, field: val} : b))`

### Storage — `src/lib/calculatorStorage.ts`

- Each calculator: `calc-{id}` key in localStorage
- List built by scanning all `calc-*` keys directly
- Status flow: `draft` → `review` → `published` / `rejected`
- Slug: custom or auto-sequential (`/1`, `/2`, ...)

### Engine — `src/lib/engine.ts`

Processing order: INPUT/CONSTANT → DATA_TABLE → SELECT_FROM_TABLE → TABLE_LOOKUP/TABLE_RANGE → CONDITION → FORMULA (iterative, max 10 cycles) → OUTPUT

Formula scope includes: all block values + `round`, `roundup`, `rounddown`, `mgnEnlarged`

### Report HTML — `src/lib/reportHtml.ts`

Token replacement in `reportHtml` field:
- `@id` — block value
- `@id.stepsCalculations` / `@id:exprOnly` — formula with substituted numbers (no round)
- `@id:expr` — expression = result

## Key Files

| File | Purpose |
|------|---------|
| `src/types/blocks.ts` | Block type definitions — start here for schema changes |
| `src/lib/engine.ts` | `recalculateValues()` — all calculation logic |
| `src/lib/store.ts` | Zustand state: blocks + values |
| `src/lib/calculatorStorage.ts` | localStorage CRUD for calculators |
| `src/lib/reportHtml.ts` | Token substitution in report HTML |
| `src/lib/validation.ts` | Block validation, dependency/cycle checks |
| `src/lib/security.ts` | XSS, URL, formula safety |
| `src/components/editor/PropertyEditor.tsx` | Block property editing UI |
| `src/components/editor/ReportPanel.tsx` | Report WYSIWYG editor |
| `src/components/editor/NodesList.tsx` | Block list with drag-and-drop |
| `src/app/admin/editor/page.tsx` | Main editor page |
| `src/main.tsx` | Entry point, pathname-based routing |

## Editor Components (`src/components/editor/`)

| Component | Purpose |
|-----------|---------|
| `PropertyEditor.tsx` | Edit selected block properties |
| `ReportPanel.tsx` | WYSIWYG report editor + preview |
| `NodesList.tsx` | Block list with DnD reorder |
| `DataVisualization.tsx` | Data visualization panel |
| `TableVisualEditor.tsx` | Visual table editor |
| `ChartRenderer.tsx` | Chart rendering (bar/line/pie/area) |
| `ValidationErrors.tsx` | Validation error display |
| `DependencyGraph.tsx` | Block dependency graph |

## Routing (`src/main.tsx`)

| Path | Page |
|------|------|
| `/` | WelcomePage |
| `/editor` | EditorPage |
| `/admin/review` | ReviewPanel |
| `/calculators` | CalculatorsListPage |
| `/calculators/:slug` | PublicCalculator |
| `/planner` | PlannerPage (admin only) |

## Security

`src/lib/security.ts`: `sanitizeHtml()`, `escapeHtml()`, `isValidUrl()`, `sanitizeUrl()`, `isValidFormula()`, `containsDangerousCode()`, `isValidBlockId()`

Rules:
- Never use `innerHTML` without sanitization
- All URLs validated before use (block `javascript:`, `vbscript:`)
- All formulas validated (block `eval()`, `import()`, `Function()`)
- All imported JSON validated via `validateImportedBlocks()`

## Conventions

- **Language:** All comments, docs, UI text — Russian
- **Naming:** camelCase (vars/functions), PascalCase (components), UPPER_SNAKE_CASE (constants)
- **Immutability:** Never mutate blocks — use `.map()` + spread
- **Imports:** Use path aliases (`@/lib`, `@/components`, `@/types`)

## Adding a New Block Type

1. Add interface to `src/types/blocks.ts` (extend `BaseBlock`)
2. Add literal to `BlockType` union
3. Add to `Block` union type
4. Add case in `recalculateValues()` in `engine.ts`
5. Add property editor in `PropertyEditor.tsx`
6. Add to validation in `validation.ts`

## Common Pitfalls

- Directly mutating blocks → use `.map()` to reconstruct
- Bypassing engine → all math through `recalculateValues()`
- Missing formula dependencies → block won't recompute
- Forgetting block.type checks → different blocks need different editors

## Build & Deploy

```sh
npm run dev    # Vite dev server
npm run build  # Production build → dist/
npm test       # Vitest unit tests
```

Auto-deploy to Cloudflare Pages on push to main.
