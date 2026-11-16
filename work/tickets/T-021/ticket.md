# T-021: Per-user Google Drive folders for photos

| Field | Value |
|---|---|
| State | REWORK |
| Priority | P2 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | architecture, db, security |
| Gate | plan-approval |
| Depends on | T-019.14 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-16 |
| Claimed by | claude@2026-11-16T03:46:13Z |
| PR | — |

## Goal
Every user's photos live in their own subfolder of the TuDo Drive folder (`TuDoCuaTui/<user_id>/`), so the Drive is organised per user and a file can be traced to its owner without the database.

## Feature reference
Ming, 2026-11-16: "mức độ đầy đủ" (per-user folders, full option). Follow-up named in T-019.13 / T-019.14 (Out of scope: "Per-user Drive folders and `appProperties.userId`") and the T-019.2 consult. Photos stay in Ming's (Ricotdin's) Drive (D27, D38); this does not change whose Drive or the quotas (T-019.14).

## Scope
- New uploads go to `TuDoCuaTui/<user_id>/`; the server finds or creates the user's subfolder on first upload (race-safe, one folder per user; cache the folder id, e.g. in the DB or in memory with a lookup by name/appProperties).
- Tag every new file with `appProperties.userId` as well (`app`, `photoId`, `itemId` stay).
- One-off migration script (dry-run by default, like `photo-sweep.js`) that moves existing files from the flat folder into each owner's subfolder (owner from `item_photos.user_id`) and adds `userId`; idempotent and resumable; prints ids and counts only.
- `photo-sweep.js` and the read/delete paths keep working for files in subfolders and in the old flat folder during the transition.
- Docs: `server/README.md` (Drive layout, migration runbook).

## Out of scope
- Moving photos to another storage or to each user's own Drive; quota changes; UI changes.

## Acceptance criteria
- [ ] A new upload by user A lands in `TuDoCuaTui/<A's user_id>/` with `appProperties.userId = A`; two concurrent first uploads by A create exactly one subfolder (test).
- [ ] Reads, replaces and deletes work for files in a subfolder and for not-yet-migrated files in the flat folder (tests).
- [ ] The migration script (dry-run default, `--apply`) moves each existing file into its owner's subfolder and is idempotent; files without a DB row are reported, not moved (tests with the fake Drive).
- [ ] `photo-sweep.js` finds orphans in subfolders too (test).
- [ ] No email, token or Drive secret is logged; user ids only. All checks pass.

## Notes / answers from Ming
- 2026-11-16 (Ming: "duyệt T-021"): **Plan approved** with the defaults: C1 folder-id cache in memory (no DB migration), C2 the script reads via the existing `photo-sweep` maintenance task. Recorded as D41.
- 2026-11-16 (Ming): chose the full option (per-user subfolders + migration of existing photos), not only `appProperties.userId`.

## Handoff

### 2026-11-16 — claude — BLOCKED
- Done: architect + database consults; plan.md READY with two choices for Ming: C1 folder-id cache (default in memory, alt `user_drive_folders` table with RLS) and C2 script read (default reuse `photo-sweep` maintenance task, alt new task + policy migration). Folders tagged `app:"tudo-folder"` so the sweep never treats them as photos.
- In progress / next: Ming approves (and picks C1/C2); record D41; implement.
- Gotchas: ~500 lines (fallback split T-021.1/T-021.2 in the plan); CLAUDE.md still names `supabase/migrations/` though the repo uses `db/migrations/`.
