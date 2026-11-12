Status: READY

# Plan — T-005.2: Upload and delete item photos via Google Drive (API mode)

Gate: plan-approval (High tier: new migration). Ming confirms or changes assumptions A1–A19 below.
This plan covers **slice 1** only. The orphan sweep is proposed as T-005.6 (see Split proposal).

## Feature summary
- docs/feature-list.md M1 goal: "CRUD with photos works".
- docs/feature-list.md F-202: "Accept JPEG, PNG, WebP and **HEIC** … reject files over 10 MB before resizing". Those parts are F-202.1 and are out of scope here (ticket Out of scope).
- work/decisions.md D27: "Item photos are stored in Ming's Google Drive folder `TuDoCuaTui/` … handled only by the TuDo Node server: OAuth refresh token and client secret in the server's runtime env only (R3); uploads/deletes through `/api`; images served by `GET /api/photos/:id` behind the Cloudflare Access check (no signed URLs)."
- D23: "Photos go to Google Drive via the backend."
- D25: "schema changes are a new SQL file in the TuDo migrations folder, applied only by the `migrate` one-shot service; never edit an applied migration … tables do not use RLS" while the app is single-user.
- Ticket goal: "In API mode, adding, replacing or removing an item's photo stores the resized JPEG in Drive and records its Drive file id; no orphaned files."
- Ticket notes (Ming, 2026-11-12): "M-15 is no longer a prerequisite for the code (tests use a fake Drive). M-15 must be done before the release that ships photos."
- Ticket notes (from the T-005.1 review): "Clean up a Drive file left behind when `createFile` times out after Google accepted it". Slice 1 tags every file so it can be found later; the cleanup itself is the sweep in T-005.6. "check the photo MIME type against an allowlist before calling Drive" is covered by A2 and step 4 of the Approach.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Uploading creates a Drive file and an `item_photos` row with its id. | `api.db.test.ts › PUT photo creates one Drive file and one row`: the fake Drive holds exactly one file whose bytes equal the request body, with `appProperties {app:"tudo", photoId, itemId}` and mimeType `image/jpeg`. The row has `drive_file_id` = that id and `is_primary` true. The response `item.primary_photo_id` = the row id. |
| 1a | A failed Drive call leaves no row. | `api.db.test.ts › Drive 500 on create -> 502, no row`. `› Drive timeout on create -> 502, no row`. `› Drive stores then times out -> 502, no row, tagged file left for the sweep`. |
| 1b | A failed DB write deletes the Drive file. | `api.db.test.ts › DB insert fails after Drive success -> Drive file deleted, 500`, using a test trigger that raises on insert into `item_photos`. `› DB fails and Drive delete fails -> logs photo_orphan, still 500`. `› item deleted between pre-check and lock -> 404, Drive file deleted`. |
| 2 | Replacing removes the old Drive file. | `api.db.test.ts › second PUT replaces: one row, one file, old file gone`. `› replace with failing old-file delete -> 200, new row, logs photo_orphan`. `› concurrent PUTs -> both 200, exactly one row and one file`. |
| 2a | Deleting the photo removes the old Drive file. | `api.db.test.ts › DELETE photo removes row and file; second DELETE is 204`. |
| 2b | Deleting an item removes its photos. | `api.db.test.ts › DELETE item removes its Drive files`. `› DELETE item with failing Drive delete -> 204, row gone, logs photo_orphan`. `› DELETE item skips legacy storage_path-only rows`. |
| 3 | API tests run against real Postgres with a fake Drive. | The `api.db.test.ts` and `schema.db.test.ts` cases above run under `describe.skipIf(!dbAvailable)`, the same as today, using `server/test/fake-drive.ts`. |
| 3a | Checks are green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass. |
| 3b | Works at 390px and in dark mode (R9). | Run the app in API mode at 390px in light and dark (or `App.test.tsx` plus a manual check). The editor shows the real picker (no "Sắp có"), the "Ảnh đã lưu" state for a stored photo, and the "Bỏ ảnh" button, with no overflow. |
| 4 | Local mode is unchanged (R1). | The existing `Editor.test.tsx`, `repo.local.test.ts` and `App.test.tsx` local-mode tests still pass. New `Editor.test.tsx › local mode: remove photo clears only photo` passes. |
| 5 | Only `image/jpeg` reaches Drive, within a size cap. | `api.db.test.ts › 415 for image/png`. `› 413 via Content-Length`. `› 413 via chunked body over 2 MiB`. `› 400 invalid_photo for empty body`. `› 400 invalid_photo for bad magic bytes`. `› 400 for truncated body`. None of these make a Drive request (checked with `fake.requests`). |

