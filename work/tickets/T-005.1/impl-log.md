## Attempt 1 — 2026-11-11

Slice 1 only (server-side Drive client and smoke). The connect script and deploy workflow belong to T-005.5.

### Files touched
| File | Required because |
|---|---|
| `server/drive.js` (new) | Drive v3 client: `loadDriveConfig`, `DriveConfigError`, `DriveError`, `createDriveClient` (createFile, getMedia, deleteFile, checkFolder) |
| `server/drive-smoke.js` (new) | Smoke command: `runSmoke`, `main` (exit 0/1/2), entry-point guard |
| `server/index.js` | Validate Google config at startup, log one fixed line, exit 2 on partial/malformed config |
| `server/drive.test.ts` (new) | Unit tests with injected fetch/now/sleep/random |
| `server/drive.http.test.ts` (new) | Real fetch against the fake Drive: streaming, timeouts, abort |
| `server/drive-smoke.test.ts` (new) | `runSmoke`, `main` and CLI exit codes |
| `server/index.cli.test.ts` | Drive startup cases |
| `server/test/fake-drive.ts` (new) | Shared fake Google token and Drive server (fake credentials only) |
| `scripts/check-image.sh` | Env-name grep adds `GOOGLE_`/`DRIVE_`; Google secret value scan; two `expect_exit 2` cases |
| `vitest.config.ts` | Coverage thresholds for `server/drive.js` and `server/drive-smoke.js` |
| `server/README.md` | Env table rows, all-or-nothing rule, Drive section, smoke command |
| `work/ming-todo.md` | M-15 rewritten verbatim from the plan |

### Tests added / changed
- `drive.test.ts`: loadDriveConfig (off, empty, valid, malformed, partial masks 1..14); token (form POST, cache, single flight, failed refresh, invalid_grant cooldown, other 4xx, retries, bad response, default expiry); 401 refresh once; 429/403 rate limit and Retry-After cap; 5xx x3; network errors and abort; 403 forbidden; 404 and idempotent delete; file id validation; getMedia; createFile (multipart body, no retry, 5 MB cap, bad mime, bad reply); checkFolder; log allowlist; redaction across 8 error paths.
- `drive.http.test.ts`: token+create+stream+delete, headers timeout, caller abort, upload timeout single request.
- `drive-smoke.test.ts`: happy path, mismatch still deletes, delete failure, still readable, folder missing, create failure, `main` (ok and unexpected failure), CLI exit 2 (no env, partial env).
- `index.cli.test.ts`: not configured logged, configured with fake values (no value printed), partial config exits 2.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: 58 files passed, 4 skipped (DB tests, no TEST_DATABASE_URL); 665 passed, 42 skipped.
- coverage: `CI=true pnpm test:coverage` with local PostgreSQL 16 (TEST_DATABASE_URL, data dir under /tmp, stopped and deleted afterwards): 62 files, 709 tests passed, thresholds met. `drive.js` 99.48 lines / 97.97 branches; `drive-smoke.js` 91.66 / 85.71.
- build: `pnpm build` succeeded.
- image: built with a scratch Dockerfile copy (outside the repo) adding only the sandbox proxy CA to the build stages; `bash scripts/check-image.sh <image>` -> `image ok` (incl. the new exit-2 cases, and the log shows "drive not configured"). Image and dockerd removed afterwards.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `deleteFile` treats an invalid file id as already gone (no request, resolves), consistent with the idempotent delete; T-005.2 only stores ids it created.
- The real-Drive smoke is Ming's M-15 after T-005.5.

### Scope self-check
- Could the diff be smaller? No; every file is in the plan list.
- Diff size: about +1,150 lines including tests (drive.js ~390, drive-smoke.js ~100 as formatted by oxfmt); no new dependency, no `createApp` change.

## Attempt 2 (REWORK: the two security follow-ups from review.md)

### Files touched
| File | Required because |
|---|---|
| `server/drive.js` | `once()` takes a redirect mode: `manual` for token, meta, create and delete (a 3xx maps to `drive_bad_response`, no retry, no second request); `follow` only for `getMedia`. New code `drive_invalid_id`: `fileUrl` throws it, so `deleteFile` no longer reports success for a malformed id. `createFile` checks the returned id against `FILE_ID_RE` |
| `server/drive.test.ts` | 307 from the token URL and from create (one request each), `redirect` option per call, `deleteFile`/`getMedia` invalid id -> `drive_invalid_id`, bad returned ids; fake ids lengthened to pass the new check |
| `server/README.md` | Error code list and redirect note |

### Checks
- typecheck clean; format:check clean; `pnpm test` 670 passed, 42 skipped (no DB).
- `CI=true pnpm test:coverage` with local PostgreSQL 16 (stopped and deleted): 62 files, 712 tests passed; `drive.js` 99.48 lines / 98.7 branches.
- build succeeded.

### Out-of-plan files
None.

### Follow-ups
None. Note: `drive-smoke.js` still ignores `drive_not_found` on delete only; ids it deletes come from `createFile`, now validated.

### Scope self-check
Only the two listed items; no other changes.
