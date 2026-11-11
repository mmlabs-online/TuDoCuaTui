# Consult — software-architect — T-005.1 (2026-11-11)

I only read files. Sources: the ticket, D23–D27, `server/{index,app,access}.js`, `server/README.md`, `Dockerfile`, `.dockerignore`, `scripts/check-image.sh`, `deploy/deployment-repo/**`, `work/ming-todo.md` (M-15), the T-005.2 and T-005.3 tickets, and in `/home/user/deployment` the README "Secrets" section, `deploy-tudocuatui.yml`, `deploy-stoktok.yml` and the `apps/*/compose.yml` env_file lines. I read no secret file contents. This folder is not a git repo, so I could not look at the old Supabase design in git history.

## Findings
1. **Writing the env file wipes it.** The draft (and live) `deploy-tudocuatui.yml` `envfile` step rebuilds `/Users/mingming/.config/tudocuatui/tudocuatui.env` from scratch on every run (`printf … > $tmp; mv -f`). Any Google value Ming adds to that file by hand disappears on the next deploy. The Google values have to be written in the same step, or go in a second env_file.
2. **The deployment repo's own convention picks GitHub environment secrets.** Its README says: "App secrets that aren't Postgres stay … `/Users/mingming/.config/<app>/<app>.env`, written by each app's deploy workflow from its GitHub environment secrets (see `deploy-stoktok.yml`)." Committed secrets in that repo are readable by every `DEPLOY_REPO_TOKEN`, including TuDo's own release token. `deploy-stoktok.yml` is the template: a job-level `environment: stoktok`, prefixed secret names, values passed through step `env:`, a missing-secret check, a charset check per value, a `printf` into a temp file, `mv`, a mode check, then `changed` → `--force-recreate`. TuDo's workflow has no `environment:` and no `--force-recreate`, so a `workflow_dispatch` after rotating a secret may not recreate the container.
3. **Egress already works.** The app service is on `web` (internet) and `db` (internal). The Access JWKS fetch already depends on `web`. The `migrate` service is only on `db`, so Drive calls, including the smoke run, must go through the `tudocuatui` service.
4. **Where the new scripts end up.** `scripts/` and `deploy/` are left out of the image by `.dockerignore`. So a connect script in `scripts/` never ships, and a smoke script in `server/` does ship, which is what we want.
5. **`check-image.sh` gaps.** It checks image env names against `KEY|SECRET|TOKEN|PASSWORD` and requires `NODE_ENV` to be the only app variable among `^(NODE_ENV|DATABASE_URL|CF_ACCESS_|TUDO_)`. It does not cover `GOOGLE_`/`DRIVE_`, and it has no value scan for Google secrets.
6. **Server pattern to copy.** The server's config pattern (`access.js`) is a pure `loadXConfig(env)` that returns `off`/`on` or throws a ConfigError (exit 2). Logs carry only `code`. Factories take injectable deps (`jwks`). `drive.js` should follow the same shape.
7. **M-15 conflicts with `drive.file`.** M-15 tells Ming to "create the `TuDoCuaTui/` folder" by hand. With `drive.file` the app cannot see a folder made in the Drive UI (only files the app created or the user opened through the Picker). Uploads with `parents=[thatId]` would fail with 404 or 403.
8. **The Ming item already exists.** The ticket says "New Ming item", but M-15 is already there. Update M-15 rather than adding M-16.

## Recommendations
**Dependencies (R7, keep the image small).** Add none. Use plain `fetch` (Node 22). `googleapis` is huge and pulls in gaxios and google-auth-library. The token exchange plus three calls is about 200 lines, and `check-image`'s layout check stays `pg`+`jose`.

**`server/drive.js` (AC1, AC2)**
- `loadDriveConfig(env)` reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID`.
  - All unset → `{mode:"off"}`, and the server logs `drive not configured`.
  - All set → validated `{mode:"on"}`. The client ID must end `.apps.googleusercontent.com`, no value may contain whitespace, and the folder ID must match `^[A-Za-z0-9_-]{10,200}$`.
  - Partly set → `DriveConfigError` → exit 2, the same as `CF_ACCESS_*`. The workflow guard below means production can never get a partial set.
  - `index.js` only loads the config and logs `drive configured`/`drive not configured`. Wiring the client into `createApp` belongs to T-005.2.
- `createDriveClient({config, fetch?, now?, sleep?, tokenUrl?, apiBase?, uploadBase?})`. Endpoint overrides come only through the factory, for tests, and **never from env**. An env override could send the refresh token to another host.
- Token handling:
  - Call `POST https://oauth2.googleapis.com/token` with a form body (`grant_type=refresh_token`, client_id, client_secret, refresh_token).
  - Cache the token in memory until `expires_in − 60 s`.
  - Use one shared in-flight promise so concurrent requests share one refresh.
  - On a 401 from Drive, drop the cached token and retry once.
  - `invalid_grant` or `invalid_client` → `drive_auth`. Never retry these, and don't refresh on every request after them (back off for about 60 s).