## Ming verification after merge
- M-15 (Drive connected in production) is required before the release that ships photos. T-005.3 must ship in the same release (A8).
- After that release, on a real phone in API mode:
  - add an item with a photo; the file appears in Drive `TuDoCuaTui/` as `<uuid>.jpg`;
  - replace the photo; the old file is gone from Drive;
  - remove the photo; the file is gone;
  - delete an item; its file is gone.
- Apply the migration through the `migrate` service. This happens automatically on deploy (D24).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261112120000_item_photos_drive.sql` (new) | Add `drive_file_id text` with a format check and a partial unique index. Make `storage_path` nullable. Add `check num_nonnulls(storage_path, drive_file_id) >= 1`. `create or replace view items_with_stats` appending `primary_photo_id` as the last column. Manual-rollback comment. | Scope "item_photos gains drive_file_id; the view exposes what the client needs" (D25: a new file, expand-only) |
| `server/photos.js` (new) | `handlePhoto(req, res, ctx)` handles PUT and DELETE `/api/items/:id/photo`. Also: the body reader (cap, deadline, truncation), the magic-byte check, the upload semaphore, the transactional write, Drive error mapping, and `deleteDriveFiles()` for best-effort cleanup. | Upload, replace and delete endpoints |
| `server/api.js` | Add `match()` entry `/api/items/:id/photo` with `Allow: PUT, DELETE`. Dispatch to `handlePhoto` after the existing method, `Sec-Fetch-Site` and uuid checks, before `readJson`. After `removeItem`, call `deleteDriveFiles`. Accept `drive` in ctx. | Routing from the raw pathname inside the guarded branch (README router note) |
| `server/items.js` | `toItemRow` adds `primary_photo_id`. `removeItem` runs in a transaction: lock the item row, select its photo ids and `drive_file_id`s, delete the item, commit, return the photos. Add a lock-discipline comment. | AC 2b. The wire field the client needs. |
| `server/app.js` | `createApp` accepts `drive` (client or null) and passes it to `handleApi`. | Wire Drive into the app |
| `server/index.js` | When `loadDriveConfig` is `on`, create `createDriveClient({ config, log })` and pass it to `createApp`. Update the stale comment on line 38. Drive stays out of `/readyz`. | Wire Drive into the app |
| `server/README.md` | Document the photo endpoints, the new error codes, `primary_photo_id` on `ItemRow`, the 2 MiB cap, Drive file naming and tags, the lock rule, and that item delete with Drive off leaves tagged files. | Contract docs (the server README is the API contract) |
| `server/test/fake-drive.ts` | Add `fail: Set<"upload" \| "delete">` to return 500. Add a `hang` mode `"upload-after-store"` that stores the file and then never answers. | Failure injection for AC 1a, 1b, 2 and 2b |
| `src/data/repo.http.ts` | `ApiItemRow` gains `primary_photo_id`. Item mapping sets `photoPath = primary_photo_id` and `photo = ""` (T-005.3 sets the URL). `save()`: PUT the item, then PUT the photo for a `data:`/`blob:` photo after `resizeImage`, or DELETE when the stored photo was removed. A failed photo step throws `PhotoSaveError` carrying the saved item. `resize` is injectable. | Scope "repo.http.ts uploads the photo the editor already resizes" |
| `src/data/apiErrors.ts` | Add Vietnamese copy for `photos_unavailable`, `photo_upload_failed`, `invalid_photo`, `request_timeout`, and the partial-save message. Add `class PhotoSaveError`. | R6 (copy in one place) and consult Risk 7 |
| `src/data/useWardrobe.ts` | On `PhotoSaveError`, `upsertLocal(e.item)` and rethrow. | Keep the grid consistent after a partial save |
| `src/App.tsx` | Drop `photoUpload={…}` and pass `photoById={wardrobe.mode === "api"}`. In `save()`'s catch, on `PhotoSaveError`, set `editor.id` to the saved id and `isNew` to false (the editor stays open with the picked photo), so a retry updates instead of creating a second item. | Partial save without duplicate items |
| `src/features/items/Editor.tsx` | Remove the "Sắp có" branch and the `photoUpload` prop. The picker is always shown. Add a "stored photo, not displayed yet" state when `!item.photo && item.photoPath && !isNew`. "Bỏ ảnh" shows when `item.photo \|\| (photoById && item.photoPath)`. With `photoById` it also clears `photoPath`. | Scope "placeholder replaced by the real picker in API mode", and A8 |
| `src/features/items/copy.ts` | Remove `comingSoon` and `comingSoonHint`. Add `photo.stored` and `photo.storedHint`. | R6 |
| `src/types/item.ts` | Comment on `photoPath`: "Supabase: storage path; API: item_photos id". | Accuracy of the shared type |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/schema.db.test.ts › migration applies over init data; a storage_path row survives` (apply init only from a temp dir, insert, then apply all) | Expand-safety (consult Risk 3) |
| `server/schema.db.test.ts › storage_path nullable; both null rejected (23514); drive_file_id format check; drive_file_id unique (23505)` | Constraints |
| `server/schema.db.test.ts › second primary photo for one item -> 23505; two non-primary allowed` | Existing one-primary index unchanged |
| `server/schema.db.test.ts › items_with_stats columns: existing order kept, primary_photo_id last` (update the existing column-list test) | `create or replace view` contract |
| `server/schema.db.test.ts › primary_photo_id null without photo; primary beats older non-primary; cascade on item delete` | View semantics |
| `server/api.db.test.ts › PUT photo creates one Drive file and one row` (bytes, appProperties, name `<photoId>.jpg`, mimeType, response `primary_photo_id`) | AC 1 |
| `server/api.db.test.ts › PUT photo for missing item -> 404, no Drive request, no row` | A4 |
| `server/api.db.test.ts › Drive 500 on create -> 502 photo_upload_failed, no row` | AC 1a |
| `server/api.db.test.ts › Drive timeout on create -> 502, no row` (`hang "upload"`, short `timeouts.upload`) | AC 1a |
| `server/api.db.test.ts › Drive stores then times out -> 502, no row, tagged file remains` (documents the orphan T-005.6 sweeps) | AC 1a and ticket note |
| `server/api.db.test.ts › DB insert fails after Drive success -> 500, Drive file deleted` (test trigger) | AC 1b |
| `server/api.db.test.ts › DB fails and Drive delete fails -> 500, logs {event:"photo_orphan"}` | AC 1b |
| `server/api.db.test.ts › item deleted between pre-check and lock -> 404, Drive file deleted` (drive `createFile` wrapper deletes the item before resolving) | Race with item delete |
| `server/api.db.test.ts › second PUT replaces: one row, one file, old file gone` | AC 2 |
| `server/api.db.test.ts › replace with failing old-file delete -> 200, logs photo_orphan` | AC 2 |
| `server/api.db.test.ts › concurrent PUTs -> both 200, one row, one file` | Lock discipline |
| `server/api.db.test.ts › DELETE photo removes row and file; second DELETE 204; DELETE photo on missing item 204` | AC 2a, A4 |
| `server/api.db.test.ts › DELETE item removes its Drive files; failing Drive delete still 204; legacy storage_path row skipped` | AC 2b |
| `server/api.db.test.ts › 415 image/png; 413 Content-Length; 413 chunked over cap; 400 empty; 400 bad magic; 400 truncated; no Drive request in any` | AC 5 |
| `server/api.db.test.ts › photo routes: 503 photos_unavailable when drive is null; 405 with Allow "PUT, DELETE"; 403 cross-site; 400 bad uuid` | Guards |
| `server/api.db.test.ts › GET /api/items and PUT /api/items/:id carry primary_photo_id` (update the existing shape test: `primary_photo_path` stays null) | Wire shape |
| `server/api.db.test.ts › item PUT never touches photos` | Consult R-3 |
| `server/api.test.ts › photo PUT without pool -> 503 db_unavailable after header checks` (no DB needed) | Pre-DB path |
| `src/data/repo.http.test.ts › save with data: photo -> PUT item, then PUT /items/:id/photo with image/jpeg body from resize` | Client upload |
| `src/data/repo.http.test.ts › save after removing stored photo (photoPath cleared, row has primary_photo_id) -> DELETE /items/:id/photo` | Client delete |
| `src/data/repo.http.test.ts › save with unchanged stored photo -> no photo request` | No accidental delete |
| `src/data/repo.http.test.ts › photo step fails -> PhotoSaveError with saved item and Vietnamese message` | Consult Risk 7 |
| `src/data/repo.http.test.ts › http(s) photo URL is not uploaded` | A11 |
| `src/data/repo.http.test.ts › list maps primary_photo_id to photoPath, photo ""` | Interim mapping |
| `src/data/apiErrors.test.ts › new codes map to Vietnamese copy` | R6 |
| `src/features/items/Editor.test.tsx` (replace the "photoUpload off" block) `› API mode shows picker, no "Sắp có"`, `› stored photo shows "Ảnh đã lưu" state`, `› Bỏ ảnh with photoById clears photo and photoPath`, `› local mode: Bỏ ảnh clears only photo` | Editor behaviour, R1 |
| `src/App.test.tsx › API mode: photo step fails -> toast, editor stays open, retry PUTs the same item id` | No duplicate item on retry |

