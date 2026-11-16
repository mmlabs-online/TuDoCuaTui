Status: READY

# Plan — T-021: Per-user Google Drive folders for photos

Gate: **plan-approval**. Ming chooses **C1** (folder id cache) and **C2** (how the script reads across users) under *Decisions for Ming* below. If he writes only "Plan approved", the defaults apply (C1 = in memory, C2 = reuse `photo-sweep`). With both defaults this ticket has **no DB migration**.

## Feature summary
This is a T-ticket. It is not in `docs/feature-list.md`. The scope comes from the ticket and these decisions:
- Ticket goal: "Every user's photos live in their own subfolder of the TuDo Drive folder (`TuDoCuaTui/<user_id>/`), so the Drive is organised per user and a file can be traced to its owner without the database."
- Ming, 2026-11-16: "mức độ đầy đủ" (per-user subfolders plus migration of the existing photos, not only `appProperties.userId`).
- D27: "Item photos are stored in Ming's Google Drive folder `TuDoCuaTui/` … scope `drive.file` … handled only by the TuDo Node server". This ticket does not change whose Drive, the scope or the secrets.
- D38: "photos of every user stay in Ming's Drive (D27) with per-user quotas (T-019.14)". Quotas are unchanged.
- Out of scope (ticket): "Moving photos to another storage or to each user's own Drive; quota changes; UI changes."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A new upload by user A lands in `TuDoCuaTui/<A>/` with `appProperties.userId = A`. Two concurrent first uploads by A create exactly one subfolder. | `api.db.test.ts › "PUT photo stores the file in the user's subfolder with appProperties.userId"` and `› "two concurrent first PUTs by one user create exactly one subfolder"`. `driveFolders.test.ts › "concurrent resolves for one user: one lookup, one create"`. Fake Drive state: exactly one file with the folder mimeType, name A, `appProperties {app:"tudo-folder", userId:A}`, parent = root; both photo files have parent = that folder. |
| 2 | Reads, replaces and deletes work for files in a subfolder and for not-yet-migrated files in the flat folder. | `api.db.test.ts › "legacy flat-folder photo: GET streams, replace deletes the flat file, DELETE works"` and `› "subfolder photo: GET streams, DELETE removes the file"`. |
| 3 | The migration script (dry-run by default, `--apply`) moves each existing file into its owner's subfolder and is idempotent. Files without a DB row are reported, not moved. | `photo-relocate.db.test.ts` (list under *Tests to write*): dry-run changes nothing. Apply moves the files and tags them with `userId`. A second apply moves 0 files. An unreferenced file stays in root and is reported. `--max-move` resumes. A 404 counts as `gone`. Runs against the fake Drive and the test Postgres. |
| 4 | `photo-sweep.js` finds orphans in subfolders too. | `photo-sweep.db.test.ts › "an unreferenced old file in a user subfolder is a candidate and deleted on apply"`, `› "referenced files in subfolders are not reported missing"` and `› "folders are never candidates; files under a folder outside the root are not listed"`. |
| 5 | No email, token or Drive secret is logged, only user ids. All checks pass. | Sentinel tests in `photo-relocate.db.test.ts`, `api.db.test.ts › "upload logs carry no folder id, file id, token or Google text"` and `drive-smoke.test.ts`. CI: `pnpm typecheck`, `pnpm format:check`, `pnpm test` and `pnpm build` are all green. |

