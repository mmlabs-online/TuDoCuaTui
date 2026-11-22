# BUG-017: Full-size photos are used for small grid thumbnails and rendering slows down

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S3 |
| Priority | P2 |
| Size | M |
| Areas | ui, data, architecture |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | unknown |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | — |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-8).
- Grid and hero images are ~1180–1200 px (≈1.4 MP) blobs from `/api/photos/:id`, displayed at ~110–180 px (on
  average about 6× larger than shown).
- 36 `.wear-pill` elements use `backdrop-filter: blur(6px)`, plus `.topbar` (16px) and `.modal-backdrop` (4px).
- After scrolling the grid, browser screenshot capture timed out (30 s) four times, and `requestAnimationFrame` ran at
  2–4 fps with **no long tasks** on the main thread. The cost is in painting or compositing, not in JS.

## Environment
- Production v0.3.1, Chrome desktop on Windows 11, 71 items with photos. The window may have been throttled by the
  automation; not yet measured on a phone.

## Steps to reproduce
1. Open the app with ~70 photo items and scroll the grid to the end.
2. Record a DevTools Performance profile (and on a mid-range phone).

## Expected
- Thumbnails close to their display size; smooth scrolling (≥ 50 fps) on a mid-range phone.

## Actual
- Full-size images for thumbnails; very low frame rate observed during the UAT.

## Root cause
**Suspected**: decoding and painting many 1.4 MP images plus a `backdrop-filter` per card. The planner confirms with
a Performance profile before changing code.

## Scope
- Measure first. If confirmed: serve or generate a thumbnail size for cards and the hero collage (full size only in
  the editor), and replace the wear-pill `backdrop-filter` with a solid translucent background.

## Out of scope
- Changing photo storage on Google Drive, or the upload resize pipeline beyond adding a thumbnail size.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. a unit test that the card requests the thumbnail variant; the frame rate is checked in a one-off
      Playwright/DevTools run recorded in impl-log).
- [ ] Profile before/after recorded in impl-log; scrolling the grid is smooth.
- [ ] All checks pass.

## Technical notes
- Files: `src/components/ItemPhoto.tsx`, `src/features/items/ItemCard.tsx`, `src/index.css` (`.wear-pill` at lines
  415, 438, 1844), possibly `server/` photo route (High path → would need plan approval if a server size variant is
  chosen).

## Notes / answers from Ming

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)
