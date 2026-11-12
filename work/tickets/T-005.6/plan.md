Status: READY

# Plan — T-005.6: Orphan sweep for Drive photos

Gate: none. This is slice 2 of T-005.2 (see `work/tickets/T-005.2/plan.md`, Split proposal and A5). The defaults
chosen here are recorded under Assumptions.

## Feature summary
- docs/feature-list.md M1 goal: "CRUD with photos works". This ticket is the cleanup half of that goal.
- D27 (`work/decisions.md`): "Item photos are stored in Ming's Google Drive folder `TuDoCuaTui/` … handled only by the
  TuDo Node server: OAuth refresh token and client secret in the server's runtime env only (R3)".
- Ticket goal: "Drive files that no `item_photos` row references (create timeouts after Google accepted the upload,
  crashes, failed best-effort deletes) get cleaned up safely."
- Ticket scope, quoted:
  - "`drive.listFiles({ q, pageToken })` in `server/drive.js` (folder + `appProperties app=tudo`, paginated, same
    error/log discipline)."
  - "`server/photo-sweep.js` (dry-run by default, `--apply` to delete): deletes only files tagged `app=tudo`,
    unreferenced by any row, older than a grace period (≥15 min, default 60); re-checks the DB before each delete;
    never touches untagged files; reports rows whose file is missing."
  - "Fake Drive list endpoint; sweep tests against real Postgres; README runbook (how to run it in the container)."
- T-005.2 plan A5 (approved by Ming, `work/ming-todo.md`, 2026-11-12): "It only touches files tagged `app=tudo`,
  unreferenced, and older than a grace period of at least 15 minutes (default 60). It re-checks the DB before each
  delete and only reports rows whose file is missing."
- Out of scope (ticket): "Scheduling the sweep (deployment-repo follow-up)."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Unreferenced old tagged files are deleted with `--apply`. | `server/photo-sweep.db.test.ts › apply deletes an unreferenced tagged file older than the grace period`: the fake Drive no longer holds it, and the output has `delete <photoId>: ok`. |
| 1a | Referenced files are kept. | `photo-sweep.db.test.ts › apply keeps a file referenced by an item_photos row`. |
| 1b | Young files are kept. | `photo-sweep.db.test.ts › apply keeps an unreferenced file younger than the grace period` (default 60, and `--grace-minutes 15` at the 15-minute boundary). |
| 1c | Untagged files are kept. | `photo-sweep.db.test.ts › apply keeps untagged files`: there are three fixtures, with no `appProperties`, with `{tudo:"smoke"}`, and with `{app:"other"}`. The test covers both the fake's `q` filter and the sweep's own `app === "tudo"` check, the latter through a fake mode that ignores the tag clause (A4). |
| 1d | Dry-run deletes nothing. | `photo-sweep.db.test.ts › dry-run (default) deletes nothing and reports would-delete`: no DELETE request is recorded on the fake, and every file is still present. |
| 1e | The DB is re-checked before each delete. | `photo-sweep.db.test.ts › a row inserted after the listing is not deleted (re-check)`. A `drive.deleteFile` wrapper inserts the referencing row before the first delete runs, or the listing is followed by the insert. The file survives and the output has `keep <photoId>: referenced`. |
| 1f | Rows whose file is missing are reported, not deleted. | `photo-sweep.db.test.ts › rows whose Drive file is missing are reported and kept`: the output has `missing file for photo <row uuid>`, the row still exists, and the exit code is 0. |
| 2 | Pagination works. | `drive.test.ts › listFiles sends q, fields, pageSize=1000 and pageToken; returns files and nextPageToken`. `photo-sweep.db.test.ts › pagination: files on later pages are swept` uses a fake `listPageSize` of 2 with 5 files, and the fake records 3 list requests. `drive.http.test.ts › listFiles paginates against the fake`. |
| 2a | No token or Google text in logs. | `photo-sweep.db.test.ts › output never contains tokens, secrets, Google error text, Drive file ids or page tokens`. Fake failures carry a sentinel message string. The test asserts that the joined output and error lines contain none of `FAKE.accessToken`, `FAKE.refreshToken`, `FAKE.clientSecret`, the sentinel, a fake Drive id (`fakefile…`) or the page token. `drive.test.ts › listFiles errors carry only a code and log only {event, op, status, code, reason}`. |
| 3 | `listFiles` follows the drive.js contract. | `drive.test.ts` covers: redirect manual (307 gives `drive_bad_response` after one request), 5xx retried up to 3 attempts, 401 refreshed once, 400 gives `drive_bad_response`, malformed JSON or a bad file id gives `drive_bad_response`, and `createdTime` is parsed. |
| 4 | The CLI follows the smoke pattern. | `photo-sweep.cli.test.ts`: without Google env it exits 2 with `drive not configured`. A partial Google env exits 2 without printing values. Without `DATABASE_URL` it exits 2. `--grace-minutes 5` exits 2, and so does an unknown flag. |
| 5 | Checks are green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test` with `TEST_DATABASE_URL` set (the DB tests must run in CI, `server/test/pg.ts`), and `pnpm build`. |

## Ming verification after merge
- After the release that contains this, run the dry-run in the container, as in the README runbook:
  `docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/photo-sweep.js`.
  Check the counts look plausible: "referenced" should be close to the number of items with photos. Only then run it again with `--apply`.
- Scheduling is a deployment-repo follow-up, not part of this ticket.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/drive.js` | Add `listFiles({ q, pageToken })` to the client and export `taggedFilesQuery(folderId)` (A1, A2). Expose the configured `folderId` only through that helper's caller; nothing else changes. | Ticket scope: the list call. |
| `server/photo-sweep.js` (new) | `runSweep({ drive, pool, folderId, apply, graceMinutes, maxDelete, now, log })` and `main({ argv, env, log, error, makeClient, makePool })`, plus the CLI guard as in `drive-smoke.js`. Exit codes 0/1/2. | Ticket scope: the sweep script. |
| `server/test/fake-drive.ts` | Add `GET /drive/v3/files?q=…` with `q` parsing, `trashed`/`parents`/`appProperties` filtering and opaque-token pagination. Uploads get `createdTime`. Add a `listPageSize` override and `fail`/`hang` mode `"list"`, a mode `"list-ignore-tag"` (A4), and an error sentinel message in failure bodies. | Ticket scope: the fake list endpoint. |
| `server/drive.test.ts` | Unit tests for `listFiles` with stubbed fetch. | R8: new pure/IO logic gets tests. |
| `server/drive.http.test.ts` | One pagination round-trip against the fake. | AC 2. |
| `server/photo-sweep.db.test.ts` (new) | Sweep behaviour against real Postgres (`createTestDb` + `runMigrations`) and the fake Drive. | AC 1–2a; the ticket says "against real Postgres". |
| `server/photo-sweep.cli.test.ts` (new) | Spawned-CLI exit codes and argument parsing (no DB, no Google). | AC 4. |
| `server/README.md` | New section "Photo sweep (T-005.6)": what it does, flags, exit codes, output lines, the runbook command (`docker compose … exec tudocuatui node server/photo-sweep.js [--apply] [--grace-minutes N]`), and "dry-run first". In the photos paragraph (line 53), change "T-005.6 sweeps these" to point at the section. | Ticket scope: README runbook. |

