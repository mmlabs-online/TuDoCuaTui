# Review — T-005.6

## Attempt 1 — 2026-11-12
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb`, diff `origin/main...HEAD`: 11 files, +1189 / −13. The code is in 6bdc867 and every file is in the plan's file list.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0, no output.
- format:check: "All matched files use the correct format." (181 files)
- test: run against a scratch local PostgreSQL 16.15 (data dir under /tmp, scram-sha-256, `TEST_DATABASE_URL` set). Result: `Test Files 68 passed (68)`, `Tests 840 passed (840)`. No suites were skipped, so `photo-sweep.db.test.ts` ran.
- test:coverage (`CI=true`): 68 / 840 passed, no threshold failure. Coverage for all files: 95.05 % statements, 94.09 % branches. `drive.js` is at 99.54 %. `photo-sweep.js` is at 87.38 % statements; the uncovered lines are the non-config error branch of `loadDriveConfig`, a part of `main`, and the CLI guard at line 249.
- build: `vite build`, `✓ built in 328ms`.
- These numbers match the impl-log (68 files, 840 tests).

**Manual CLI run (reviewer).**
- Setup:
  - The real entry point `node server/photo-sweep.js` ran against a freshly migrated DB. `server/migrate.js` applied `20261110120000_init` and `20261112120000_item_photos_drive`.
  - The fake Drive (`server/test/fake-drive.ts`, `listPageSize` 2) ran in a scratch launcher. A `--import` preload rewrote the three Google base URLs to the fake and threw on any other `https://` host.
- Seeded Drive files:
  - one referenced file (600 min old)
  - two unreferenced tagged files (600 and 120 min old)
  - one young tagged file (10 min old)
  - three untagged files: `{tudo:"smoke"}`, no `appProperties`, and `{app:"other"}`
  - one tagged file with no `createdTime`
  - one trashed tagged file
- Seeded DB rows: one referencing row, one old row whose file is missing, and one young row whose file is missing.
- Results:
  1. Dry-run: exit 0, `would delete <uuid2>` and `would delete <uuid3>`, `missing file for photo …101` (the young row …102 was not reported), and `listed 5 (3 pages), referenced 1, young 1, untagged 0, no_time 1, candidates 2, deleted 0, …, mode dry-run`. The fake recorded 0 DELETEs.
  2. `--apply --max-delete 1`: exit 1, `too many candidates: 2 > 1 (rerun with --max-delete 2)`, 0 DELETEs. This is the A7 behaviour.
  3. `--apply`: exit 0, `delete <uuid2>: ok` and `delete <uuid3>: ok`, 2 DELETEs. Only `ORPH0002` and `ORPH0003` left the fake. The referenced, young, no-time, untagged ×3 and trashed files all remained.
  4. Fake switched to `list-ignore-tag`, then `--apply --grace-minutes 15`: exit 0, `untagged 3, candidates 0`, no new DELETE. This shows the in-code tag check works on its own (A4).
  5. `--grace-minutes 14` gave exit 2 with the usage line. An empty `DATABASE_URL` gave exit 2 with `DATABASE_URL is not set`.
  6. All 3 `item_photos` rows were still present after the runs.
- Redaction: I grepped all captured stdout/stderr for `fakefile|fake-access|fake-refresh|fake-client|sentinel|googleapis|Google|revpw|postgres://` and found no match. The output contains only photo/row UUIDs, counts and codes.
- Cleanup: the cluster, the fake Drive and the scratch files were stopped and deleted afterwards.

### Acceptance criteria
- [x] Unreferenced old tagged files are deleted with `--apply`. Evidence:
  - `server/photo-sweep.db.test.ts:82`
  - the manual run, step 3
  - code: `server/photo-sweep.js:97-103` (classification) and `:116-137` (delete loop)
- [x] Referenced, young and untagged files are kept. Evidence:
  - tests at `photo-sweep.db.test.ts:91`, `:101` (includes the 14/16 min boundary at grace 15), `:115` (q filter plus `list-ignore-tag`), and `:136` (no or unparsable `createdTime`)
  - the manual run, steps 3 and 4
