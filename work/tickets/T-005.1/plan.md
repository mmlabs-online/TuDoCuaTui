Status: READY

# Plan — T-005.1: Connect the Node server to Google Drive (slice 1: the server-side Drive client and smoke)

Gate: **plan-approval** (High tier: secrets, and the production deploy config in slice 2). Ming confirms assumptions A1–A17.
This plan covers **slice 1 only**. See *Split proposal*: the connect script, deploy workflow and full M-15 runbook move
to a new ticket, **T-005.5**.

## Feature summary
- Ticket goal: "The TuDo Node server can create, read and delete files in Ming's Drive folder `TuDoCuaTui/` with a
  long-lived OAuth refresh token that only the server sees."
- D27 (work/decisions.md, 2026-11-11): "Item photos are stored in Ming's Google Drive folder `TuDoCuaTui/` (Ricotdin's
  Google Cloud project and account, OAuth client "TuDoCuaTui", scope `drive.file`, as decided 2026-11-08) and handled
  only by the TuDo Node server: OAuth refresh token and client secret in the server's runtime env only (R3); uploads/
  deletes through `/api`; images served by `GET /api/photos/:id` behind the Cloudflare Access check (no signed URLs)."
- D23: "Photos go to Google Drive via the backend (T-005 re-planned)."
- docs/feature-list.md F-202 (P0, M1): "**AC:** a photo taken on iPhone and on Android uploads successfully". This
  ticket only provides the storage layer that F-202 builds on. Note that F-202's "signed URLs refresh automatically"
  line is replaced by D27 ("no signed URLs").
- Ticket scope items in this slice: "`server/drive.js`: refresh-token → access-token exchange (cached until expiry),
  minimal Drive v3 calls (create multipart upload, get media, delete) with `fetch`; scope `drive.file`; timeouts;
  errors mapped to safe codes", "Config from runtime env only … the server starts without them", "A smoke command
  (create, read, delete a tiny file) runnable inside the container."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1a | "with it unset the server still starts" | `server/index.cli.test.ts › starts with no Google env and logs "drive not configured"`. The existing `check-image.sh` smoke (no Google env) still reaches `/healthz` 200. |