- Drive calls:
  - `createFile({name, mimeType, bytes, appProperties})`: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,mimeType`. The body is `multipart/related` with a random boundary, a JSON part `{name, parents:[folderId], mimeType, appProperties}`, then the bytes. Cap the size at 5 MB → `drive_too_large`.
  - `getMedia(id, {signal})`: `GET …/drive/v3/files/{id}?alt=media`. Return `{body: ReadableStream, contentType, contentLength}` so T-005.3 can pipe it with `Readable.fromWeb`.
  - `deleteFile(id)`: `DELETE …/files/{id}` → 204. Treat 404 as success, the same as `DELETE /api/items`.
  - `checkFolder()`: `GET files/{folderId}?fields=id,mimeType,trashed`. Used by smoke to catch Finding 7 with a clear `drive_folder_not_found`.
  - Check every file ID against the regex before it goes into a URL.
- Timeouts: use `AbortSignal.timeout`. Undici's default headers timeout is 300 s.
  - Token, delete and metadata calls: 10 s.
  - Upload: 30 s.
  - `getMedia`: abort if headers take more than 10 s, then let the caller's signal own the body.
- Retries: at most 3 attempts with exponential backoff and jitter, and honour `Retry-After`.
  - Retry on 429, 500, 502, 503, 504, and 403 whose reason is `rateLimitExceeded` or `userRateLimitExceeded` (Drive returns rate limits as 403), plus network errors.
  - Token, get and delete calls are safe to retry.
  - **Create is not idempotent:** a retry after a 5xx can leave a duplicate orphan. Either pre-allocate an ID (`GET files/generateIds?count=1&space=drive`, send `id` in the metadata, and treat 409 as success on retry), or don't retry create at all and leave cleanup to T-005.2. I recommend the generateIds approach, or no retry if the plan wants it minimal.
- Error mapping: `class DriveError { code, status? }` with codes `drive_not_configured`, `drive_auth`, `drive_not_found`, `drive_forbidden`, `drive_rate_limited`, `drive_unavailable` (5xx, timeouts, network), `drive_too_large`, `drive_bad_response`, `drive_folder_not_found`.
  - No `cause`, no response body, no request object, no headers.
  - Logs may hold `{event, op, status, code, reason}` only, where `reason` is an allowlisted Google reason string.
  - Responses to the browser never carry Google text.
- Keep Drive out of `/readyz`. A Google outage must not fail the health check and trigger an automatic restore.

**Where the secrets live (R3, AC2).** Recommended: secrets in a GitHub environment `tudocuatui` in `mmlabs-online/deployment`, restricted to `main`. Name them `TUDOCUATUI_GOOGLE_CLIENT_ID`, `TUDOCUATUI_GOOGLE_CLIENT_SECRET`, `TUDOCUATUI_GOOGLE_REFRESH_TOKEN` and `TUDOCUATUI_DRIVE_FOLDER_ID`. The `TUDOCUATUI_` prefix is needed because the repo is shared.

Changes to the draft workflow:
- Add `environment: tudocuatui` to the job.
- Pass the values through step `env:` into the **same** `envfile` step that writes `DATABASE_URL`.
- If all four are empty, write only `DATABASE_URL` (photos stay off), so the workflow can land before M-15. If only some are set, fail and leave the file unchanged.
- Allow only these characters: `^[A-Za-z0-9._/-]+$`. This is mandatory: a newline in a secret could inject lines like `TUDO_ACCESS_DISABLED=1` into the env file.
- Add a `changed` output → `--force-recreate`, copying stoktok.
- Update the "No GitHub secrets" header comment.

Alternatives:
- A committed file in the deployment repo: one place, no `gh`. Against it: it breaks the README convention, every deploy token can read it, and it stays in git history forever after rotation. Rejected.
- A second hand-made env file such as `tudocuatui.google.env` (compose `env_file` with `required: false`): no GitHub involved. Against it: Ming has to edit files on the Mac, and nothing validates them.

`DRIVE_FOLDER_ID` is not secret. It could go in compose `environment:` (the `CF_ACCESS_*` pattern), but keeping all four together makes M-15 a single place. That is the plan's choice.

**Connect script `scripts/drive-connect.mjs` (`@ts-check`, no deps, works on Windows and Mac, run by Ming).**
- Input: `--client-file <path to client_secret_*.json>`. The secret never goes on argv or into shell history.
- OAuth request:
  - Desktop-app client, loopback redirect `http://127.0.0.1:<ephemeral port>`, listening on 127.0.0.1 only and accepting one request.
  - PKCE S256, a random `state` that is checked on return, a 5-minute timeout.
  - `access_type=offline`, `prompt=consent` (so Google always returns a refresh token), `scope=https://www.googleapis.com/auth/drive.file`.
  - Print the auth URL (not secret).
