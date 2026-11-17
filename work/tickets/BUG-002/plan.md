Status: READY

# Plan — BUG-002: The item grid renders every item at once instead of 12 at a time

## Feature summary
Bug ticket; the feature reference is the bug report in `work/tickets/BUG-002/ticket.md`.

> Ming, 2026-11-17: "hình ảnh/items mỗi lần load 12 items thôi, còn lại kéo xuống mới load thêm, giảm tải load quá nhiều 1 lúc"

Expected (ticket):
> - The grid shows the first 12 matching items.
> - Scrolling near the end of the grid adds the next 12, until all matching items are shown.
> - Changing search, filters or sort starts again from the first 12.

Scope (ticket): client-side progressive rendering with an IntersectionObserver sentinel; reset to 12 when search,
filters or sort change; "Xem thêm" button fallback without IntersectionObserver, copy in the items copy file (R6);
page size as a named constant. Out of scope: server-side pagination of `GET /api/items`, photo loader changes.

Related feature list line (context only, not changed): `docs/feature-list.md` F-202 — "Grid uses lazy-loaded images".
The ticket notes this request is not in the feature list and was filed by Ming with `/bug` (D42); no conflict with
scope, since it only limits how many already-loaded items are rendered.

Root cause — **confirmed**: `src/features/items/ItemGrid.tsx:32` maps the whole `visible` array to `ItemCard`s
(`visible.map(...)`); there is no page size. `visible` comes from `src/features/items/useItemFilters.ts:26-31`
(filter + sort of the full item list). Photos are already lazy (`src/data/usePhotoUrl.ts:50-56`, rootMargin 300px),
so the cost is the number of mounted cards and observers.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Regression: with 40 matching items the grid renders 12 cards; triggering the sentinel shows 24, then 36, then 40 (no sentinel/button left) | `ItemGrid.test.tsx › renders 12 of 40 items, then 12 more each time the sentinel intersects` — fails on current code (40 cards), passes after |
| 2 | Without IntersectionObserver, a "Xem thêm" button appears while more items remain; clicking it adds 12; it disappears when all are shown | `ItemGrid.test.tsx › without IntersectionObserver shows a "Xem thêm" button that adds 12` |
| 3 | Changing search / filters / sort (the reset key) shows the first 12 again | `ItemGrid.test.tsx › resets to 12 when resetKey changes`; `useItemFilters` key test (below) proves query/category/filters/sort change the key |
| 4 | Editing/updating items with the same filters does **not** collapse the grid back to 12 (same resetKey, new `visible` array) | `ItemGrid.test.tsx › keeps the shown count when the list changes but resetKey does not` |
| 5 | If 12 cards do not fill the viewport (sentinel still visible after appending), loading continues | `ItemGrid.test.tsx › re-observes after each page so a still-visible sentinel loads the next page` (the observer is recreated when the shown count changes; the mock fires on `observe`) |
| 6 | Header count ("N kết quả") and StatsRow still count all items, not the rendered ones | Code reading: `src/App.tsx:147` uses `visible.length` and StatsRow uses `items` — both unchanged; plus `ItemGrid` test asserts nothing about the header. Reviewer confirms `App.tsx` diff only adds the `resetKey` prop |
| 7 | Fewer than or exactly 12 items: all render, no sentinel, no button | `ItemGrid.test.tsx › with 12 or fewer items renders all and no load-more control` |
| 8 | Works at 390px and in dark mode; no layout jump when cards are appended | One-off Playwright check (D42, session's preinstalled Playwright, script outside the repo) on `pnpm dev`: 390px, light + dark, 40-item wardrobe, scroll to bottom → 24 cards, scroll position unchanged, no horizontal scroll; result recorded in impl-log |
| 9 | All checks pass | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- On a real phone with the production wardrobe: first screen shows 12 cards; scrolling down loads more smoothly;
  changing a filter returns to the top 12.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/items/useProgressiveList.ts` | New hook `useProgressiveList<T>(list: T[], resetKey: string, pageSize = GRID_PAGE_SIZE)` → `{ shown: T[]; hasMore: boolean; showMore(): void }`; exports `GRID_PAGE_SIZE = 12` | Ticket scope: page size as a named constant; reset logic kept out of the component |
| `src/features/items/ItemGrid.tsx` | Render `shown` instead of `visible`; new prop `resetKey: string`; after the grid render a sentinel `<div className="grid-more">` when `hasMore`: observed with IntersectionObserver (rootMargin `"600px"`) when available, otherwise containing `<Btn>{GRID_COPY.loadMore}</Btn>` | Root cause fix |
| `src/features/items/copy.ts` | Add `export const GRID_COPY = { loadMore: "Xem thêm" } as const;` | R6: Vietnamese copy in the items copy file |
| `src/features/items/useItemFilters.ts` | Return `filterKey` — a memoized string of `query`, `category`, `filters`, `sort` (e.g. `JSON.stringify([query, category, filters, sort])`) | Reset only on search/filter/sort change, not on every item edit (AC 4) |
| `src/App.tsx` | Destructure `filterKey` from `useItemFilters` and pass `resetKey={filterKey}` to `ItemGrid` | Wire the reset key |
| `src/index.css` | Add one base rule `.grid-more { display: flex; justify-content: center; padding: 16px 0; min-height: 1px; }` right after the base `.item-grid` rule (~line 362) | Center the fallback button and give the sentinel a box; no layout jump |
| `src/features/items/ItemGrid.test.tsx` | New: tests listed below | R8, D42 regression test |
| `src/features/items/useItemFilters.test.ts` | New: `filterKey` test | R8 (changed logic) |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/items/ItemGrid.test.tsx › renders 12 of 40 items, then 12 more each time the sentinel intersects` | **Regression test (unit, jsdom)** with a stubbed `IntersectionObserver` (pattern from `src/components/ItemPhoto.test.tsx:96-110`): asserts 12 `.item-card` children; fire intersecting → 24 → 36 → 40, sentinel gone. Fails before the fix (40 cards on first render). AC 1 |
| `ItemGrid.test.tsx › without IntersectionObserver shows a "Xem thêm" button that adds 12` | `vi.stubGlobal("IntersectionObserver", undefined)`; button click → 24; with 40 items after 3 clicks button gone. AC 2 |
| `ItemGrid.test.tsx › resets to 12 when resetKey changes` | rerender with a new `resetKey` after loading 24 → 12. AC 3 |
| `ItemGrid.test.tsx › keeps the shown count when the list changes but resetKey does not` | rerender with a new array (one item renamed), same key → still 24. AC 4 |
| `ItemGrid.test.tsx › re-observes after each page so a still-visible sentinel loads the next page` | mock whose `observe()` immediately calls back `isIntersecting: true` → ends at 40 cards without manual triggers. AC 5 |
| `ItemGrid.test.tsx › with 12 or fewer items renders all and no load-more control` | 0-edge: 12 items → 12 cards, no `.grid-more`, no button; loading / empty / no-results branches unchanged (one assertion each). AC 7 |
| `src/features/items/useItemFilters.test.ts › filterKey changes with query, category, filters and sort but not with items` | `renderHook`: key stable when `items` prop changes; changes after `setQuery("áo")` (Vietnamese diacritics), `setCategory`, `setFilter`, `setSort`. AC 3/4 |

Item fixtures: a local `makeItem(i)` helper as in `ItemCard.test.tsx` (ids `"i1".."i40"`), no new shared fixture.

## Approach
1. `useProgressiveList`: `const [limit, setLimit] = useState(pageSize)`; reset when `resetKey` changes using the
   "adjust state during render" pattern (`const [prevKey, setPrevKey] = useState(resetKey); if (prevKey !== resetKey)
   { setPrevKey(resetKey); setLimit(pageSize); }`) so the old count never flashes. `shown = list.slice(0, limit)`,
   `hasMore = list.length > limit`, `showMore = () => setLimit((l) => l + pageSize)`.
2. `ItemGrid`: use the hook; keep the loading / empty / no-results branches as they are. Sentinel effect via a ref
   callback or `useEffect` with deps `[hasMore, shown.length]`: when `IntersectionObserver` exists, create an
   observer (`rootMargin: "600px"`) that calls `showMore()` on intersect, `observe(sentinel)`, `disconnect()` on
   cleanup. Recreating per page makes a still-visible sentinel fire again (AC 5). When it does not exist, render the
   `Btn` fallback (`GRID_COPY.loadMore`). Feature-detect with `typeof IntersectionObserver !== "undefined"`, as in
   `src/data/usePhotoUrl.ts:19`.
3. `useItemFilters`: `filterKey = useMemo(() => JSON.stringify([query, category, filters, sort]), [...])`.
4. `App.tsx`: pass `resetKey={filterKey}`. The "N kết quả" count stays `visible.length` (AC 6).
5. `index.css`: the single `.grid-more` rule; dark mode needs nothing (the `Btn` already themes itself).
6. Rules: R1 untouched (no data access change); R6 copy in `copy.ts`; R7 only listed files; R8 tests above; R9
   verified by the Playwright check at 390px light/dark.

## Specialist input used
None (no consults).

## Assumptions
- **Shared hotspot `src/index.css`:** BUG-003 (≤650px hero block, ~lines 2221-2251) and BUG-004 (≤650px toolbar
  rules, ~1200-1211 and ~2558-2561) edit the same file on the same branch. This plan adds one new rule near the
  base `.item-grid` rule (~line 362), away from their blocks, so a conflict is unlikely; the orchestrator should
  expect a trivial rebase/merge.
- **`src/App.tsx` hotspot:** one-line change (destructure `filterKey`, pass `resetKey`). BUG-005 touches
  `Header.tsx`/`Icon.tsx`, not `App.tsx`.
- Reset happens only on search/category/filters/sort changes; adding, editing or deleting an item keeps the current
  count (the ticket's Expected names only search, filters and sort). A newly added item may sort beyond the shown
  range — acceptable, it is reachable by scrolling.
- rootMargin 600px (about two card rows ahead) so the next page is mounted before the user reaches the end; tunable.
- `useProgressiveList.ts` and `ItemGrid.tsx` are not added to the coverage `include` list in `vitest.config.ts`
  (no config change); they are covered by the tests above.
- Out of scope, for follow-ups: the hard-coded Vietnamese strings in `ItemGrid.tsx:43-45` ("Không tìm thấy món đồ",
  etc.) are not in a copy file (R6) — not moved by this ticket.

## Blocking questions
None.

## Split proposal
None (estimated ~150 changed lines including tests).
