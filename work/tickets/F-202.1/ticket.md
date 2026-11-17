# F-202.1: Accept phone photo formats with size check and progress

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui, data |
| Gate | none |
| Depends on | F-004.2, T-005.2 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-17T12:26:01Z |
| PR | — |

## Goal
Photos taken on an iPhone or Android phone upload successfully, with clear feedback.

## Feature reference
`docs/feature-list.md` F-202 (split F-202.1). Decisions: `work/decisions.md`.

## Scope
- Accept JPEG, PNG, WebP and HEIC. Convert HEIC on the client (lazy-load the converter only when a HEIC file
  is chosen), or show a clear error if conversion fails (decision D4).
- Reject files over 10 MB **before** resizing, with a Vietnamese message (decision D3).
- Show upload progress or a busy state on the photo while saving.
- Use object URLs instead of `FileReader` data URLs for picked files (less memory, and F-603 reuses this).
- Shared helper `preparePhoto(file)` → `{ blob, width, height }` or a typed error. The blob is always a JPEG
  that fits the server's upload limit (see Technical notes); `repo.http.ts` uses it instead of calling
  `resizeImage` directly.
- Map the photo upload errors from the Node API (`413 payload_too_large`, `415 unsupported_media_type`,
  `429 rate_limited`, `503 photos_unavailable`) to Vietnamese messages in the editor.

## Out of scope
- Several photos per item (F-203).
- Bulk import (F-603).

## Acceptance criteria
- [ ] A photo taken on an iPhone and one taken on an Android phone both upload successfully.
- [ ] A file over 10 MB is rejected with a message and nothing is uploaded.
- [ ] A HEIC file picked on desktop Chrome either uploads or shows a clear error.

## Technical notes
- Files: `src/data/photos.ts`, `src/data/repo.http.ts`, `src/features/items/Editor.tsx` (+ its copy).
  No server change is expected.
- Current backend (re-scoped 2026-11-17 for the Node API + Google Drive, D23/D44):
  - Photos upload with `PUT /api/items/:id/photo` (`server/photos.js`): body must be `image/jpeg` and at most
    **2 MiB** (`MAX_BYTES`); Drive stores the file; the app displays `/api/photos/<id>` through blob URLs
    (`usePhotoUrl`). Per-user quotas (`server/photoQuota.js`): 50 uploads per rolling day, 500 stored photos;
    the owner account is exempt.
  - The client already re-encodes every upload to JPEG at max 1200 px (`resizeImage`, quality 0.82), so the
    server's JPEG-only rule is not what blocks HEIC. The blocker is decoding: Chrome and Firefox cannot decode
    HEIC in `<img>`. Safari can, and iOS usually converts to JPEG when picking with `accept="image/*"`.
  - `preparePhoto` must guarantee the output is ≤ 2 MiB (for example, retry at lower quality) so a valid photo
    never hits the 413.
  - The 10 MB input limit (D3) is a product rule on the original file, not a technical need.
  - `Editor.tsx` still reads the picked file with `FileReader.readAsDataURL`; switch to an object URL and
    revoke it on replace/close.
- The HEIC decoder is a new dependency: name it, its licence and bundle size in the plan; it must be
  lazy-loaded (separate chunk) and allowed by the CSP (`script-src 'self'` — no CDN).
- Expected tier: Medium.

## Test plan
- Unit: `preparePhoto` type/size checks and the ≤ 2 MiB guarantee (decoding is mocked); error-code → message
  mapping.
- Manual: iPhone (Safari) and Android (Chrome) camera photos; a HEIC file on desktop Chrome; a 12 MB file.

## Notes / answers from Ming
- 2026-11-17: scope refreshed for the current backend (Node API, Drive, no local mode — D44) at Ming's request.
- 2026-11-08: photos move to Google Drive (T-005.x). Re-scope this ticket to Drive photos served through `tudo-drive` URLs. It starts after T-005.3.
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