| 1b | Partial or malformed Google config is refused (A7) | `index.cli.test.ts › partial Google config exits 2 with a fixed message that holds no values`. `drive.test.ts › loadDriveConfig` cases. `check-image.sh` `expect_exit 2 "server with partial Google config"`. |
| 1c | "With the env set, smoke creates, reads and deletes a file in `TuDoCuaTui/`" | In CI: `server/drive-smoke.test.ts › runSmoke against a fake Drive: checkFolder → create → read (bytes equal) → delete → read 404, exit 0`. The file is created with `parents:[DRIVE_FOLDER_ID]`, asserted on the fake's recorded multipart body. With real Drive: Ming, in M-15, after T-005.5. |
| 1d | Smoke without config exits 2 | `drive-smoke.test.ts › CLI without env exits 2`. `check-image.sh` `expect_exit 2 "drive smoke without Google env"`. |
| 2a | "No token or client secret appears in logs, responses, the image or the repo (R3)" | `drive.test.ts › redaction`: across every error path, `JSON.stringify(err)`, `String(err)`, `err.stack` and every `log` entry are captured and must not contain the fake client secret, refresh token or access token. `index.cli.test.ts`: with fake values set, stdout and stderr do not contain them. `check-image.sh`: the image env-name check covers `GOOGLE_\|DRIVE_`, and a value scan of `/app/server`, `/app/dist` and `/app/package.json` looks for `GOCSPX-…` and `1//0…`. Reviewer: `grep -rE 'GOCSPX-[A-Za-z0-9_-]{10,}\|1//0[A-Za-z0-9_-]{20,}' --exclude-dir=node_modules .` returns nothing. |
| 2b | "tests cover the token exchange and error mapping with a fake Drive" | The `server/drive.test.ts` and `server/drive.http.test.ts` tests listed below. `pnpm test` is green. Coverage thresholds are added for `server/drive.js` and `server/drive-smoke.js`. |
| 3 | "The Ming runbook lists the exact steps" | **Moved to T-005.5** (split). This slice only rewrites M-15 to match A1 (the folder is created by the script, not by hand) and points to T-005.5. `server/README.md` documents the env names and the smoke command. |
| — | Checks | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` are green. The CI `image` job (check-image.sh) is green. |

## Ming verification after merge
None for this slice on its own: the server keeps starting with photos off, because no Google env is set anywhere yet.
The real-Drive smoke (AC1 with real credentials) is Ming's M-15. It runs after T-005.5 ships the connect script and the
deploy workflow change.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/drive.js` (new) | `loadDriveConfig(env)`, `DriveConfigError`, `DriveError`, `createDriveClient({...})` with `createFile`, `getMedia`, `deleteFile`, `checkFolder` | The core of the ticket (scope item 1–2) |
| `server/drive-smoke.js` (new) | `runSmoke({drive, log})`, plus a CLI wrapper used when the file is run directly (exit 0/1/2) | Scope item "smoke command … runnable inside the container" (ships in the image because `server/` is copied) |
| `server/index.js` | After the access config: `loadDriveConfig(process.env)`. On `DriveConfigError`, print `config error: <message>` and exit 2. Log `drive configured` or `drive not configured`. No client yet, and `createApp` is unchanged. | AC1a/1b; exit-code contract (A7) |
| `server/drive.test.ts` (new) | Unit tests with an injected `fetch`, `sleep`, `now` and `random` | AC2b, R8 |
| `server/drive.http.test.ts` (new) | Integration tests against a fake Drive on `node:http` at `127.0.0.1:0` (real `fetch`) | AC2b: streaming and timeout behaviour that a stub cannot show |
| `server/drive-smoke.test.ts` (new) | `runSmoke` against the fake Drive, and the CLI exit code 2 | AC1c/1d |
| `server/index.cli.test.ts` | Add the drive startup cases | AC1a/1b/2a |
| `server/test/fake-drive.ts` (new) | A small fake Google token and Drive v3 server shared by the http and smoke tests (`server/test` is excluded from the image) | Test fixture, no duplication |
| `scripts/check-image.sh` | Image env grep adds `GOOGLE_\|DRIVE_`. Value scan for Google secret patterns. `expect_exit 2` for `node server/drive-smoke.js` without env, and for the server with a partial Google config (with `ACCESS` set). | AC2a, AC1b/1d in the real image |
| `vitest.config.ts` | Add coverage thresholds for `server/drive.js` and `server/drive-smoke.js` | Same rule as the other server modules (R8) |
| `server/README.md` | Rows in the env table for the 4 variables (all-or-nothing, exit 2 on partial). A Drive section covering error codes, the smoke command (`docker compose … exec tudocuatui node server/drive-smoke.js`), and "Drive is not part of `/readyz`". | Documentation of the runtime contract, which T-005.5 and M-15 point to |
| `work/ming-todo.md` | Rewrite M-15 only (text below). | Consult Finding 7 and orchestrator request: under `drive.file`, a folder created by hand is invisible to the app |

M-15 new wording (implementer copies it verbatim):
> - [ ] **M-15 — Connect Google Drive for TuDo photos** (D27, after T-005.1 **and T-005.5** are merged): follow the
>   runbook T-005.5 adds. Create the OAuth client "TuDoCuaTui" (type **Desktop app**) in Ricotdin's Google Cloud
>   project (published "In production"). Create the GitHub environment `tudocuatui` in `mmlabs-online/deployment`,
>   restricted to `main`. Run the connect script locally: it signs in as Ricotdin's account and **creates the
>   `TuDoCuaTui` folder itself**. Do not create the folder by hand in Drive, because the app cannot see a folder it did not
>   create (`drive.file`). Store the four values as the environment secrets the runbook names (never in chat or the TuDo
>   repo). Delete the downloaded client JSON and the token file. Run `deploy-tudocuatui` (workflow_dispatch from `main`),
>   then run the smoke command.