No other file is touched. `scripts/check-image.sh` (an image check that the sweep exits 2 without env) is a follow-up, see Assumptions A12.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `drive.test.ts › listFiles sends q, fields, pageSize=1000 and pageToken; returns files and nextPageToken` | URL: `GET {apiBase}/files?q=…&fields=nextPageToken,files(id,createdTime,appProperties)&pageSize=1000&spaces=drive[&pageToken=…]` via `URLSearchParams`. Result shape. |
| `drive.test.ts › listFiles without nextPageToken returns nextPageToken undefined` | Last page |
| `drive.test.ts › listFiles retries 5xx up to 3 attempts, refreshes once on 401` | Contract (retry: true) |
| `drive.test.ts › listFiles 3xx -> drive_bad_response after one request (redirect manual)` | Contract |
| `drive.test.ts › listFiles 400 -> drive_bad_response; 403 -> drive_forbidden; 429 -> drive_rate_limited` | Error mapping |
| `drive.test.ts › listFiles malformed body (not JSON, files not an array, bad file id, bad nextPageToken) -> drive_bad_response` | A3 validation |
| `drive.test.ts › taggedFilesQuery builds the folder + trashed + app=tudo query` | A1 |
| `drive.test.ts › listFiles errors carry only a code and log only {event, op, status, code, reason}` (extend the existing "logging and redaction" block) | AC 2a |
| `drive.http.test.ts › listFiles paginates against the fake and returns only tagged, non-trashed files in the folder` | AC 2, fake fidelity |
| `photo-sweep.db.test.ts › apply deletes an unreferenced tagged file older than the grace period` | AC 1 |
| `photo-sweep.db.test.ts › apply keeps a file referenced by an item_photos row` | AC 1a |
| `photo-sweep.db.test.ts › apply keeps an unreferenced file younger than the grace period` (default 60; 14 min kept and 16 min deleted with `--grace-minutes 15`) | AC 1b |
| `photo-sweep.db.test.ts › apply keeps untagged files` (q filter, plus the in-code check with `list-ignore-tag`) | AC 1c, A4 |
| `photo-sweep.db.test.ts › apply keeps files with a missing or unparsable createdTime` | A5 |
| `photo-sweep.db.test.ts › dry-run (default) deletes nothing and reports would-delete` | AC 1d |
| `photo-sweep.db.test.ts › a row inserted after the listing is not deleted (re-check)` | AC 1e |
| `photo-sweep.db.test.ts › rows whose Drive file is missing are reported and kept; young rows are not reported` | AC 1f, A6 |
| `photo-sweep.db.test.ts › pagination: files on later pages are swept` | AC 2 |
| `photo-sweep.db.test.ts › a failed delete is reported with its code, the sweep continues, exit 1` (`fail "delete"`) | A8 |
| `photo-sweep.db.test.ts › list failure -> exit 1, nothing deleted` (`fail "list"`) | A8 |
| `photo-sweep.db.test.ts › more candidates than --max-delete: apply deletes nothing, exit 1` | A7 |
| `photo-sweep.db.test.ts › folder check fails -> exit 1, no list, nothing deleted` | A9 |
| `photo-sweep.db.test.ts › output never contains tokens, secrets, Google error text, Drive file ids or page tokens` | AC 2a |
| `photo-sweep.db.test.ts › main runs with env + injected client/pool factories and returns the exit code` | Wiring |
| `photo-sweep.cli.test.ts › without Google env exits 2 'drive not configured'` | AC 4 |
| `photo-sweep.cli.test.ts › partial Google env exits 2 without values` | AC 4, R3 |
| `photo-sweep.cli.test.ts › Google env but no DATABASE_URL exits 2 'DATABASE_URL is not set'` | AC 4 |
| `photo-sweep.cli.test.ts › --grace-minutes below 15, non-integer, unknown flag -> exit 2 with usage` | A3, AC 4 |

