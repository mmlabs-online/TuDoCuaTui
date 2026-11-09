# Implementation log — F-601.3

## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/data/importRunner.ts` (new) | Sequential loop that continues after a failure, stops before the next row on abort (plan step 1) |
| `src/data/importRunner.test.ts` (new) | R8, plan test table |
| `src/data/useWardrobe.ts` | `importMany(list, { onProgress, signal })` delegates to `runImport`, upserts each saved row, returns `ImportResult[]` with `message()`-mapped errors |
| `src/data/useWardrobe.test.tsx` | Updated the two local `importMany` tests to the new signature and result; replaced "stops at the first failure" with the continue-after-failure test; added per-row state, 200-row and abort tests |
| `src/features/import-export/csv/preview.ts` (new) | `buildCsvPreview` pure logic |
| `src/features/import-export/csv/preview.test.ts` (new) | R8 |
| `src/features/import-export/ImportCsvTab.tsx` | File picker, preview list, counts, ignored columns, parse error, progress bar, summary |
| `src/features/import-export/ImportModal.tsx` | Mock removed; owns phase, `AbortController`, per-tab primary button |
| `src/features/import-export/ImportModal.test.tsx` (new) | Abort on close / Escape, running state, summary |
| `src/features/import-export/ImportPhotosTab.tsx` | Mock progress and props removed; "Sắp có" note |
| `src/features/import-export/ImportJsonTab.tsx` | "Sắp có" note |
| `src/features/import-export/copy.ts` | New CSV copy and `comingSoon`; removed `processingFile`, `parsedCount` |
| `src/App.tsx` | Modal props swapped (`locations`, `importMany`, `onImported`) |
| `src/App.test.tsx` | See characterisation changes below |
| `src/index.css` | `.csv-preview`, `.csv-preview-title`, `.csv-error`, `.import-summary`, `.coming-soon` using existing variables |
| `vitest.config.ts` | `csv/preview.ts` added to coverage include and thresholds |

### Characterisation tests changed (each named by the plan)
- `App.test.tsx › import modal switches tabs and keeps pasted CSV across tabs`: `Nhận 2 món` became `Bỏ qua 2 dòng lỗi` for `a\nb\nc`.
- `App.test.tsx › import mock shows progress, adds 4 items and closes`: removed (mock deleted); replaced by the five new App tests (template import, invalid rows, disabled CSV states, file pick, disabled Photos/JSON tabs).
- `useWardrobe.test.tsx › importMany saves in order with fresh ids and reports progress` and `› importMany works without onProgress` (renamed "without options"): new signature and `ImportResult[]`.
- `useWardrobe.test.tsx › supabase mode › importMany stops at the first failure …`: replaced by `importMany continues after a failed row and keeps the saved rows in state`.

### Tests added / changed
- importRunner.test.ts: all 8 listed tests.
- preview.test.ts: all 10 listed tests (the Excel test compares the BOM+`;` fixture with an equivalent `,` text; both fixture rows are invalid by design, so it asserts equal previews and the two error messages).
- ImportModal.test.tsx: 5 listed tests.
- App.test.tsx: 5 new + 1 updated. useWardrobe.test.tsx: 3 new local + 1 supabase + 2 updated.

### Checks (actual output summary)
- typecheck: clean (`tsc --noEmit`, no errors)
- format:check: All matched files use the correct format
- test: 25 files passed, 385 tests passed
- test:coverage: 25 files, 385 tests passed; thresholds met; All files 99.82% lines; preview.ts 95.65% stmts / 91.66% branches
- build: vite build OK

### Out-of-plan files
None.

### Deviations
- `useWardrobe.test.tsx › importMany adds each saved item to state before the next row starts` is weaker than the plan wording: inside a single `act`, React batches the state updates, so reading `items.length` inside `onProgress` does not show the intermediate state. The test asserts that `onProgress` ran per row and that the final order is right. The ordering guarantee itself (onSaved before the next save) is tested precisely in `importRunner.test.ts`.
- `ImportCsvTab` takes `results` instead of the plan's `summary` prop (the tab derives imported/failed counts from it).
- The "Bỏ qua N dòng lỗi" count is rendered as a `<small className="csv-error">` so it is its own text node.
- Escape test unmounts the modal after checking `onClose` was called, because the parent (App) is what unmounts it.

### Follow-ups (noticed, not done)
- `oxfmt` prints "No config found, using defaults" (pre-existing).
- Row numbers shown can be off when the file has blank lines (plan A3).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see `git show --stat` of the commit.
