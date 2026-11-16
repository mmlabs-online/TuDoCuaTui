## Attempt 1 — 2026-11-16

Defaults approved by Ming: C1 = folder-id cache in server memory (no DB table, no migration); C2 = the relocate script reads `item_photos` through `withMaintenance(pool, "photo-sweep", …)`. Alternatives C1-DB and C2-task were not implemented.

### Files touched
| File | Required because |
|---|---|
| `server/drive.js` | `createFile` `parentId`, `createFolder`, `moveFile`, `getParents`, `subfoldersQuery`, `userFolderQuery`, `rootFolderId`, folder-excluding `taggedFilesQuery`, `cannotAddParent` reason |
| `server/driveFolders.js` (new) | in-memory single-flight resolver, oldest-folder rule |
| `server/app.js`, `server/api.js` | one resolver per app instance, passed to `handlePhoto` |
| `server/photos.js` | upload into the user's subfolder, `userId` tag, `forget` on stale folder |
| `server/photo-sweep.js` | lists root plus subfolders, `folders N` in the summary |
| `server/photo-relocate.js` (new) | one-off relocation CLI |
| `server/drive-smoke.js` | createFolder, move, read in folder, delete folder steps |
| `server/test/fake-drive.ts` | folders (kept in `dirs`, apart from `files`), PATCH move, metadata GET, parent validation, new fail/hang keys, `folderCreateDelayMs`, `folders()` |
| `server/scoping.test.ts` | allow-list of `withMaintenance` users, no direct `pool.query` in photo-relocate.js |
| `server/README.md` | Drive layout, relocation runbook, smoke and sweep notes |
| Tests | see below |

### Tests added / changed
- New: `driveFolders.test.ts` (7), `photo-relocate.db.test.ts` (14), `photo-relocate.cli.test.ts` (1, all usage cases in one test as the plan lists it).
- `api.db.test.ts`: 8 new tests in "per-user subfolders (T-021)". The test app is now built per test (the cache lives in the app instance) and uses `headerAuth`.
- `photo-sweep.db.test.ts`: 4 new tests; the existing pagination test now expects 4 list calls / 4 pages (one extra call for the subfolder listing).
- `drive.http.test.ts`: 4 new; `drive.test.ts`: 1 new, taggedFilesQuery expectation updated; `drive-smoke.test.ts`: 1 new, step list updated.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test without DB: 97 files passed, 10 skipped; 1246 tests passed, 202 skipped.
- test with throwaway Postgres 16 (trust auth, port 55432, deleted afterwards): 106 files passed, 1 failed; 1447 tests passed, 1 failed. The one failure is `migrate.cli.test.ts › exit 1 on wrong password` (trust auth, unrelated, as announced).
- build: green.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Merge duplicate folders of one user; empty folders of removed users (already in the plan).
- In dry-run `photo-relocate.js` looks up each user's folder with `create:false` once per user; a lookup failure shows up as a `move … FAIL` line for that file.

### Scope self-check
- Could the diff be smaller? No: the two new product files are about 340 lines together; the rest is wiring and tests.
- Diff size: tracked files +690 / -47, plus new files (driveFolders.js, photo-relocate.js, three new test files). Nothing committed.

## Attempt 2 (REWORK, orchestrator note items 1-4)

### Changes
1. `server/drive-smoke.js`: smoke file created with `{tudo:"smoke", a:"1"}`, moved with `{b:"1"}`; after the move the smoke lists the folder and fails ("appProperties not merged") unless both `a` and `b` survive.
2. `server/photo-relocate.js`: the wrong-DB refusal (exit 1 on apply) now needs `rows.length > 0`; with an empty DB and only unreferenced files it logs "nothing to move: no listed file is referenced" and exits 0.
3. `server/drive-smoke.js`: "left behind" lines print the file/folder name, not the Drive id.
4. `server/scoping.test.ts`: explicit ALLOW entry (with reason) for the cross-user SELECT in `photo-relocate.js`; the stale-entry check now looks at all literals (that SELECT names `user_id`, so it is not in `unscoped()` output).

### Tests
- `server/test/fake-drive.ts`: list tag query accepts `tudo=smoke` as well as `app=tudo` (the fake already merged appProperties on PATCH, like real Drive).
- `drive-smoke.test.ts`: +1 (replace-instead-of-merge move returns 1, "move: FAIL error"); leftover test asserts the name, never the id.
- `photo-relocate.db.test.ts`: +1 (only unreferenced files, empty DB: exit 0, "nothing to move"); the refusal test now adds a DB row that matches no listed file, so it still exits 1.

### Checks (actual)
- typecheck clean; format:check "All matched files use the correct format."; build green.
- `pnpm test` without DB: 97 files passed, 10 skipped; 1247 tests passed, 203 skipped.
- With throwaway Postgres 16 (trust auth, port 55432, stopped and deleted): 106 files passed, 1 failed; 1449 passed, 1 failed (the known `migrate.cli.test.ts` wrong-password test, trust auth, unrelated).

### Touched files
`server/drive-smoke.js`, `server/photo-relocate.js`, `server/scoping.test.ts`, `server/test/fake-drive.ts`, `server/drive-smoke.test.ts`, `server/photo-relocate.db.test.ts`, this log. Not committed.

### Follow-ups
Unchanged (F3 cache TTL, F5 itemId check, duplicate/empty folders, tighten `unscoped()` to `user_id = $n`).

## Attempt 3 (REWORK, review Attempt 2 item 2)

### Changes
- `server/photo-relocate.js`: when the DB has rows, root files are listed and none is referenced, probe up to 5 rows with `drive.getParents(drive_file_id)`. Any probe succeeds -> "nothing to move: no listed file is referenced", continue (exit 0, dry-run and apply). All probes `drive_not_found` -> the wrong-DB refusal as before (exit 1 on apply, report-only on dry-run). Any other probe error -> `probe: FAIL <code>`, exit 1. No Drive ids printed.

### Tests (`server/photo-relocate.db.test.ts`, +2; existing refusal test unchanged and still exits 1)
- Rows whose files live in a subfolder + one root orphan: apply and dry-run exit 0, "nothing to move", no refusal line, nothing moved, no write requests, no Drive ids in output.
- Probe error other than not-found: `probe: FAIL ECONNRESET`, exit 1 (apply and dry-run), error text not printed.
- Nits not touched.

### Checks (actual, throwaway Postgres 16 under /tmp, stopped and deleted)
- typecheck clean; format:check clean; build green.
- `pnpm test` with DB: 106 files passed, 1 failed; 1451 passed, 1 failed (the known `migrate.cli.test.ts` wrong-password test under trust auth, unrelated).

### Touched files
`server/photo-relocate.js`, `server/photo-relocate.db.test.ts`, this log. Not committed.
