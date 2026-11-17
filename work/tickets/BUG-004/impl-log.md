## Attempt 1 — 2026-11-17

### Regression test / check results
All artefacts outside the repo in `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-004/` (script `bug004-toolbar.cjs`, built CSS in `before/` and `after/`, outputs `before-run.txt` / `after-run.txt`, screenshots `panel-<before|after>-<390|560|650>-<light|dark>.png`).

**Before the fix (pre-fix build + pre-fix markup) — FAIL as required:**
- Playwright `bug004-toolbar.cjs` (A1–A4 at 390/560/650px, light and dark): 6 PASS (A1 only), 18 FAIL. At every width: A2 FAIL (toolbar scrollWidth/clientWidth 878/342 at 390px, 1048/512 at 560px, 1138/602 at 650px), A3 FAIL (toolbar has the right-edge `mask-image` gradient), A4 FAIL (no `.filter-row`). A1 passes in the harness (no safe-area inset), as the plan's Root cause correction predicted.
- Unit `FilterBar.test.tsx › keeps the search box and the filter row as separate children of .toolbar`: FAIL (toolbar had 6 children: label.searchbox + 5 label.filter-select).

**After the fix — PASS:**
- Playwright (after build + fixed markup): exit 0, 32 PASS / 0 FAIL = A1–A4 at 390/560/650px in light and dark (24) + A5 desktop unchanged at 651/800/1000/1280px in light and dark (8). 390px: search box x=24–366 = content box, toolbar 342/342, no mask, five selects 44px high and hit-testable, last select right edge 338 ≤ 366−28.
- Unit test passes.
- Screenshots (light and dark, 390/560/650): `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-004/panel-after-<w>-<light|dark>.png` (before: `panel-before-…`).

**BUG-003 hero check re-run against the final CSS** (`bug003-hero-collage.cjs`):
- Same way BUG-003 ran it (raw `src/index.css` linked, `hero-raw/hero.html`): exit 0, all 6 rows (light/dark × 390/490/650) inside:PASS clear:PASS.
- Against the compiled CSS (`hero-built/`): light/dark 390px `clear:FAIL`, 490/650 PASS. The same result occurs with the pre-fix build (`hero-built-before/`), and the `.hero-collage` rules in the before and after CSS are identical, so this is a harness artefact (that harness markup + Tailwind preflight), not caused by BUG-004. Noted for the reviewer.

### Files touched
| File | Required because |
|---|---|
| `src/features/items/FilterBar.tsx` | Wrap the five `FilterSelect` in `<div className="filter-row">` so filters get their own row |
| `src/index.css` | `.filter-row { display: contents }` base; re-indexed ≤1000px hide selectors; ≤650px toolbar column + full-width search box + scrolling filter row (removed `calc(100vw - 48px)` and sticky); fade mask moved from `.toolbar` to `.filter-row` |
| `src/features/items/FilterBar.test.tsx` (new) | Unit guard for the markup split |
| `work/tickets/BUG-004/impl-log.md` | This log |

### Tests added / changed
- `src/features/items/FilterBar.test.tsx › keeps the search box and the filter row as separate children of .toolbar`
- One-off Playwright `bug004-toolbar.cjs` (outside repo, D42)

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: All matched files use the correct format.
- test: 108 files passed, 10 skipped; 1269 tests passed, 205 skipped
- build: ✓ built

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The `.categories` row still scrolls sideways by design (out of scope per ticket).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: FilterBar.tsx +26/-26 (re-indent only), index.css about +17/-11, new test 37 lines.