Not touched: `Dockerfile`, `.dockerignore` (`server/drive-smoke.js` ships, and `*.test.ts` and `server/test` are already
excluded), `package.json` (no new dependency), `server/app.js` (wiring is T-005.2), `deploy/**` (T-005.5),
`AGENTS.md`/`.figma/`/the Figma plugins in `vite.config.ts` (R10).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `drive.test.ts › loadDriveConfig: all four unset → {mode:"off"}` | AC1a |
| `drive.test.ts › loadDriveConfig: all set and valid → {mode:"on"}; malformed client id, folder id or any whitespace → DriveConfigError` | A7 validation: client id ends `.apps.googleusercontent.com`; no whitespace in any value; folder id `^[A-Za-z0-9_-]{10,200}$` |
| `drive.test.ts › loadDriveConfig: each 1-of-4, 2-of-4, 3-of-4 set → DriveConfigError naming the missing variables, never a value` | A7 |
| `drive.test.ts › loadDriveConfig: empty string counts as unset` | Matches the workflow writing nothing when the secrets are absent |
| `drive.test.ts › token: form-encoded POST to the token URL with grant_type=refresh_token; secret only in the body` | Token exchange; the secret never goes in the URL |
| `drive.test.ts › token: cached until expires_in − 60 s, refreshed after (fake now)` | Caching |
| `drive.test.ts › token: concurrent calls share one in-flight refresh` | Single flight |
| `drive.test.ts › token: a failed refresh clears the in-flight promise; the next call retries` | No stuck promise |
| `drive.test.ts › token: invalid_grant / invalid_client / unauthorized_client → drive_auth, no retry; no new token request for 60 s` | A15 cooldown |
| `drive.test.ts › token: 5xx / network error → retried, then drive_unavailable` | Retry on the token call |
| `drive.test.ts › 401 from Drive → cached token dropped, one refresh, one retry; second 401 → drive_auth` | 401 handling |
| `drive.test.ts › 429 and 403 rateLimitExceeded/userRateLimitExceeded → retried with backoff, Retry-After honoured (capped 10 s), then drive_rate_limited` | Retry policy (A8) |
| `drive.test.ts › 500/502/503/504 → up to 3 attempts, then drive_unavailable` | Retry policy |
| `drive.test.ts › 403 other reason (e.g. insufficientFilePermissions, storageQuotaExceeded) → drive_forbidden, no retry` | Error mapping |
| `drive.test.ts › 404 → drive_not_found; deleteFile 404 → resolves (success)` | Error mapping; idempotent delete (A4) |
| `drive.test.ts › createFile: exactly one request on 5xx/network error (no retry) → drive_unavailable` | A8: create is not idempotent |
| `drive.test.ts › createFile: one token refresh + retry on 401 is still allowed` | A 401 means the request was not accepted, so retrying is safe |
| `drive.test.ts › createFile: multipart/related body: random boundary, JSON part {name, mimeType, parents:[folderId], appProperties}, then the bytes; fields=id,size,mimeType` | Body shape |
| `drive.test.ts › createFile: > 5 MB → drive_too_large without any request` | A12 |
| `drive.test.ts › createFile: 2xx with a non-JSON body or without id → drive_bad_response` | Error mapping |
| `drive.test.ts › file id validation: ids with "/", "..", "?", "%", or the wrong length → drive_not_found without any request` | URL injection guard |
| `drive.test.ts › checkFolder: not a folder or trashed → drive_folder_not_found; 404 → drive_folder_not_found` | Finding 7 |
| `drive.test.ts › DELETE uses files/{id} (permanent), not a trash update` | A4 |
| `drive.test.ts › log entries contain only {event, op, status, code, reason}; a reason outside the allowlist is dropped` | AC2a |
| `drive.test.ts › redaction: across every error path, JSON.stringify(err), String(err), err.stack and all log entries contain none of the fake secret, refresh token or access token; err has no cause` | AC2a |
| `drive.http.test.ts › real fetch against the fake Drive: token + create + getMedia streams the bytes (Readable.fromWeb) + delete` | End-to-end shape |
| `drive.http.test.ts › getMedia: headers not received within the headers timeout → drive_unavailable (test uses a short injected timeout)` | Timeouts |
| `drive.http.test.ts › getMedia: the caller's AbortSignal aborts the body stream` | Contract for T-005.3 |
| `drive.http.test.ts › upload hanging past its timeout → drive_unavailable, a single request` | Timeouts plus no create retry |
| `drive-smoke.test.ts › runSmoke happy path: logs the step names with "ok", returns 0` | AC1c |
| `drive-smoke.test.ts › runSmoke: read-back bytes differ → returns 1, then still tries to delete` | AC1c |
| `drive-smoke.test.ts › runSmoke: folder not found → returns 1 with code drive_folder_not_found` | AC1c / Finding 7 |
| `drive-smoke.test.ts › CLI with no Google env exits 2 and prints "drive not configured"` | AC1d |
| `drive-smoke.test.ts › CLI with a partial env exits 2` | A7 |
| `index.cli.test.ts › starts with no Google env and logs "drive not configured"` | AC1a |
| `index.cli.test.ts › with all four fake values set: logs "drive configured", /healthz 200, /readyz unaffected, stdout/stderr contain no value` | AC1a/2a, A10 |
| `index.cli.test.ts › partial Google config exits 2 with "config error: …" and no values` | AC1b |