## Approach
1. **Migration** (D25, R5). Write `20261112120000_item_photos_drive.sql` following consult R-1. No `begin`/`commit`. No new derived columns.
   - `alter table item_photos add column drive_file_id text check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$')`.
   - `alter column storage_path drop not null`. Keep its `unique`.
   - `add constraint item_photos_ref_chk check (num_nonnulls(storage_path, drive_file_id) >= 1)`.
   - `create unique index item_photos_drive_file_uq on item_photos(drive_file_id) where drive_file_id is not null`.
   - `create or replace view items_with_stats`: same columns in the same order, plus `p.id as primary_photo_id` last. The lateral subquery selects `id, storage_path` and orders by `is_primary desc, created_at, id`.
   - Add a manual-rollback comment block, as in init.
   - Old images keep working (expand-only), per the migrations README.
2. **Wiring.** `index.js` creates the Drive client when configured. `createApp({ …, drive })` passes it to `handleApi({ …, drive })`. Tests pass a client built on the fake (`urls`, `sleep: async () => {}`, small `timeouts`).
3. **Routing** in `api.js`, inside the guarded branch, from the same raw `pathname`:
   - `match()` gains `parts.length === 5 && a === "items" && b && c === "photo"` → `{ route: "/api/items/:id/photo", allow: "PUT, DELETE" }`.
   - The existing 405, `Sec-Fetch-Site` and uuid checks run first.
   - Then `if (m.route === "/api/items/:id/photo") return handlePhoto(...)` **before** the `readJson` block.