- [x] Dry-run deletes nothing. Evidence: `photo-sweep.db.test.ts:152` and the manual run, step 1. The cap applies only with `--apply` (`photo-sweep.js:110`; dry-run is checked at `db.test.ts:233`).
- [x] Re-check before each delete. Evidence: `photo-sweep.js:122-128` and `photo-sweep.db.test.ts:165`. In that test a row is inserted after the reference set loads, the file is kept, and the output has `keep …: referenced`.
- [x] Rows whose file is missing are reported, not deleted, and only after the grace period. Evidence: `photo-sweep.js:140-146`, `photo-sweep.db.test.ts:185`, and the manual run (…101 reported, …102 not).
- [x] Pagination works. Evidence:
  - `drive.test.ts:569` and `:592` (`pageToken` passed, `nextPageToken` returned or undefined)
  - `drive.http.test.ts` "listFiles paginates against the fake…" (3 pages, only tagged, non-trashed files in the folder)
  - `photo-sweep.db.test.ts:196` (5 files, 3 list calls)
  - the manual run (`3 pages`)
  - A repeated token and a cap of 1000 pages abort the run: `photo-sweep.js:65,70`.
- [x] No token or Google text in logs. Evidence:
  - `photo-sweep.db.test.ts:261` checks for tokens, secret, `GOOGLE_TEXT_SENTINEL`, `fakefile` and page tokens.
  - `drive.js:438` logs through the existing `note()` path only.
  - The CLI creates the Drive client with the default no-op `log` (`photo-sweep.js:231`, `drive.js:110`).
  - `main` prints the fixed text `sweep failed` and never `err.message` (`photo-sweep.js:240-242`, `db.test.ts:307`).
  - The manual grep above found nothing.
- [x] `listFiles` follows the drive.js contract. Evidence: `drive.js:410-458` (GET with `retry: true` and `t.meta`, strict body validation), and `drive.test.ts:619`, `:628`, `:635` plus the malformed-body and logging tests.
- [x] The CLI follows the smoke pattern. Evidence: `photo-sweep.cli.test.ts` covers no Google env → 2, partial env → 2 without values, no `DATABASE_URL` → 2, and bad flags → 2 with usage.
- [x] README runbook. Evidence: `server/README.md:69-86`, and the line-53 pointer is updated. `server/` is copied into the image (`Dockerfile`, `COPY server ./server`), and the compose `env_file` supplies `DATABASE_URL` and the Google variables, so the `docker compose … exec` runbook works.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1 and R9: there is no client or UI change.
- R2: no migration. The re-check uses the existing unique index on `drive_file_id`.
- R3: no new env or `VITE_*` variable. Secrets stay in the server runtime env and are never printed (see the redaction evidence).
- R4 (photos private): Drive ids are not printed. Only the configured folder is listed (`taggedFilesQuery`, `drive.js:74-79`, which validates against `FOLDER_RE`). Nothing outside the `app=tudo` tag is touched.
- R5: nothing derived is stored.
- R7: every changed file is in the plan's list. The follow-ups (scheduling, `check-image.sh`, the stale README line) were left out.
- R8: checks are green and the new logic has unit and DB tests.
- R10: no Figma files touched.

### Nits (do not block)
- The repeated-`nextPageToken` and 1000-page guards (`photo-sweep.js:65,70`) have no direct test.
- `photo-sweep.js:214-216`: the non-`DriveConfigError` branch of the config catch is not covered.
- Dry-run with more candidates than `--max-delete` exits 0 and does not warn that `--apply` would refuse. Adding a hint line would save one round trip for Ming.

### Follow-ups (out of scope)
- Scheduling the sweep (deployment repo).
- `scripts/check-image.sh`: add `expect_exit 2 … node server/photo-sweep.js` (plan A12).
- Stale "GitHub environment `tudocuatui`" line in `server/README.md` (T-005.2 A19; D28).

### Security blockers (added by orchestrator from security-review.md, attempt 1)
- 🔴 B1 — `server/photo-sweep.js:92-115`: in `--apply` mode the sweep must refuse (exit 1, delete nothing) when the reference set looks empty/foreign: `item_photos` has no rows while there are candidates, or no listed tagged file is referenced while there are candidates. The absolute `--max-delete` cap (50) does not protect a personal library of ≤ 50 photos against a wrong/empty `DATABASE_URL`. Needs DB tests for both conditions and one README sentence.

→ Verdict for attempt 1 becomes **REWORK** (orchestrator rule: a 🔴 security finding turns PASS into REWORK).
