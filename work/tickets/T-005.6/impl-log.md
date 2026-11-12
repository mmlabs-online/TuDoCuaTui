## Attempt 1 — 2026-11-12

### Files touched
| File | Required because |
|---|---|
| `server/drive.js` | `listFiles({ q, pageToken })` and `taggedFilesQuery(folderId)` (plan A1-A3). |
| `server/photo-sweep.js` (new) | `runSweep` and `main`: the sweep CLI. |
| `server/test/fake-drive.ts` | Fake list endpoint, `createdTime` on uploads, `listPageSize`, `fail`/`hang` "list", `modes` "list-ignore-tag", `GOOGLE_TEXT_SENTINEL` in failure bodies. |
| `server/drive.test.ts` | `listFiles` and `taggedFilesQuery` unit tests. |
| `server/drive.http.test.ts` | Pagination round-trip against the fake. |
| `server/photo-sweep.db.test.ts` (new) | Sweep behaviour against real Postgres and the fake Drive. |
| `server/photo-sweep.cli.test.ts` (new) | Spawned-CLI exit codes and argument parsing. |
| `server/README.md` | "Photo sweep (T-005.6)" section with runbook; line-53 pointer updated. |

### Tests added / changed
- `drive.test.ts`: `taggedFilesQuery …`, `listFiles sends q, fields, pageSize=1000 …`, `listFiles without nextPageToken …`, `listFiles keeps appProperties only when …` (extra), `listFiles retries 5xx … refreshes once on 401`, `listFiles 3xx …`, `listFiles 400/403/429 …`, `listFiles malformed body …`, `listFiles errors carry only a code and log only {…}`.
- `drive.http.test.ts › listFiles paginates against the fake …`.
- `photo-sweep.db.test.ts`: every test in the plan table (deleted, referenced, young + 15 min boundary, untagged incl. `list-ignore-tag`, no createdTime, dry-run, re-check, missing rows, pagination, failed delete, list failure, max-delete, folder check, redaction, main wiring), plus `db failure -> exit 1` and `main: an unexpected error prints a fixed message` (small extras for the DB and main error paths).
- `photo-sweep.cli.test.ts`: four tests as planned.
- The re-check test inserts the row from a pool wrapper right after the reference set is loaded (inserting after the listing but before the DB load would just count as referenced).

### Checks (actual output summary)
Local PostgreSQL 16 on a temp data dir (stopped and deleted afterwards), `TEST_DATABASE_URL` set.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: 68 files passed, 840 tests passed (DB tests ran).
- test:coverage (`CI=true`): 68 files, 840 tests passed, no threshold failure.
- build: built OK.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Scheduling the sweep (deployment repo).
- `scripts/check-image.sh`: add `expect_exit 2 … node server/photo-sweep.js` (plan A12).
- Stale "GitHub environment `tudocuatui`" line in `server/README.md` (T-005.2 A19; D28).

### Scope self-check
- Could the diff be smaller? No; the sweep is about 200 lines, `listFiles` about 55, fake about 40.
- Diff size: new `server/photo-sweep.js` (~215 lines) plus edits in drive.js, fake-drive.ts, README and tests.

## Attempt 2 (REWORK: security blocker B1)

### Files touched
- `server/photo-sweep.js`: before any delete, if there are candidates and no listed tagged file is referenced (covers empty `item_photos` and rows matching nothing listed), log the fixed line `refusing: no listed file is referenced (check DATABASE_URL)`; with `--apply` set exit 1 and delete nothing. Dry-run prints the same line, still reports, exit 0. Required because: B1. No ratio guard.
- `server/README.md`: one bullet in the photo-sweep section describing the refusal.
- `server/photo-sweep.db.test.ts`: new tests (a) empty `item_photos` + 3 old tagged files, apply exits 1 with 0 DELETEs (dry-run also checked); (b) only non-matching rows, same. Existing apply tests that deleted files with an empty reference set now first add a referenced "anchor" file (counts adjusted: pagination 6 listed, main test leaves 1 file). Required because the new guard would otherwise refuse them.

### Checks (actual output summary)
Scratch PostgreSQL 16 under /tmp (scram password auth, stopped and deleted afterwards), `TEST_DATABASE_URL` set.
- typecheck: clean. format:check: all files correct.
- test: 68 files, 842 tests passed. `CI=true pnpm test:coverage`: 68 files, 842 passed, no threshold failure. build: OK.

### Out-of-plan files
None.

### Follow-ups
None new.

### Scope self-check
Only B1 addressed; no other behavior changed.
