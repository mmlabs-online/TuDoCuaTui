# BUG-004: Search box overflows and scrolls sideways on mobile

| Field | Value |
|---|---|
| Type | bug |
| State | PLANNING |
| Severity | S2 |
| Priority | P1 |
| Size | XS |
| Milestone | M1 |
| Epic | E5 — UI |
| Areas | ui |
| Gate | none |
| Found in | unknown (production, reported 2026-11-17) |
| Introduced in | unknown — the ≤ 650px toolbar CSS is already in v0.2.0 (Figma Make export) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-17 |
| Claimed by | claude@2026-11-17T13:49:40Z |
| PR | — |

## Report
Ming, 2026-11-17: "trên mobile Ô tìm kím bị scroll ngang" (on mobile the search box scrolls horizontally).
Screenshot (light mode, mobile, ~560px wide): under "Tất cả món đồ · 63 kết quả", the search box is wider than the
panel — its left edge is pushed past the panel padding and its right edge is cut off ("…chất liệ"), with a horizontal
scrollbar under it. The category chips row below ("Tất cả 63", "Áo 20", "Quần/váy 6") is also cut at the right edge.

## Environment
- Mode: API (identity) · mobile browser · light (dark not checked) · viewport ≤ 650px (reproduced at 390px and 560px)

## Steps to reproduce
1. Open the main screen at a viewport ≤ 650px wide (e.g. 390px).
2. Look at the search box under "Tất cả món đồ"; swipe the row sideways.

## Expected
- The search box fits the panel width (no part of it hidden, no sideways scrolling needed to see or use it).
- The filter selects (Trạng thái, Mùa, Vị trí lưu trữ, Màu, Sắp xếp) stay reachable and visible as such on mobile.

## Actual
- At 390px the toolbar is 326px wide but the search box is 374px wide (x=32–406), so its right part is outside the
  toolbar and faded by the edge mask; the toolbar scrolls sideways (scrollWidth 910px vs 326px) because the filters
  sit to the right of the search box, off screen. Same at 560px (toolbar 496px, search box 544px).

## Root cause
**Confirmed** (Playwright on the real `src/index.css` with the toolbar markup, 390px and 560px; script outside the repo).
`src/index.css:1200-1211` (`@media (max-width: 650px)`): `.toolbar` becomes `display: flex; overflow-x: auto`, and
`.searchbox` gets `min-width: calc(100vw - 48px)` with `position: sticky; left: 0`. 48px assumes 24px of page inset
per side, but the panel's content starts at 32px on each side, so the search box is always wider than the toolbar
it sits in. `src/index.css:2558-2561` adds a right-edge fade mask to `.toolbar`, hiding the end of the search box.
The filters only exist to the right of it in the same scrolling row.

## Scope
- At ≤ 650px, make the search box exactly the toolbar width (e.g. search on its own full-width row, filter selects in
  their own sideways-scrolling row below), so the search box never overflows and the filters stay reachable.
- Keep desktop/tablet (> 650px) toolbar layout unchanged.

## Out of scope
- Category chips row behaviour (it scrolls sideways by design; only revisit if Ming asks).
- Filter logic, copy, or which filters exist.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after (name the test). jsdom
      cannot see layout, so: a one-off Playwright check (D42) asserting the `.searchbox` box lies within the `.toolbar`
      / panel content box and the search row has no horizontal overflow, at 390px and 650px; recorded in impl-log and review.
- [ ] All five filter selects are still reachable on mobile.
- [ ] Holds in light and dark mode at 390px, 560px and 650px; screenshots attached to the PR.
- [ ] All checks pass.

## Technical notes
- Files: `src/index.css` (≤ 650px toolbar/searchbox rules); `src/features/items/FilterBar.tsx` only if a wrapper
  element is needed to split the search row from the filter row.
- Test level: browser-only (CSS layout) → Playwright one-off, script outside the repo (D42).

## Notes / answers from Ming

## Handoff
- 2026-11-17 — claude — recorded; record PR https://github.com/mmlabs-online/TuDoCuaTui/pull/71
