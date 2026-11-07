# F-603: Bulk photo import

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | ui, data |
| Gate | none |
| Depends on | F-601.3, F-202.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
Ming photographs the closet and turns 30 photos into 30 items in one go.

## Feature reference
`docs/feature-list.md` F-603. Decisions: `work/decisions.md`.

## Scope
- Replace the mock in the "Ảnh hàng loạt" tab: pick or drop N photos; choose a default location and status
  once for the batch.
- Each photo becomes an item named after the file name without the extension (for example `IMG_2031`).
- Process sequentially, with progress showing the current file name and count.
- List failed files with a retry button.
- Run the resize off the main thread (`createImageBitmap` + `OffscreenCanvas` in a worker) when supported;
  otherwise fall back to the main thread.
- Hide the AI checkbox (it is checked by default in the mock, but AI is F-703 in M3); see T-001.

## Out of scope
- AI tagging (F-703).
- Grouping several photos into one item.

## Acceptance criteria
- [ ] 30 phone photos import in one go.
- [ ] The browser does not freeze (no long task over 200 ms in a Performance trace on a mid-range phone).
- [ ] Failed files are listed and can be retried.

## Technical notes
- Files: `src/features/import-export/ImportPhotosTab.tsx`, `src/data/photos.ts` (+ worker), `src/data/useWardrobe.ts`.
- Use object URLs, not data URLs: 30 × 5 MB as base64 is a lot of memory on a phone.
- Expected tier: Medium.

## Test plan
- Unit: batch runner (retry, continue after failure) with a fake repo.
- Manual: 30 photos from an iPhone and an Android phone, in Supabase mode.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
