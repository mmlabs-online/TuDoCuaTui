# TuDo Node server (T-013.1)

Start contract (T-015): `node server/index.js`, listens on `0.0.0.0:3000` (`PORT` overrides), serves the built SPA from `../dist`.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `postgres://tudocuatui:<pw>@postgres:5432/tudocuatui` (D24). Unset: starts without a DB, `/readyz` is 503. |
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` (not secret) |
| `CF_ACCESS_AUD` | Access application AUD tag (not secret) |
| `TUDO_ACCESS_DISABLED` | `1` turns the `/api` JWT check off. Dev only; refused when `NODE_ENV=production`. |
| `GOOGLE_CLIENT_ID` | OAuth client id of "TuDoCuaTui" (ends `.apps.googleusercontent.com`). Photos (D27). |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. Secret: runtime env only. |
| `GOOGLE_REFRESH_TOKEN` | Long-lived refresh token (scope `drive.file`). Secret: runtime env only. |
| `DRIVE_FOLDER_ID` | Id of the `TuDoCuaTui` Drive folder the connect script created |
| `AI_KEK` | Base64 of 32 random bytes (T-018). Secret: runtime env only. Unset, or request auth off (`access check OFF`): AI routes answer 503; malformed: exit 2. Removed from `process.env` after startup. |
| `NODE_ENV` | With `production`, missing `CF_ACCESS_*` exits 2. |
| `PORT` | Default 3000 |

Routes: `/healthz` (liveness), `/readyz` (`select 1`), `/api/*` (Cloudflare Access JWT required; endpoints below), everything else is the SPA.

In production the four Google values come from `deploy-tudocuatui` (repository secrets of `mmlabs-online/deployment`, D28), see M-15 in `work/ming-todo.md`.

The four Google variables are all-or-nothing: none set means photos are off (`drive not configured`, the server still starts); a partial or malformed set exits 2 with a message that names variables, never values. An empty string counts as unset.

## Google Drive (T-005.1)

`server/drive.js` is the Drive v3 client (plain `fetch`, scope `drive.file`, no dependency). It is wired into `createApp` (T-005.2) and is not part of `/readyz`; nothing calls Google at startup. Errors are `DriveError` with a fixed `code` only: `drive_not_configured`, `drive_auth`, `drive_not_found`, `drive_forbidden`, `drive_rate_limited`, `drive_unavailable`, `drive_too_large` (over 5 MB), `drive_bad_response`, `drive_folder_not_found`, `drive_invalid_id` (malformed file id, no request made). Redirects are never followed, except for media reads. Creates are never retried (not idempotent); other calls retry up to 3 attempts. Deletes are permanent and a missing file counts as success.

Smoke (creates, reads and deletes a tiny file in the folder; exit 0 ok, 1 failed, 2 not configured):

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
| `GET /api/photos/:id` | 200 image stream; `:id` is `primary_photo_id` (`item_photos.id`), never a Drive id. Headers are constants: `Content-Type: image/jpeg` (never Drive's), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<id>"` (a matching `If-None-Match` gives 304 with no Drive call; a replace creates a new id). 404 `not_found` (unknown id, legacy row, Drive file gone), 502 `photo_fetch_failed`, 503 `photos_unavailable` / `db_unavailable`. Behind the same access check as the rest of `/api` |
| `POST /api/items/:id/wear` `{ delta: 1 \| -1, today: "YYYY-MM-DD" }` | 200 `{ wear_count, last_worn, already }`; `-1` removes the latest log; `today` must be within one day of Asia/Ho_Chi_Minh today |

`ItemRow` is a snake_case `items_with_stats` row: `price` is a number or null, dates are `YYYY-MM-DD`, `created_at`/`updated_at` are ISO strings, `primary_photo_path` is always null; `primary_photo_id` is the `item_photos` id (uuid) or null; the client builds `/api/photos/<primary_photo_id>` from it. Drive file ids never reach the browser.

Errors are `{ "error": { "code", ... } }`: 400 `invalid_input` (with `field` and `reason` for validation failures), 400 `invalid_json`, 403 `forbidden_origin`, 404 `not_found`, 405 `method_not_allowed`, 409 `conflict`, 413 `payload_too_large` (256 KB), 415 `unsupported_media_type`, 500 `internal` (with `requestId`), 503 `db_unavailable`. Photos add 400 `invalid_photo` (empty, truncated, not starting `FF D8 FF`), 408 `request_timeout` (body not read in 30 s), 413 over 2 MiB, 415 unless `image/jpeg`, 502 `photo_upload_failed` (Drive failed or timed out), 503 `photos_unavailable` (Drive not configured, auth or folder problem, or 3 uploads already in flight; `Retry-After: 5`). Reasons: `notObject`, `idInvalid`, `nameRequired`, `nameTooLong`, `priceNegative`, `priceInvalid`, `dateInvalid`, `invalidType`, `invalidValue`, `tooLong`, `tooMany`, `todayOutOfRange`.

Photos (T-005.2): the cap is 2 MiB, counted on the stream as well as `Content-Length`. Files are named `<photoId>.jpg` and tagged `appProperties {app:"tudo", photoId, itemId}`; a create is never retried. The row is written after Drive succeeds; if the write fails the new file is deleted. Replacing deletes the old file after commit. Deleting an item deletes its Drive files; a failed Drive delete is logged as `{event:"photo_orphan", photoId, code}` and leaves a tagged file behind (also when Drive is not configured; see Photo sweep). Lock rule: every writer of `item_photos` locks the `items` row first.

CSRF: PUT/POST/DELETE with `Sec-Fetch-Site: cross-site` or `same-site` are refused; PUT/POST need `Content-Type: application/json`. No CORS headers are sent.

Image (T-015): `/app/{package.json,node_modules,dist,server,db/migrations}`, root-owned, `USER node`, `NODE_ENV=production`
baked in, `CMD ["node","server/index.js"]`. The image `HEALTHCHECK` probes `/healthz`; the compose file overrides it with
`/readyz`. `CF_ACCESS_*` come from the compose file, `DATABASE_URL` from the host env file; neither is in the image.

Local run: `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=... pnpm start`.

Logging: one JSON line per request (method, route template, status, ms, id). Never log `DATABASE_URL`, tokens, raw URLs or whole error objects; only `err.code`.

Router note for T-013.2: `server/app.js` computes one `pathname` (after rejecting non-origin-form targets with 400). Dispatch API endpoints from that same `pathname`, inside the guarded `/api` branch, so the access check cannot be bypassed by a second URL parse.

Photo reads (T-005.3): every `getMedia` caller passes a per-request signal with a deadline (`servePhoto`: 30 s total, also aborted when the client disconnects); a handed-over stream keeps its abort listener until that signal goes away. The bytes are served unchanged: photos uploaded through the app are re-encoded by the canvas resize, which strips EXIF/GPS, but a hand-made `PUT /api/items/:id/photo` could store EXIF/GPS and it would be served back as is (only to access-authenticated users). Read errors are logged as `{event:"photo_read_failed", code}` with no ids.

## Photo sweep (T-005.6)

`node server/photo-sweep.js [--apply] [--grace-minutes N] [--max-delete N]` finds Drive files that no `item_photos` row references (a create that timed out after Google accepted it, a crash, a failed best-effort delete) and deletes them. Drive deletes are permanent, so it is dry-run by default: run it without `--apply` first and check the counts.

- Touches only files in the configured folder tagged `appProperties app=tudo` (checked in the query and again in code), unreferenced, and older than the grace period (`--grace-minutes`, 15 to 43200, default 60). A file with no readable creation time is kept. The DB is re-checked right before each delete.
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

`GET /api/ai-settings` returns `{ settings: AiSettingsView | null }` (provider, model, masked `keyHint`, `hasKey`, `modelSupported`, `updatedAt`; never the key). `PUT /api/ai-settings` takes `{ provider, model, apiKey? }` (omit `apiKey` to keep the stored key; changing provider needs a new key). `DELETE /api/ai-settings/key` clears the key (idempotent). The key is sealed with AES-256-GCM (`server/ai/crypto.js`, KEK from `AI_KEK`) and stored in the single `ai_settings` row. `POST /api/ai-settings/test` (body exactly `{}`, `Content-Type: application/json`) checks the saved key with the provider (`GET /v1/models/<model>` on `api.anthropic.com`, no tokens spent) and answers `{ ok: true }`; failures use the codes below. With request auth off (`access === null`) AI is disabled at startup (log `ai disabled: request auth off`) and every AI route answers 503.

Errors use the codes in `AI_ERROR_STATUS`: `invalid_provider`, `invalid_model`, `invalid_key_format`, `key_required`, `bad_request`, `invalid_json`, `unsupported_media_type`, `payload_too_large` (4096 bytes), `forbidden_origin`, `not_configured` (no saved key), `key_unreadable` (ciphertext does not open under this `AI_KEK`), `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`, `provider_unavailable`, `rate_limited` (30 saves/hour and 20 tests/hour, in memory), `db_unavailable`, `server_misconfigured` (no `AI_KEK`: every AI route), `internal`.

`server/ai/*.js` mirrors `src/shared/ai`; `server/ai/parity.test.ts` fails if they drift. The `/test` endpoint comes with T-018.2.
