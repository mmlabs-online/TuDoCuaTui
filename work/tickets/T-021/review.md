## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed commit f55b30f on `claude/magical-cori-2ssw8l`. HEAD is now a72f786, which only adds `security-review.md`. The code is the same. Plan approved with defaults C1 (in-memory cache) and C2 (reuse the `photo-sweep` maintenance read), D41. No DB migration.

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0.
- format:check: "All matched files use the correct format." (255 files), exit 0.
- test (no DB): 1246 passed, 202 skipped (1448), exit 0. Matches impl-log.
- test (throwaway Postgres 16, trust auth, port 55432; stopped and deleted afterwards): 106 files passed, 1 failed; 1447 passed, 1 failed. The failure is `migrate.cli.test.ts › exit 1 on wrong password` (known under trust auth). Matches impl-log.
- T-021 suites rerun 3× with the DB (`api.db`, `photo-relocate.db`, `photo-sweep.db`, `driveFolders`): 100/100 each time. The concurrency test is not flaky.
- build: `vite build` green.

### Acceptance criteria
- [x] AC1: a new upload by A lands in `TuDoCuaTui/<A>/` with `appProperties.userId = A`, and two concurrent first uploads create exactly one subfolder.
  - Tests: `api.db.test.ts › "PUT photo stores the file in the user's subfolder with appProperties.userId"` (folder name, mimeType, parent = root, tags `{app:"tudo-folder", userId}`; file parent = folder; file tags `userId`).
  - `› "two concurrent first PUTs by one user create exactly one subfolder"`. The fake only stores the folder after `folderCreateDelayMs=150`, so without single-flight both lookups would miss and two folders would be created. The test is meaningful.
  - `driveFolders.test.ts › "concurrent resolves for one user: one lookup, one create"` and `› "a failed lookup or create is not cached; the next call retries"`.
  - Code: `driveFolders.js:49-63`. The in-flight entry is removed in `finally`, only a successful id is cached, and a `create:true` caller that joined a `create:false` lookup re-resolves.
- [x] AC2: reads, replaces and deletes work in a subfolder and in the flat root.
  - Tests: `api.db.test.ts › "legacy flat-folder photo: GET streams, replace deletes the flat file, DELETE works"` and `› "subfolder photo: GET streams, DELETE removes the file"`. Reads and deletes are still by file id, and the code is unchanged.
- [x] AC3: the relocation script is dry-run by default, `--apply` moves files and is idempotent, and unreferenced files are reported, not moved.
  - Tests in `photo-relocate.db.test.ts` (14), all green:
    - dry-run: no non-GET request, no folder.
    - apply with two users: two folders, files moved and tagged.
    - second apply: `listed 0`, `moved 0`.
    - unreferenced file stays in root.
    - `--max-move 1` then a rerun.
    - 404 → `gone`, exit 0.
    - `mismatch` is not moved.
    - an existing folder is reused.
    - move FAIL: carries on, exit 1.
    - check, list and db failures: exit 1.
    - refusal guard.
    - output sentinels.
    - `main` wiring.
  - `photo-relocate.cli.test.ts` covers usage, exit 2.
  - Code: matches by `drive_file_id` (`photo-relocate.js:104`). `getParents` pre-check → `already` (151-156). DB access is SELECT-only through `withMaintenance(pool, "photo-sweep")` (93).
- [x] AC4: `photo-sweep.js` finds orphans in subfolders too.
  - Tests in `photo-sweep.db.test.ts › "user subfolders (T-021)"`: a subfolder orphan is deleted on apply and the folder stays; referenced subfolder files are not missing (`missing 0`, `folders 1`); a folder outside the root is not listed; pagination plus the shared page budget and the stuck-token guard.
  - Code: the parent filter is kept, and the sweep lists the root plus only `app=tudo-folder` children (`photo-sweep.js:85-93`). The file query excludes the folder mimeType (`drive.js:87`), so a folder can never be a candidate.
