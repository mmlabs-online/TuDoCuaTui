## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| `src/index.css` | In-place: `--green-ink` (root + dark) and 10 text/border swaps, dark chip rule moved, `100vh` + `100dvh` fallbacks (4 places). New section `/* T-024 — mobile layout and readability */` at the end (shared, <= 650, touch). |
| `index.html` | Line 6 `viewport-fit=cover` only. |
| `src/features/items/Editor.tsx`, `copy.ts` | Close aria-label, `editor-footer` / `editor-cancel` / `editor-save` / `editor-duplicate` hooks, `btn-label` span. |
| `src/features/layout/Header.tsx`, `copy.ts` | Add button `aria-label`; label text now from copy. |
| `src/features/import-export/ImportModal.tsx`, `ExportModal.tsx`, `copy.ts` | Close aria-labels. |
| `src/features/items/StatsRow.tsx` | No-break space before "₫". |
| `src/features/items/Editor.test.tsx`, `import-export/ImportModal.test.tsx` | New tests. |
| `src/features/import-export/ExportModal.test.tsx`, `layout/Header.test.tsx`, `items/StatsRow.test.tsx` | New test files. |
| `scripts/mobile-verify.cjs` | New reviewer script (checks A-I). |

### Tests added / changed
- Editor.test.tsx › header › close button is named "Đóng"
- Editor.test.tsx › footer › edit mode exposes the mobile layout hooks
- Editor.test.tsx › footer › new mode has no duplicate button
- ImportModal.test.tsx › close button › is named "Đóng"
- ExportModal.test.tsx › close button is named "Đóng" and closes
- Header.test.tsx › Add button keeps an accessible name when its label is hidden
- StatsRow.test.tsx › total value keeps ₫ on the same line

### Checks (actual output summary)
- typecheck: `pnpm typecheck` exit 0 (tsc + tsc -p tsconfig.server.json)
- format:check: "All matched files use the correct format." (259 files)
- test: Test Files 100 passed | 10 skipped (110); Tests 1254 passed | 205 skipped (1459)
- build: `vite build` ok ("built in 314ms")
- scripts/mobile-verify.cjs (local mode, dev server on :5199, stopped afterwards), final full run: exit 0, `failures: []`. Covers A-H at 320/360/390/430 x light/dark plus editor-320 and desktop I. Output and screenshots in `/tmp/claude-0/after` (summary.json). One info line: `[H info] 430x932-dark: toast without modal not observed (timing)`. Desktop baseline (HEAD in a temporary worktree, port 5198, removed) vs after: unchanged screens 0.00% (light home, editor-new, import-csv, export); expected changes: delete confirm 0.35% / 0.85% (red button), dark home 0.30% (chip), dark editor 0.39%, dark import-csv 0.49%. Residual diffs I could not map to a planned fix: light editor 0.09% (about 77 scattered pixels, looks like animation/antialiasing noise at the 300 ms screenshot delay); dark export 0.46%, dark editor-new 0.29%: bounding box is the dimmed home page behind the backdrop (active chip, P1 3).

### Out-of-plan files
None.

### Deviations from the plan (and why)
- Added `.editor-body { grid-template-columns: minmax(0, 1fr); }` inside the <= 650 block. The shared `320px minmax(0, 1fr)` rule at the end of the file otherwise overrides the existing mobile single-column rule (seen in the first run: editor split into two columns on phones).
- `.editor-header h2 { line-height: 1.2 }` only in the <= 650 block, not in the shared block: in the shared block it moved the desktop title (0.33% pixel diff), contradicting "desktop unchanged".
- Phone toast while a modal is open: `top: calc(68px + env(safe-area-inset-top))` instead of 12px. At 12px it covers the editor's close button, which fails the plan's own check H (toast must not intersect `.modal-header .icon-btn`). 68px sits below the 56-60px editor header.
- `.searchbox` height 46px (not 44px) so the inner input measures 44px after the 1px borders (check D).
- Auth-preview screens: the verify script hides the preview harness (its own `<select>`s and log) before measuring, so only app UI is judged.
- Comment on the auth link rule avoids the literal path `src/features/auth/...` because `boundary.test.ts` greps for it in `src/index.css`.
- Verify script: the save-toast measurement polls for the toast shown with no modal and records an info line if the timing is missed (the toast lives 2.4 s; one dark run missed it three times in a row with a hard wait).

### Follow-ups (noticed, not done)
- `autoFocus` on the editor name field opens the keyboard on every open on phones; `role="status"` on the toast; focus trap/rings (F-1101); give auth `LinkButton` a semantic class.
- A stray worktree `/tmp/claude-0/wt-main` (branch `main-wt`) exists from before this run; not touched.
- Real-device checks (iOS Safari toolbar/safe areas, Android keyboard) remain Ming's, as listed in the plan.

### Scope self-check
- Could the diff be smaller? No: CSS is the bulk, all other edits are the plan's markup/copy hooks.
- Diff size: see `git diff --shortstat` (not committed, per instruction).
