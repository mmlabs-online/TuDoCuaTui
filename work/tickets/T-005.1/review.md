## Attempt 1 — 2026-11-11
Verdict: PASS

Scope reviewed: slice 1 only (server-side Drive client, smoke, startup config, image checks, README, M-15 wording).
Connect script, deploy workflow and full runbook are T-005.5. Diff `git diff origin/main...HEAD` (T-016 files ignored).

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` — clean.
- format:check: "All matched files use the correct format." (171 files).
- test: `pnpm test` (run twice) — Test Files 58 passed | 4 skipped (62); Tests 667 passed | 42 skipped (709).
- coverage: `CI=true pnpm test:coverage` with TEST_DATABASE_URL on a temporary local PostgreSQL 16 (data dir under /tmp,
  scram password auth, run as `postgres`, stopped and deleted afterwards) — 62 files, 709 tests passed, thresholds met.
  `drive.js` 99.48 stmts / 97.97 branches / 100 funcs / 100 lines; `drive-smoke.js` 91.66 / 85.71 / 100 / 90.69.
- build: `pnpm build` — built (dist/assets/index-*.js 247 kB).
- image: rebuilt with a scratch copy of the Dockerfile (outside the repo) that only adds the sandbox CA
  (`COPY --from=ca` + `NODE_EXTRA_CA_CERTS`) to the `build` and `prod-deps` stages; runtime stage unchanged.
  `bash scripts/check-image.sh <image>` → `image ok` (start log shows `drive not configured`).
  Extra probes on the image: partial Google config (with Access set) → exit 2, stderr `config error: Google Drive config
  is incomplete, missing: GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_FOLDER_ID` (names only);
  `node server/drive-smoke.js` without env → exit 2 `drive not configured`; `/app/server/test` absent; a planted
  `GOCSPX-…` file is detected by the new value-scan expression. Image, build cache and dockerd removed afterwards.
- fake-Drive smoke: `runSmoke` with a real-fetch client pointed at `server/test/fake-drive.ts` → all five steps `ok`,
  exit 0, 0 files left; requests: POST /token, GET folder, POST upload, GET media, DELETE, GET (404). Client log held
  only `{"event":"drive","op":"get","code":"drive_not_found","status":404,"reason":"notFound"}`.
- repo secret scan: `grep -rnE 'GOCSPX-[A-Za-z0-9_-]{10,}|1//0[A-Za-z0-9_-]{20,}' --exclude-dir=node_modules --exclude-dir=.git .` → no match.

### Acceptance criteria (this slice)
- [x] 1a "with it unset the server still starts" — `server/index.cli.test.ts` "starts with no Google env and logs 'drive
  not configured'"; `server/index.js:38-46`; check-image smoke reached `/healthz` 200 with `drive not configured`.
- [x] 1b partial/malformed config refused (A7) — `server/drive.js:52-68`; `drive.test.ts:62,85`; `index.cli.test.ts`
  "partial Google config exits 2 …"; `scripts/check-image.sh:113`; reproduced on the image (exit 2, names only).
- [x] 1c smoke creates, reads, deletes in the folder (fake Drive) — `drive-smoke.test.ts:22` plus reviewer run above;
  `parents:[folderId]` asserted in `drive.http.test.ts:34-37` and `drive.test.ts:329`. Real Drive = M-15 after T-005.5.
- [x] 1d smoke without config exits 2 — `drive-smoke.test.ts:116,122`; `scripts/check-image.sh:112`; reproduced on image.
- [x] 2a no token/secret in logs, responses, image, repo — `DriveError` carries only `code`/`status`, message = code, no
  cause (`drive.js:11-19`); every fetch/text failure is swallowed by bare `catch {}` (`drive.js:179,255`); log entries are
  built from fixed fields with an allowlisted reason (`drive.js:31-44,70-82,114-120`); config errors name variables only
  (`drive.js:57,66`); `index.js` prints only the mode (`index.js:40-42`); smoke prints step names, codes and file ids only
  (`drive-smoke.js:17,21,52,86`). Tests: `drive.test.ts:424,438` (8 error paths incl. Google bodies echoing the secret and
  thrown errors carrying the token), `index.cli.test.ts` (fake values not in stdout/stderr). Image: env-name grep
  (`check-image.sh:58`) and value scan (`check-image.sh:46-48`) green. Repo scan clean.
- [x] 2b token exchange and error mapping tested with a fake Drive — `drive.test.ts:107-199` (form POST, secret only in
  body, cache to expires_in−60 s, single flight, failed refresh clears in-flight, invalid_grant cooldown, retries) and
  `:201-320` (401 refresh once, 429/403 rate limit + Retry-After cap 10 s, 5xx ×3, network/abort, 403 forbidden, 404 +
  idempotent permanent DELETE, id validation); `drive.http.test.ts` (real fetch: streaming, headers timeout, caller abort,
  upload timeout single request). Coverage thresholds added (`vitest.config.ts:62-63`).
- [x] 3 runbook — moved to T-005.5 per the approved split. M-15 rewritten verbatim from plan.md (compared line by line,
  `work/ming-todo.md:148-155`): Desktop-app client, environment `tudocuatui` restricted to `main`, script creates the
  folder, "Do not create the folder by hand", delete client JSON + token file, dispatch deploy, then smoke.
  `server/README.md` documents the 4 env names, all-or-nothing rule, error codes and the A13 smoke command.

### Specific points checked
- **Endpoint overrides not env-driven (A11)**: Google URLs are factory defaults (`drive.js:100-102`); no `process.env`
  in `drive.js`; `drive-smoke.js:84` calls `makeClient({ config })` with no URL; `index.js` creates no client.
- **Retries vs A8**: `createFile` passes `retry:false` (`drive.js:328`), so `last` is true on the first attempt
  (`drive.js:240`): 5xx, network error, timeout and 429 each give exactly one request (`drive.test.ts:360-373`,
  `drive.http.test.ts:74-83`); 401 refresh+retry still allowed once (`drive.js:265-271`). get/delete/checkFolder use
  `retry:true` with max 3 attempts (`drive.js:106,240`), backoff `500·2^n + <250 ms` or Retry-After capped 10 s
  (`drive.js:123-128`). Token refresh retries 5xx/429/network up to 3 (`drive.js:163-212`) and is not multiplied by the
  outer loop (getToken is outside the try at `drive.js:239`). Aborted caller → no retry (`drive.js:257`).
- **A15 cooldown**: `drive.js:213,221`; tested `drive.test.ts:152`.
- **A4 permanent delete / 404 success**: `drive.js:368-380`; tested `drive.test.ts:271`.
- **Injection guards**: file ids `^[A-Za-z0-9_-]{10,200}$` + `encodeURIComponent` (`drive.js:28,298-301`); mime type
  regex blocks CRLF in the multipart header (`drive.js:29,311`); metadata via `JSON.stringify`; random 96-bit boundary.
- **A10**: Drive not in `/readyz`, no network call at startup (`index.js:38-46`; `index.cli.test.ts` /readyz 503 without DB
  unaffected).

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no `src/` or data-layer change; local mode untouched. R2: no migration. R3: secrets only from
runtime env; nothing in `VITE_*`, image env or repo (checks above). R4/R5/R6/R9: not applicable (no storage/schema/UI;
D27 replaces signed URLs). R7: every changed file is in the plan list; the other `work/` changes are orchestrator
bookkeeping (ticket.md, plan-approval lines in ming-todo.md) and T-016 files, ignored as instructed. R8: checks green,
unit + integration tests and coverage thresholds for both new modules. R10: `AGENTS.md`, `.figma/`, `vite.config.ts`
untouched.

### Nits (do not block)
- 💭 `impl-log.md` reports `pnpm test` as 665 passed | 42 skipped (707 total), but its own coverage line and both
  reviewer runs give 709 total (667 passed | 42 skipped). The green result reproduces; the count looks stale. Keep the
  numbers exact next time.
- 💭 `server/drive.js:204` logs a token 429 with `code: "drive_unavailable"` but throws `drive_rate_limited` on the last
  attempt (`:207`). Log the same code that would be thrown.
- 💭 `server/drive.js:152`: for streaming calls that fail (non-2xx or fetch error), the `abort` listener stays on the
  caller's signal; with retries up to 3 stale listeners. Harmless (`once`, dead controllers), but could be removed when
  `!res.ok` or on throw.
- 💭 `server/drive.js:341`: `size: Number(j.size)` is `NaN` if Google omits `size`; T-005.2 should not rely on it blindly.
- 💭 `server/drive-smoke.js:31`: `=== undefined && failed` is a roundabout way to say "checkFolder failed"; a boolean
  return from `step` would read more clearly.
- 💭 `scripts/check-image.sh:46`: if one of the scanned paths were missing, grep exits 2 and the check passes silently
  (same pattern as the existing `sb_secret_` scan). All three paths exist in the current image.

### Follow-ups (out of scope)
- T-005.2: decide how to handle `drive_unavailable` on create (possible orphan on a timeout after Google accepted the
  upload) — orphan cleanup is already in its scope.
- T-005.5: connect script, workflow secrets, full M-15 runbook and the security review of the deploy config.

### Security follow-ups to fix (Ming, 2026-11-11: "Sửa cả 2 rồi mở PR")
From security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request):
1. `server/drive.js:143,168-178` — no redirect following on the token exchange (`redirect: "error"`, or `"manual"` mapped to `drive_bad_response`); same for meta/create/delete. Leave `getMedia` on follow unless sure Drive `alt=media` never redirects. Test: a 307 from the token URL fails and makes no second request.
2. `server/drive.js:298-300,376-378` — `deleteFile` must not report success for an id that fails `FILE_ID_RE`: give invalid ids their own code (e.g. `drive_invalid_id`) or swallow `drive_not_found` only when `status === 404`. Also validate the id returned by `createFile` (`:337-341`) against `FILE_ID_RE`. Tests for both.

## Attempt 2 — 2026-11-11
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` → clean (tsc app + tsconfig.server.json).
- format: `pnpm format:check` → "All matched files use the correct format." (171 files).
- tests: `pnpm test` → Test Files 58 passed | 4 skipped (62); Tests 670 passed | 42 skipped (712). Matches impl-log.
- coverage: `CI=true pnpm test:coverage` with a throwaway local PostgreSQL 16.15 (data dir under /tmp, scram password
  auth, `TEST_DATABASE_URL` set; stopped and deleted afterwards) → exit 0, 62 files, 712 passed; `drive.js` 99.48 lines /
  98.7 branches / 100 funcs; thresholds met. Matches impl-log.
