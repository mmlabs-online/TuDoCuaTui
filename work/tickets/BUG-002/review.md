Verdict: PASS

## Attempt 1 — 2026-11-17

Reviewed commit `e414e3b` only (BUG-005 and the BUG-003/004 plan commits on this branch are out of scope here).

### Checks (run by reviewer)
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- format:check: "All matched files use the correct format." (273 files)
- test: Test Files 107 passed | 10 skipped (117); Tests 1268 passed | 205 skipped (1473) — matches impl-log
- build: pass (`vite build`, built in 414ms)

Regression evidence, reproduced by the reviewer: the parent of `e414e3b` was extracted with `git archive` to a
scratch folder (outside the repo) and the two new test files from `e414e3b` were run against it:
5 failed | 2 passed. `renders 12 of 40 items, then 12 more each time the sentinel intersects` fails with
`expected 40 to be 12`; the "Xem thêm", reset and keep-count tests fail the same way (40 cards); the `filterKey` test fails
(`expected 1 to be 5`). The two that pass before the fix (`re-observes…`, `with 12 or fewer…`) are recorded honestly in
impl-log as passing trivially before. On `e414e3b` all 7 pass.

One-off Playwright check (D42) re-run by the reviewer with the implementer's harness
(`/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-002/check.cjs`, real `ItemGrid` +
`src/index.css`, 40 items, 390×800):
`{"mode":"light","initial":12,"afterScroll1":24,"final":40,"sentinelLeft":0,"hScroll":false}` and the same for dark.
Screenshots `light-initial.png` / `dark-bottom.png` inspected: two-column grid at 390px, dark theme applied, cards 37–40
render correctly at the bottom, no overflow.

### Acceptance criteria
- [x] 1 Regression: 40 items → 12, sentinel → 24 → 36 → 40, no sentinel left — evidence: `src/features/items/ItemGrid.test.tsx` › `renders 12 of 40 items, then 12 more each time the sentinel intersects`; fails on pre-fix code (shown above), passes now
- [x] 2 "Xem thêm" fallback without IntersectionObserver — evidence: `ItemGrid.test.tsx` › `without IntersectionObserver shows a "Xem thêm" button that adds 12`; copy in `src/features/items/copy.ts:33` (`GRID_COPY.loadMore`)
- [x] 3 Search / filters / sort reset to 12 — evidence: `ItemGrid.test.tsx` › `resets to 12 when resetKey changes`; `useItemFilters.test.ts` › `filterKey changes with query, category, filters and sort but not with items` (includes `setQuery("áo")`); reset implemented with the adjust-during-render pattern in `useProgressiveList.ts:9-12`, so no flash of the old count
- [x] 4 Item edits keep the shown count — evidence: `ItemGrid.test.tsx` › `keeps the shown count when the list changes but resetKey does not`; `filterKey` (`useItemFilters.ts:33-36`) depends on `query, category, filters, sort` only, not `items`. `filters` includes `special`, so the StatsRow toggles also reset (correct: they change the visible list)
- [x] 5 Still-visible sentinel keeps loading — evidence: `ItemGrid.test.tsx` › `re-observes after each page…` (observer recreated on `shown.length`, `ItemGrid.tsx:37-48`); Playwright `afterScroll1: 24` then `final: 40`
- [x] 6 "N kết quả" and StatsRow count all items — evidence: `src/App.tsx:148` still `{visible.length} kết quả`; `src/App.tsx:141` `StatsRow items={items}`; the `App.tsx` diff only adds `filterKey` to the destructuring and `resetKey={filterKey}`; `ItemGrid` still receives the full `visible` and `total={items.length}`, and the empty/no-results branches test `visible.length`/`total`, not `shown`
- [x] 7 ≤12 items: all render, no sentinel/button — evidence: `ItemGrid.test.tsx` › `with 12 or fewer items renders all and no load-more control`
- [x] 8 390px + dark mode, no layout jump — evidence: Playwright re-run above (no horizontal scroll, light and dark); cards are appended below the existing ones and the sentinel keeps a fixed box (`src/index.css:363-368`)
- [x] 9 All checks pass — see Checks

### Out-of-plan change: `src/App.test.tsx` — justified
The 16-item starter fixture now renders 12 cards first, and jsdom has no IntersectionObserver, so existing App tests
that expected all 16 cards failed by design. The change adds a `showAll()` helper that clicks "Xem thêm" until it is
gone and calls it in `renderApp` and after the four actions that reset the grid (clear filters, "Tất cả", sort, stat-card
toggle). No assertion was removed or loosened (still `toHaveLength(16)` / full sorted name list), and the extra
`showAll()` after each reset is itself an integration check that filter/sort changes go back to a paged state. Test-only,
recorded under *Out-of-plan files* in impl-log. Accepted.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data access change. R6: "Xem thêm" lives in `copy.ts`. R7: only planned files plus the
justified `App.test.tsx`. R8: new hook and changed `useItemFilters` have tests. R9: verified at 390px light/dark.

### Nits (do not block)
- 💭 `ItemGrid.tsx:48` effect deps omit `showMore`; harmless because `showMore` uses a functional `setLimit`, but a
  lint rule would flag it.
- 💭 The plan's `with 12 or fewer items…` test was to add one assertion each for the loading / empty / no-results
  branches; the test only covers the 12-item case. Those branches are unchanged and covered by `App.test.tsx`.
- 💭 With IntersectionObserver present, `.grid-more` is an empty 33px block under the grid until everything is shown;
  invisible, but adds a little space at the bottom.

### Ming verification after merge
- On a real phone with the production wardrobe: first screen shows 12 cards; scrolling down loads more smoothly;
  changing a filter returns to the top 12.

### Follow-ups (out of scope)
- Hard-coded Vietnamese strings in the `ItemGrid.tsx` no-results block are not in a copy file (R6), as noted by plan
  and impl-log.
- Changing a filter while scrolled far down does not scroll back to the top of the grid; consider it if Ming finds it
  confusing.
