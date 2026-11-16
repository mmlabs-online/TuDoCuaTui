# Consult — database-optimizer — T-021 (2026-11-16)

## Findings

- **Drive layout today.** `createFile` hard-codes `parents: [config.folderId]` (server/drive.js:333). The sweep lists with `'<folderId>' in parents and ... app=tudo` (server/drive.js:74-78, used at photo-sweep.js:63). That query only returns direct children. Once files sit in subfolders, the sweep silently sees none of them and would report every DB row as "missing".
- **Reads and deletes need no change.** They go by `drive_file_id` only (photos.js:87, 329-361), whatever the parent. The flat-folder transition is free for them. Only `createFile`, the sweep listing and the migration script change.
- **There is no users table in this repo's migrations.** `user_id` is a plain uuid in the five tables, with RLS `owner_only` using `app_user_id()` (20261114200000_row_level_security.sql:15-46). A new per-user table should follow the same shape and have no FK to users. Please verify that against the identity code.
- **Transaction limits.** The pool has `max: 5` and `statement_timeout: 5000` (db.js:14-17). `inTx` also forbids nested transactions (db.js:51). Holding a transaction or advisory lock across a Drive HTTP call would pin one of 5 connections for the length of an external call, and it risks the 5 s timeout. Don't do it.
- **Existing lock rule** (photos.js:3-5): items row first, then the per-user quota advisory lock. A folder lookup must not be added inside `withLockedItem`. Put it before `drive.createFile` (photos.js:238) in its own short `withUser` transaction. That adds no lock-order edge.
- **Maintenance role.** `withMaintenance` accepts only tasks in `MAINTENANCE_TASKS = ["photo-sweep"]` (db.js:40). It runs read-only and sets no user. The SELECT-only policy `photo_sweep_read` is tied to that exact string (RLS migration :48-49). A migration script therefore cannot write `user_drive_folders` under `withMaintenance`. It must write through `withUser(pool, ownerId, ...)`, one transaction per user.
- **Indexes.** `item_photos_drive_file_uq` (partial unique on `drive_file_id`) already exists (20261112120000_item_photos_drive.sql:21). The migration reads all rows once into a `Map<drive_file_id, user_id>`, so no new index is needed.

## Recommendations

**1. Store the folder id in the DB, and do not rely on lookup-only or in-memory.**
- A DB row is the only cross-process arbiter. Drive has no uniqueness on names, so a lookup followed by a create is racy.
- An in-memory cache is lost on restart, and a second instance would create a duplicate.
- Use a new table rather than a column. No existing per-user table is a natural home: `ai_settings` is optional and tied to AI, and the other four are domain rows.
- Add a Drive-side fallback so a lost DB row can be recovered. Name the folder `<user_id>` and set `appProperties {app:"tudo", userId, kind:"user-folder"}`, so a folder can be traced to its owner without the DB (the ticket goal).

**2. Migration (new file `db/migrations/<ts>_user_drive_folders.sql`; R2, RLS in the same file).**
```
create table user_drive_folders (
  user_id uuid primary key,
  folder_id text not null check (folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),  -- same regex as drive_file_id
  created_at timestamptz not null default now()
);
alter table user_drive_folders enable row level security;
alter table user_drive_folders force row level security;
create policy owner_only on user_drive_folders for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));
```
- Add a manual-rollback comment block in the house style, for example `drop table user_drive_folders;`.
- Add the table to whatever RLS and scoping tests enumerate tables. The ticket mentions `scoping.test.ts`. Check whether a test asserts that every table has FORCE RLS.
- The primary key is the lookup index, so no extra index.
- `folder_id` is not unique-constrained. Two users never share a folder. Add `unique (folder_id)` anyway if you want a cheap guard.
- Do not run `drive.createFolder` from the migration. It is SQL only.

**3. Race-safe `ensureUserFolder(pool, drive, userId)`**, called from `putPhoto` just before `createFile`, inside the existing try so failures map to 502/503 and refund the quota ticket as today. Steps:
1. A per-process single-flight map keyed by `userId` (see server/inflight.js) coalesces concurrent calls in one process.
2. `withUser(..., readOnly)` runs `select folder_id from user_drive_folders where user_id = $1`. If a row exists, return it.
3. Otherwise search Drive for a non-trashed folder in the root with `name = userId` and `appProperties.userId = userId`. If several exist, take the oldest by `createdTime`. If none, `createFolder`. This needs a new `drive.createFolder` and a `findFolder` or a folders mode on `listFiles`.
4. A short `withUser` write transaction runs `insert ... on conflict (user_id) do nothing returning folder_id`.
   - If nothing is returned, a concurrent creator won. Select the winner's row. If you created the folder yourself in step 3, delete it best-effort with `deleteFiles`-style logging that carries user ids only. If you found it by lookup, leave it alone.
   - Never hold a transaction or advisory lock during the Drive calls in step 3.
