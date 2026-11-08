# F-202.1: Accept phone photo formats with size check and progress

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui, data |
| Gate | none |
| Depends on | F-004.2, T-005.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
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
- Shared helper `preparePhoto(file)` → `{ blob, width, height }` or a typed error.

## Out of scope
- Several photos per item (F-203).
- Bulk import (F-603).

## Acceptance criteria
- [ ] A photo taken on an iPhone and one taken on an Android phone both upload successfully.
- [ ] A file over 10 MB is rejected with a message and nothing is uploaded.
- [ ] A HEIC file picked on desktop Chrome either uploads or shows a clear error.

## Technical notes
- Files: `src/data/photos.ts`, `src/features/items/Editor.tsx`, `src/data/repo.ts`.
- Notes from the code:
  - The bucket only allows jpeg/png/webp, but every upload is re-encoded to JPEG by `resizeImage`, so the
    bucket list is not what blocks HEIC. The blocker is decoding: Chrome and Firefox cannot decode HEIC in
    `<img>`. Safari can, and iOS usually converts to JPEG when picking with `accept="image/*"`.
  - The 10 MB bucket limit applies to the resized file (about 300 KB), not to the original. The 10 MB input
    limit is a product rule, not a technical need.
- Expected tier: Medium.

## Test plan
- Unit: `preparePhoto` type/size checks (decoding is mocked).
- Manual: iPhone (Safari) and Android (Chrome) camera photos; a HEIC file on desktop Chrome; a 12 MB file.

## Notes / answers from Ming
- 2026-11-08: photos move to Google Drive (T-005.x). Re-scope this ticket to Drive photos served through `tudo-drive` URLs. It starts after T-005.3.
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
