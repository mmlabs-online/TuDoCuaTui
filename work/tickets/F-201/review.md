## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit`, no errors.
- format:check: "All matched files use the correct format." (79 files).
- test: 17 files, 287 tests passed.
- test:coverage: 287 passed, thresholds met. All files 100% stmts / 99.24% branch / 100% funcs / 100% lines. `validate.ts` and `dirty.ts` are at 100% (listed in `vitest.config.ts:28-29,40-41`). The only uncovered branches are in `map.ts` (139, 227-228); these lines were not changed by this ticket.
- build: `vite build` OK (233 kB JS / 74 kB gzip).
- The results match the impl-log (Attempt 1).

### Acceptance criteria
- [x] No double submits. Evidence: ref guard at `src/App.tsx:60-63`, reset in `finally` at `:72`. The button has `disabled={saving}` and the label switches to "Đang lưu…" (`src/features/items/Editor.tsx:313-314`). Test `App.test.tsx:161` "double-clicking save adds one item and shows "Đang lưu…"" passes: 17 cards, button disabled and labelled "Đang lưu…" until the toast.
- [x] Error toasts use `useWardrobe.message()`. Evidence: every editor-path `catch` in `App.tsx` calls `notify(wardrobe.message(e))` (`:70, :178, :194, :207`). Test `App.test.tsx:174` "a failed save shows the repo error as a toast" passes. The deviation (throwing from `crypto.randomUUID` instead of `Storage.prototype.setItem`) is acceptable: the local repo swallows storage errors, and the throw still goes through `App.save`'s `try/catch`. `restoreMocks: true` (`vitest.config.ts:20`) cleans up the spy.
- [x] Closing with unsaved changes asks for confirmation on all four close paths. Evidence: `requestClose` (`Editor.tsx:56`) is wired to Modal Escape/backdrop (`:67`), the X button (`:73`) and "Huỷ" (`:312`). The discard `Confirm` is at `:319`. Tests: `App.test.tsx:188` has one `it` per path (X, Huỷ, Escape, backdrop mouseDown), plus `:214` (no prompt when nothing changed, all 4 paths) and `:224` (wear +1 alone is not dirty). Unit tests are in `dirty.test.ts` (same values, each of the 14 fields, wear/id/createdAt/photoPath ignored, array order).
- [x] A negative price cannot be submitted. Evidence: `priceError` (`validate.ts:26-30`) and the `handleSave` gate (`Editor.tsx:49-55`). `min={0}` is at `:220`. Unit test `validate.test.ts` "−1 → priceNegative, 0 ok". Test `App.test.tsx:234` passes: −1 gives the inline "Giá không được âm" and no save; 0 saves.
- [x] (scope) Inline name and date validation. Evidence: `validate.test.ts` covers 120/121 code points with "ệ", trimming, empty/whitespace, today/tomorrow, the UTC+7 timestamp and garbage input. `App.test.tsx:247` checks the 121-char name and the future date. The future-date deviation (today+2) is acceptable because it avoids a flake at the UTC+7 day boundary.
- [x] (scope) Escape on a stacked dialog closes only that dialog. Evidence: the module-level stack is in `Modal.tsx:4,15-25`. `App.test.tsx:259` tests the delete confirm, and the Escape branch of the guard test tests the discard dialog.
- [x] Checks green: see above.

### Points checked on request
- **Existing tests**: `git diff origin/main...HEAD -- src/App.test.tsx` shows one change to an existing test, the planned rename at `:136` from validation toast to inline error (`findByRole("alert")`). It keeps the heading assertion. Everything else in the file is additions.
- **Editor.tsx**: `git diff -w` gives +52/−9 (the raw diff is ±509 because the fragment wrapper re-indented the file). Every non-whitespace hunk is in plan step 7:
  - imports
  - `saving` prop
  - `initial` snapshot, `showErrors`, `discardOpen`, `today`, `errors`, `msg`, `handleSave`, `requestClose`
  - the fragment
  - `requestClose` on the Modal, X and Huỷ
  - `error`/`aria-invalid` on the name, price and date fields
  - `min={0}` and `inputMode` on price, `max={today}` on date
  - save button disabled state and label
  - the discard `Confirm`

  Nothing else changed.
- **map.ts**: `cell()` already trims and NFC-normalises (`map.ts:148-151`), so `nameError`'s extra trim is a no-op. Required and too-long behaviour and the messages are unchanged. `map.test.ts` was not modified and passes.
- **R9 (code reading)**: `.field` is a flex column (`index.css:636-641`), so the `<small>` error sits under the input in both the 1fr and wide columns at 390px. `--danger` is defined for light (`index.css:13`) and `.dark` (`:25`). The discard dialog reuses `Confirm`/`.confirm-content`, so it is the same layout as the existing delete dialog. The disabled button uses the global `button:disabled` style (`index.css:42`). A visual check at 390px and in dark mode is listed for Ming below.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no data access was added; saves still go through `useWardrobe`.
- R5: wear fields are excluded from `isDirty`.
- R6: new copy is only in `src/features/items/copy.ts`.
- R7: every changed file is in the plan; the `ticket.md` changes are workflow state only.
- R8: unit tests and coverage thresholds exist for both new modules.
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.
- R2, R3 and R4 are not affected.

### Ming verification after merge (from plan)
- Supabase mode with Slow 3G throttling: double-click "Lưu món đồ" → one item, and the button shows "Đang lưu…".
- At 390px and in dark mode: the inline error text is readable and the discard dialog fits. On a phone, the date picker does not offer future dates.

### Nits (do not block)
- `App.test.tsx:161`: after the first click React re-renders the button as `disabled`, so the second `fireEvent.click` never reaches `onClick`. The test proves the disabled state but not the `savingRef` guard itself; the guard was verified by code reading.
- The discard dialog keeps the default trash icon and `danger-fill` button (`Editor.tsx:319-327`). That is acceptable, but a neutral icon would fit "Bỏ thay đổi?" better.
- `Modal`'s keydown listener is re-registered on every Editor render because `requestClose` is not memoised. This is harmless, but `useCallback` would avoid the churn.

### Follow-ups (out of scope)
- Move `toDateOnly` to `src/lib/` (`Editor.tsx` and `validate.ts` import it from `import-export/csv`).
- The local repo swallows storage failures, so local mode never shows a save-error toast.
- Consider disabling the close paths (or the discard confirm) while a save is in flight.