- build: `pnpm build` → built OK.
- Real-fetch probe (reviewer, scratch script, not committed): local HTTP server answering 307 to everything,
  `createDriveClient({ tokenUrl/apiBase/uploadBase: local })`, `deleteFile("abcdefghij12")` → `DriveError
  drive_bad_response 307`, server saw exactly one request (`POST /token`). Confirms Node's fetch returns the 3xx
  unfollowed with `redirect: "manual"`.

### Scope
`git show 094c220 --stat`: `server/drive.js`, `server/drive.test.ts`, `server/README.md` (error-code list + redirect
note), `impl-log.md`. `git diff 19fc4ac..HEAD` adds only orchestrator bookkeeping (`ticket.md` state). Nothing else
changed since attempt 1.

### Security follow-up 1 — no redirect following (except getMedia)
- `once()` takes the mode and passes it to fetch (`server/drive.js:134,137,144`).
- Token exchange: `"manual"` (`drive.js:179`); a 3xx throws `drive_bad_response` with no retry (`drive.js:204-207`).
- Meta/create/delete (`request()`): `"manual"` unless `follow` (`drive.js:260`); a 3xx is not 401/429/403-rate/5xx so it
  falls through to `drive_bad_response` with no retry (`drive.js:288-297`). Only `getMedia` sets `follow: true`
  (`drive.js:364`).