- After the code exchange:
  1. Call `about?fields=user(emailAddress)` and show the account so Ming can confirm it is Ricotdin's.
  2. **Find or create the `TuDoCuaTui` folder through the API.** Query `name='TuDoCuaTui' and mimeType='application/vnd.google-apps.folder' and trashed=false`. With `drive.file` this only returns the app's own folder, so re-runs are idempotent.
  3. Write the refresh token to a mode-600 file outside the repo, e.g. `~/.config/tudocuatui/google-refresh-token`. Refuse a path inside a git work tree.
  4. Print only the file path, the folder ID (not secret) and the exact `gh secret set … --env tudocuatui -R mmlabs-online/deployment < file` commands.
- The runbook then says to delete the token file and the downloaded client JSON.

**Smoke command (AC1).**
- Make a `runSmoke({drive, log})` function in `server/drive-smoke.js` with a thin CLI wrapper.
- Steps: checkFolder → create `tudo-smoke-<ts>.txt` → getMedia and compare bytes → delete → get returns 404.
- Print step names and OK or the error code only.
- Exit 0 on success, 1 on failure, 2 when not configured.
- Run it with `docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js`. Not `run migrate`, which has no egress.
- Add to `check-image.sh`:
  - running `drive-smoke.js` with `--network none` and no env exits 2;
  - add `GOOGLE_|DRIVE_` to the image-env check;
  - scan `/app` for `GOCSPX-` and `1//0` patterns.

**Tests (R8, AC2).**
- Vitest unit tests with an injected `fetch` stub and a fake `sleep`/`now`:
  - token caching, expiry and refresh;
  - concurrent requests share one refresh;
  - 401 → one refresh and retry;
  - `invalid_grant` → `drive_auth` with no retry;
  - 429/5xx/403-rateLimit backoff and `Retry-After`;
  - no retry on a non-idempotent create (or the generateIds path);
  - multipart body shape;
  - file-ID validation;
  - `loadDriveConfig` cases: none, all, partial, malformed.
- Redaction test: serialise every thrown error and every log entry and assert the fake token and secret strings never appear.
- One integration test against a fake Drive on `node:http` at `127.0.0.1:0`: real fetch, a streamed body, and a hanging endpoint → `drive_unavailable` timeout.
- A CLI test for smoke exit code 2, the same style as `index.cli.test.ts`.

**Scope (R7).**
- T-005.1 covers: `drive.js`, `drive-smoke.js`, the connect script, startup config and log line, the README env table, the deploy workflow draft (`envfile` + environment + force-recreate), `check-image.sh`, and an updated M-15 runbook.
- T-005.2 covers: `/api` upload and delete, the `item_photos.drive_file_id` migration, orphan cleanup, the 503 `photos_not_configured`, and wiring the client into `createApp`.
- T-005.3 covers: `GET /api/photos/:id` streaming, caching headers, ETag and Range.

## Risks
- **Refresh tokens break quietly.** They die in 7 days if the consent screen is in "Testing", after 6 months unused, when there are more than 100 tokens per client per account (connect-script re-runs), or when Ming revokes access in the account. Photos then fail with `drive_auth`. The runbook needs a "re-run connect + `gh secret set` + dispatch deploy" recovery path.
- **The manual-folder pitfall (Finding 7)** fails on the first upload unless the script creates the folder and smoke checks it.
- **Same Cloud project as Ricotdin.** `drive.file` grants are, I believe, per Cloud project rather than per OAuth client. If so, the TuDo token could see Ricotdin's app-created files and the other way round. Please check before relying on it. Mitigation: only ever touch file IDs TuDo stored, inside `DRIVE_FOLDER_ID`. Files also count against the Ricotdin account's quota.
- **Env-file injection through a newline in a secret** if the workflow's charset check is skipped.
- **Hand edits to the env file are lost** on the next deploy (Finding 1).
- **Restart behaviour.** If a partial or malformed config reaches the server, it exits 2. The health check fails and the previous release is restored; the previous release ignores the Google variables, so the restore is harmless.
- **The workflow change is high-tier production deploy config.** It needs a deployment-repo setup PR (not a `release/*` branch) and plan approval. GitHub creates an environment automatically when a job first references it, without branch rules, so Ming should create `tudocuatui` restricted to `main` first.
- **The desktop client secret** sits in `~/Downloads/client_secret_*.json`. Google calls it non-confidential for desktop apps, but R3 still applies: the runbook should delete the file.

## Open questions for Ming
1. Should the connect script create the `TuDoCuaTui` folder (recommended; M-15 wording changes), instead of Ming creating it in Drive by hand?
2. Secrets source: GitHub environment `tudocuatui` secrets in `mmlabs-online/deployment` (recommended, matches its README), or a committed file there?
3. `DRIVE_FOLDER_ID`: in the env secrets with the other three, or in compose `environment:` since it is not secret?
4. Deletes (for T-005.2, but `drive.js` exposes it): permanent `DELETE` or move to trash (30-day recovery)?
5. Is it acceptable that TuDo shares Ricotdin's Cloud project, and so possibly `drive.file` visibility, or should TuDo get its own project?
6. Which OS will Ming run the connect script on (Windows/Git Bash or the Mac)? It changes the token-file path and how chmod works.
7. Partial Google config: exit 2 (recommended, matches `CF_ACCESS_*`), or warn and run with photos off?
