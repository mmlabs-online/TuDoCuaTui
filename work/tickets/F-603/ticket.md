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
- Process sequentially (create the item, then upload its photo), with progress showing the current file name
  and count. Each photo goes through F-202.1's `preparePhoto`, so the same types, HEIC and size rules apply.
- List failed files with a retry button. If the item was created but the photo failed, retry only the photo
  (no duplicate item).
- Handle the server's photo limits: on `429 rate_limited` stop the batch, show how many were imported and when
  to try again (`Retry-After`); on `503` wait and retry once. Before starting, warn when the batch is larger
  than the daily upload limit.
- Run the resize off the main thread (`createImageBitmap` + `OffscreenCanvas` in a worker) when supported;
  otherwise fall back to the main thread. The worker must be allowed by the CSP (`worker-src`).
- Hide the AI checkbox (AI in bulk import is F-703); see T-001.

## Out of scope
- AI tagging (F-703).
- Grouping several photos into one item.

## Acceptance criteria
- [ ] 30 phone photos import in one go.
- [ ] The browser does not freeze (no long task over 200 ms in a Performance trace on a mid-range phone).
- [ ] Failed files are listed and can be retried; a retry never creates a duplicate item.
- [ ] Hitting the daily upload limit stops the batch with a clear Vietnamese message; nothing is lost.
- [ ] 390px and dark mode.

## Technical notes
- Files: `src/features/import-export/ImportPhotosTab.tsx`, `src/data/photos.ts` (+ worker),
  `src/data/useWardrobe.ts`, maybe `src/data/importRunner.ts` (the CSV import runner) if it can be reused.
- Backend (re-scoped 2026-11-17, D23/D44): items are created with `PUT /api/items/:id`, photos with
  `PUT /api/items/:id/photo` (JPEG ≤ 2 MiB, stored on Google Drive). Per-user quotas in
  `server/photoQuota.js`: 50 uploads per rolling day and 500 stored photos (owner exempt), plus a per-user
  concurrent-upload slot (`503` + `Retry-After: 5` when busy). No server change is expected.
- Use object URLs, not data URLs: 30 × 5 MB as base64 is a lot of memory on a phone.
- Expected tier: Medium.

## Test plan
- Unit: batch runner (retry, continue after failure, photo-only retry, stop on 429) with a fake repo.
- Manual: 30 photos from an iPhone and an Android phone, on the real app.

## Notes / answers from Ming
- 2026-11-17: scope refreshed for the current backend (Node API, Drive quotas, no local mode — D44) at Ming's request.
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
