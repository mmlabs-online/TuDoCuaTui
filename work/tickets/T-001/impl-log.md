# Implementation log — T-001

## Attempt 1 — 2026-11-10

### Files touched
| File | Required because |
|---|---|
| src/features/items/Editor.tsx | `showMockAi` prop; AI button wrapped in `{showMockAi && …}` (AC 1, 3) |
| src/features/import-export/ImportPhotosTab.tsx | `showMockAi` prop; AI checkbox conditional (AC 2, 3) |
| src/features/import-export/ImportModal.tsx | prop pass-through (AC 2) |
| src/App.tsx | `showMockAi={wardrobe.mode === "local"}` on Editor and ImportModal (AC 1-4) |
| src/features/items/Editor.test.tsx | `renderEditor` takes `showMockAi` (default true) |
| src/features/import-export/ImportModal.test.tsx | `setup` takes `showMockAi` (default true); imports IMPORT_EXPORT_COPY |
| src/App.test.tsx | local-mode regression test; imports IMPORT_EXPORT_COPY |

### Tests added / changed
- Editor.test.tsx › mock AI › hides / shows "Tự điền từ ảnh"
- ImportModal.test.tsx › mock AI › Photos tab hides / shows the AI checkbox
- App.test.tsx › App import/export (local mode) › shows the mock AI controls in local mode
- Changed helpers: `renderEditor`, `setup` (new optional param, default true).

### Checks (actual output summary)
- typecheck: exit 0
- format:check: "Finished ... 96 files", clean (after `pnpm format`)
- test: 27 files, 396 tests passed
- test:coverage: 27 files, 396 passed; All files 99.82 / 99.09 / 100 / 99.79
- build: built in 583ms

### Out-of-plan files
None.

### Deviations
- The App test sits in the `App import/export (local mode)` describe (it uses `openImport`, defined there), not `App (local mode)` as the plan names.
- `setup` in ImportModal.test.tsx gets `showMockAi` as a second param but the new tests render the modal directly, as the plan says.

### Follow-ups (noticed, not done)
- Remove `showMockAi` and the `.ai-btn` leftovers when F-702/F-703 land.

### Scope self-check
- Could the diff be smaller? No (R1 grep on the three components returns nothing).
- Diff size: +87 / -26 lines (includes indentation changes from wrapping).