The DB tests use `describe.skipIf(!dbAvailable)`, as `api.db.test.ts` does. `server/test/pg.ts` already throws when
`CI` is set without `TEST_DATABASE_URL`, so they cannot be skipped in CI. Rows are created with `saveItem` (or plain SQL
inserts into `items`) and `insert into item_photos (id, item_id, drive_file_id, is_primary)`. Fake files are put straight
into `fake.files` with `meta {parents:[folderId], appProperties, createdTime}`. Time is injected through `now`.

## Approach
1. **`drive.js`, `listFiles`.**
   - Signature: `listFiles({ q, pageToken })`.
   - Build `URLSearchParams({ q, fields: "nextPageToken,files(id,createdTime,appProperties)", pageSize: "1000", spaces: "drive" })` and add `pageToken` when given.
   - Call `request("list", { method: "GET", url: \`${apiBase}/files?${params}\`, timeoutMs: t.meta, retry: true })`, with redirect manual by default.
   - Parse the body:
     - Invalid JSON, or `files` that is not an array, gives `drive_bad_response`.
     - Each entry needs an `id` matching `FILE_ID_RE`, otherwise `drive_bad_response`.
     - `createdTime` becomes epoch ms when it is a string that parses, otherwise `null`.
     - `appProperties` is kept only when it is a plain object of string values, otherwise `{}`.
     - `nextPageToken` must be absent or a non-empty string of at most 4096 characters, otherwise `drive_bad_response`.
   - Errors and logs keep the existing `note()` path, so they carry no text, URL or token.
   - Export `taggedFilesQuery(folderId)`, which returns `'<folderId>' in parents and trashed = false and appProperties has { key='app' and value='tudo' }`.
     - The folder id is already constrained by `FOLDER_RE` (no quote characters).
     - The helper still throws `DriveError("drive_invalid_id")` when the id does not match `FOLDER_RE`.
2. **`fake-drive.ts`.**
   - Route `GET /drive/v3/files?…`, before the `/files/:id` regex.
   - Parse `q` with one strict regex for exactly the query `taggedFilesQuery` emits. Anything else gives 400.
   - Filter `files` on `meta.parents` including the folder, `meta.trashed !== true`, and `meta.appProperties?.app === "tudo"`. The `list-ignore-tag` mode skips the last filter.
   - Page by `min(pageSize, listPageSize)` with an opaque base64 offset token, and return the requested fields.
   - Uploads set `meta.createdTime = new Date().toISOString()` when it is absent.
   - `fail`/`hang` gain `"list"`. Failure bodies include the exported constant `GOOGLE_TEXT_SENTINEL` as `error.message`.
