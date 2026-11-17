# TuDo Node server (T-013.1)

Start contract (T-015): `node server/index.js`, listens on `0.0.0.0:3000` (`PORT` overrides), serves the built SPA from `../dist`.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `postgres://tudocuatui:<pw>@postgres:5432/tudocuatui` (D24). Unset: starts without a DB, `/readyz` is 503. |
| `TUDO_AUTH_MODE` | Optional; only `identity` (also the default when unset). Anything else, including an empty value, exits 2 (the value is never printed). The server verifies mmlabs Identity access tokens (see Identity tokens). |
| `MM_IDENTITY_ISSUER` | Required (not secret). Exactly `https://<host>`; in production it must equal `https://api.mmlabs.online`. Outside production `http://localhost:<port>` is also accepted. Missing or malformed exits 2. |
| `TUDO_OWNER_SUB` | The owner's Identity `sub` (a UUID; not secret; never printed). Required (also by `migrate`). This user is the owner lane: exempt from the global AI ceilings and from the shared upload / tag-photo slots (per-user limits still apply). Same value for the app and `migrate`; a malformed or missing value exits 2. |
| `GOOGLE_CLIENT_ID` | OAuth client id of "TuDoCuaTui" (ends `.apps.googleusercontent.com`). Photos (D27). |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. Secret: runtime env only. |
| `GOOGLE_REFRESH_TOKEN` | Long-lived refresh token (scope `drive.file`). Secret: runtime env only. |
| `DRIVE_FOLDER_ID` | Id of the `TuDoCuaTui` Drive folder the connect script created |
| `AI_KEK` | Base64 of 32 random bytes (T-018). Secret: runtime env only. Unset: AI routes answer 503; malformed: exit 2. Removed from `process.env` after startup. |
| `NODE_ENV` | With `production`, `MM_IDENTITY_ISSUER` must be the production issuer. |
| `PORT` | Default 3000 |

Routes: `/healthz` (liveness, `{status:"ok", auth:"identity"}`), `/readyz` (`select 1`), `/api/*` (Identity bearer token only; endpoints below), everything else is the SPA.

In production the four Google values come from `deploy-tudocuatui` (repository secrets of `mmlabs-online/deployment`, D28), see M-15 in `work/ming-todo.md`.

The four Google variables are all-or-nothing: none set means photos are off (`drive not configured`, the server still starts); a partial or malformed set exits 2 with a message that names variables, never values. An empty string counts as unset.

## Identity tokens (T-019.5)

`/api` needs `Authorization: Bearer <access token>` (never a cookie, query or other header). The verifier follows `consumers.md` of org-admin-api: ES256 only, keys from `<issuer>/.well-known/jwks.json` (cache 300 s, unknown `kid` refetch at most once per 60 s, 5 s timeout, `User-Agent: tudocuatui-server`), exact `iss`, `aud` = `tudocuatui`, `typ` = `at+jwt`, `exp`/`iat`/`sub`/`jti` required, 30 s leeway, tokens older than 15 min rejected, `email_verified` true, `sub` a canonical UUID, and at least one `tudocuatui:`-prefixed entry in `roles` (removing the role is the ban lever). The server must be able to reach Identity over HTTPS (egress). Fail closed: any failure, including an unreachable JWKS, answers 401 `unauthorized`.

Denied requests log `{event:"auth_denied", code}` only, with `code` one of `missing`, `too_large`, `malformed`, `alg`, `signature`, `expired`, `claim_<iss|aud|typ|iat|nbf|exp|sub|jti>`, `unknown_kid`, `jwks_unavailable`, `email_unverified`, `sub_invalid`, `no_role`, `invalid`. Tokens, claims and error messages are never logged. Authentication runs no database query. A revoked user or removed role keeps access until the token expires (up to 15 minutes, accepted; ADR-0005).

## Google Drive (T-005.1)

`server/drive.js` is the Drive v3 client (plain `fetch`, scope `drive.file`, no dependency). It is wired into `createApp` (T-005.2) and is not part of `/readyz`; nothing calls Google at startup. Errors are `DriveError` with a fixed `code` only: `drive_not_configured`, `drive_auth`, `drive_not_found`, `drive_forbidden`, `drive_rate_limited`, `drive_unavailable`, `drive_too_large` (over 5 MB), `drive_bad_response`, `drive_folder_not_found`, `drive_invalid_id` (malformed file id, no request made). Redirects are never followed, except for media reads. Creates are never retried (not idempotent); other calls retry up to 3 attempts. Deletes are permanent and a missing file counts as success.

