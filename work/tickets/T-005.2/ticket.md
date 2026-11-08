# T-005.2: Upload and delete item photos via Google Drive

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | data, db, security |
| Gate | plan-approval |
| Depends on | T-005.1 |
| Needs Ming | M-7 |
| Attempts | 0 |
| Created | 2026-11-08 |
| Claimed by | — |
| PR | — |

## Goal
In Supabase mode, adding, replacing or deleting an item's photo stores the file in Drive and records its Drive file id. It never leaves orphaned files.

## Feature reference
- Not in `docs/feature-list.md` as written. Ming's decision on 2026-11-08 (chat with Annie): store photos in Google Drive
  the way Ricotdin does, using approach **A** (a Supabase Edge Function holds the Drive credentials). Defaults accepted:
  - Split into T-005.1 to T-005.4.
  - A new OAuth client "TuDoCuaTui" in Ricotdin's Google Cloud project, published "In production".
  - Ricotdin's Google account, folder `TuDoCuaTui/`.
  - Secret names `TUDO_GOOGLE_CLIENT_ID`, `TUDO_GOOGLE_CLIENT_SECRET`, `TUDO_GOOGLE_REFRESH_TOKEN` and
    `TUDO_DRIVE_FOLDER_ID`, in Edge Function secrets of the shared stoktok project.
- Replaces the Storage part of F-202 and of rule R4. Ricotdin's reference design is in `projects/ricotdin/CLAUDE.md`
  (Storage = Google Drive) and `app/web/src/lib/upload/upload.ts`. Ricotdin has a Python backend; TuDo uses an Edge
  Function instead.

## Scope
- New `tudo-drive` actions:
  - Upload. The photo is already resized client-side to a 1200px JPEG.
  - Delete. Deletion is permanent and never goes to the trash.
  - The function checks that the caller owns the item.
- Migration: `tudo_item_photos` stores `drive_file_id` instead of `storage_path`, with RLS in the same migration.
  Regenerate the types.
- `src/data/repo.ts` (Supabase repo): upload and delete through the function, keeping the current rule of leaving no
  orphans. Local mode is unchanged.

## Out of scope
- Showing photos (T-005.3).
- Removing the bucket (T-005.4).
- Moving old Storage photos (the hosted project has none yet).

## Acceptance criteria
- [ ] Uploading a photo creates a Drive file in `TuDoCuaTui/` and a `tudo_item_photos` row with its file id. If the
      row insert fails, the Drive file is deleted.
- [ ] Deleting an item or a photo deletes the Drive file permanently.
- [ ] A user cannot attach, read or delete a photo of an item they do not own. pgTAP tests cover RLS and function
      tests cover the function.
- [ ] Unit tests cover the repo paths. Checks are green. `npx supabase test db` passes.

## Technical notes
- Touches Edge Function secrets and/or migrations, so it needs a security review.
- Risks:
  - The refresh token expires if it goes unused for 6 months, or if the OAuth app is left in "Testing".
  - Images load more slowly because they go through the Edge Function.
  - Drive API quotas.

## Test plan
- Unit: fake fetch for the Google and Drive calls; the repo paths.
- Manual (Ming, after merge): run M-7 smoke, then add, view and delete a photo in Supabase mode on a phone.

## Notes / answers from Ming
- 2026-11-08: approach A and the defaults accepted (questions 2–6, chat with Annie).

## Handoff