- [x] AC5: no email, token or Drive secret in logs, and all checks green.
  - Tests: `api.db.test.ts › "upload logs carry no folder id, file id, token or Google text"`, the relocate sentinel test (file and folder ids, root id, access/refresh token, client secret, Google text) and the sweep sentinel test.
  - New Drive ops log only `{event, op, status, code, reason}`, and `cannotAddParent` is allow-listed.
  - Checks above.

Other points checked:
- **Query injection:** `checkRoot` / `FOLDER_RE` on every folder id, and `isUuid` (anchored, `validate.js:42`) before `userId` enters `q` (`drive.js:74-101`). Subfolder ids from `listFiles` already pass `FILE_ID_RE`. Test `drive.test.ts › "userFolderQuery/subfoldersQuery: exact strings; reject bad root or non-uuid user"`.
- **Retries:** `createFolder` uses `retry: false` and `moveFile`/`getParents` use `retry: true` (`drive.http.test.ts › createFolder … not retried on 500`, `› moveFile … retried on 500; 404 -> drive_not_found`).
- **Upload path:** `folders.resolve` sits inside the `createFile` try and before `onDriveStored` (`photos.js:242-250`). The 503/502 mapping and the `finally` refund are unchanged, and there is no fallback to the root. A stale folder (`drive_not_found` after a resolve) calls `forget` (`photos.js:254`), and the test `› "cached folder deleted by hand -> 503, next PUT creates a new folder"` covers it.
- **Transactions:** the resolver uses no DB, so no transaction spans Drive IO.
- **Smoke:** extended with createFolder → move → parents check → read in folder → delete → delete folder, with cleanup on failure (`drive-smoke.test.ts`, 2 new or updated tests).
- **README:** has the Drive layout section with "**Never delete or trash a user folder**", the relocation section with the runbook (smoke → dry-run → `--apply` until `would_move 0` → sweep dry-run `missing 0`), and the updated sweep and photo paragraphs.
- **`scoping.test.ts`:** adds `photo-relocate.js` to the `withMaintenance` allow-list and to the "no direct `pool.query`/`pool.connect`" list, exactly as the plan's file table says. The cross-user SELECT passes `unscoped()` because the literal names `user_id`; the plan states this in Approach step 5.
- **`api.db.test.ts` setup:** the server now dispatches to `handler`, which is rebuilt in `beforeEach`. This is sound. The folder cache, `photoSlots` and `photoQuota` are per app, so each test starts clean and tests no longer share daily-quota state. `headerAuth()` defaults to OWNER_A, so it behaves the same as the earlier `fixedAuth(OWNER_A)` for existing tests. `noDriveServer` is unchanged.

### Issues
No blockers. These two should be fixed before Ming's `--apply`, but they do not block this verdict.

#### Issue 1 — 🟡 should-fix — the live check of appProperties merge on move is missing
- **Where**: `server/drive-smoke.js:51-61`, relying on `server/photo-relocate.js:157-161`
- **Expected**: The smoke proves that a move PATCH carrying only `{userId}` keeps the existing `app`, `photoId` and `itemId` tags. Relocation depends on it: if Drive replaced the map, moved files would lose `app=tudo`. They would then drop out of `taggedFilesQuery`, the sweep would report them as `missing` and real orphans would go unseen. This is not destructive, but it would need a re-tag pass.
- **Actual**: The smoke creates the file with `{tudo:"smoke"}` and moves it with the same `{tudo:"smoke"}`, so a replace and a merge look the same. Only the fake Drive asserts merge semantics. This was also raised as F2 in `security-review.md`. Drive v3 documents patch semantics for `appProperties`, so the risk is low, but the smoke is the gate before `--apply`.
- **Fix instruction**: In `drive-smoke.js`, create the smoke file with `appProperties {tudo:"smoke", a:"1"}` and move it with `{b:"1"}`. Then read the metadata and fail the `move` step unless both `a` and `b` are present. This needs a metadata getter that returns `appProperties`, for example by extending `getParents` or adding a small `getMeta`. Update `drive-smoke.test.ts`.

