## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| `src/components/focusTrap.ts` (new) | Pure `tabbables` / `nextTrapFocus` (plan). |
| `src/components/focusTrap.test.ts` (new) | Unit tests for both (R8). |
| `src/components/Modal.tsx` | Dialog semantics, initial focus, Tab trap (topmost only), focus restore, heading wiring. |
| `src/components/Modal.test.tsx` (new) | Regression and behaviour tests. |
| `src/components/FilterSelect.tsx` | `aria-label={label}` on the select. |
| `src/features/items/FilterBar.test.tsx` | "each filter select has an aria-label". |
| `src/features/items/Editor.tsx` | Line 343: `autoFocus` -> `data-autofocus={isNew || undefined}`. |
| `src/features/items/Editor.focus.test.tsx` (new) | New-item and existing-item focus tests. |

### Tests added / changed
- Written first and run against the unchanged source (12 failed, 3 passed):
  - Failed on `main`: 9 of 11 `Modal.test.tsx` tests (aria-modal dialog/traps focus, existing heading id, data-autofocus, dialog focus when nothing marked, Shift+Tab, Tab from outside, stacked traps, restore to opener, stacked returns focus); `FilterBar.test.tsx` › "each filter select has an aria-label" (no combobox with that name, so the select has no computed name at all); both `Editor.focus.test.tsx` tests (no `role="dialog"`).
  - Passed on `main` (trivially): "keeps focus that a child already moved inside", "does not throw or move focus when the opener is gone", and the existing FilterBar test.
- **Editor focus half on `main`**: a throwaway test (not kept) rendering `Editor` with `blankItem()`, `isNew`, asserting `document.activeElement` is "Tên món đồ", PASSED on `main` (React `autoFocus` works in jsdom). So the UAT-7 symptom is not reproducible in jsdom, as the plan expected; only the dialog query fails there.
- `src/components/focusTrap.test.ts` (5 tests), `Modal.test.tsx` (10), `Editor.focus.test.tsx` (2), `FilterBar.test.tsx` (+1): all pass after the fix.
- Changed: `src/features/outfits/OutfitsModal.test.tsx` `baseTimers()` (see Out-of-plan files).

### Checks (actual output summary)
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- format:check: pass.
- test: 6 failed, 2015 passed, 288 skipped. All 6 are the known pre-existing Windows failures on `main`: `server/ai/tagPhoto.test.ts` (2), `server/api.test.ts` (1), `server/index.cli.test.ts` (1), `server/scoping.test.ts` (1), `src/features/auth/boundary.test.ts` (1). Not fixed. (An earlier full run also showed a tagPhoto "in-flight cap" failure that did not repeat: flaky, same file.)
- build: pass (vite build, 128 modules).

### Out-of-plan files
- `src/features/outfits/OutfitsModal.test.tsx` — two existing tests ("weather timer cleared on close", "... after the weather arrives") count fake timers; jsdom's `focus()` (now called by Modal on mount) leaves one timer behind that outlives unmount, so they failed (expected 3 to be 2). Verified by a bare jsdom test: `div.focus()` under `vi.useFakeTimers()` adds a timer. Fix in the test helper `baseTimers()` only: spend that timer with a priming render + `vi.clearAllTimers()` before measuring, and clear after. Assertions unchanged. Not a product bug.

### Playwright check
Not run. `AuthGate` / `identityClient` call `/auth/login`, `/auth/token`, `/auth/accounts` and Turnstile; getting past sign-in needs real credentials or a deep stub of the Identity flow plus the dev token proxy (`scripts/with-secrets.sh`, which I was told not to run). All six steps move to Ming verification (below), along with the plan's "Ming verification after merge" items.

### Ming verification
1. Click "Thêm món đồ", type `Áo test`: it lands in "Tên món đồ" (UAT-7).
2. Tab / Shift+Tab 40 times with the editor open: focus stays in the dialog and never lands on the hidden file inputs.
3. Escape: focus returns to "Thêm món đồ".
4. Open an item, "Xoá", Tab inside the Confirm, Escape: focus returns to the Editor's delete button.
5. "Hôm nay mặc gì?", Import, Export, AI settings: each is a named dialog (`aria-modal=true`).
6. 390px, light and dark, editor opened by keyboard: no focus ring around the whole modal; the name input shows its normal focus style.
7. Screen reader on a real device and phone behaviour as in plan "Ming verification after merge".

### Follow-ups (noticed, not done)
1. Confirm as `alertdialog` with `aria-describedby` and initial focus on cancel.
2. Body scroll lock while a modal is open (plus `overscroll-behavior: contain`).
3. Backdrop close only when mousedown and mouseup are both on the backdrop.
4. Focus fallback when the opener has been removed (e.g. after a delete).
5. Duplicate: move focus to the name field when the Editor turns into a new item.
6. Check and label the selects at `OutfitsModal.tsx:188` and `ImportPhotosTab.tsx:119`.
7. The window Escape listener can fire during IME composition or with an open `<select>`.
8. Optional `inert` on the app root while a modal is open.

### Scope self-check
- Could the diff be smaller? No for source (about 60 lines); tests are most of the diff.
- Diff size: +399 / -9 lines (9 files, incl. tests and the one out-of-plan test helper edit).
- Implementation note: initial focus runs in a `useLayoutEffect` (after child `autoFocus`, before paint); focus restore runs in the passive-effect cleanup.
