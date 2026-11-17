# BUG-002: The item grid renders every item at once instead of 12 at a time

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S2 |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui |
| Gate | none |
| Found in | unknown (production, reported 2026-11-17) |
| Introduced in | unknown — the grid has rendered the full list since the Figma Make export |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-17 |
| Claimed by | — |
| PR | — |

## Report
Ming, 2026-11-17: "hình ảnh/items mỗi lần load 12 items thôi, còn lại kéo xuống mới load thêm, giảm tải load quá nhiều 1 lúc"
(Show only 12 items/photos at a time; load more when scrolling down, so the app does not load too much at once.) No screenshot.

Scope note: this is a performance improvement rather than broken behaviour, and it is not in `docs/feature-list.md`
(F-202 asks only for lazy-loaded grid images). Recorded as a bug because Ming filed it with `/bug`.

## Environment
- Mode: API (identity) and local · any browser/device · light and dark · 390px and desktop

## Steps to reproduce
1. Have a wardrobe with more than 12 items (e.g. 40).
2. Open the main screen.
3. Count the cards in `.item-grid`.

## Expected
- The grid shows the first 12 matching items.
- Scrolling near the end of the grid adds the next 12, until all matching items are shown.
- Changing search, filters or sort starts again from the first 12.

## Actual
- Every matching item is rendered as a card on first load (40 items → 40 cards), and each card mounts its photo
  observer. With a large wardrobe this is a long first render and many photo requests as the user scrolls quickly.

## Root cause
**Confirmed.** `src/features/items/ItemGrid.tsx:32` maps the whole `visible` array to `ItemCard`s; there is no
page size or "load more" step. Reproduced with a throwaway unit test (rendered `ItemGrid` with 40 items → 40 children
in `.item-grid`; test not committed).
Context: photos are already lazy — `src/data/usePhotoUrl.ts` starts a fetch only within 300px of the viewport
(IntersectionObserver), and `src/data/photoUrls.ts` caps parallel photo fetches at 4. So the cost is mostly the number
of cards and observers mounted, plus photos within 300px of the viewport.
`GET /api/items` (`src/data/repo.http.ts:64`) returns all items in one response; filters, search and stats
(`StatsRow`) run client-side on that full list.

## Scope
- Render the grid progressively on the client: first 12 items of `visible`, then 12 more each time a sentinel after
  the last card comes near the viewport (IntersectionObserver), until all are shown.
- Reset to 12 when the filtered/sorted list changes (search, filters, sort).
- Without IntersectionObserver (old browsers, jsdom), fall back to a "Xem thêm" button, Vietnamese copy in the items
  copy file (R6).
- Page size as a named constant (12).

## Out of scope
- Server-side pagination of `GET /api/items` (stats, filters and search need the full list on the client; the item
  JSON is small compared with the photos).
- Changing the photo loader (concurrency, cache) or thumbnail sizes.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after (name the test) —
      e.g. `ItemGrid` with 40 items renders 12 cards; triggering the sentinel (or "Xem thêm") shows 24.
- [ ] Changing the visible list (filter/search) shows the first 12 again (test).
- [ ] The total in the header/stats still counts all items, not just the rendered ones.
- [ ] Works at 390px and in dark mode; no layout jump when more cards are appended.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/items/ItemGrid.tsx`, maybe a small hook (e.g. `src/features/items/useProgressiveList.ts`),
  `src/features/items/copy.ts`, tests next to them.
- Test level: unit (jsdom) with a mocked IntersectionObserver or the fallback button. A one-off Playwright check of
  scroll-to-load at 390px recorded in impl-log (D42).

## Notes / answers from Ming

## Handoff
- 2026-11-17 — claude — recorded; record PR https://github.com/mmlabs-online/TuDoCuaTui/pull/71
