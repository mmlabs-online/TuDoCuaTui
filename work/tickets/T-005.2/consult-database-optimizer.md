# Consult — database-optimizer — T-005.2 (2026-11-12)

Read-only review. I read the ticket, D23–D28, the init migration and its README, server/{items,api,validate,errors,http,drive}.js, test/fake-drive.ts, the server README grep and src/data (repo.http.ts, mappers.ts). I did not read any .env file.

## Findings

1. `item_photos` today (init migration):
   - `storage_path text not null unique`, nullable `width`/`height`, `is_primary`.
   - Partial unique index `item_photos_one_primary (item_id) where is_primary` already exists. No new index is needed for the one-primary rule.
   - The FK index `item_photos_item_idx` exists.
2. `items_with_stats` exposes `primary_photo_path` from `storage_path` through a lateral subquery. `toItemRow` hard-codes `primary_photo_path: null`. T-005.3 (`GET /api/photos/:id`) needs a photo identifier on the wire, and nothing exposes one today.
3. `saveItem` and `removeItem` are the only writers.
   - `removeItem` is a bare `delete from items`. The cascade removes photo rows silently and loses the Drive ids, so it must change.
   - `saveItem` uses the connect/begin/commit pattern with `client.release(err)`. Reuse it.
4. `handleApi` only reads JSON on PUT/POST (`readJson` forces `application/json`, 256 KB cap). A binary route needs its own branch, its own reader and its own `match()` entry.
   - `readJson`'s `error` handler resolves normally. A binary reader must not copy that, or a truncated JPEG would be stored.
5. `drive.js` is sound for this ticket: `createFile` is never retried and accepts `appProperties`, `deleteFile` retries and treats 404 as success, and `MAX_BYTES` is 5 MiB. Gaps:
   - There is no list or find call, so a sweep needs a new `listFiles`.
   - `fake-drive.ts` 404s on `GET /files?q=`. Its `hang` mode never stores the file, so it cannot model "Google accepted, we timed out". It also has no way to fail a delete or an upload on demand.
6. `mapDbError` already maps 23503 to 404 and 23505 to 409, which is enough.

## Recommendations

**R-1. Migration** `db/migrations/20261112xxxxxx_item_photos_drive.sql`. Single transaction, no begin/commit, expand-only. Include a manual-rollback comment block like init.
- `alter table item_photos add column drive_file_id text;`
- `alter table item_photos alter column storage_path drop not null;`
  - Keep `unique` on `storage_path`; NULLs are distinct, so this is fine.
  - The old image never inserts photo rows and only reads the view, so this is expand-safe.
  - The contract step (drop `storage_path`, set `drive_file_id not null`) belongs to T-016 or later.
- `check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$')`. This mirrors `FILE_ID_RE` in drive.js; NULL passes.
- `check (num_nonnulls(storage_path, drive_file_id) >= 1)`, so a row always references something.
- `create unique index item_photos_drive_file_uq on item_photos(drive_file_id) where drive_file_id is not null;`. Two rows must never own one Drive file, because deleting one would break the other.
- Keep the existing one-primary partial index unchanged.
- Do not add `unique(item_id)`. The model allows several photos later. v1 behaviour is "one primary photo, replaced on upload", enforced in code under the item lock (R-3).
- View: `create or replace view items_with_stats`, appending **`primary_photo_id uuid`** as the last column.
  - Postgres only allows `create or replace view` to add columns at the end, so keep the existing column order and types.
  - Keep `primary_photo_path`; it stays null for Drive rows.
  - The lateral subquery selects `id` as well as `storage_path`.
  - Make the order deterministic: `order by ph.is_primary desc, ph.created_at, ph.id`.
- Expose the photo row id, not the Drive id.
  - The client builds `/api/photos/<id>` and never sees Drive ids (R3/R4 spirit).
  - Replace creates a new row with a new id, so the URL changes and T-005.3 can send `Cache-Control: immutable` with no cache-busting.
- Wire: `toItemRow` gains `primary_photo_id`. In mappers, `photo = id ? "/api/photos/" + id : ""` and `photoPath = id`, as the "has a photo" marker for clear-photo logic.
  - Update `ItemRow` type, mappers and tests.
  - The mapper only makes sense once T-005.3 serves the URL. See Risk 6.
- Optional `width`/`height`: accept them as validated query params (ints 1..10000), or parse the JPEG SOF marker server-side. Both columns are nullable, so skipping them is acceptable. Decide in the plan.

**R-2. Upload route** `PUT /api/items/:id/photo` (replace semantics, so PUT), and `DELETE /api/items/:id/photo`. Add them to `match()` with `Allow: PUT, DELETE`.

Request checks, in this order, all before any Drive call:
1. Same uuid and `Sec-Fetch-Site` checks as today.
2. Drive client is null: respond 503 `photos_unavailable` and close or drain the socket.
3. `Content-Type` must be exactly `image/jpeg`, else 415. This allowlist is also a CORS preflight trigger, a free extra CSRF guard.
4. Size cap.
   - Photos are about 150–300 KB after the client resize, so use roughly 2 MiB, below drive.js's 5 MiB.
   - Check `Content-Length` first, and also count streamed bytes (chunked bodies).
   - Return 413 with `Connection: close` and destroy the socket after the response flushes, as `handleApi` does now.
   - Reject Content-Length 0 and empty bodies.