4. **PUT photo** (`server/photos.js`). Checks in this order; nothing reaches Drive until all pass.
   1. `Content-Type` (before `;`, lower-cased) must be exactly `image/jpeg`, else 415 `unsupported_media_type`. This is the MIME allowlist from the ticket note.
   2. `Content-Length` > 2 MiB → 413 `payload_too_large` with `Connection: close`, and destroy the socket on `finish`, as `handleApi` does now.
   3. `drive` null → 503 `photos_unavailable`. `pool` null → 503 `db_unavailable`. Both close the connection the same way, because the body is unread.
   4. Semaphore: 3 or more photo PUTs in flight → 503 `photos_unavailable` with `Retry-After: 5`.
   5. Read the body.
      - Count streamed bytes; past the cap → 413.
      - 30 s deadline → 408 `request_timeout` plus close.
      - Premature `close`/`aborted`, `!req.complete`, or a byte count different from `Content-Length` → 400 `invalid_photo`.
      - Unlike `readJson`, an `error` event rejects; it never resolves with partial data.
   6. Empty body, or the first bytes not `FF D8 FF` → 400 `invalid_photo`.
   7. `select 1 from items where id = $1`. No row → 404 `not_found`, and no Drive call.
   8. `photoId = randomUUID()`. `drive.createFile({ name: photoId + ".jpg", mimeType: "image/jpeg", bytes, appProperties: { app: "tudo", photoId, itemId } })`. The mimeType is a constant, never the client header. No retry in the handler.
      - On `DriveError`: `drive_auth`, `drive_forbidden`, `drive_not_found` or `drive_folder_not_found` → 503 `photos_unavailable`; anything else → 502 `photo_upload_failed`.
      - Log `{event:"photo_upload_failed", code}` only.
   9. Transaction on `pool.connect()`, using the `saveItem` pattern:
      - `select id from items where id = $1 for update`. Zero rows → rollback, delete the new file, 404.
      - `delete from item_photos where item_id = $1 returning id, drive_file_id`.
      - `insert into item_photos (id, item_id, drive_file_id, is_primary) values ($1, $2, $3, true)`.
      - Commit.
      - On any error: rollback, `release(err)`, `deleteDriveFiles([new])` (failure is logged as `{event:"photo_orphan", photoId, code}`), then `mapDbError` and the existing `db_error` log.
   10. After commit, run `deleteDriveFiles(old ids)` best-effort. Respond 200 `{ item: toItemRow(row) }`.
   11. Nothing after `createFile` depends on `req` staying open (consult R-3.6).