- Tests: `drive.test.ts:300` (307 from token → 1 request; 307 on delete → 2 requests, `redirect:"manual"`; getMedia
  token call manual, media call follow); `drive.test.ts:425` (307 on create → no second upload, manual).

### Security follow-up 2 — invalid ids
- `fileUrl` throws new code `drive_invalid_id` (`drive.js:306`; typedef `:9`); `deleteFile` swallows only
  `drive_not_found` (`drive.js:385`), so a malformed id now rejects. Test `drive.test.ts:284`: six bad ids, getMedia and
  deleteFile both → `drive_invalid_id`, `calls` length 0.
- `createFile` validates the returned id with `FILE_ID_RE` (`drive.js:344`). Test `drive.test.ts:418` (short, path-like,
  `../etc/passwd`, 201 chars → `drive_bad_response`). Existing fake ids lengthened to pass the check.
- README error list includes `drive_invalid_id` and the redirect rule (`server/README.md:24`).

### Issues
None.

### Rules R1–R10
No change from attempt 1; the rework touches only `server/drive.js`, its tests and README. R3/R4: secrets still not
logged (3xx path logs status + fixed code only, `drive.js:205`). R7: in scope. R8: checks green, new behaviour tested.
R10: untouched.

### Nits (do not block)
- 💭 No test sends a 3xx to `checkFolder` specifically; it shares `request()` with delete, which is tested, so coverage of
  the behaviour is adequate.
- 💭 Attempt 1 nits still stand (token 429 log code, stale abort listeners, `size` NaN, smoke readability, grep exit 2).

### Follow-ups (out of scope)
- Unchanged from attempt 1 (T-005.2 orphan handling on create timeout; T-005.5 deploy config + security review).