## Ming verification after merge
These are Ming's steps, in order (default C1/C2; for the alternatives see *Decisions for Ming*). The README runbook carries the exact commands:
1. **Deploy** the new image (release as usual). No migration is needed with the defaults. New uploads now go to `TuDoCuaTui/<user_id>/`.
2. **Smoke:** `node server/drive-smoke.js` in the container must exit 0. It now also proves create-folder → move → read → delete live (scope `drive.file`, `addParents`/`removeParents`). Do not run step 4 unless this passes.
3. **Dry-run:** `node server/photo-relocate.js`. Check `would_move`, `unreferenced` and `mismatch`, and the `would create folder for user <uuid>` lines.
4. **Apply:** `node server/photo-relocate.js --apply` (default `--max-move 100`). Repeat until the dry-run shows `would_move 0`. Any `unreferenced` files stay in the root. They are the sweep's business.
5. **Sweep dry-run:** `node server/photo-sweep.js` must show `missing 0` and a `listed` count that includes the subfolders. Run `--apply` only if it lists real orphans you have checked.
6. In Drive, open `TuDoCuaTui/`: you should see one folder per user named with the user id, and the root should hold no tagged photos. **Never delete or trash a user folder.** That trashes every photo inside it.
- Rollback is safe at any point. An older image reads and deletes by file id, so moved files keep working. It uploads to the flat root again, and the script's next run moves those files.
- After approval the orchestrator records the layout and the C1/C2 choice as **D41** in `work/decisions.md` (on `main`, D16).

## Decisions for Ming

### C1: where the user's folder id is cached. **Default: in memory (architect R-B).**
*Default: in memory.* `server/driveFolders.js` holds an in-flight `Map<userId, Promise>` (single-flight) and a resolved `Map<userId, folderId>`. On a miss it looks the folder up in Drive (`appProperties userId`, child of the root). If there are several results, the oldest `createdTime` wins (id breaks ties). If there are none, it creates the folder. Failures are never cached.
Why this is the default:
- **One process today.** There is one container and one Drive client per process. Single-flight makes AC1 hold for the app outright.
- **A duplicate folder is harmless.** Every read, replace and delete goes by Drive file id. The sweep lists every subfolder. The oldest-folder rule makes later lookups, after a restart or in another process, converge on one folder. The worst case is one extra folder holding a few photos. That is cosmetic, and consolidating it is a follow-up.
- **No migration.** There is no new RLS table and no High-tier DB change. The script stays DB-read-only. Deploy and rollback do not depend on schema order.
- **The ticket allows it:** "cache the folder id, e.g. in the DB or in memory with a lookup by name/appProperties".
Costs: one `files.list` per user per process lifetime. There is a small race window across processes, so a duplicate is possible while the relocation script runs next to the app, or when Drive's search index lags right after a create.

*Alternative C1-DB (database-optimizer rec. 1–3): table `user_drive_folders`.*
- **Migration** `db/migrations/<ts>_user_drive_folders.sql`: `user_id uuid primary key`, `folder_id text not null check (folder_id ~ '^[A-Za-z0-9_-]{10,200}$') unique`, `created_at timestamptz not null default now()`, RLS `enable` + `force`, policy `owner_only` (same shape as the other tables), no FK, manual-rollback comment `drop table user_drive_folders;`.
- **Resolver:** single-flight → `withUser` read (readOnly) → Drive lookup or create, with no transaction open → short `withUser` `insert … on conflict (user_id) do nothing returning folder_id`. The loser re-selects the winner's row and deletes its own folder only if it created it. A stale id (`createFile` → `drive_not_found`) deletes the row; the request fails, with no retry. The script writes rows through `withUser(pool, ownerId, …)`.
- **Extra work:** schema, RLS and migrator tests list the new table (`rls.db.test.ts`, `schema.db.test.ts`, `migrator.db.test.ts` `TABLES`), `scoping.test.ts` `TABLE_RE` gains `user_drive_folders`, and a race test drives the DB conflict path with two resolver instances.
- **Deploy order:** Ming applies the migration → image → smoke → script → sweep.
- Choose this only if a second app instance is planned, or if zero duplicate folders matters even while the script runs live. It adds roughly 150 lines and makes the ticket High tier for DB.
- In both options folders are tagged `app:"tudo-folder"`, never `app:"tudo"` (see *Specialist input used*).