5. **DELETE photo.**
   - `drive` null → 503 `photos_unavailable` (rows untouched). `pool` null → 503.
   - In a transaction: lock the item row (zero rows → commit and 204, A4); `delete from item_photos where item_id = $1 returning id, drive_file_id`; commit.
   - Then `deleteDriveFiles` best-effort, then 204. Rows go before files, so a failure leaves an invisible tagged file rather than a broken row.
6. **DELETE item.**
   - `removeItem` becomes a transaction: lock the item, select its photos, delete the item, commit. It returns `[{id, drive_file_id}]`.
   - `api.js` then calls `deleteDriveFiles` for non-null ids and returns 204, the same as today.
   - With `drive` null, the files are left and `photo_orphan` is logged (A9).
   - Comment in `items.js`: "Every writer of item_photos locks the items row first (items → item_photos), see T-005.2". The lock order is the same everywhere, so there is no deadlock.
7. **`deleteDriveFiles(drive, photos, log)`** runs sequentially, `await drive.deleteFile(id)` in try/catch, and logs `{event:"photo_orphan", photoId, code}`. It never logs Drive ids or messages. This follows the drive.js logging contract (R3).
8. **Client** (`repo.http.ts`). `save(item)`:
   1. PUT the item → `row`.
   2. If `item.photo` starts with `data:` or `blob:`: `resize(await urlToBlob(item.photo))`, then PUT `/items/{id}/photo` (body = blob, `Content-Type: image/jpeg`) → `row`.
   3. Else if `row.primary_photo_id && !item.photoPath`: DELETE `/items/{id}/photo` and set `row.primary_photo_id = null`.
   4. Else, for an `http(s)` photo or an unchanged stored photo: no photo request.
   5. Steps 2–3 failing throws `new PhotoSaveError(toItem(row), cause)`.
   - The binary call reuses `call()`'s error handling (refactor `call` to accept a raw body and content type).
   - It returns `toItem(row)`: `rowToItem(row, "")` with `photoPath: row.primary_photo_id ?? undefined`.
   - Local mode and `repo.ts` are untouched (R1).
9. **Editor / App** (R6, R9).
   - Remove the "Sắp có" branch and its copy.
   - Add a "stored" state inside `.upload-zone`, reusing the existing classes, so 390px and dark mode inherit current styles: icon, `EDITOR_COPY.photo.stored` "Ảnh đã lưu", and `storedHint` "Ảnh sẽ hiển thị trong bản cập nhật tới · nhấp để đổi ảnh". It shows when `!item.photo && item.photoPath && !isNew`.
   - "Bỏ ảnh" with `photoById` calls `update("photo", "")` and `update("photoPath", undefined)`. Without it, only `photo` is cleared, so Supabase mode semantics are unchanged.
   - `App.save` handles `PhotoSaveError` as in the files table.
10. Run the checks. Update `server/README.md`.

Rules: R1 (local untouched; repo boundary kept), R3 (Drive secrets stay server-side; only photo row ids on the wire; no Google text in logs or responses), R4 spirit (no Drive ids or links to the browser), R5 (nothing derived stored), R6 (copy in `copy.ts` / `apiErrors.ts`), R7 (sweep, display and duplicate-copy are follow-ups), R8 (tests above), R9 (existing classes, manual check), R10 (no Figma files touched), D25 (new migration file, no RLS).

