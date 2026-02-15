# GitHub Copilot Instructions — Igor Page Calc

## Project Overview
**Igor Page Calc** is a visual calculator builder (SPA) for engineering calculations. Users create calculators from composable blocks (inputs, formulas, tables, charts), submit for review, and publish publicly.

**Tech Stack:** React 18 + Vite + Zustand (state) + math.js (formulas) + TypeScript + PicoCSS

---

## Architecture & Critical Knowledge

### Block-Based Everything
All calculator elements are **immutable Block objects** with a `type` property. Every feature request should decompose into block types.

**Key block types** (`src/types/blocks.ts`):
- `input`: User values (number/text/select)
- `constant`: Static values
- `formula`: math.js expressions with `dependencies` array (reactive)
- `table_lookup`: Row lookup by key, returns column value
- `select_from_table`: Dropdown populated from table column
- `condition`: if/then/else logic (boolean evaluation)
- `data_table`: Raw data with columns/rows
- `chart`: Visualization (bar/line/pie/area)
- `group`: Container for nested blocks
- `output`: Display block with format template

**Why this matters:** Don't add new fields to blocks without checking type definitions. When modifying block handling, ensure all block types are covered in switch/if statements.

### Data Flow: Single Source of Truth
```
User Input → useCalcStore.updateValue(id, value)
         ↓
Store calls recalculateValues(blocks, inputs)
         ↓
Engine re-evaluates ALL formulas (respects dependencies)
         ↓
Store updates values → React re-renders
```

**Critical:** Never bypass the engine. All calculations go through `recalculateValues()` in `src/lib/engine.ts`.

### State Management (Zustand)
`src/lib/store.ts` is the single source:
- `blocks[]`: Schema (immutable, user edits)
- `values{}`: Runtime values keyed by block ID
- Actions: `setBlocks()`, `updateValue(id, value)`, `setValues()`

**Pattern:** Never mutate blocks directly. Map and reconstruct:
```typescript
const updated = blocks.map(b => b.id === selectedId ? {...b, label: newLabel} : b);
setBlocks(updated);
```

### Calculation Engine (`src/lib/engine.ts`)
**Process:** INPUT → CONSTANT → TABLE_LOOKUP → CONDITION → FORMULA (iterative, max 10 cycles) → OUTPUT

**Key:** Formula evaluation is **iterative with cycle detection**. Formulas reference other block IDs by variable name in `scope`:
```typescript
const scope = {...values}; // {a: 10, b: 20, ...}
const result = evaluate("a * b + 100", scope);
```

**Dependencies matter:** If a formula doesn't declare dependencies, it won't recompute when referenced blocks change. Always check `dependencies` array.

---

## Editor UI Architecture

### Three-Panel Layout (`src/components/editor/`)
1. **BlueprintPanel.tsx** — Block canvas/tree. Click to select, drag to reorder
2. **PropertyEditor.tsx** — Edit selected block's properties (label, formula, table data)
3. **ReportPanel.tsx** — Live preview + AI assistant panel

### Component Patterns
- Use `useCalcStore()` hooks to access blocks and values
- Render block properties conditionally by `block.type` (not polymorphic)
- For input render: check `inputType` ('number' uses `<input type="number">`, 'select' uses `<select>`)
- Update blocks via `handleChange(key, value)` which calls `setBlocks()`

### Styling
- **PicoCSS** (classless CSS framework) — rely on semantic HTML tags
- **Dark theme default** — toggle via localStorage `"themeMode"` (0=light, 1=dark)
- Fixed header/footer with theme button
- Use inline styles for layout; reserve CSS for component-specific styling

---

## Critical Workflows

### Adding a New Block Type
1. Add interface to `src/types/blocks.ts` (extend `BaseBlock`)
2. Add literal type to `BlockType` union
3. Add case in `recalculateValues()` (if it computes values)
4. Add conditional render in PropertyEditor for its properties
5. Add render in BlueprintPanel

### Adding a New Calculation Feature
1. Define block type + structure in `types/blocks.ts`
2. Implement logic in `engine.ts` `recalculateValues()` — maintain phase order (INPUT → CONSTANT → TABLE_LOOKUP → CONDITION → FORMULA → OUTPUT)
3. Test with `recalculateValues(testBlocks, testInputs)` to verify
4. Add PropertyEditor fields for configuration

### UI Responsiveness
- Always call `recalculateValues()` after user input via `updateValue()`
- Pass `values` object to renderers to display computed results
- Show formula errors as `values[id] === 'Ошибка формулы'` check

---

## Developer Conventions

### Naming
- **IDs & variables:** camelCase (e.g., `inputArea`, `formulaSum`)
- **Components:** PascalCase
- **Constants:** UPPER_SNAKE_CASE
- **CSS classes:** kebab-case

### Code Style
- TypeScript strict mode enabled — use proper types
- Functions: JSDoc comments for public functions
- Imports: Use path aliases (`@/lib`, `@components`, `@types`)
- Error handling: Try-catch in formula evaluation; log with prefixes (`✅`, `❌`, `⚠️`)

### Communication & Documentation
- **All communication, code comments, and documentation must be in Russian**
- Use Russian for variable names in context-specific areas (UI labels, data fields)
- Error messages and console logs use Russian
- Commit messages, PR descriptions, and issue discussions in Russian

### Testing Checklist
- [ ] All block types render correctly
- [ ] Formulas evaluate with correct dependencies
- [ ] Values update reactively when inputs change
- [ ] localStorage persists blocks/values between sessions
- [ ] Dark/light theme toggle works