Smoke (creates a tiny file, moves it into a temporary subfolder, reads and deletes both; exit 0 ok, 1 failed, 2 not configured):

```
docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js
```

## API (T-013.2)

JSON only. Without `DATABASE_URL` every endpoint validates its input, then answers 503 `db_unavailable`. Ids are UUIDs, matched against the raw path segment (never decoded).

| Endpoint | Success |
|---|---|
| `GET /api/items` | 200 `{ items: ItemRow[] }`, newest first |
| `GET /api/locations` | 200 `{ locations: string[] }`, by `sort_order, name` |
| `PUT /api/items/:id` | 200 `{ item: ItemRow }`; idempotent upsert, full replacement (omitted optional fields reset to defaults); body is `itemToRow` minus `id`/`location_id`, plus `location_name` (NFC, get-or-create); unknown keys ignored |
| `DELETE /api/items/:id` | 204, also when the item is already gone |
| `PUT /api/items/:id/photo` (raw JPEG body, `Content-Type: image/jpeg`) | 200 `{ item: ItemRow }`; stores the file in Drive and replaces the item's single primary photo |
| `DELETE /api/items/:id/photo?photo=<uuid>` | 204. `photo` is required (exactly one uuid, else 400 `invalid_input` field `photo`). Deletes only if that id is still the item's photo, under the item lock; a stale id (already replaced or removed), no photo or no item is a 204 no-op, never 409 |
| `GET /api/photos/:id` | 200 image stream; `:id` is `primary_photo_id` (`item_photos.id`), never a Drive id. Headers are constants: `Content-Type: image/jpeg` (never Drive's), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, no-cache`, `ETag: "<id>"` (a matching `If-None-Match` gives 304 with no Drive call, only after the owner-scoped lookup found the row; otherwise 404; a replace creates a new id). In identity mode the SPA fetches it with the bearer and shows `blob:` URLs. 404 `not_found` (unknown id, legacy row, Drive file gone), 502 `photo_fetch_failed`, 503 `photos_unavailable` / `db_unavailable`. Behind the same access check as the rest of `/api` |
| `POST /api/items/:id/wear` `{ delta: 1 \| -1, today: "YYYY-MM-DD" }` | 200 `{ wear_count, last_worn, already }`; `-1` removes the latest log; `today` must be within one day of Asia/Ho_Chi_Minh today |

`ItemRow` is a snake_case `items_with_stats` row: `price` is a number or null, dates are `YYYY-MM-DD`, `created_at`/`updated_at` are ISO strings, `primary_photo_path` is always null; `primary_photo_id` is the `item_photos` id (uuid) or null; the client builds `/api/photos/<primary_photo_id>` from it. Drive file ids never reach the browser.

Errors are `{ "error": { "code", ... } }`: 400 `invalid_input` (with `field` and `reason` for validation failures), 400 `invalid_json`, 403 `forbidden_origin`, 404 `not_found`, 405 `method_not_allowed`, 409 `conflict`, 413 `payload_too_large` (256 KB), 415 `unsupported_media_type`, 500 `internal` (with `requestId`), 503 `db_unavailable`. Photos add 400 `invalid_photo` (empty, truncated, not starting `FF D8 FF`), 408 `request_timeout` (upload body cut after 15 s in total or 5 s without data), 413 over 2 MiB, 415 unless `image/jpeg`, 502 `photo_upload_failed` (Drive failed or timed out), 503 `photos_unavailable` (Drive not configured, auth or folder problem, or 3 uploads already in flight, the owner excepted; `Retry-After: 5`), 409 `photo_quota_exceeded` (the user already stores the maximum), 429 `rate_limited` (daily upload count reached; `Retry-After` in seconds, `Connection: close`, body not read). Reasons: `notObject`, `idInvalid`, `nameRequired`, `nameTooLong`, `priceNegative`, `priceInvalid`, `dateInvalid`, `invalidType`, `invalidValue`, `tooLong`, `tooMany`, `todayOutOfRange`.

Photos (T-005.2): the cap is 2 MiB, counted on the stream as well as `Content-Length`. Files are named `<photoId>.jpg` and tagged `appProperties {app:"tudo", photoId, itemId, userId}` and stored in the user's subfolder (see Drive layout); a create is never retried. The row is written after Drive succeeds; if the write fails the new file is deleted. Replacing deletes the old file after commit. Deleting an item deletes its Drive files; a failed Drive delete is logged as `{event:"photo_orphan", photoId, code}` and leaves a tagged file behind (also when Drive is not configured; see Photo sweep). Lock rule: every writer of `item_photos` locks the `items` row first; step 2, only in `PUT`, is a per-user advisory transaction lock (`pg_advisory_xact_lock(hashtextextended('photo-quota:' || user_id, 0))`, Postgres 11+) taken before the stored-photo recount; deletes never take it. Quotas (T-019.14, `PHOTO_LIMITS` in `server/photoQuota.js`): at most 500 stored photos per user (replacing an item's photo is net zero; at the cap a PUT to another item is 409 `photo_quota_exceeded` and creates no Drive file) and 50 uploads per user per rolling 24 h (in memory, a restart resets it; counted when Drive stored a file, refunded when the request ends before that). The owner (`TUDO_OWNER_SUB`) is exempt from both.