## Specialist input used
`consult-database-optimizer.md`:
- **R-1 adopted**: nullable `storage_path`, `drive_file_id` with format check and partial unique index, `num_nonnulls` check, view column appended last, photo row id on the wire, no `unique(item_id)`. Width/height: neither option adopted; left null (A3).
- **R-2 adopted**: route shape, check order, 2 MiB cap, chunked counting, 30 s deadline, magic bytes, fixed mimeType, semaphore (3), item pre-check. The Drive-off check moved after the cheap header checks; behaviour is the same.
- **R-3 adopted**: write ordering, item-row lock, delete-before-insert replace, compensating delete with `photo_orphan` log, best-effort post-commit deletes, `removeItem` in a transaction. The photo-delete-on-missing-item choice is 204 (A4).
- **R-4 adopted**: no idempotency key; `createFile` never retried.
- **R-5 deferred to T-005.6**: `listFiles` + `server/photo-sweep.js`. Kept here: every file tagged `appProperties {app, photoId, itemId}` so the sweep can find them.
- **R-6 adopted**: tests for the parts in this slice. Sweep tests move to T-005.6.
- **Risks**: 2 (lock comment), 3 (migration-over-init test), 4 (generic 503/502), 5 (deadline and semaphore) and 7 (PhotoSaveError) are handled. Risk 6 → A8. Risk 1 → T-005.6. Risks 8 and 9 accepted.

## Assumptions
- **A1 — Route shape.** `PUT /api/items/:id/photo` uploads or replaces the single primary photo (v1, one photo per item). `DELETE /api/items/:id/photo` removes it. PUT body = raw JPEG bytes. Response 200 `{ item: ItemRow }`.
- **A2 — Size and type.** The cap is 2 MiB (2,097,152 bytes), below drive.js's 5 MiB. It is checked via `Content-Length` and by counting streamed bytes. Only `Content-Type: image/jpeg` is accepted (415 otherwise) and the body must start `FF D8 FF`. The client always sends the output of `resizeImage` (1200 px, quality 0.82, about 150–300 KB). HEIC and the 10 MB pre-check stay in F-202.1.
- **A3 — Width/height.** Not stored in this slice; the columns stay null. No consumer needs them yet (T-005.3 does not). Can be added later as validated query params.
- **A4 — Missing item.** PUT photo → 404 `not_found`, with no Drive file left. DELETE photo → 204, idempotent, matching `DELETE /api/items/:id`. DELETE item is unchanged (204 when gone).
- **A5 — Orphan sweep is split out (T-005.6).**
  - It is a script `server/photo-sweep.js`, dry-run by default and `--apply` to delete.
  - It only touches files tagged `app=tudo`, unreferenced, and older than a grace period of at least 15 minutes (default 60).
  - It re-checks the DB before each delete and only reports rows whose file is missing.
  - Scheduling (cron or compose one-shot in the deployment repo) is a follow-up of T-005.6.
  - Until then, orphans from create timeouts, crashes and failed best-effort deletes stay in Drive, tagged and invisible.
- **A6 — No `byte_size` and no `mime_type` column.** JPEG only.
- **A7 — Wire identifier.** `ItemRow.primary_photo_id` is the `item_photos.id` uuid. Drive file ids never reach the browser. `primary_photo_path` stays and is null for Drive rows. The contract step (drop `storage_path`, `drive_file_id not null`) is for T-016 or later.
- **A8 — Behaviour before T-005.3 (consult Risk 6).**
  - API mode shows the real picker.
  - Right after picking, the editor previews the picked image (data URL), as today.
  - After saving, and after any reload, an item with a stored photo has `photo = ""` and `photoPath = <photo id>`. The grid card shows its normal no-photo look, and the editor shows the "Ảnh đã lưu" state, from which the user can pick a new photo or "Bỏ ảnh".
  - The returned item does not keep the data URL. Keeping it would re-upload on every later save.
  - T-005.3 changes only `photo: ""` → `"/api/photos/<id>"` plus serving. The "Ảnh đã lưu" state then never shows in API mode.
  - **T-005.2 and T-005.3 ship in one release**, which M-15 gates anyway.