5. Overall body read deadline, for example 30 s, so a slow client cannot hold the handler.
6. Premature close or `!req.complete` returns 400, never a store. Content-Length mismatch returns 400.
7. Magic bytes: `FF D8 FF` at the start. Pass the fixed `"image/jpeg"` to Drive, never the client header.
8. A small semaphore (2–3 concurrent uploads) bounds memory. Single user, so this is cheap.
9. `select 1 from items where id=$1`. Return 404 before spending a Drive call.

**R-3. Write ordering, upload.**
1. `photoId = randomUUID()`. Name the Drive file `${photoId}.jpg` with `appProperties {app:"tudo", photoId, itemId}`. No item name or other PII.
2. `createFile`. On a DriveError, write no row. Map codes generically: `drive_too_large` to 413, config or auth to 503 `photos_unavailable`, others to 502 or 503. Log the code only.
3. Open a tx on a pooled client:
   - `select id from items where id=$1 for update`. This is the per-item mutex. Zero rows means rollback, delete the new Drive file, return 404.
   - `delete from item_photos where item_id=$1 returning drive_file_id` (v1 single photo, so replace is atomic).
   - `insert into item_photos (id, item_id, drive_file_id, is_primary, width, height) values (..., true, ...)`.
   - Commit.
4. On any tx error: rollback, `release(err)`, then `await deleteFile(newId)` in its own try/catch.
   - If that delete also fails, log `{event:"photo_orphan", photoId, code}`. The file is tagged and the sweep will catch it.
   - Return the mapped DB error.
5. After commit, delete the old Drive ids best-effort. A failure is logged and the response is still 200. The orphan is tagged, so the sweep catches it.
6. Do not tie the post-Drive work to `req` close. A client disconnect after `createFile` must still finish the commit or the cleanup.
7. Respond with the `items_with_stats` row via `toItemRow`.

**Delete photo.**
- In a tx: lock the item row, `delete from item_photos where item_id=$1 returning drive_file_id`, commit.
- Then delete the Drive files best-effort and return 204. It is idempotent: no rows is still 204. Item missing returns 404, or 204 like item delete; choose and document it.
- Rows go first. A leaked file is invisible and swept. A row pointing at a missing file would show a broken image.

**Item delete (`removeItem`).**
- In a tx: `select id from items where id=$1 for update`, then `select drive_file_id from item_photos where item_id=$1`, then `delete from items`, commit.
- After the commit, delete the Drive files best-effort. Skip rows whose `drive_file_id` is null (legacy `storage_path`).
- Return 204 even if a Drive delete failed.
- The shared item-row lock orders this against uploads in both directions:
  - If the upload commits first, the delete sees and removes its row.
  - If the delete commits first, the upload's lock returns 0 rows, so it removes its own Drive file and returns 404.
- Lock order is always items, then photos, so there is no deadlock. `saveItem`'s upsert also takes the item lock, which is fine.
- The item PUT must never touch photos. The client sends the photo through the separate endpoint.

**R-4. Idempotency and retries.**
- No idempotency key. A client retry creates a second file and replaces the first, so the end state is one row and one file.
- The server must keep `createFile` unretried. Do not add retry in the handler.
- The client may retry the PUT on network failure. It is safe, apart from the orphan the sweep handles.

**R-5. Orphan cleanup. Tagging alone is not enough; tag plus a sweep.**
- Tag every file with `appProperties {app, photoId, itemId}` (already supported by `createFile`).
- Add `drive.listFiles({ q, pageToken })` to drive.js:
  - Query: `'<folder>' in parents and trashed=false and appProperties has {key='app' and value='tudo'}`.
  - Fields `nextPageToken, files(id, createdTime, appProperties)`, `pageSize` 1000, paginated.
  - The `drive.file` scope lists the files this app created.
  - Same error-code and no-secrets-in-logs discipline as the rest of drive.js.
- Add `server/photo-sweep.js`, modelled on drive-smoke.js. It is a script that is dry-run by default (`--apply` to delete). Do not run it as an in-process timer in v1.
  - It lists tagged files and loads `select drive_file_id from item_photos where drive_file_id is not null`.
  - It deletes only files that are unreferenced AND older than a grace period (at least 15 min, well above the 30 s upload timeout).
  - Re-check the DB for that id immediately before each delete.
  - It never touches untagged files.
  - Rows whose file is missing from Drive are reported, not deleted.
- This covers `createFile` timeouts after Google accepted the file (ticket Notes), a crash between Drive and the DB, a failed post-commit delete, and SQL-level deletes bypassing the app.
- Skip an immediate in-handler lookup after a create timeout. `files.list` search can lag, and the sweep is the reliable path. It can be a later add-on.
- Running the sweep on a schedule is a deploy concern for a follow-up (cron or compose one-shot). T-005.2 ships the script and tests.