CSRF: PUT/POST/DELETE with `Sec-Fetch-Site: cross-site` or `same-site` are refused; PUT/POST need `Content-Type: application/json`. No CORS headers are sent.

Response headers (T-019.8): every response gets nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and HSTS (`max-age=31536000; includeSubDomains`). SPA (static) responses also get `SPA_CSP` from `server/http.js`; `/api/photos` keeps its own `default-src 'none'; sandbox`. `/verify-email` and `/reset-password` get `Referrer-Policy: no-referrer`. Widen `SPA_CSP` when the app starts using a new external origin. `connect-src` also allows `blob:` and `data:` because the upload path reads the picked photo with `fetch()` before resizing (T-022).

Image (T-015): `/app/{package.json,node_modules,dist,server,db/migrations}`, root-owned, `USER node`, `NODE_ENV=production`
baked in, `CMD ["node","server/index.js"]`. The image `HEALTHCHECK` probes `/healthz`; the compose file overrides it with
`/readyz`. `TUDO_AUTH_MODE` / `MM_IDENTITY_ISSUER` / `TUDO_OWNER_SUB` come from the compose file, `DATABASE_URL` from the host env file; none is in the image.

Local run: `pnpm build && MM_IDENTITY_ISSUER=https://api.mmlabs.online TUDO_OWNER_SUB=<uuid> DATABASE_URL=... pnpm start` (or `MM_IDENTITY_ISSUER=http://localhost:<port>` for a local Identity API). There is no dev bypass: `/api` needs a real bearer, and signing in from localhost is not possible (the Identity origin is registered for production only, M-19). For UI work use `pnpm dev`, which proxies to a local server with a dev-only token (see the "Development (dev loop)" section of the root README).
The T-019.2 contract migration needs `TUDO_OWNER_SUB` (same value) when the dev database has rows, and fails if they belong to another owner.

Logging: one JSON line per request (method, route template, status, ms, id). Never log `DATABASE_URL`, tokens, raw URLs or whole error objects; only `err.code`.

Router note for T-013.2: `server/app.js` computes one `pathname` (after rejecting non-origin-form targets with 400). Dispatch API endpoints from that same `pathname`, inside the guarded `/api` branch, so the access check cannot be bypassed by a second URL parse.

Photo reads (T-005.3): every `getMedia` caller passes a per-request signal with a deadline (`servePhoto`: 30 s total, also aborted when the client disconnects); a handed-over stream keeps its abort listener until that signal goes away. The bytes are served unchanged: photos uploaded through the app are re-encoded by the canvas resize, which strips EXIF/GPS, but a hand-made `PUT /api/items/:id/photo` could store EXIF/GPS and it would be served back as is (only to authenticated users). Read errors are logged as `{event:"photo_read_failed", code}` with no ids.

## Row level security (T-019.4)

Every TuDo table has RLS `ENABLE` + `FORCE` with the policy `owner_only`: `user_id = app_user_id()`, which reads the transaction-local setting `app.user_id`. `withUser(pool, userId, fn, { readOnly })` in `server/db.js` is the only way to query user tables: it opens a transaction, sets `app.user_id`, runs `fn(client)` and commits. Without it every table reads 0 rows and writes fail with 42501. `items_with_stats` is `security_invoker`. A transaction never spans Drive IO or streaming (pool `max: 5`).

