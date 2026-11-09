## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/App.test.tsx` (new, commit ce6deec) | Characterisation tests, written and green against the unchanged `App.tsx` before the extraction |
| `src/features/items/useItemFilters.ts` (new) | Filter/sort state hook (moved bodies + `setFilter`, `hasActiveFilters`) |
| `src/features/items/blankItem.ts` (new) | Moved `blankItem` |
| `src/features/items/ItemCard.tsx` (new) | Moved `ItemCard` |
| `src/features/items/ItemGrid.tsx` (new) | Loading/grid/empty/no-results block |
| `src/features/items/Editor.tsx` (new) | Moved `Editor` |
| `src/features/items/FilterBar.tsx` (new) | Toolbar + category chips (fragment) |
| `src/features/items/StatsRow.tsx` (new) | `.stats-grid` section |
| `src/features/layout/Header.tsx` (new) | `<header className="topbar">` |
| `src/features/layout/Hero.tsx` (new) | `<section className="intro">` |
| `src/App.tsx` | Moved code removed, new components rendered |

### Tests added / changed
- `src/App.test.tsx` (10 tests, as listed in plan). Passed on pre-refactor `App.tsx` (219 tests total) and unchanged after (`git diff ce6deec -- src/App.test.tsx` empty).

### Checks (actual output summary)
- typecheck: tsc --noEmit, exit 0
- format:check: "All matched files use the correct format."
- test: 12 files, 219 tests passed (before and after the extraction)
- test:coverage: 12 files, 219 tests passed, thresholds met
- build: built OK
- `App.tsx` line count: 991 -> 458 (AC 6 <= 480)
- grep `lib/supabase` in items/layout: empty; grep for inline stats-grid/toolbar/categories/item-grid/topbar/intro in App.tsx: empty

### Out-of-plan files
None.

### Deviations
- Did not run the `--color-moved` diff self-check or a screenshot compare; moves were done by line-range extraction with sed plus only the planned prop substitutions. `onClick={() => onImport()}` forms were simplified to `onClick={onImport}` (same behaviour, handlers ignore args).

### Follow-ups (noticed, not done)
- Coverage `include` for `src/features/items/**` and `src/constants/**`.
- `ItemCard` could import `ageInDays` instead of the `age` prop.
- `sortItems` should use `sortOptions` (F-004.1 follow-up, still open).

### Scope self-check
- Could the diff be smaller? No (moves plus wiring).
- Diff size: App.tsx -533 / +~0 net; new files hold the moved code.
