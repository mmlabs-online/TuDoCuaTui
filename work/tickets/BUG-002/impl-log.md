## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| src/features/items/useProgressiveList.ts (new) | Hook with `GRID_PAGE_SIZE = 12`, reset on key change |
| src/features/items/ItemGrid.tsx | Render `shown`; sentinel + IntersectionObserver (rootMargin 600px, recreated per page); "Xem thêm" fallback; new `resetKey` prop |
| src/features/items/copy.ts | `GRID_COPY.loadMore` (R6) |
| src/features/items/useItemFilters.ts | Return memoized `filterKey` (query, category, filters, sort) |
| src/App.tsx | Pass `resetKey={filterKey}` |
| src/index.css | `.grid-more` rule next to `.item-grid` |
| src/features/items/ItemGrid.test.tsx (new) | 6 tests incl. the regression test |
| src/features/items/useItemFilters.test.ts (new) | filterKey test |

### Tests added / changed
- src/features/items/ItemGrid.test.tsx › renders 12 of 40 items, then 12 more each time the sentinel intersects (REGRESSION: **failed before the fix** — 40 cards instead of 12; passes after)
- ItemGrid.test.tsx › without IntersectionObserver shows a "Xem thêm" button that adds 12
- ItemGrid.test.tsx › resets to 12 when resetKey changes
- ItemGrid.test.tsx › keeps the shown count when the list changes but resetKey does not
- ItemGrid.test.tsx › re-observes after each page so a still-visible sentinel loads the next page (passed trivially before the fix, since all 40 rendered; passes after)
- ItemGrid.test.tsx › with 12 or fewer items renders all and no load-more control (passes before and after)
- useItemFilters.test.ts › filterKey changes with query, category, filters and sort but not with items (failed before: no filterKey)
- src/App.test.tsx (changed, out of plan): `renderApp` and 4 tests now click "Xem thêm" via a `showAll()` helper

Before the fix: 5 tests failed (the 4 listed ItemGrid tests plus the filterKey test). After: all pass.

### Checks (actual output summary)
- typecheck: pass (tsc app + server)
- format:check: All matched files use the correct format.
- test: 107 files passed | 10 skipped; 1268 tests passed | 205 skipped
- build: pass (vite build, built in 407ms)

One-off Playwright check (D42), throwaway harness outside the repo (/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-002, vite + ItemGrid with 40 items, 390x800):
- light: initial 12 cards; after scroll 24; after scrolling to bottom 40; sentinel gone; no horizontal scroll
- dark: same results
- Screenshots: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-002/light-initial.png, /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-002/light-bottom.png, /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-002/dark-initial.png, /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug-002/dark-bottom.png
- Not measured: pixel-level scroll-jump (appended cards are added below the viewport, no layout shift observed in the screenshots).

### Out-of-plan files
- src/App.test.tsx — existing tests assume all 16 fixture items render at once and failed (38 tests); `renderApp`/4 assertions now page in via "Xem thêm" (jsdom has no IntersectionObserver).

### Follow-ups (noticed, not done)
- Hard-coded Vietnamese strings in ItemGrid.tsx no-results block are not in a copy file (R6), as the plan noted.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see git diff --stat of the commit