3. **`photo-sweep.js`, `runSweep`** (pure orchestration with injected `drive`, `pool`, `now` and `log`).
   1. `await drive.checkFolder()`. On failure, log `checkFolder: FAIL <code>` and return 1.
   2. List all pages with `taggedFilesQuery(folderId)`. Stop after 1000 pages, or on a repeated token (`drive_bad_response`). On failure, log `list: FAIL <code>` and return 1.
   3. Load `select id, drive_file_id, created_at from item_photos where drive_file_id is not null`. On failure, log `db: FAIL <pg code>` and return 1.
   4. Classify each listed file, in this order:
      - `untagged`: `appProperties.app !== "tudo"`. Never touched.
      - `referenced`.
      - `no_time`: `createdTime` is null.
      - `young`: `now - createdTime < grace`.
      - `candidate`.
   5. If `apply` and the number of candidates is greater than `maxDelete`: log `too many candidates: N > M (rerun with --max-delete N)`, delete nothing, and return 1.
   6. For each candidate:
      - Dry-run logs `would delete <label>`.
      - Apply first re-checks `select 1 from item_photos where drive_file_id = $1`:
        - Referenced: log `keep <label>: referenced`.
        - Otherwise call `drive.deleteFile(id)` and log `delete <label>: ok`, or `delete <label>: FAIL <code>`, which marks the run failed and continues.
      - `<label>` is `appProperties.photoId` when it is a UUID (`isUuid` from `validate.js`), otherwise `-`. Drive ids are never printed (A10).
   7. Missing files: report each DB row whose `drive_file_id` is not in the listed set and whose `created_at` is older than the grace period as `missing file for photo <row id>`. Report only.
   8. Summary line: `listed N (P pages), referenced R, young Y, untagged U, no_time T, candidates C, deleted D, failed F, missing M, mode dry-run|apply`.
   9. Return 0 or 1.
4. **`photo-sweep.js`, `main`.**
   - `util.parseArgs` in strict mode, with options `apply` (boolean), `grace-minutes` (string) and `max-delete` (string).
     - `grace-minutes` must be an integer from 15 to 43200. The default is 60.
     - `max-delete` must be an integer from 1 to 10000. The default is 50.
     - A bad flag or value prints a usage line and returns 2.
   - `loadDriveConfig(env)`:
     - `off` prints `drive not configured` and returns 2.
     - `DriveConfigError` prints `config error: <names>` and returns 2.
   - Missing `DATABASE_URL` prints `DATABASE_URL is not set` and returns 2.
   - Create the client with `makeClient({ config })`. Create the pool with `makePool(env.DATABASE_URL)`, defaulting to `createPool` from `db.js`.
   - Run `runSweep`, and `pool.end()` in `finally`.
   - Any unexpected error prints `sweep failed` and returns 1, never `err.message`.
   - CLI guard and `process.exit(await main())`, as in `drive-smoke.js`.
5. **README**: add the section and update the line-53 pointer. Then run the checks.

Rules:
- **R3**: no new env or `VITE_*` variable. Secrets stay in the server runtime env. Output is codes, counts and photo row UUIDs only, and AC 2a tests this.
- **R4 spirit**: Drive ids are not printed.
- **R1, R5, R6, R9**: unaffected, because this is server-only, has no UI and stores nothing derived.
- **R7**: scheduling and the image check stay out.
- **R8**: the tests above.
- **R10**: no Figma files touched.
- **D25**: no migration needed. The unique index on `drive_file_id` already makes the re-check an index lookup.

## Specialist input used
From `work/tickets/T-005.2/consult-database-optimizer.md`, R-5:
- **Adopted:**
  - The query `'<folder>' in parents and trashed=false and appProperties has {key='app' and value='tudo'}`.
  - The fields `nextPageToken, files(id, createdTime, appProperties)`, `pageSize` 1000, and pagination.
  - The same error and log discipline as the rest of drive.js.
  - A script modelled on drive-smoke.js, dry-run by default with `--apply`, not an in-process timer.
  - The reference set comes from `select drive_file_id from item_photos where drive_file_id is not null`.
  - Grace period of at least 15 minutes, default 60 (T-005.2 A5).
  - Re-check before each delete. Never touch untagged files. Report missing-file rows without deleting them.
  - No in-handler lookup after a create timeout.
