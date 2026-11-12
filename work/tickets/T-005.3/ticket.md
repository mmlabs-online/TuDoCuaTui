# T-005.3: Display item photos from Google Drive

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Photos |
| Areas | data, security |
| Gate | none |
| Depends on | T-005.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-08 (re-planned 2026-11-11) |
| Claimed by | — |
| PR | — |

## Goal
In API mode, the grid and the editor show photos stored in Drive, streamed by the server.

## Feature reference
- Ming 2026-11-08: store photos in Google Drive the way Ricotdin does. OAuth client "TuDoCuaTui" in Ricotdin's
  Google Cloud project (published "In production"), Ricotdin's Google account, folder `TuDoCuaTui/`, scope `drive.file`.
- **Re-planned 2026-11-11 on the Node backend (D23, D27):** the Drive credentials live only in the TuDo server's
  runtime env (never in the image, never `VITE_*`, R3); there is no Supabase Edge Function. Ming confirmed Google Drive
  with the account above ("Như đã chốt"). Ricotdin reference: `projects/ricotdin/CLAUDE.md` (Storage = Google Drive),
  `app/web/src/lib/upload/upload.ts`.

## Scope
- `GET /api/photos/:id` streams the image from Drive with caching headers (immutable per Drive file id / ETag).
  It sits behind the same Cloudflare Access JWT check: an `<img>` request to the same origin carries the Access
  cookie and Cloudflare adds `Cf-Access-Jwt-Assertion`, so no HMAC URL tokens are needed (simpler than the old plan).
- The API row returns a photo URL (or id) instead of `primary_photo_path: null`; `rowToItem` maps it; lazy loading
  (`loading="lazy"`, `decoding="async"`) on grid images.

## Out of scope
- Thumbnails/transforms (F-1102).

## Acceptance criteria
- [ ] Photos show in the grid and editor in API mode; no Google token or direct Drive link reaches the browser.
- [ ] `/api/photos/:id` returns 401 without a valid Access JWT and 404 for unknown ids; tests cover both.
- [ ] Local mode unchanged (R1); works at 390px and in dark mode (R9).

## Technical notes
- Replaces F-202.2's signed-URL refresh (no expiring URLs any more).

## Notes / answers from Ming
- (2026-11-12, from T-005.2 security review) `GET /api/photos/:id` must send a fixed `Content-Type: image/jpeg` (never Drive's mimeType), keep `X-Content-Type-Options: nosniff`, and add `Content-Security-Policy: default-src 'none'; sandbox` + `Content-Disposition: inline` (a JPEG/HTML polyglot passes the magic-byte check). Hand-made uploads may carry EXIF/GPS (the app's resize strips it) — note it. The photo id on the wire is `items_with_stats.primary_photo_id` (item_photos.id), never the Drive id.
- (2026-11-11, from T-005.1 security review) Every `getMedia` caller passes a per-request signal with a deadline (document in server/README.md); remove the caller abort listener on the streaming path (`server/drive.js:153`).
- 2026-11-11: Ming put T-016 on hold and asked for photo upload first; Google Drive, account as decided (D27).

## Handoff