5. Stale id: if `createFile` fails with the folder-not-found code, delete the row, re-ensure once, and retry once. Otherwise a manually deleted or trashed folder leaves the user stuck on 503 (the config error list at photos.js:248 includes `drive_folder_not_found`).
- Test for the acceptance criterion "two concurrent first uploads create exactly one subfolder": fake Drive with a counter plus a real or fake pool that enforces the unique key. Run two `ensureUserFolder` calls through different single-flight maps, or bypass the single-flight, so the DB conflict path is actually exercised.

**4. Photo sweep.**
- List the root's child folders from Drive (`mimeType='application/vnd.google-apps.folder' and '<root>' in parents and trashed=false`). Then list the tagged files in the root and in each of those folders.
- This avoids a new maintenance policy on `user_drive_folders` and also covers folders whose DB row was lost. Folders created outside the app are included, but the `app=tudo` filter on files still protects other content.
- Keep the page-token loop guards (`MAX_PAGES`, seen-token set) across all listings.

**5. Migration script (`server/photo-folders-migrate.js`, modelled on photo-sweep.js).**
- Read `(user_id, id, drive_file_id)` for all rows with `drive_file_id is not null` through maintenance read access. Two options:
  - (a) Reuse the `"photo-sweep"` task. This needs no migration, but the name is misleading.
  - (b) Preferred for least privilege: add the task `"photo-folders"` to `MAINTENANCE_TASKS` and a second SELECT-only policy `photo_folders_read on item_photos` using `current_setting('tudo.maintenance', true) = 'photo-folders'`. Put it in the same new migration as step 2. Policies on a table are OR-ed, so `photo_sweep_read` stays untouched. Never edit an applied migration.
- List the flat root's tagged files. These are the unmigrated set, so the script is naturally resumable: a moved file no longer lists in the root. For each file:
  - Look up its owner in the map. With no DB row, report the photo id or "-" only and do not move it. This matches the sweep and the acceptance criterion.
  - Dry-run prints "would move" lines and counts.
  - On `--apply`: call `ensureUserFolder` via `withUser` for that owner (cached per run), re-check the DB row, then do one `files.update` with `addParents=<sub>`, `removeParents=<root>` and `appProperties {userId}`.
  - Treat a Drive 404 on the file as skipped, not a failure.
- Add a `--max-move N` cap and a refuse-if-no-rows-match guard like the sweep's (photo-sweep.js:115-119).
- Use counts and photo row uuids only in output, never Drive ids or folder ids.
- Concurrent live uploads already target subfolders, and delete and replace by id are parent-independent. So the script can run while the app is up, with no maintenance window.

**6. Other items.**
- `appProperties.userId` goes into `createFile` (photos.js:242).
- Extend `server/drive.js` with `createFolder`, a folders list or `findFolder`, and `moveFile`. Keep the existing `DriveError` codes and the rule that no Drive text or ids are logged.
- Add a README section describing the layout and runbook: dry-run, `--apply`, then run the sweep. Note that folder ids in `user_drive_folders` are not secrets but also not logged.

## Risks

- **Duplicate folders.** There is a small window of two Drive folders for one user (a lookup-miss race across processes). The DB unique key still keeps one winner, and the loser deletes its own folder. Residual impact is an empty folder, and the sweep ignores folders.
- **Stale or deleted folder id.** Handled by step 5. Untested, it would show as a permanent 503 for that user.
- **Sweep regression.** If the sweep change ships without the folder listing, `--apply` could mis-handle files. The existing "refusing: no listed file is referenced" guard would catch the worst case, but test the subfolder listing explicitly.
- **High-risk tier.** `db/migrations/**` is High tier and the ticket has Gate plan-approval, so Ming must approve the plan. Applying the migration to production is Ming's step. Deploy order: migration, then the new image, then the migration script, then the sweep. An older image keeps writing to the flat folder, and the script's next run moves those files.
- **Quota or ordering.** Folder creation happens before the Drive file is stored (`onDriveStored` at photos.js:244). A folder-creation failure is refunded, which is correct. Do not move the folder call after `onDriveStored`.
- **`user_id` as a folder name.** This is acceptable (uuid, from the verified session, never user input). Ensure `userId` is validated through `toUserId` as in `withUser`.

## Open questions

1. Is there a users table or FK convention for `user_id` in the identity code? I saw none in the migrations.
2. Choose option (a) or (b) for the maintenance read policy used by the migration script. I recommend (b).
3. Should empty user folders be removed when a user is deleted? Out of scope today, but worth a follow-up.
4. Does the Drive client's `files.update` (move) need an added scope? The current scope should allow it since the app created the files. Confirm with `drive-smoke.js`.

Files reviewed: work/tickets/T-021/ticket.md, server/photos.js, server/db.js, server/photo-sweep.js, server/drive.js, db/migrations/20261114200000_row_level_security.sql, db/migrations/20261112120000_item_photos_drive.sql.