- Maintenance path: the photo sweep needs all users' `item_photos` rows. It uses `withMaintenance(pool, "photo-sweep", fn)` (read-only, sets `tudo.maintenance`), which the SELECT-only policy `photo_sweep_read` on `item_photos` accepts. No other table, and no write, is reachable that way. No extra DB role exists (D24).
- What it protects: a second layer against app bugs (a forgotten `where user_id`). It does not protect against stolen DB credentials or arbitrary SQL on the app connection: the owner can `no force`, and any session can set any setting. Splitting roles is the D24 follow-up.
- psql checks: run them as `postgres` (`psql -U postgres -d tudocuatui`), or set `select set_config('app.user_id', '<sub>', false);` first. As the `tudocuatui` role they return 0 rows, which is expected.

## Drive layout (T-021)

Photos live in `TuDoCuaTui/<user_id>/`, one subfolder per user, created on the first upload (folder name = user uuid, tags `appProperties {app:"tudo-folder", userId}`; never `app:"tudo"`, so the sweep cannot see a folder as a file). The folder id is cached in server memory (`server/driveFolders.js`, single-flight per user); on a miss it is looked up by tag, and of several folders the oldest wins. A duplicate folder, from two processes or Drive index lag, is harmless: every read, replace and delete goes by file id. Photos uploaded before T-021 stay in the flat root until `photo-relocate.js` moves them; reads and deletes work for both. **Never delete or trash a user folder**: that trashes every photo inside it.

## Photo relocation (T-021)

`node server/photo-relocate.js [--apply] [--max-move N]` moves each tagged photo still in the flat root into its owner's subfolder and tags it with `userId`. Dry-run by default. `--max-move` (1 to 10000, default 100) caps the moves per run; rerun until `would_move` is 0 (idempotent: moved files leave the root listing). It reads `item_photos` of all users through `withMaintenance(pool, "photo-sweep", ...)`: the task name is reused on purpose because the SELECT-only policy `photo_sweep_read` is exactly the read needed; nothing is written to the DB.