## Approach
1. **`server/drive.js`** (`// @ts-check`, JSDoc types, no dependency; same shape as `access.js`):
   - `loadDriveConfig(env)` reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID`.
     An empty string counts as unset. None set → `{mode:"off"}`. All set → validated `{mode:"on", clientId,
     clientSecret, refreshToken, folderId}`. Anything else → `DriveConfigError`. The message names the variables only.
   - `class DriveError extends Error { code; status? }`. The message equals the code. It has no `cause`, no body, no
     headers and no URL. Codes: `drive_not_configured`, `drive_auth`, `drive_not_found`, `drive_forbidden`,
     `drive_rate_limited`, `drive_unavailable`, `drive_too_large`, `drive_bad_response`, `drive_folder_not_found`.
   - `createDriveClient({config, fetch = globalThis.fetch, now = Date.now, sleep, random = Math.random, log = () => {},
     tokenUrl, apiBase, uploadBase, timeouts})`. Production URL defaults are constants: `https://oauth2.googleapis.com/token`,
     `https://www.googleapis.com/drive/v3`, `https://www.googleapis.com/upload/drive/v3`. Overrides exist **only** as
     factory parameters for tests and are never read from env (A11).
   - Token: a form POST. The token is cached until `expires_in − 60 s`. One shared in-flight promise. On
     `invalid_grant`/`invalid_client`/`unauthorized_client`, throw `drive_auth` and record a 60 s cooldown, during which
     calls fail fast with `drive_auth` (A15).
   - One internal `request(op, {method, url, body, headers, timeoutMs, retry})` helper. It adds the bearer token,
     applies the `AbortSignal.timeout` limits (token, delete and metadata 10 s; upload 30 s; getMedia 10 s to headers,
     then the caller's signal), and handles 401 (one refresh and retry). Retries (when `retry` is true): at most 3
     attempts, with backoff `500 ms · 2^n` plus up to 250 ms of jitter, or `Retry-After` capped at 10 s. Retried
     statuses: 429, 500/502/503/504, 403 with reason `rateLimitExceeded`/`userRateLimitExceeded`, and network or timeout
     errors. It parses Google's JSON `error.errors[0].reason` / `error.error` only to choose a code. The log gets an
     allowlisted reason only.
   - `createFile({name, mimeType, bytes, appProperties})`: `retry:false` (A8). The 5 MB cap is enforced before any
     request. The multipart/related body is built as one `Uint8Array` (`Buffer.concat`). Returns `{id, size, mimeType}`.
   - `getMedia(id, {signal})` → `{body: ReadableStream, contentType, contentLength}`. `deleteFile(id)` (permanent
     `DELETE`, where 404 counts as success, A4). `checkFolder()` uses `fields=id,mimeType,trashed`.
   - File ids must match `^[A-Za-z0-9_-]{10,200}$` before they go into a URL. The id is then `encodeURIComponent`'d anyway.
2. **`server/drive-smoke.js`**: `runSmoke({drive, log, now})` runs `checkFolder` → `createFile("tudo-smoke-<ISO>.txt",
   text/plain, appProperties {tudo:"smoke"})` → `getMedia` and compare the bytes → `deleteFile` → `getMedia`, which must
   throw `drive_not_found`. It prints `step: ok` or `step: FAIL <code>`, plus the created file id if the delete fails
   (ids are not secret). The CLI runs only when the file is the entry point (`import.meta.url` vs `process.argv[1]`):
   not configured → exit 2, `DriveConfigError` → exit 2, otherwise the exit code is the result (0/1).
3. **`server/index.js`**: load the drive config right after the access config, with the same error pattern (exit 2).
   Print one fixed line. Nothing else. Drive stays out of `/readyz` (A10).
4. **Tests** as listed, using `server/test/fake-drive.ts` (records requests, scripted responses, a hang mode).
5. **`check-image.sh`**: the additions listed above. The value scan does **not** cover `node_modules` (false-positive
   risk, and dependencies cannot hold our secrets).
6. **Docs**: the `server/README.md` env table and Drive section, and the M-15 rewrite.

Rules:
- R3: the secrets come only from runtime env. Nothing is added to the image, `VITE_*` or the repo. Redaction tests and
  the image scans enforce this.
- R1: there are no data-layer or browser changes. Local mode is untouched.
- R7: no endpoints, migration or `createApp` wiring.
- R8: unit and integration tests, plus coverage thresholds.
- R10: no Figma files.
- R2, R4–R6 and R9 do not apply (there is no schema, no UI, and D27 replaces R4's signed URLs for the Drive design).

## Specialist input used
`consult-software-architect.md`:
- **Adopted:**
  - no dependencies / plain `fetch`
  - the `loadDriveConfig` shape and exit 2
  - factory-only endpoint overrides
  - the token cache, single flight, 401 retry and `invalid_grant` cooldown
  - the timeouts, retry set and `Retry-After`
  - the error codes and log allowlist
  - file-id validation
  - `checkFolder`
  - Drive kept out of `/readyz`
  - smoke steps, exit codes, and the `exec tudocuatui` run path (`migrate` has no egress, Finding 3)
  - the `check-image.sh` additions (Finding 5)
  - the test list (fake Drive, redaction, CLI)
  - M-15 updated rather than adding an M-16 (Finding 8)
  - Finding 7, so the script creates the folder (A1)
- **Adopted for T-005.5 (recorded here so Ming approves them once):**
  - GitHub environment `tudocuatui` secrets with the `TUDOCUATUI_` prefix (Finding 2)
  - the same `envfile` step, charset check, all-or-nothing write and `changed` → `--force-recreate` (Finding 1)
  - the connect script design (loopback + PKCE + state; `--client-file`; token file at mode 600 outside the repo;
    printing the `gh secret set` commands)
  - the refresh-token recovery path in the runbook
- **Chosen between the consult's options:** no retry on create instead of `generateIds` (A8; smaller, and orphan
  cleanup is already in T-005.2's scope).
- **Rejected:** a committed secret file in the deployment repo, and a hand-made second env file (consult's own
  "Alternatives", for the reasons given there).

## Assumptions
Numbered so Ming can confirm or change each one at plan approval. Defaults are what the plan implements.

- **A1 — The connect script creates the folder.** Default: T-005.5's connect script finds or creates `TuDoCuaTui` through
  the API (with `drive.file`, a folder made by hand is invisible to the app). M-15 is reworded now. Smoke's
  `checkFolder` catches a wrong id.
- **A2 — Where the secrets live.** Default: GitHub environment `tudocuatui` in `mmlabs-online/deployment`, restricted
  to `main` (Ming creates it first). Secrets `TUDOCUATUI_GOOGLE_CLIENT_ID`, `TUDOCUATUI_GOOGLE_CLIENT_SECRET`,
  `TUDOCUATUI_GOOGLE_REFRESH_TOKEN` and `TUDOCUATUI_DRIVE_FOLDER_ID`. `deploy-tudocuatui`'s existing `envfile` step
  writes them into `/Users/mingming/.config/tudocuatui/tudocuatui.env` next to `DATABASE_URL`, unprefixed (the names in
  A9's runtime contract). This follows the deployment README convention and `deploy-stoktok.yml`. Implemented in T-005.5.
- **A3 — `DRIVE_FOLDER_ID` location.** Default: in the same environment secrets as the other three. It is not secret,
  but keeping all four in one place gives one all-or-nothing check in both the workflow and the server, and one place
  in M-15. It is not in the compose `environment:`.
- **A4 — Delete semantics.** Default: permanent `DELETE files/{id}`, where 404 counts as success (the same as
  `DELETE /api/items`). Trashed files would still count against the Ricotdin account's quota, and TuDo deletes are
  already permanent in the DB. Alternative: move to trash (`PATCH {trashed:true}`) for 30-day recovery. That would be
  a one-line change in `deleteFile`.
- **A5 — Shared Ricotdin Cloud project.** Default: acceptable (as decided on 2026-11-08). Risk: `drive.file` grants may
  be per Cloud project, so TuDo's token might see Ricotdin's app-created files. Mitigation: `drive.js` only acts on ids
  the caller passes in, creates only inside `DRIVE_FOLDER_ID`, and T-005.2 only stores ids it created. Files use
  Ricotdin's quota. A separate project would only change M-15's first step.
- **A6 — Connect script OS.** Default: the script works on both macOS and Windows. It is plain Node 22 with no
  dependencies and no shell features, uses `os.homedir()` for paths, and writes the token file with mode 600. On Windows
  the mode is not enforced, so the script warns that the file sits in the user profile. It prints the auth URL rather
  than opening a browser. This is implemented in T-005.5.
- **A7 — Partial config.** Default: a partial or malformed Google config makes the server (and smoke) exit 2, the same
  as `CF_ACCESS_*`. The T-005.5 workflow refuses a partial set before writing the env file, so production cannot reach
  this. If it ever did, the health check fails and the previous release is restored, which is harmless.
- **A8 — Create retries.** Default: `createFile` is never retried on 5xx, network errors or timeouts (it is not
  idempotent, and a retry could leave a duplicate). It returns `drive_unavailable`, and the caller (T-005.2) decides
  what to do. A 401 is still refreshed and retried once, because Google rejected the request before any write. Token,
  get, delete and checkFolder calls retry up to 3 attempts. The `generateIds` approach is not used.
- **A9 — Runtime env names.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID`.
  An empty string counts as unset.
- **A10 — No readiness coupling.** Drive is not checked by `/readyz` or at startup (no network call at boot), so a Google
  outage never fails the health check or triggers a restore. `index.js` only validates the config and logs one line.
  `createApp` wiring is T-005.2.
- **A11 — Endpoints are fixed.** Google URLs are constants. Test overrides exist only as factory parameters, never from
  env, so a misconfiguration cannot send the refresh token to another host.
- **A12 — Upload cap in the client.** `createFile` rejects more than 5 MB (`drive_too_large`). T-005.2 sets its own
  request-body limit, which may be lower.
- **A13 — Smoke command.** Command: `docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file
  apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js`. Exit codes: 0 ok, 1 failed, 2 not
  configured. It never runs through `migrate` (that service has no `web` network).
- **A14 — Compatibility with the live nginx v0.1.4 deploy (for T-005.5).** The live `apps/tudocuatui/compose.yml` (nginx)
  has no `env_file`, so extra lines in the host env file are ignored, and `--force-recreate` only restarts nginx. The
  T-005.5 workflow change can therefore merge before or after mmlabs-online/deployment#40. If all four secrets are
  absent, it writes only `DATABASE_URL`, exactly as today.
- **A15 — Auth cooldown.** After `drive_auth` from the token endpoint, the client does not call Google again for 60 s.
- **A16 — Hotspot files.** `server/index.js`, `server/index.cli.test.ts`, `server/README.md` and `vitest.config.ts` are
  also likely edited by T-005.2/T-005.3. `scripts/check-image.sh` is off-limits to T-014 (D26 A3), but not to this ticket.
- **A17 — Reasons allowed in the log.** `invalid_grant`, `invalid_client`, `unauthorized_client`, `rateLimitExceeded`,
  `userRateLimitExceeded`, `storageQuotaExceeded`, `insufficientFilePermissions`, `notFound`, `authError`,
  `backendError`. Any other reason is logged as `other`.

## Blocking questions
None. The gate is plan approval: Ming confirms or changes A1–A17 (A2, A4, A5 and A6 are the real choices).

## Split proposal
The whole ticket is about 520 changed non-test lines. Estimate:
- `drive.js` ~260
- connect script ~190
- smoke ~70
- workflow ~45
- check-image ~15
- index ~12
- docs

That is above the ~400 guide, and it mixes runtime code with High-tier production deploy config. Split:

1. **T-005.1 (this plan), ~380 lines:** the server-side Drive client, smoke command, startup config, image checks,
   README, and the M-15 rewording. It can be fully verified in CI against a fake Drive. T-005.2 builds on its
   `drive.js` API.
2. **T-005.5 (new; the orchestrator creates it, Depends on T-005.1, Gate plan-approval, Areas security; T-005.4 is
   taken):** "Drive connect script, deploy secrets and M-15 runbook". It covers:
   - `scripts/drive-connect.mjs` (A1, A6; loopback + PKCE + state, find-or-create the folder, token file at mode 600
     outside any git work tree, printing the `gh secret set … --env tudocuatui -R mmlabs-online/deployment < file`
     commands) with unit tests for its pure helpers;
   - `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` (A2, A3, A14: `environment: tudocuatui`; the four
     values through step `env:` into the same `envfile` step; all-or-none; charset `^[A-Za-z0-9._/-]+$`; client id
     suffix; `changed` → `--force-recreate`; the header comment updated);
   - `deploy/deployment-repo/README.md` and the compose header comment;
   - the full M-15 runbook (AC3), including the refresh-token recovery path (re-run connect → `gh secret set` →
     dispatch the deploy) and deleting the client JSON and token file.

   T-005.2 then needs M-15, which needs T-005.5 merged.

If Ming prefers one ticket, T-005.5's items can be appended to this plan unchanged. The review is then about 520 lines.