### C2: how the script reads all users' `item_photos`. **Default: reuse `withMaintenance(pool, "photo-sweep", …)`.**
Why this is the default:
- Policy `photo_sweep_read` already grants exactly the needed read: SELECT on `item_photos`, any column, and nothing else.
- A new task name would expose the same rows and columns, so it gains no least privilege, only a clearer name.
- Reusing the task keeps the ticket migration-free.
Cost: the name is misleading. It is documented in a header comment of `photo-relocate.js` and in the README. `scoping.test.ts` adds `photo-relocate.js` to the `withMaintenance` allow-list.

*Alternative C2-task (database-optimizer 5b):*
- `MAINTENANCE_TASKS = ["photo-sweep", "photo-relocate"]`.
- New migration `db/migrations/<ts>_photo_relocate_read.sql`: `create policy photo_relocate_read on item_photos for select using (current_setting('tudo.maintenance', true) = 'photo-relocate');`, manual rollback `drop policy photo_relocate_read on item_photos;`.
- `rls.db.test.ts` updates its expected policy list. A test proves `"photo-relocate"` reads only `item_photos`.
- Deploy order: migration first.
- If Ming picks C1-DB, this costs almost nothing extra (same migration file), and I recommend combining the two.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/drive.js` | See the list below the table. | Architect R-D, DB rec. 6 |
| `server/driveFolders.js` (new) | `createFolderResolver({ drive })` → `{ resolve(userId, { create = true }), forget(userId) }`. Validates `isUuid` first. Single-flight plus resolved map. Lookup with `userFolderQuery` follows pages up to 10. Picks the oldest `createdTime` (null last), then the smallest id. `create:false` returns `null` and does not cache it. Creates the folder named `<userId>` with `appProperties {app:"tudo-folder", userId}`. No logging of its own. | AC1, R-A |
| `server/app.js` | `const folders = drive ? createFolderResolver({ drive }) : null` once per app instance, passed into `handleApi`. | One cache per process |
| `server/api.js` | Pass `folders` through to `handlePhoto` (ctx type). | Wiring |
| `server/photos.js` | See the list below the table. | AC1, R-C |
| `server/photo-sweep.js` | See the list below the table. | AC4, R-E, DB rec. 4 |
| `server/photo-relocate.js` (new) | One-off relocation CLI, see *Approach* step 5. | AC3, R-F, DB rec. 5 |
| `server/drive-smoke.js` | New steps after `read`, see the list below the table. | R-G: prove the move live before `--apply` |
| `server/test/fake-drive.ts` | See the list below the table. | Tests for AC1–4 |
| `server/scoping.test.ts` | `withMaintenance` allow-list → `["db.js", "photo-relocate.js", "photo-sweep.js"]`. Add `photo-relocate.js` to the "never `pool.query(`/`pool.connect(`" list. | The guard pins who may use maintenance |
| `server/README.md` | See the list below the table. | Ticket docs scope |
| Test files | Listed under *Tests to write*: `driveFolders.test.ts` (new), `photo-relocate.db.test.ts` (new), `photo-relocate.cli.test.ts` (new), `api.db.test.ts`, `photo-sweep.db.test.ts`, `drive-smoke.test.ts`, `drive.http.test.ts` (or `drive.test.ts` for pure query builders). | R8 |

**`server/drive.js` changes**
- `createFile` takes an optional `parentId`, which must pass `FOLDER_RE`, else `drive_invalid_id` with no request. It is used for `parents: [parentId ?? config.folderId]`.
- New `createFolder({ name, appProperties })`: metadata-only `POST ${apiBase}/files?fields=id`, JSON body with the folder mimeType and `parents:[config.folderId]`. Not retried (like `createFile`).
- New `moveFile(id, { addParent, removeParent, appProperties })`: `PATCH fileUrl(id)?addParents=&removeParents=&fields=id,parents` built with `URLSearchParams`, JSON body `{appProperties}`. Retried. Both parent ids are checked with `FOLDER_RE`.
- New `getParents(id)`: `GET fileUrl(id)?fields=id,parents` → `string[]`. Malformed → `drive_bad_response`.
- New exported `subfoldersQuery(rootId)` and `userFolderQuery(rootId, userId)`. `userId` must pass `isUuid`, else `drive_invalid_id`.
- `taggedFilesQuery` gains `and mimeType != 'application/vnd.google-apps.folder'`.
- Read-only `rootFolderId` on the client (not a secret, never logged).
- New ops are logged with the existing `{event, op, status, code, reason}` only. `cannotAddParent` is added to `REASONS`.

**`server/photos.js` changes**
- `putPhoto`: after the quota pre-check, `folderId = await folders.resolve(userId)` inside the same `try` as `createFile`. Failures keep the existing 503/502 mapping and the refund.
- `createFile({ …, parentId: folderId, appProperties: { app:"tudo", photoId, itemId, userId } })`.
- On `drive_not_found` from `createFile`: `folders.forget(userId)`, then the existing 503. No retry.
- No silent fallback to the root. Reads and deletes are unchanged.

**`server/photo-sweep.js` changes**
- List the subfolders (`subfoldersQuery`), then `taggedFilesQuery` for the root and each subfolder.
- Shared `MAX_PAGES` budget and seen-token guard for each listing.
- `listed` and `present` = union, deduplicated by id.
- The summary adds `folders N`. Header comment updated.
- The DB query, the guards and the delete logic are unchanged. Folders are never deleted.

**`server/drive-smoke.js` changes**
After `read`: `createFolder` (temporary name `tudo-smoke-folder-<iso>`, `appProperties {tudo:"smoke"}`) → `move` the file into it → `parents` check → `read in folder` → `delete` → `delete folder` → `read after delete`. On failure it still cleans up the file and the folder, and prints `folder left behind: <id>` like the existing file line.

**`server/test/fake-drive.ts` changes**
- Metadata-only `POST /drive/v3/files` (folders).
- `PATCH /drive/v3/files/<id>`: merges `appProperties`. 403 `cannotAddParent` without `removeParents`. 400 if `removeParents` is not a current parent. 404 for an unknown target folder.
- `GET …/files/<id>?fields=` returns JSON metadata (`id, parents, mimeType, trashed`). `alt=media` keeps streaming.
- A create into a parent that is neither the root nor an existing, non-trashed folder → 404 `notFound`.
- The list handler takes three strict regexes: tagged files, subfolders and user folder.
- `fail`/`hang` keys `folder-create`, `move`, `parents`. A `config.folderCreateDelayMs` option. A `folders()` helper.

**`server/README.md` changes**
- New "Drive layout (T-021)" section: `TuDoCuaTui/<user_id>/`, folder tags, the oldest-folder rule, **never delete or trash a user folder**, the flat root during the transition.
- Photos paragraph: the `userId` tag.
- Smoke: the new steps.
- Photo sweep: it lists the root and the subfolders.
- New "Photo relocation (T-021)" section: flags, output, exit codes, runbook (smoke → dry-run → `--apply` until `would_move 0` → sweep dry-run with `missing 0`), the C2 note.

No other file is touched. With alternative C1-DB or C2-task, the migration and test files named under *Decisions for Ming* join this list.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `driveFolders.test.ts › "concurrent resolves for one user: one lookup, one create"` | AC1 (single-flight) |
| `driveFolders.test.ts › "second resolve is cached: no Drive request"` | cache |
| `driveFolders.test.ts › "an existing folder is reused; of several, the oldest createdTime wins (id tie-break)"` | convergence |
| `driveFolders.test.ts › "a failed lookup or create is not cached; the next call retries"` | no cached failures |
| `driveFolders.test.ts › "create:false returns null and creates nothing"` | dry-run lookup |
| `driveFolders.test.ts › "invalid userId throws before any request"; "forget drops the entry"` | input validation, stale id |
| `drive.http.test.ts › "createFile with parentId sends parents [parentId]; invalid parentId → drive_invalid_id, no request"` | upload into the folder |
| `drive.http.test.ts › "createFolder posts metadata only, parent root, not retried on 500"` | folder create |
| `drive.http.test.ts › "moveFile sends PATCH with addParents/removeParents and appProperties; retried on 500; 404 → drive_not_found"` | move |
| `drive.http.test.ts › "getParents parses ids; malformed → drive_bad_response"` | script pre-check |
| `drive.test.ts › "userFolderQuery/subfoldersQuery: exact strings; reject bad root or non-uuid user"; "taggedFilesQuery excludes folders"` | query injection safety |
| `api.db.test.ts › "PUT photo stores the file in the user's subfolder with appProperties.userId"` | AC1 |
| `api.db.test.ts › "two concurrent first PUTs by one user create exactly one subfolder"` (two items, `folderCreateDelayMs` so the requests overlap) | AC1 |
| `api.db.test.ts › "two users get two folders"` | AC1 |
| `api.db.test.ts › "folder lookup/create fails → 503/502 by code, no row, quota refunded"` | R-C error mapping |
| `api.db.test.ts › "cached folder deleted by hand → 503, next PUT creates a new folder"` | stale id |
| `api.db.test.ts › "legacy flat-folder photo: GET streams, replace deletes the flat file, DELETE works"` | AC2 |
| `api.db.test.ts › "subfolder photo: GET streams, DELETE removes the file"` | AC2 |
| `api.db.test.ts › "upload logs carry no folder id, file id, token or Google text"` | AC5 |
| `photo-sweep.db.test.ts › "an unreferenced old file in a user subfolder is a candidate and deleted on apply"` | AC4 |
| `photo-sweep.db.test.ts › "referenced files in subfolders are not reported missing"` | AC4 |
| `photo-sweep.db.test.ts › "folders are never candidates; files under a folder outside the root are not listed"` | AC4, parent filter kept |
| `photo-sweep.db.test.ts › "pagination and page guards across root + subfolders"` | guards |
| `photo-relocate.db.test.ts › "dry-run (default) moves nothing, creates no folder, prints would-move and would-create lines"` | AC3 |
| `photo-relocate.db.test.ts › "apply moves each file into its owner's subfolder and tags userId; two users → two folders"` | AC3 |
| `photo-relocate.db.test.ts › "second apply moves 0 (idempotent)"` | AC3 |
| `photo-relocate.db.test.ts › "a root file with no DB row is reported unreferenced and stays in root"` | AC3 |
| `photo-relocate.db.test.ts › "--max-move 1 moves one, reports remaining; reruns finish the rest"` | resumable |
| `photo-relocate.db.test.ts › "file deleted between list and move → gone, exit 0"` | 404 → gone |
| `photo-relocate.db.test.ts › "tag userId differs from row owner → mismatch, not moved"` | safety |
| `photo-relocate.db.test.ts › "an existing user folder is reused (no create)"` | convergence with the app |
| `photo-relocate.db.test.ts › "move failure → FAIL code, continues, exit 1"; "folder check / list / db failure → exit 1, nothing moved"` | error paths |
| `photo-relocate.db.test.ts › "apply refuses when no listed file is referenced"` | wrong `DATABASE_URL` guard |
| `photo-relocate.db.test.ts › "output never contains Drive file or folder ids, tokens, secrets or Google text"` | AC5 |
| `photo-relocate.db.test.ts › "main runs with injected client/pool factories"` | CLI wiring |
| `photo-relocate.cli.test.ts › "no Google env → 2; no DATABASE_URL → 2; bad --max-move / unknown flag → 2 with usage"` | usage |
| `drive-smoke.test.ts › "checkFolder, create, read, createFolder, move, read in folder, delete, delete folder, read 404: returns 0"` | R-G |
| `drive-smoke.test.ts › "move failing: deletes file and folder, returns 1"` | cleanup |

## Approach
1. **Drive client (`drive.js`).** Add the primitives and query builders listed above. Every id that goes into a query or URL is validated first (`FOLDER_RE`, `FILE_ID_RE`, `isUuid`). URL params are built with `URLSearchParams`. `listFiles` stays the only list primitive. Neither create is retried. Move and metadata reads are retried. Error and log shape are unchanged (R3: nothing secret, no Google text).
2. **Resolver (`driveFolders.js`).** In memory (C1 default). It uses no DB, so no transaction ever spans Drive IO (pool `max: 5`, lock rule in `photos.js`). Folder name `<user_id>`, tags `{app:"tudo-folder", userId}`.
3. **Upload path.** Resolve the folder after the quota pre-check and before `createFile`, so `onDriveStored` and the refund behave as today. A resolve failure fails the request, with no fallback to the root. A stale folder (`drive_not_found` on create) clears the cache, and the request fails with 503. Reads, replaces and deletes do not change (they go by file id).
4. **Sweep.** It keeps the parent filter, because a query without it could reach another deployment's files on the same client and Drive. It lists the root plus every app-tagged subfolder one level down, with global page guards, and builds `listed`/`present` from the union. Folders are excluded from the file query and are never deleted.
5. **Relocation script (`photo-relocate.js`)**, modelled on `photo-sweep.js`. CLI `[--apply] [--max-move 1..10000, default 100]`, exit 0/1/2.
   - Run `checkFolder`. List the tagged files in the root only. Moved files drop out of that list, so the script is idempotent and resumable.
   - Read `select id, user_id, drive_file_id from item_photos where drive_file_id is not null` through `withMaintenance(pool, "photo-sweep", …)` (C2 default; the literal contains `user_id`, so no scoping allow-list entry is needed). Match rows by `drive_file_id`.
   - Classify each file: no row → `unreferenced <photoId|->`. A `userId` tag that differs from the owner → `mismatch <rowId>`. Otherwise it is a candidate.
   - If files are listed but none is referenced: `refusing: …`, and exit 1 with `--apply`.
   - **Dry-run:** `resolve(owner, {create:false})`. Print `would create folder for user <uuid>` once per user, and `would move <rowId> to user <uuid>`.
   - **Apply:** take the first `--max-move` candidates, sequentially. `resolve(owner)` → `getParents`. If the root is no longer a parent → `already <rowId>`. Otherwise one `moveFile` (add the subfolder, remove the root, `appProperties {userId}`). A 404 → `gone <rowId>`. Other errors → `move <rowId>: FAIL <code>`, carry on, exit 1.
   - **Summary:** `listed, referenced, unreferenced, mismatch, would_move|moved, gone, already, failed, remaining, folders_created, mode`.
   - Output is photo or row uuids, user uuids and counts only (R3, AC5). The DB is never written.
6. **Smoke.** Extend it as described, so Ming proves the move semantics live (scope, `cannotAddParent`) before `--apply`.
7. **Tests and docs** as listed. Run all checks.

Rules: R1 n/a (server only; local mode untouched). R2: no migration with the defaults; the alternatives follow R2 (new file, RLS in the same file, never edit an applied migration). R3: no new secret; folder ids and Drive ids are never logged or returned. R4 as amended by D27/D34: photos stay private behind `/api/photos/:id`. R5 n/a. R6 n/a (no UI copy). R7: out-of-scope items go to follow-ups. R8: tests above. R9 n/a (no UI). R10 untouched.

## Specialist input used
- **Architect R-A (resolver, single-flight, oldest-folder rule):** adopted.
- **Architect R-B (in memory):** adopted as the C1 default. **DB rec. 1–3 (`user_drive_folders` table):** kept as alternative C1-DB, with all its details. Reasons are under *Decisions for Ming*.
- **DB rec. 1, folder tag `{app:"tudo", kind:"user-folder"}`:** rejected. A folder tagged `app=tudo` matches `taggedFilesQuery(root)`. The sweep would see it as an unreferenced tagged file and `--apply` could delete a user folder with all its photos. Folders use `app:"tudo-folder"`, and the file query also excludes the folder mimeType.
- **Architect R-C / DB "stale folder id":** adopted the architect's version: forget the cache entry, fail this request, no retry. A retry would mean a second, non-idempotent create inside one request. The user's next upload heals it.
- **Architect R-D / DB rec. 6 (`drive.js` primitives):** adopted. `getParents` was chosen over adding `parents` to `listFiles`, so the list shape stays unchanged.
- **Architect R-E / DB rec. 4 (sweep lists the root plus each subfolder, keeps the parent filter):** adopted. The **report-only `mismatch` in the sweep** was rejected as an extra beyond AC4, and it would change the sweep's SQL and allow-list. `mismatch` stays in the relocation script, where it guards the move.
- **Architect R-F / DB rec. 5 (script):** adopted. The name is `photo-relocate.js`, chosen over `photo-folders-migrate.js` to avoid confusion with DB migrations and `migrate.js`. **`--max-move` caps the moves per run and then stops (resumable)**; it does not refuse everything the way `--max-delete` does, because a move is reversible. The DB consult's "re-check the DB row before each move" was dropped: a move is non-destructive, and the `getParents` pre-check covers concurrent runs. C2 defaults to the architect/DB option (a), with option (b) as the alternative.
- **Architect R-G (smoke):** adopted. **R-H / DB test notes (fake Drive, AC tests):** adopted. The DB-level race test applies only to C1-DB.
- **DB transaction findings (no transaction across Drive IO, lock order, pool `max: 5`):** adopted. The default adds no DB access to the upload path at all.
- **Architect open question 4 / DB Q4 (shared client or Drive across deployments, scope for move):** handled by keeping the parent filter (sweep) and by the smoke step. No answer is needed to proceed.

## Assumptions
- A1: The relocation script runs in the app container via `docker compose … exec`, like the sweep. It needs the same env (four Google variables plus `DATABASE_URL`).
- A2: Each My Drive file has exactly one parent, so `addParents` + `removeParents` in one PATCH is the move. The smoke confirms this live before `--apply`. If Drive rejects it, the smoke fails and Ming stops at step 2.
- A3: Duplicate folders that a cross-process race or index lag might create are tolerated. The oldest-folder rule converges new uploads, and the sweep covers every folder.
- A4: `photoSlots` allows 2 uploads in flight per user (`app.js`), so the AC1 concurrency test is reachable through the API.
- A5: Hotspot files: `server/photos.js`, `server/photo-sweep.js` and `server/README.md`. No other open ticket in the backlog plans changes to them (T-019.9 removes Access code in `auth`/`app.js`). If T-019.9 lands first, `app.js` wiring is a trivial rebase.
- A6: Size: the estimate is about 500 product lines plus tests, borderline against the guide. See *Split proposal*.

## Blocking questions
None. C1 and C2 have defaults and are decided at plan approval.

## Split proposal
None. The ticket stays as one: the sweep change and the relocation script have to be reviewed together, because the sweep's `missing 0` is the check that the migration succeeded, and one slice alone would leave AC3 or AC4 unmet. If review finds the diff too large, the fallback split is:
- T-021.1: drive primitives, resolver, upload path, sweep, smoke (AC1, 2, 4, 5).
- T-021.2: `photo-relocate.js` and its runbook (AC3).

T-021.1 can be deployed on its own: old files stay flat and keep working.

## Follow-ups (out of scope)
- Merge duplicate folders of one user (move the files into the oldest folder, remove the empty ones).
- Empty folders of removed users.
- Scheduling the sweep (already a deployment-repo follow-up).
