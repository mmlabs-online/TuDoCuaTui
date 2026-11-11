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
| `NODE_ENV` | With `production`, missing `CF_ACCESS_*` exits 2. |
| `PORT` | Default 3000 |

Routes: `/healthz` (liveness), `/readyz` (`select 1`), `/api/*` (Cloudflare Access JWT required; endpoints below), everything else is the SPA.

The four Google variables are all-or-nothing: none set means photos are off (`drive not configured`, the server still starts); a partial or malformed set exits 2 with a message that names variables, never values. An empty string counts as unset.

## Google Drive (T-005.1)

`server/drive.js` is the Drive v3 client (plain `fetch`, scope `drive.file`, no dependency). It is not wired into `createApp` yet (T-005.2) and is not part of `/readyz`; nothing calls Google at startup. Errors are `DriveError` with a fixed `code` only: `drive_not_configured`, `drive_auth`, `drive_not_found`, `drive_forbidden`, `drive_rate_limited`, `drive_unavailable`, `drive_too_large` (over 5 MB), `drive_bad_response`, `drive_folder_not_found`. Creates are never retried (not idempotent); other calls retry up to 3 attempts. Deletes are permanent and a missing file counts as success.

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
| `POST /api/items/:id/wear` `{ delta: 1 \| -1, today: "YYYY-MM-DD" }` | 200 `{ wear_count, last_worn, already }`; `-1` removes the latest log; `today` must be within one day of Asia/Ho_Chi_Minh today |

`ItemRow` is a snake_case `items_with_stats` row: `price` is a number or null, dates are `YYYY-MM-DD`, `created_at`/`updated_at` are ISO strings, `primary_photo_path` is always null for now.

Errors are `{ "error": { "code", ... } }`: 400 `invalid_input` (with `field` and `reason` for validation failures), 400 `invalid_json`, 403 `forbidden_origin`, 404 `not_found`, 405 `method_not_allowed`, 409 `conflict`, 413 `payload_too_large` (256 KB), 415 `unsupported_media_type`, 500 `internal` (with `requestId`), 503 `db_unavailable`. Reasons: `notObject`, `idInvalid`, `nameRequired`, `nameTooLong`, `priceNegative`, `priceInvalid`, `dateInvalid`, `invalidType`, `invalidValue`, `tooLong`, `tooMany`, `todayOutOfRange`.

CSRF: PUT/POST/DELETE with `Sec-Fetch-Site: cross-site` or `same-site` are refused; PUT/POST need `Content-Type: application/json`. No CORS headers are sent.

Image (T-015): `/app/{package.json,node_modules,dist,server,db/migrations}`, root-owned, `USER node`, `NODE_ENV=production`
baked in, `CMD ["node","server/index.js"]`. The image `HEALTHCHECK` probes `/healthz`; the compose file overrides it with
`/readyz`. `CF_ACCESS_*` come from the compose file, `DATABASE_URL` from the host env file; neither is in the image.

Local run: `pnpm build && TUDO_ACCESS_DISABLED=1 DATABASE_URL=... pnpm start`.

Logging: one JSON line per request (method, route template, status, ms, id). Never log `DATABASE_URL`, tokens, raw URLs or whole error objects; only `err.code`.

Router note for T-013.2: `server/app.js` computes one `pathname` (after rejecting non-origin-form targets with 400). Dispatch API endpoints from that same `pathname`, inside the guarded `/api` branch, so the access check cannot be bypassed by a second URL parse.