- **A9 — Drive not configured.**
  - Photo PUT and DELETE → 503 `photos_unavailable`, with no DB changes.
  - Item DELETE still works. Its Drive files are left in place and logged as `photo_orphan`. They are tagged, so T-005.6 removes them.
  - Blocking item deletion on Drive would be worse for the user.
- **A10 — Partial save.**
  - When the item saves but the photo step fails, the toast says "Đã lưu món đồ nhưng chưa lưu được ảnh — …" followed by the cause.
  - The editor stays open with the picked photo, and its id becomes the saved id with `isNew` false.
  - "Lưu" retries the photo without creating a second item.
- **A11 — External photo URLs.** `http(s)` photos (demo data, CSV import) are not uploaded in API mode. The item saves without a photo. The Supabase repo's best-effort fetch is not copied, because CORS fails for most hosts.
- **A12 — Duplicate.**
  - In API mode, "Tạo bản sao" does not copy a stored photo; the copy saves without one.
  - The duplicate editor shows the empty picker (`isNew`).
  - This conflicts with docs/feature-list.md line 69 ("duplicate (photo copied)"). Flagged as a follow-up: a server-side copy, e.g. Drive `files.copy` plus a new row.
- **A13 — Upload concurrency.** At most 3 photo PUTs in flight per process; more → 503 `photos_unavailable` + `Retry-After: 5`.
- **A14 — Body read deadline.** 30 s → 408 `request_timeout`, `Connection: close`.
- **A15 — Drive file naming.** `<photoId>.jpg` in the configured folder, `appProperties {app:"tudo", photoId, itemId}`. No item name or other personal text.
- **A16 — Error codes added.**
  - 503 `photos_unavailable`
  - 502 `photo_upload_failed`
  - 400 `invalid_photo`
  - 408 `request_timeout`
  - Reused: 413 `payload_too_large` and 415 `unsupported_media_type` (for a photo, its copy reads "Ảnh không hợp lệ"; the copy is chosen client-side by the request kind, or kept generic).
  - All Vietnamese copy lives in `apiErrors.ts`.
- **A17 — Dirty check.** `isDirty` keeps ignoring `photoPath` (an existing test asserts it). Before T-005.3, removing a stored-but-not-shown photo and then closing without saving does not prompt. This is acceptable for the interim.
- **A18 — Hotspot files shared with T-005.3** (runs after this ticket): `server/api.js`, `server/items.js`, `server/README.md`, `src/data/repo.http.ts`, `src/features/items/Editor.tsx`. No other open ticket is planned on them.
- **A19 — Out-of-plan finding, recorded as a follow-up and not changed here (R7).** `server/README.md` line 20 still says the Google values come from "GitHub environment `tudocuatui`"; D28 made them repository secrets. This plan does not touch that line.

## Blocking questions
None. Ming confirms A1–A19 at plan approval (the Gate). The ones most worth a look are A4, A5, A8 and A12.

## Split proposal
The full ticket including the sweep is about 550–600 non-test lines: slice 1 about 370 plus sweep, `listFiles` and README about 180. That is over the ~400 guide.

- **Slice 1 = T-005.2 (this plan).** Migration, Drive wiring, photo PUT/DELETE, item-delete cleanup, file tagging, client upload/remove, editor picker in API mode, fake-drive failure modes. About 370 non-test lines.
- **Slice 2 = T-005.6 (new ticket, proposed): "Sweep orphaned Drive photo files".**
  - `drive.listFiles({ q, pageToken })`, with query `'<folder>' in parents and trashed=false and appProperties has {key='app' and value='tudo'}`, fields `nextPageToken, files(id, createdTime, appProperties)`, and pagination.
  - `server/photo-sweep.js` as described in A5.
  - A fake-drive list endpoint with `q` and pagination.
  - Tests: unreferenced old file deleted; referenced kept; young kept; untagged kept; pagination; dry-run deletes nothing.
  - README runbook.
  - Depends on T-005.2. It covers the ticket note on `createFile` timeouts. It should land before or in the photos release; it is not a hard blocker, since leaked files are tagged and invisible.
  - Follow-up after T-005.6: schedule it in the deployment repo.
- **Other follow-ups (not slices of this ticket):**
  - duplicate copies the stored photo in API mode (A12);
  - server/README D28 wording (A19);
  - optional width/height (A3).
