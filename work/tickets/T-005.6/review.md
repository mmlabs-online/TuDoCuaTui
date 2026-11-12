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

## Attempt 2 — 2026-11-12
Verdict: REWORK

Scope: security blocker B1 (security-review.md attempt 1), fixed in 63f67aa "T-005.6: refuse sweep on empty or foreign reference set".

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb`. Scratch PostgreSQL 16 (`/usr/lib/postgresql/16`, data dir under /tmp, scram-sha-256 password auth, `TEST_DATABASE_URL` set). The cluster was stopped and deleted afterwards.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0, no output.
- format:check: exit 0 (181 files).
- test: `Test Files 68 passed (68)`, `Tests 842 passed (842)`. `photo-sweep.db.test.ts` ran (19 passed, not skipped).
- test:coverage (`CI=true`): exit 0, 68 / 842 passed, no threshold failure. All files 95.06 % statements / 94.12 % branches; `photo-sweep.js` 87.93 % statements.
- build: `vite build`, `✓ built in 326ms`.
- These numbers match impl-log attempt 2 (68 files, 842 tests).

**Manual check (reviewer).** I ran `runSweep` from a scratch test outside the repo against a fresh migrated DB and the fake Drive. Three old tagged files were listed.
- Empty `item_photos`, `--apply`:
  - exit 1, 0 DELETEs
  - output: `refusing: no listed file is referenced (check DATABASE_URL)` and the summary line `referenced 0, candidates 3, deleted 0`
  - The same result with `maxDelete: 100, graceMinutes: 15`, so a high cap does not bypass the refusal.
- Only a non-matching row (its file is not listed), `--apply`:
  - exit 1, 0 DELETEs
  - output: the refusal line, `missing file for photo <row uuid>`, and the summary
- After adding a row for file 1, `--apply`:
  - exit 0
  - `delete <uuid2>: ok` and `delete <uuid3>: ok`, 2 DELETEs
  - only `fakefile00000001` (the referenced file) remained
- Redaction: I grepped the refusal outputs for the access, refresh and client-secret values, `GOOGLE_TEXT_SENTINEL`, `fakefile`, `postgres://` and the DB password. Nothing matched. Only fixed text, row UUIDs and counts are printed.

### Acceptance criteria (B1)
- [x] With `--apply`, empty `item_photos` plus candidates gives exit 1 and nothing deleted. Evidence:
  - code: `server/photo-sweep.js:110-116`. The refusal sets `failed`, the `apply && failed` branch skips both the cap and the delete loop, and `:160` returns 1.
  - test: `server/photo-sweep.db.test.ts:247` (exit 1, refusal line, 0 DELETEs, 3 files remain; dry-run exits 0 with the same warning and the would-delete lines)
  - the manual run above
- [x] With `--apply`, only non-matching rows gives the same result. Evidence: `photo-sweep.db.test.ts:261` and the manual run. The guard condition `count.referenced === 0` (`photo-sweep.js:110`) covers both cases.
- [x] Normal sweeps still delete. Evidence:
  - `photo-sweep.db.test.ts:87`, `:107`, `:204` (6 listed, 3 pages, 1 file left), `:215`, `:236` and `:323`
  - the manual run's final step
- [x] The README has one sentence on the refusal. Evidence: `server/README.md:75`.
- [x] Fixed log line, no ids or secrets. Evidence: `photo-sweep.js:112` and the manual grep.
- [ ] Changed or affected existing tests still test what they did. **FAILED, see Issue 1.** The anchor added to `:87`, `:107`, `:172`, `:204`, `:215`, `:236` and `:323` keeps their intent. Their assertions were adjusted only for the extra referenced file (`size 1`, `listed 6`). The redaction test was not updated.

### Issues
#### Issue 1 — 🟡 should-fix — test regression (redaction test lost its delete-failure path)
- **Where**: `server/photo-sweep.db.test.ts:296-321` ("output never contains tokens, secrets, Google error text, Drive file ids or page tokens").
- **Expected**: The test still runs an `--apply` sweep in which Drive DELETEs fail. The fake answers those with an error body containing `GOOGLE_TEXT_SENTINEL`, so the test proves that a failed delete leaks no Google text. That was the evidence for the attempt-1 criterion "No token or Google text in logs".
- **Actual**: The test seeds files 1–3 and only a row for file 4 (`:298-299`), so no listed file is referenced. Since 63f67aa, the `fake.fail.add("delete")` + `--apply` run (`:302-303`) is refused at `photo-sweep.js:110-113` and sends 0 DELETEs. I reproduced this: exit 1, output `refusing…`, `missing file for photo …004`, summary `deleted 0, failed 0`, 0 DELETE requests. The test still passes, but its delete-failure leg no longer runs. The impl-log says the existing apply tests that relied on an empty reference set were anchored, but this one was missed.
- **Fix instruction**:
  - In that test, call `await anchor();` before the files are seeded (before `:298`).
  - After the failing apply run at `:303`, assert that DELETEs were actually attempted, e.g. `expect(deletes().length).toBeGreaterThan(0)`. This stops the leg from going silently dead again.
  - Keep every other assertion. The anchor's `fakefile00000100` is covered by the existing `"fakefile"` check, and with `listPageSize` 2 there are still page tokens.

### Rules R1–R10 (CLAUDE.md)
No violations found. Only `server/photo-sweep.js`, `server/photo-sweep.db.test.ts`, `server/README.md` and the impl-log changed, all inside the plan's files (R7). There is no client, env, migration or Figma change.

### Nits (do not block)
- `server/README.md:74` still says "rerun with the number it prints once you have checked it". The new bullet at `:75` covers the dangerous case, so this is acceptable.
- In dry-run the warning line starts with `refusing:` even though nothing is being refused. A dry-run wording such as `warning: … --apply would refuse` would be clearer. Do not change it unless Ming asks.
- The refusal goes to stdout, like the other failure lines (security note N9, unchanged).

### Follow-ups (out of scope)
- Unchanged from attempt 1: scheduling, `scripts/check-image.sh` `expect_exit 2` line, the stale README environment line, trash instead of permanent delete (security N1), and an optional ratio guard.
