# F-202.2: Lazy-load grid images and refresh expired signed URLs

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | data |
| Gate | none |
| Depends on | F-004.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
The grid loads fast, and photos still show after the app has been open for more than an hour.

## Feature reference
`docs/feature-list.md` F-202 (split F-202.2). Decisions: `work/decisions.md`.

## Scope
- `loading="lazy"` and `decoding="async"` on grid and hero images.
- Signed URLs live 3600 seconds (`createSignedUrls(paths, 3600)`). Re-sign before they expire (for example
  at 50 minutes, and when the tab becomes visible again), plus an `onError` fallback on `<img>` that re-signs
  that one path.
- Add a `refreshPhotoUrls()` (or similar) method to `WardrobeRepo`; it does nothing in local mode.

## Out of scope
- Thumbnails or image transforms (F-1102, M3).

## Acceptance criteria
- [ ] Nothing is broken after the app stays open for more than one hour (the test can use a short TTL
      behind a dev flag).
- [ ] Off-screen images are not requested on the first load.

## Technical notes
- Files: `src/data/repo.ts`, `src/data/useWardrobe.ts`, `src/features/items/ItemCard.tsx`, the hero component.
- Keep the `WardrobeRepo` interface backwards compatible (local mode keeps working).
- Expected tier: Medium.

## Test plan
- Unit: the re-sign timer in `useWardrobe` with fake timers and a fake repo.
- Manual: set a 60-second TTL in dev, wait, scroll; check the Network tab.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
