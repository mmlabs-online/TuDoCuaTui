# T-005.2: Upload and delete item photos via Google Drive (API mode)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | data, db, security |
| Gate | plan-approval |
| Depends on | T-005.1 |
| Needs Ming | M-15 |
| Attempts | 0 |
| Created | 2026-11-08 (re-planned 2026-11-11) |
| Claimed by | — |
| PR | — |

## Goal
In API mode, adding, replacing or removing an item's photo stores the resized JPEG in Drive and records its Drive file id; no orphaned files.

## Feature reference
- Ming 2026-11-08: store photos in Google Drive the way Ricotdin does. OAuth client "TuDoCuaTui" in Ricotdin's
  Google Cloud project (published "In production"), Ricotdin's Google account, folder `TuDoCuaTui/`, scope `drive.file`.
- **Re-planned 2026-11-11 on the Node backend (D23, D27):** the Drive credentials live only in the TuDo server's
  runtime env (never in the image, never `VITE_*`, R3); there is no Supabase Edge Function. Ming confirmed Google Drive
  with the account above ("Như đã chốt"). Ricotdin reference: `projects/ricotdin/CLAUDE.md` (Storage = Google Drive),
  `app/web/src/lib/upload/upload.ts`.

## Scope
- Migration (new file, D25): `item_photos` gains `drive_file_id` (expand-only; `storage_path` stays nullable or is
  replaced per the plan); the view exposes what the client needs.
- Endpoints under the guarded `/api`: upload a photo for an item (binary JPEG body, size cap, content-type check),
  delete/replace; ownership is the item id (single user, D25). Drive file deleted when the photo or item is deleted.
- Client: `repo.http.ts` uploads the photo the editor already resizes; the "Sắp có" placeholder is replaced by the
  real picker in API mode; local mode unchanged (R1).

## Out of scope
- Showing photos from Drive (T-005.3). HEIC conversion / 10 MB pre-check (F-202.1).

## Acceptance criteria
- [ ] Uploading creates a Drive file and an `item_photos` row with its id; a failed Drive call leaves no row, a failed DB write deletes the Drive file.
- [ ] Replacing or deleting removes the old Drive file; deleting an item removes its photos.
- [ ] API tests run against real Postgres with a fake Drive; checks green; 390px + dark mode (R9).

## Technical notes
- Request body limit for photos is separate from the 256 KB JSON limit (T-013.2 A21).

## Notes / answers from Ming
- 2026-11-11: Ming put T-016 on hold and asked for photo upload first; Google Drive, account as decided (D27).

## Handoff
