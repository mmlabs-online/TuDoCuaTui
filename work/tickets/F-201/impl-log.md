## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/features/items/validate.ts` (new) | Shared validation rules (plan step 1) |
| `src/features/items/validate.test.ts` (new) | R8 unit tests |
| `src/features/items/dirty.ts` (new) | Pure dirty check for the unsaved-changes guard |
| `src/features/items/dirty.test.ts` (new) | R8 unit tests |
| `src/features/items/copy.ts` (new) | R6: new editor copy in one place |
| `src/features/items/Editor.tsx` | Saving state, inline errors, close guard, discard dialog (wrapped in a fragment, so the formatter re-indented the whole JSX; the diff is large but mostly whitespace) |
| `src/components/Modal.tsx` | Only the topmost modal handles Escape |
| `src/components/Confirm.tsx` | Optional copy props, defaults = old delete copy |
| `src/components/Field.tsx` | Optional inline `error` |
| `src/App.tsx` | `savingRef` double-submit guard, name toast removed, `saving` prop |
| `src/App.test.tsx` | `F-201 editor` tests; one planned change to the existing test |
| `src/features/import-export/csv/map.ts` | Uses shared `NAME_MAX`/`nameError` |
| `vitest.config.ts` | Coverage include/thresholds for validate.ts and dirty.ts |

### Tests added / changed
- validate.test.ts and dirty.test.ts: all cases in the plan table.
- App.test.tsx: `F-201 editor` describe: double-click save, failed save toast, unsaved-changes guard (X, Huỷ, Escape, backdrop), closes without asking, wear +1 not dirty, negative price, name/future-date errors, Escape on delete confirm.
- CHANGED (planned, only change to existing tests): `saving a new item without a name shows a validation toast` renamed to `... shows an inline error`; asserts the inline alert text instead of the toast. Heading assertion kept.

### Deviations
- "a failed save shows the repo error as a toast": the plan's `Storage.prototype.setItem` throw does not fail a save, because the local repo swallows storage errors (`persist` catches; covered by `repo.local.test.ts`). The test instead makes `crypto.randomUUID` throw `Error("Hết dung lượng")`, which `App.save` calls inside its `try` for a new item. This still verifies catch → `notify(wardrobe.message(e))`, editor stays open, button back to "Lưu món đồ".
- Future-date test uses today + 2 days (UTC date) to avoid a day-boundary flake near UTC+7 midnight.

### Checks (actual output summary)
- typecheck: `tsc --noEmit` no errors
- format:check: "All matched files use the correct format."
- test: 17 files, 287 tests passed
- test:coverage: passed, thresholds met (All files 100% stmts / 99.24% branch)
- build: built OK (vite)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Move `toDateOnly` to `src/lib/` (Editor and validate.ts import it from import-export/csv).
- The local repo hides storage failures from the UI (no error toast in local mode).

### Scope self-check
- Could the diff be smaller? No (Editor diff size is re-indentation from the fragment wrapper).
- Diff size: +463 / -251 tracked lines plus new files.