- A root file with no DB row is `unreferenced` and stays in the root (the sweep's business). A file whose `userId` tag differs from the row owner is `mismatch` and is not moved. A file deleted in between is `gone`. With `--apply` it refuses (exit 1) when listed files exist but none is referenced (wrong `DATABASE_URL`).
- Exit codes: 0 ok, 1 a step failed (folder check, list, DB, a move), 2 bad usage or not configured. Needs the four Google variables and `DATABASE_URL`.
- Output: `would create folder for user <uuid>`, `would move <rowId> to user <uuid>`, `move <rowId>: ok|FAIL <code>`, `unreferenced <photoId>`, `mismatch <rowId>`, `gone|already <rowId>`, then a summary (`listed, referenced, unreferenced, mismatch, would_move|moved, gone, already, failed, remaining, folders_created, mode`). No Drive ids, tokens or Google text.

Runbook: smoke, then dry-run, then `--apply` until `would_move 0`, then a sweep dry-run that shows `missing 0`:

```
docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/drive-smoke.js
docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/photo-relocate.js
docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/photo-relocate.js --apply
```

## Photo sweep (T-005.6)

`node server/photo-sweep.js [--apply] [--grace-minutes N] [--max-delete N]` finds Drive files that no `item_photos` row references (a create that timed out after Google accepted it, a crash, a failed best-effort delete) and deletes them. Drive deletes are permanent, so it is dry-run by default: run it without `--apply` first and check the counts.

- Lists the configured folder and each user subfolder one level down (T-021; the summary shows `folders N`), never deletes folders. Touches only files tagged `appProperties app=tudo` (checked in the query and again in code), unreferenced, and older than the grace period (`--grace-minutes`, 15 to 43200, default 60). A file with no readable creation time is kept. The DB is re-checked right before each delete.
- `--max-delete` (1 to 10000, default 50): with `--apply`, if more files qualify than this, nothing is deleted and the exit code is 1. This guards against a wrong `DATABASE_URL` making every photo look unreferenced; rerun with the number it prints once you have checked it.
- With `--apply` it also refuses (exit 1, nothing deleted, prints `refusing: no listed file is referenced (check DATABASE_URL)`) when there are candidates but no listed tagged file is referenced by any `item_photos` row, which means `DATABASE_URL` probably points at an empty or wrong database; dry-run prints the same warning.
- Rows whose Drive file is missing (and older than the grace period) are only reported, never deleted.
- Needs the four Google variables and `DATABASE_URL` in the container env. Exit codes: 0 ok, 1 a step failed (folder check, list, DB, a delete, or too many candidates), 2 bad usage or not configured.
- Output: `would delete <photoId>` (dry-run), `delete <photoId>: ok|FAIL <code>`, `keep <photoId>: referenced`, `missing file for photo <row id>`, then one summary line with the counts. `<photoId>` is the `photoId` tag (`-` if absent). Drive ids, page tokens, tokens and Google text are never printed.

Runbook (dry-run first, then `--apply`):

```
docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/photo-sweep.js
docker compose -p tudocuatui -f apps/tudocuatui/compose.yml --env-file apps/tudocuatui/release.env exec tudocuatui node server/photo-sweep.js --apply
```

Scheduling it is a deployment-repo follow-up.

## AI settings (T-018)

`GET /api/ai-settings` returns `{ settings: AiSettingsView | null }` (provider, model, masked `keyHint`, `hasKey`, `modelSupported`, `updatedAt`; never the key). `PUT /api/ai-settings` takes `{ provider, model, apiKey? }` (omit `apiKey` to keep the stored key; changing provider needs a new key). `DELETE /api/ai-settings/key` clears the key (idempotent). The key is sealed with AES-256-GCM (`server/ai/crypto.js`, KEK from `AI_KEK`) and stored in the caller's `ai_settings` row (one per user, primary key `user_id`, D33; AAD `tudocuatui-ai-key|v2|<sub>|<provider>`). `POST /api/ai-settings/test` (body exactly `{}`, `Content-Type: application/json`) checks the saved key with the provider, no tokens spent (Claude: `GET /v1/models/<model>` on `api.anthropic.com`; Gemini: `GET /v1beta/models/<model>` on `generativelanguage.googleapis.com`, key only in the `x-goog-api-key` header, never `?key=`) and answers `{ ok: true }`; failures use the codes below.

Errors use the codes in `AI_ERROR_STATUS`: `invalid_provider`, `invalid_model`, `invalid_key_format`, `key_required`, `bad_request`, `invalid_json`, `unsupported_media_type`, `payload_too_large` (4096 bytes), `forbidden_origin`, `not_configured` (no saved key), `key_unreadable` (ciphertext does not open under this `AI_KEK`), `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`, `provider_unavailable`, `rate_limited` (per user 30 saves/hour, 20 tests/hour, 100 tags/24 h, plus global ceilings 600/300/2000, which the owner is exempt from; in memory), `db_unavailable`, `server_misconfigured` (no `AI_KEK`: every AI route), `internal`.

### Photo tagging (F-701)

`POST /api/ai/tag-photo` takes a raw JPEG body (`Content-Type: image/jpeg`, at most 2 MB, magic bytes checked, body cut after 15 s in total or 5 s idle) and answers `{ suggestion: { name, category, colors, seasons, material, brand, tags } }`. Values are DB ids (`category` in `CATEGORIES`, colours from `COLOR_IDS`, `SEASONS`); anything unknown becomes `null` or `[]`, never `"other"`. It uses the provider, model and key saved in `ai_settings`. The photo is sent under the user's own key to `api.anthropic.com` for Claude (forced tool use, `max_tokens` 1024) or to `generativelanguage.googleapis.com` for Gemini (F-701.1: `generateContent` with `inline_data` and a JSON `responseSchema`, `maxOutputTokens` 2048), with a 45 s timeout and no retries, and is not stored or logged. Limits: 100 calls per 24 h per user (in memory) and 1 in flight per user, 2 in total (the owner is exempt from the total). New codes: `invalid_photo` (400), `request_timeout` (408), `provider_bad_response` (502), `ai_busy` (503, `Retry-After: 5`). Logs: `ai_tag` with `{id, code, ms}` only.

`server/ai/*.js` mirrors `src/shared/ai`; `server/ai/parity.test.ts` fails if they drift. The `/test` endpoint comes with T-018.2.