---

## Build & Deployment

**Dev:** `npm run dev` (Vite dev server, typically http://localhost:5173)
**Build:** `npm run build` (outputs dist/)
**Deploy:** Auto-deploy to Cloudflare Pages on push to main

---

## Configuration Files

### vite.config.ts
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 5173,
    host: 'localhost',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

### Required Dependencies
Ensure `@vitejs/plugin-react` is installed for Vite React support:
```bash
npm install --save-dev @vitejs/plugin-react
```

---

## Key Files Reference
| File | Purpose |
|------|---------|
| `src/types/blocks.ts` | Block interface definitions — start here for schema changes |
| `src/lib/engine.ts` | `recalculateValues()` — all calculation logic |
| `src/lib/store.ts` | Zustand state; blocks + values |
| `src/components/editor/PropertyEditor.tsx` | Block property editing UI |
| `src/components/editor/BlueprintPanel.tsx` | Block canvas/tree view |
| `tsconfig.json` | Path aliases (`@/lib`, `@components`, etc.) |

---

## Common Pitfalls
❌ **Directly mutating blocks array** → Use `.map()` to reconstruct  
❌ **Bypassing engine for calculations** → All math through `recalculateValues()`  
❌ **Missing formula dependencies** → FormulaBlock won't recompute if deps incomplete  
❌ **Forgetting block.type checks** → Different blocks need different property editors  
❌ **Hardcoding UI strings** → Use block labels, data from schema

---

## 🔒 SECURITY REQUIREMENTS (CRITICAL)

### XSS Protection
- **NEVER use `innerHTML` or `dangerouslySetInnerHTML` without sanitization**
- Always escape user data before rendering
- Use functions from `src/lib/security.ts`: `escapeHtml()`, `sanitizeHtml()`, `sanitizeText()`
- When creating DOM elements, use `createElement` and `textContent`, not `innerHTML`

### URL Validation
- **ALL URLs must be validated before use**
- Use `isValidUrl()` and `sanitizeUrl()` from `src/lib/security.ts`
- Allow only safe protocols: `http:`, `https:`, `data:` (images only)
- **BLOCK:** `javascript:`, `vbscript:`, `data:text/html` and other dangerous protocols

### Protection Against Hidden Database/API Calls
- **CRITICAL:** When processing text data (read/write, JSON parsing, formula processing), **NEVER execute hidden calls to databases or external APIs**
- All data operations must be explicit and transparent
- Do not use `eval()`, `Function()`, `import()`, `require()` in user data
- All formulas must be validated via `isValidFormula()` before execution

**Forbidden patterns:**
```typescript
// ❌ WRONG - hidden DB call in text processing
function processText(text: string) {
  const result = db.query(text); // NEVER do this!
  return result;
}

// ❌ WRONG - eval in user data
const result = eval(userInput); // DANGEROUS!

// ✅ CORRECT - explicit validation and safe execution
const validation = isValidFormula(userInput);
if (!validation.valid) throw new Error(validation.error);
const result = evaluate(formula, safeScope); // math.js with safe scope
```

### Input Validation
- **ALL user data must be validated before use**
- Use `validateBlocks()` for block schemas
- Use `validateImportedBlocks()` for imported JSON
- Check types, required fields, dependencies

### Formula Security
- All formulas are checked for dangerous patterns:
  - `eval()`, `import()`, `require()`, `Function()`
  - Access to `constructor`, `__proto__`, `prototype`
- Use only `math.js` `evaluate()` with safe scope
- Never pass user data directly to `evaluate()` without validation

### Save/Load Protection
- All data is validated before saving to localStorage
- All data is validated when loading from localStorage
- On validation error — do not load data, show error

### Security Utilities Available

**src/lib/security.ts:**
- `sanitizeHtml()` — HTML sanitization
- `escapeHtml()` — HTML escaping
- `sanitizeText()` — safe text with line breaks
- `isValidUrl()` — URL validation
- `sanitizeUrl()` — URL sanitization
- `isValidFormula()` — formula validation
- `containsDangerousCode()` — dangerous code detection
- `isValidBlockId()` — block ID validation

**src/lib/validation.ts:**
- `validateBlocks()` — full block validation
- `validateImportedBlocks()` — import validation
- Dependency checking
- Circular dependency detection

### Security Checklist
- [ ] All user data is validated
- [ ] All URLs are checked for safety
- [ ] All HTML content is sanitized
- [ ] All formulas are validated before execution
- [ ] No hidden DB/API calls in text operations
- [ ] No use of `eval()`, `innerHTML` without sanitization
- [ ] All JSON imports are validated
- [ ] Validation errors are logged

**See `SECURITY.md` and `COPILOT_RULES.md` for detailed security guidelines.**  

---

## AI-Specific Notes
When generating block schemas (JSON):
- Always use unique, descriptive IDs (e.g., "inputArea", "formulaCost")
- Ensure formula dependencies reference actual block IDs
- For table blocks: provide `rows` as array of objects with column keys
- For select blocks: either `options` array or `dataSource` (reference to table ID)
- For charts: `dataSource` points to table ID; `xKey`/`yKey` are column names

**Example schema structure:**
```json
[
  {"id": "areaInput", "type": "input", "label": "Area", "inputType": "number", "defaultValue": 50},
  {"id": "costPerSqm", "type": "constant", "value": 100},
  {"id": "totalCost", "type": "formula", "formula": "areaInput * costPerSqm", "dependencies": ["areaInput", "costPerSqm"]}
]
```