- **Extended:**
  - The sweep also checks `app === "tudo"` in code, so it does not rely on `q` alone (A4).
  - Missing-file reporting also respects the grace period, because `files.list` can lag (A6).
  - Added a delete cap (A7).
- R-6 sweep tests: all adopted (deleted, referenced, young, untagged, pagination, dry-run). The plan adds re-check, missing rows, failure paths, the cap and redaction tests.

## Assumptions
- **A1 — The `q` comes from a helper.** The `listFiles({ q, pageToken })` shape follows the ticket. The sweep only ever passes `taggedFilesQuery(folderId)`, so the tag and folder constraints live in one place. `spaces=drive` is sent explicitly.
- **A2 — `listFiles` is idempotent.** It is retried like delete and folder (3 attempts, 401 refresh once), with timeout `t.meta` (10 s) and redirect manual.
- **A3 — Validation.** A malformed list response aborts the sweep (`drive_bad_response`, exit 1) rather than skipping entries. Real Drive ids always match `FILE_ID_RE`, and aborting is the safe failure for a deleting tool.
- **A4 — Defense in depth on the tag.** Even though `q` filters on `app=tudo`, the sweep re-checks `appProperties.app === "tudo"` per file and skips anything else as `untagged`. The fake's `list-ignore-tag` mode proves the check. Smoke files (`{tudo:"smoke"}`) are therefore never touched.
- **A5 — Unknown age means keep.** A file with no parsable `createdTime` is kept and counted as `no_time`.
- **A6 — Missing-file report.**
  - Only rows older than the grace period are reported, so `files.list` lag right after an upload does not produce noise.
  - Missing rows do not change the exit code (0). The ticket says "reports", not "fails".
  - Rows are reported by `item_photos.id`.
  - A row that only has a legacy `storage_path` is ignored (`drive_file_id is not null`).
- **A7 — Delete cap `--max-delete` (default 50).**
  - With `--apply`, if more files qualify than the cap, nothing is deleted and the exit code is 1.
  - This guards against a wrong or empty `DATABASE_URL` making every photo look unreferenced, because Drive deletes are permanent (consult risk 8).
  - The flag is not named in the ticket. It is a small safety default for an `areas: security` ticket, and Ming can drop it at review.
- **A8 — Failures.**
  - checkFolder, list or DB-load failure: exit 1 before any delete.
  - A per-file delete failure is reported with its code, the sweep continues, and the exit code is 1.
  - `deleteFile` already treats 404 as success.
- **A9 — `checkFolder` runs first**, so a wrong folder fails loudly instead of listing nothing and reporting every row as missing.
- **A10 — Output and identifiers.**
  - Plain lines go to stdout (errors to stderr), like drive-smoke.
  - The only identifiers printed are photo/row UUIDs (`appProperties.photoId` and `item_photos.id`). This matches `photo_orphan` logging in `photos.js`.
  - Drive file ids, page tokens, tokens, URLs and Google text are never printed.
  - The Drive client is created without a `log` sink, as in drive-smoke.
- **A11 — Race safety.**
  - An upload calls `createFile` and then inserts its row within seconds: the create times out at 30 s and the request deadline is 30 s.
  - With a grace period of at least 15 minutes, a file whose row is still to come is never a candidate.
  - The per-delete re-check covers rows written between the listing and the delete.
  - No item lock is taken. The sweep only deletes Drive files and never writes `item_photos`, so the lock rule ("every writer of item_photos locks items first") is not affected.
- **A12 — Follow-ups, not in this diff (R7).**
  - Scheduling (cron or compose one-shot in the deployment repo).
  - An image check `expect_exit 2 … node server/photo-sweep.js` in `scripts/check-image.sh`.
  - The stale "GitHub environment `tudocuatui`" line in `server/README.md` (T-005.2 A19; D28 made these repository secrets).
- **A13 — Pool.** The pool is `createPool` from `db.js`, which reuses `application_name` `tudocuatui-api` and the 5 s `statement_timeout`. A separate application name is not worth a signature change.
- **A14 — Hotspot files.** `server/drive.js`, `server/test/fake-drive.ts` and `server/README.md` are shared with T-005.3 (merged or in PR; its plan A13 lists T-005.6 as the other user). Branch `claude/loving-fermi-t90upb`. Rebase on the latest `main` before implementing.
- **Size.** About 200–250 non-test lines (`listFiles` about 50, sweep about 150, fake about 40, README about 20). This is within one cycle.

## Blocking questions
None.

## Split proposal
None.