#### Issue 2 — 🟡 should-fix — a re-apply after migration exits 1 with a false "check DATABASE_URL"
- **Where**: `server/photo-relocate.js:125-128`
- **Expected**: The refusal guard only matters when it would stop a move.
- **Actual**: After a full migration the root still holds any `unreferenced` orphans. The plan and README say these stay for the sweep. A further `--apply` then has `listed > 0`, `candidates + mismatch = 0`, prints "refusing: … (check DATABASE_URL)" and exits 1. The guard never protects anything here, because with zero candidates nothing would be moved anyway. This matches the plan's wording, but it gives Ming a misleading failure in a likely runbook state.
- **Fix instruction**: Either keep the warning line and return 1 only when there is something it would have prevented (in practice, never), or document in the README relocation bullet that an `--apply` with only unreferenced files left exits 1 by design and the dry-run is the completion check. The README option is the smaller change.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1 n/a (server only; local mode untouched).
- R2: no migration (C1/C2 defaults).
- R3: no new secret or `VITE_*`, and Drive and folder ids are never logged or returned. The smoke's existing "left behind: <id>" pattern was extended to folders, which the plan says explicitly; it is console-only for Ming.
- R4 as amended by D27/D34: photos stay behind `/api/photos/:id`.
- R5, R6, R9 n/a.
- R7: every changed file is in the plan's file list, and the `work/` files are workflow bookkeeping.
- R8: checks are green and the new logic has tests.
- R10: untouched.

### Nits (do not block)
- `photos.js` `putPhoto` takes `ctx: any`, so `folders` being `null` is not type-checked at `photos.js:242`. `createApp` always builds a resolver when `drive` is set, so this is only a latent hazard for a future caller of `handleApi` that passes `drive` without `folders`. The failure would surface as a 502.
- The "folder lookup/create fails" API test only exercises the 502 path (500 → `drive_unavailable`), and it does not assert the daily-quota refund directly. The 503 mapping and the refund are unchanged shared code, already covered by earlier tests.
- `photo-relocate.js:165`: a `drive_not_found` from `folders.resolve` (rather than from the file) would be counted as `gone`. This is unlikely, because `checkFolder` passed just before.
- The sweep's "folders are never candidates" test does not include a folder tagged `app:"tudo"`. The mimeType exclusion is pinned by the `taggedFilesQuery` string test and the fake's strict regex instead.

### Follow-ups (out of scope)
- Cache TTL or a once-per-process `trashed` check for a user folder trashed by hand (security F3). Drive may accept uploads into a trashed parent.
- Merge duplicate folders of one user, and handle the empty folders of removed users (both already in the plan).
- An explicit `scoping.test.ts` ALLOW entry for the relocate cross-user SELECT, and tightening `unscoped()` to `user_id = $n` (security F4).
- Optionally compare `appProperties.itemId` with the row's `item_id` in relocate (security F5).

### Orchestrator note (2026-11-16) — PASS turned into one small rework
No 🔴 from review or security. Before Ming runs `--apply`, four cheap items go into rework attempt 2 (nothing else):
1. `server/drive-smoke.js`: prove Drive *merges* `appProperties` on move — create the smoke file with `{tudo:"smoke", a:"1"}`, move it with `{b:"1"}`, fail unless both survive (review should-fix 1, security F2).
2. `server/photo-relocate.js:125-128`: when the root only holds unreferenced files (nothing to move), do not exit 1 with "refusing … check DATABASE_URL"; keep the wrong-DB refusal for the case where files are listed and *none* is referenced while the DB has rows, otherwise report "nothing to move" and exit 0 — or document it; prefer the code fix with a test (review should-fix 2).
3. `server/drive-smoke.js:82,84`: "left behind" lines print the file/folder name, not the Drive id (security F1).
4. `server/scoping.test.ts`: explicit ALLOW entry with a reason for the cross-user SELECT in `photo-relocate.js` (security F4).
Follow-ups stay out (F3 cache TTL, F5 itemId check, duplicate/empty folders).