**R-6. Tests, against real Postgres plus fake Drive.**

Fake-drive additions:
- list endpoint with `q` support and pagination;
- a "store then hang or 500" upload mode;
- a delete failure mode;
- per-call failure injection.

Schema (extend `schema.db.test.ts`):
- The migration applies over init data (an existing `storage_path` row survives).
- `storage_path` is nullable.
- Both columns null is rejected.
- `drive_file_id` is unique and its format check works.
- A second primary for one item gives 23505; two non-primary rows are allowed.
- Cascade on item delete.
- The view returns `primary_photo_id` null with no photo, and the primary beats an older non-primary.
- Existing view columns keep their order.

API (`api.db.test.ts`):
- Upload creates one Drive file and one row; the bytes match, `appProperties` are set, and the response carries `primary_photo_id`.
- Missing item gives 404, no row, and no Drive file left.
- Drive 5xx or timeout (the `hang` mode) gives an error status and no row.
- DB failure after Drive success: force it with a trigger raising an error on `item_photos` or a failing pool wrapper. The Drive file must be deleted.
- DB failure plus Drive delete failure logs `photo_orphan` and still returns the DB error.
- Replace leaves one row and one file, and the old file is gone.
- Replace where the old Drive delete fails still returns 200 and leaves a swept-later orphan.
- Concurrent uploads (`Promise.all`) leave exactly one row, exactly one Drive file, and both calls 200.
- Upload racing item delete, in both orderings, leaves no row and no file.
- DELETE photo removes row and file, and a second call is also 204.
- Item delete removes its files, and still returns 204 if the Drive delete fails. A legacy `storage_path`-only row is skipped.
- 413 via Content-Length and via chunked body, 415 for a wrong type, 400 for bad magic bytes, 400 for a truncated body.
- 503 with Drive off, 400 for a bad uuid, 405 `Allow` header, 403 for cross-site.
- Existing `listItems` includes `primary_photo_id`.
- A `GET /api/items` shape test covers the new field.

Sweep:
- Unreferenced old tagged file is deleted.
- Referenced file is kept.
- Young file is kept.
- Untagged file is kept.
- Pagination works.
- Dry-run deletes nothing.

Unit and client:
- Mapper and `repo.http` tests: PUT item, then PUT photo for a `data:` or `blob:` photo after `resizeImage`; DELETE when the photo is cleared; a photo-step failure surfaces an error although the item saved.
- Local mode is unchanged (R1).

## Risks

1. Orphans cannot be fully prevented. Create timeout, crash, and failed best-effort delete all leave tagged files. Without the sweep (R-5) these leak forever, so the sweep belongs in this ticket.
2. Lock discipline. If any future writer touches `item_photos` without locking the item row first, the "two uploads" guarantee degrades to the partial index raising 23505, mapped to 409. Document this in the code.
3. `create or replace view` fails if column order or types change. Test it by applying the migration on top of init.
4. Drive quota or auth failure (`drive_auth`, cooldown 60 s) should map to a generic 503. No Google text or ids may reach the client or logs (already the drive.js contract).
5. Memory: a 2 MiB buffer is fine, but the unbounded default Node `requestTimeout` is not. Keep the read deadline and the semaphore.
6. UX gap: until T-005.3 serves `/api/photos/:id`, an uploaded photo will not display. T-005.2 and T-005.3 should ship in one release, or the editor must keep showing the local blob. D27 says M-15 gates the release anyway.
7. A partial save is possible: the item PUT succeeds and the photo PUT fails. The client must surface this and keep the picker state.
8. A permanent `files.delete` skips trash, so there is no undo. This is acceptable and matches the ticket.
9. `mime_type` is not stored. This is fine while the cap is JPEG-only.

## Open questions

1. Confirm `PUT /api/items/:id/photo` (single primary, replace) rather than `POST` plus photo ids. I recommend PUT for v1.
2. Size cap: 2 MiB OK? Should the server also store width/height (query params or SOF parse), or leave them null?
3. Item DELETE and photo DELETE on a missing item: 204 (idempotent) or 404?
4. Sweep: is a script plus a follow-up schedule acceptable, or does Ming want an in-process daily timer? What grace period (I suggest 15 min or more)?
5. Should the migration also add a `byte_size` column for diagnostics? I would skip it.

Relevant files:
- /home/user/TuDoCuaTui/db/migrations/20261110120000_init.sql
- /home/user/TuDoCuaTui/db/migrations/README.md
- /home/user/TuDoCuaTui/server/items.js
- /home/user/TuDoCuaTui/server/api.js
- /home/user/TuDoCuaTui/server/http.js
- /home/user/TuDoCuaTui/server/errors.js
- /home/user/TuDoCuaTui/server/drive.js
- /home/user/TuDoCuaTui/server/test/fake-drive.ts
- /home/user/TuDoCuaTui/src/data/repo.http.ts
- /home/user/TuDoCuaTui/src/data/mappers.ts
