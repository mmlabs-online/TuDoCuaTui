Status: READY

# Plan — BUG-004: Search box overflows and scrolls sideways on mobile

## Feature summary
Bug ticket (D42): the feature reference is the bug report in `work/tickets/BUG-004/ticket.md`.

> **Expected** — "The search box fits the panel width (no part of it hidden, no sideways scrolling needed to see or use
> it)." / "The filter selects (Trạng thái, Mùa, Vị trí lưu trữ, Màu, Sắp xếp) stay reachable and visible as such on mobile."
>
> **Scope** — "At ≤ 650px, make the search box exactly the toolbar width (e.g. search on its own full-width row, filter
> selects in their own sideways-scrolling row below), so the search box never overflows and the filters stay reachable."
> "Keep desktop/tablet (> 650px) toolbar layout unchanged."
>
> **Out of scope** — "Category chips row behaviour (it scrolls sideways by design …)." "Filter logic, copy, or which filters exist."

`work/decisions.md` D42: "Every bug fix ships with a regression test that fails before the fix (Playwright when jsdom
cannot see the bug) … a browser-only bug gets a unit-level regression test where one can reproduce it, plus a one-off
Playwright check (the session's preinstalled Playwright, script outside the repo) whose result is recorded in impl-log and review."
D44 (no local/demo mode) does not affect this ticket: the check loads the built CSS with static markup, no data access.

### Root cause — confirmed, with one correction
Confirmed by the planner with Playwright on the CSS built from the current tree (`vite build`, Tailwind v4 compiled)
and the `FilterBar` markup inside `.app-shell > main > section.wardrobe-panel`:

- `src/index.css:1200-1204` (`@media (max-width: 650px)`, block starting at line 1124): `.toolbar` becomes
  `display: flex; overflow-x: auto`, so the search box and all five filter selects share **one** sideways-scrolling row
  (planner measurement at 390px: toolbar `scrollWidth` 878 vs `clientWidth` 342; the selects start at x=373, past the
  panel's right content edge at 366).
- `src/index.css:1205-1211`: `.searchbox { min-width: calc(100vw - 48px); position: sticky; left: 0; … }`. The 48px is a
  hard-coded guess of the horizontal inset. **Correction:** in a plain harness the inset is exactly 24px/side
  (`main` padding 12px at `src/index.css:1146-1148` + panel padding 12px at `:2277-2280`), so there the search box
  happens to be exactly the content width (x=24–366). It overflows whenever the real inset differs from 24px/side,
  e.g. the `.app-shell` safe-area padding (`src/index.css:2455-2458`, `env(safe-area-inset-left/right)`) on a phone,
  which matches Ming's report (content at 32px, search box 374px). The cause is the same: a `vw`-based width instead of
  the container width, plus the shared scrolling row.
- `src/index.css:2557-2561` (second `@media (max-width: 650px)` block, from line 2463): the right-edge fade mask is on
  `.toolbar`, so the right 28px of the search row (the end of the search box) is always faded.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Regression test reproduces the bug: fails on the pre-fix CSS/markup, passes after (named) | One-off Playwright script `bug004-toolbar.cjs` (outside the repo, spec in **Tests to write**). Run once against the pre-fix build + pre-fix markup → assertions A2 and A3 fail at 390/560/650px; run against the fixed build + fixed markup → all assertions pass. Both outputs pasted in impl-log; reviewer reruns the "after" run. Plus unit test `FilterBar.test.tsx › keeps the search box and the filter row as separate children of .toolbar` (fails before: no `.filter-row`). |
| 2 | Search box lies within the panel content box and the search row has no horizontal overflow at ≤ 650px | Playwright assertions A1–A3 at 390, 560, 650px. |
| 3 | All five filter selects are still reachable on mobile | Playwright assertion A4 at 390, 560, 650px. |
| 4 | Holds in light and dark mode at 390, 560 and 650px; screenshots for the PR | Script runs every viewport twice (`<html>` without / with class `dark`, as `src/App.tsx:73` does) and saves `panel-<w>-<light|dark>.png` of `.wardrobe-panel`; implementer attaches them to the PR. |
| 5 | Desktop/tablet (> 650px) toolbar layout unchanged | Playwright assertion A5: at 651, 800, 1000 and 1280px, the rects and `display` of `.searchbox` and each `.filter-select` are identical (±0.5px) between the pre-fix and the fixed run (same visible set: at 651–1000px Vị trí lưu trữ and Màu hidden, Trạng thái/Mùa/Sắp xếp visible). |
| 6 | All checks pass | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
- On a real phone (light and dark), the search box fits the panel and the filter row swipes sideways on its own.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/items/FilterBar.tsx` | Wrap the five `<FilterSelect>` in `<div className="filter-row">` inside `.toolbar`, after the `<label className="searchbox">`. No other markup change. | The filters need their own scrolling row separate from the search box (ticket Technical notes allow a wrapper). |
| `src/index.css` | (a) base: add `.filter-row { display: contents; }` next to `.filter-select` (~line 304) so the desktop grid is unchanged; (b) `@media (max-width: 1000px)` lines 1116-1119: re-index the hidden selects to `.filter-row .filter-select:nth-of-type(3), .filter-row .filter-select:nth-of-type(4)` (**replace** the old selectors, do not add); (c) `@media (max-width: 650px)` lines 1200-1217: new toolbar/searchbox/filter-row rules; (d) lines 2557-2561: move the fade mask from `.toolbar` to `.filter-row`. | Root cause lines. |
| `src/features/items/FilterBar.test.tsx` (new) | Unit test of the toolbar structure. | Unit-level guard for the markup split (D42, R8). |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| **Regression (one-off Playwright, D42)** `<scratchpad>/bug004/bug004-toolbar.cjs` › assertions A1–A5 below | The bug itself (CSS layout jsdom cannot see) and the desktop non-regression |
| `src/features/items/FilterBar.test.tsx` › keeps the search box and the filter row as separate children of .toolbar | `.toolbar` has exactly two element children: `label.searchbox` and `div.filter-row`; `.filter-row` contains five `.filter-select` labels whose first `<option>` texts are, in order, `Trạng thái`, `Mùa`, `Vị trí lưu trữ`, `Màu`, `Sắp xếp`. Render with `@testing-library/react` (no-op callbacks, empty filters, `locationOptions={[]}`, `counts={}`, `total={0}`). Fails before the fix. |

### Playwright regression script — exact spec
Script lives in the session scratchpad (outside the repo), CommonJS, `const { chromium } = require('playwright'); const browser = await chromium.launch();` (no options).

**Loading the real CSS** (Tailwind v4 must be compiled — raw `src/index.css` has `@import "tailwindcss"` and relies on
preflight `box-sizing: border-box`):
1. *Before* editing anything: `npx vite build --outDir <scratchpad>/bug004/before --emptyOutDir` (keeps the repo's `dist/` untouched). After the fix: same with `--outDir <scratchpad>/bug004/after`.
2. The script takes `<css path> <before|after>`; reads `assets/index-*.css`, strips the Google Fonts `@import url(...)` line, inlines it in a `<style>` tag via `page.setContent(html)`; `page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())`.
3. Markup (mirror of `src/App.tsx:138-168` + `FilterBar.tsx`, copy class names exactly):
   `<html [class="dark"]><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>…</style></head><body><div id="root"><div class="app-shell"><main><section class="wardrobe-panel"><div class="panel-heading"><div><p class="eyebrow">BỘ SƯU TẬP</p><h2>Tất cả món đồ</h2><span>63 kết quả</span></div></div><div class="toolbar"><label class="searchbox"><svg width="18" height="18"></svg><input placeholder="Tìm theo tên, hãng, màu, tag, chất liệu, ghi chú, vị trí…"></label>` + FILTERS + `</div><div class="categories"></div></section></main></div></div></body></html>`
   where each select is `<label class="filter-select "><select><option value="">LABEL</option></select><svg width="15" height="15"></svg></label>` for the five labels in order, and FILTERS is the five labels bare (`before`) or wrapped in `<div class="filter-row">…</div>` (`after`).
4. Viewports `{width: w, height: 900}` for w ∈ {390, 560, 650} (mobile assertions A1–A4) and {651, 800, 1000, 1280} (A5), each in light and dark. Save `page.locator('.wardrobe-panel').screenshot()` as `panel-<w>-<theme>.png` for the mobile widths.

**Assertions** (each prints PASS/FAIL with the measured numbers; exit code 1 if any FAIL):
- **A1 search box inside the panel content box**: with `P = .wardrobe-panel`, `contentLeft = P.rect.left + paddingLeft + borderLeftWidth`, `contentRight = P.rect.right − paddingRight − borderRightWidth`; `.searchbox` rect satisfies `left ≥ contentLeft − 0.5` and `right ≤ contentRight + 0.5`, and `.searchbox` rect width ≈ `.toolbar` `clientWidth` (±0.5).
- **A2 search row has no horizontal overflow**: `.toolbar.scrollWidth ≤ .toolbar.clientWidth + 1`; `.searchbox.scrollWidth ≤ .searchbox.clientWidth + 1`; `document.documentElement.scrollWidth ≤ innerWidth`. (Before: 878 vs 342 at 390px → FAIL.)
- **A3 search box not faded**: `getComputedStyle(.toolbar).maskImage === 'none'` and the same for `webkitMaskImage` where defined. (Before: linear-gradient → FAIL.)
- **A4 five filters reachable**: exactly 5 `.filter-select select`; each has computed `display` ≠ `none`, `visibility` = `visible`, rect height ≥ 44. For each: `select.scrollIntoView({block:'nearest', inline:'nearest'})`, then its rect lies horizontally within `.filter-row`'s rect (±0.5) and `document.elementFromPoint(centerX, centerY)` is the select (or inside its label). Then set `.filter-row.scrollLeft = 1e5`; the 5th `.filter-select` rect `right ≤ .filter-row rect.right − 28 + 0.5` (it can be scrolled clear of the fade). (In `before` there is no `.filter-row`: record A4 as FAIL "no .filter-row".)
- **A5 desktop unchanged** (651/800/1000/1280px): collect `{display, left, top, width, height}` of `.searchbox` and each `.filter-select` in both runs; the script, given both CSS paths, runs `before` markup+CSS and `after` markup+CSS and asserts equal (±0.5).

## Approach
1. Build the pre-fix CSS into `<scratchpad>/bug004/before` (step 1 above) **before any edit**; write the script; run it in `before` mode and keep the output (expected: A2, A3, A4 FAIL at 390/560/650; A1 may pass in the harness — see Root cause correction).
2. Write `FilterBar.test.tsx`; run `pnpm test` → it fails.
3. `FilterBar.tsx`: wrap the five `FilterSelect`s in `<div className="filter-row">`.
4. `src/index.css`:
   - base (after the `.filter-select` rules ~line 304): `.filter-row { display: contents; }` — desktop grid (`grid-template-columns: minmax(230px, 1fr) repeat(4, auto) auto`) keeps the same six grid items.
   - `@media (max-width: 1000px)` lines 1116-1117: replace `.filter-select:nth-of-type(4), .filter-select:nth-of-type(5)` with `.filter-row .filter-select:nth-of-type(3), .filter-row .filter-select:nth-of-type(4)`. Reason: the searchbox `<label>` used to be label #1 among the toolbar children; inside `.filter-row` the selects are #1–#5, so the old indices would hide Màu and Sắp xếp instead of Vị trí lưu trữ and Màu (planner probe at 800px confirmed this regression if the selectors are left as is).
   - `@media (max-width: 650px)` lines 1200-1211: replace the `.toolbar` and `.searchbox` rules with:
     `.toolbar { display: flex; flex-direction: column; gap: 8px; }` (no `overflow-x`, no `padding-bottom`);
     `.searchbox { width: 100%; min-width: 0; }` (drop `min-width: calc(100vw - 48px)`, `position: sticky`, `left`, `z-index`, `background` — the base rule at line 1718 already sets `background: var(--surface)`);
     `.filter-row { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px; padding-right: 28px; }`;
     keep `.filter-select { display: block !important; }` and add `flex: none;`; keep `.filter-select select { max-width: none; }`.
     If A1/A2 still report the input forcing width, add `.searchbox input { min-width: 0; }` here (not needed in the planner probe).
   - lines 2557-2561: in the selector list `.stats-grid, .toolbar, .categories`, replace `.toolbar` with `.filter-row` (the mask now fades only the filter row; `padding-right: 28px` lets the last select scroll out of the fade).
5. Build into `<scratchpad>/bug004/after`, run the script (after mode + A5 comparison), light and dark; paste both outputs in impl-log; attach the six mobile screenshots to the PR.
6. Run Checks.

Planner probe result for this exact CSS (harness above): at 390/560/650 the search box is x=24–366/536/626 (= content box), `.toolbar` scrollWidth = clientWidth, no mask; all five selects hit-testable after scrolling, last select right edge 338 ≤ 366−28 at 390px; at 1280px all rects identical to before; at 800px identical once the nth-of-type selectors are re-indexed.

Rules: R6 (no copy change), R7 (only the toolbar; categories row untouched), R8 (regression test + unit test, green checks), R9 (390px and dark mode verified). R1–R5 not touched.

## Specialist input used
None (no consults).

## Assumptions
- **Hotspot:** BUG-003 (planned in parallel) also edits `src/index.css`, but only the `@media (max-width: 650px)` hero block (`src/index.css:2211-2260` area, `.hero-collage`). BUG-004 edits lines ~304, 1116-1117, 1200-1217 and 2557-2561 — no overlapping lines, but a textual rebase may be needed when the batch lands on one branch.
- `display: contents` on a plain `<div>` has no accessibility cost (no role on the div; the `<select>`s keep their own semantics).
- The scrollbar of `.filter-row` keeps the existing thin-scrollbar styling from `@layer base` (`scrollbar-width: thin`); no new styling.
- Fonts are blocked in the harness (fallback font); widths shift a few px but A1–A5 are relative, so results hold.

## Blocking questions
None.

## Split proposal
None (≈ 30 changed lines plus one small test file).
