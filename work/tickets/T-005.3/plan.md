Status: READY

# Plan — T-005.3: Display item photos from Google Drive

Gate: none. The defaults chosen are recorded under Assumptions (A1–A14).

## Feature summary
- work/decisions.md D27: "handled only by the TuDo Node server … uploads/deletes through `/api`; images served by `GET /api/photos/:id` behind the Cloudflare Access check (no signed URLs)."
- docs/feature-list.md F-202, line 143: "Grid uses lazy-loaded images; signed URLs refresh automatically when expired". D27 replaces the signed-URL half. The ticket's technical note says: "Replaces F-202.2's signed-URL refresh (no expiring URLs any more)."
- Ticket scope:
  - "`GET /api/photos/:id` streams the image from Drive with caching headers (immutable per Drive file id / ETag). It sits behind the same Cloudflare Access JWT check".
  - "The API row returns a photo URL (or id) instead of `primary_photo_path: null`; `rowToItem` maps it; lazy loading (`loading="lazy"`, `decoding="async"`) on grid images."
- Ticket notes (Ming, 2026-11-12, from the T-005.2 security review):
  - Send a "fixed `Content-Type: image/jpeg` (never Drive's mimeType)".
  - "keep `X-Content-Type-Options: nosniff`, and add `Content-Security-Policy: default-src 'none'; sandbox` + `Content-Disposition: inline`".
  - "Hand-made uploads may carry EXIF/GPS … note it."
  - "The photo id on the wire is `items_with_stats.primary_photo_id` (item_photos.id), never the Drive id."
- Ticket notes (2026-11-11, from the T-005.1 security review): "Every `getMedia` caller passes a per-request signal with a deadline (document in server/README.md); remove the caller abort listener on the streaming path (`server/drive.js:153`)."
- T-005.2 plan A8: "T-005.3 changes only `photo: ""` → `"/api/photos/<id>"` plus serving. The 'Ảnh đã lưu' state then never shows in API mode."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Photos show in the grid and editor in API mode. | `repo.http.test.ts › list maps primary_photo_id to photo "/api/photos/<id>" and photoPath`. `ItemCard.test.tsx › renders the photo lazily`. `Editor.test.tsx › API item with a photo URL shows the image`. Browser smoke (API mode with the fake Drive, as in the T-005.2 review): add a photo, save, reload. The grid card, the hero collage and the editor all show the image. The Network tab shows `GET /api/photos/<uuid>` 200 `image/jpeg`. |
| 1a | No Google token or direct Drive link reaches the browser. | `api.db.test.ts › GET photo streams the stored bytes with fixed headers` asserts that neither the response headers nor any `/api/items` payload contain the Drive file id (`fakefile…`), `googleapis` or the access token, and that only the listed headers are present (none from Drive is forwarded). Code reading: `servePhoto` builds headers from constants only. |
| 1b | Serving headers follow the security notes. | Same test. It sets the fake file's stored mimeType to `text/html` and still expects `Content-Type: image/jpeg`. It also checks `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<photoId>"` and `Cross-Origin-Resource-Policy: same-origin`. |
| 2 | `/api/photos/:id` returns 401 without a valid Access JWT, and tests cover it. | `app.test.ts › GET /api/photos/:id without a valid JWT -> 401, no DB query, no Drive call`. |
| 2a | `/api/photos/:id` returns 404 for unknown ids, and tests cover it. | `api.db.test.ts › GET photo: unknown uuid -> 404 not_found, no Drive request`. `› legacy storage_path-only row -> 404`. `› Drive file gone -> 404`. |
| 2b | Failures are generic and leak nothing. | `api.test.ts › GET photo with drive null -> 503 photos_unavailable`. `api.db.test.ts › Drive 500 on media -> 502 photo_fetch_failed`, `› Drive auth failure -> 503 photos_unavailable`, `› Drive headers timeout -> 502`. Each error body equals `{ error: { code } }` exactly, and the logs contain neither the photo id nor the Drive id. |
| 2c | Every `getMedia` call has a deadline, and client disconnect aborts it. | `photos.test.ts › servePhoto aborts the getMedia signal after the deadline` (injected `deadlineMs`). `› servePhoto aborts the getMedia signal when the client disconnects`. `drive.test.ts › failed streaming attempts remove their abort listener`. |
| 3 | Local mode is unchanged (R1). | The existing local tests (`App.test.tsx` "App (local mode)", `repo.local.test.ts`, `Editor.test.tsx › local mode: Bỏ ảnh clears only photo`) pass. Browser smoke in local mode: the demo photos show, a picked photo saves as a data URL, and there are zero `/api/` requests. |
| 3a | Works at 390px and in dark mode (R9). | Browser smoke at 390×844 in light and dark (class-based dark mode via `tu-do-theme=dark`, as in the T-005.2 review). Check the grid, hero, editor with a photo, and the editor broken-image fallback (stop the fake Drive). Expect 0 px horizontal overflow. |
| 4 | The interim copy is gone. | `copy.ts` no longer has `photo.stored` / `photo.storedHint`; typecheck enforces this. `grep -r "sẽ hiển thị" src` finds nothing. |
| 5 | Broken image fallback. | `ItemCard.test.tsx › img error shows the "Chưa có ảnh" placeholder`. `Editor.test.tsx › img error shows the load-failed state and keeps Bỏ ảnh`. `ItemPhoto.test.tsx › resets when src changes`. |
| 6 | Checks are green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test` (with `TEST_DATABASE_URL` so the `*.db.test.ts` suites run), `pnpm build`. |

## Ming verification after merge
- The release that ships T-005.2 and T-005.3 needs M-15 (Drive connected in production).
- After that release, on a real phone in API mode:
  - items with photos show them in the grid, the hero collage and the editor, in light and dark;
  - a newly added photo shows right after saving;
  - reopening the app shows the photos again from cache (DevTools or "no visible reload" is enough);
  - a replaced photo shows the new image and not the cached old one, because a replace creates a new id.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/photos.js` | Add `servePhoto(req, res, { pool, drive, photoId, id, log, deadlineMs = 30_000 })`. It looks up the row, sends 304 on a matching `If-None-Match`, calls `getMedia` with a per-request signal (deadline plus client disconnect), and streams the body with fixed headers. It maps Drive errors and logs `{event:"photo_read_failed", code}` only. | Scope item 1 |
| `server/api.js` | `match()` gains `parts.length === 4 && a === "photos" && b` → `{ route: "/api/photos/:id", allow: "GET" }`. The existing 405 and uuid checks run on `parts[3]`. Then `if (m.route === "/api/photos/:id") return servePhoto(...)` before the `readJson` block. | Routing from the raw pathname inside the guarded branch (README router note) |
| `server/drive.js` | In `once()`, track whether a streaming response was handed to the caller. In `finally`, remove the caller's abort listener unless it was handed over. This replaces `if (!streaming)` at line 153. Update the `getMedia` JSDoc: the caller must pass a per-request signal with a deadline. | T-005.1 security note |
| `server/test/fake-drive.ts` | `fail` gains `"media"` (500 on `alt=media`). Add a `stream-stall` hang mode for media that sends headers and part of the body, then stalls. | Failure injection for 2b and 2c |
| `server/README.md` | Add the `GET /api/photos/:id` row (headers, 304, errors `404 not_found`, `502 photo_fetch_failed`, `503 photos_unavailable`). Add the getMedia rule ("every caller passes a per-request signal with a deadline"). Add the EXIF note (A9). The `ItemRow` sentence says the client builds `/api/photos/<primary_photo_id>`. | Contract docs and the ticket notes |
| `src/data/mappers.ts` | Add `apiPhotoUrl(id: string \| null \| undefined, base = "/api"): string`. It returns `${base}/photos/${id}` for a uuid and `""` otherwise. `rowToItem` is unchanged, so Supabase mode is not touched. | "mapper builds `/api/photos/<id>`" (R6: wire→UI mapping in mappers) |
| `src/data/repo.http.ts` | `toItem` sets `photo: apiPhotoUrl(row.primary_photo_id, base)`. Update the stale comment on line 11. `toItem` moves inside `createHttpRepo`, or takes `base` as a parameter. | Scope item 2 |
| `src/components/ItemPhoto.tsx` (new) | `<ItemPhoto src alt fallback />` renders `<img loading="lazy" decoding="async">` and switches to `fallback` after `onError`. The failure is tracked per `src` (`failedSrc === src`), so a new src retries. | Lazy loading and the onError fallback, shared by grid and hero |
| `src/features/items/ItemCard.tsx` | Use `ItemPhoto`, with the existing `.photo-placeholder` block as the fallback. | Grid display, lazy, fallback |
| `src/features/layout/Hero.tsx` | Use `ItemPhoto` with `fallback={null}`. | Hero display, lazy, fallback |
| `src/features/items/Editor.tsx` | Remove `storedOnly` and its branch. Update the `photoById` doc comment. The `<img>` gets `decoding="async"` and an `onError` that records `brokenSrc`. When `item.photo === brokenSrc`, the upload zone shows the icon plus `EDITOR_COPY.photo.loadFailed` / `loadFailedHint` without `has-photo`. "Bỏ ảnh" logic is unchanged. | Remove the interim copy; editor fallback |
| `src/features/items/copy.ts` | Remove `photo.stored` and `photo.storedHint`. Add `photo.loadFailed: "Không tải được ảnh"` and `photo.loadFailedHint: "Nhấp để chọn ảnh khác"`. | R6, scope |
| `src/App.tsx` | `onDuplicate`: in API mode, also set `photo: ""`, `photoPath: undefined`, `removedPhotoId: undefined`. Without this, the copy would show the source photo but save without it (A12 of T-005.2). | Keep the UI truthful now that photos display (A7) |

Test files (new or extended): `server/photos.test.ts` (new), `server/api.db.test.ts`, `server/api.test.ts`, `server/app.test.ts`, `server/drive.test.ts`, `src/data/mappers.test.ts`, `src/data/repo.http.test.ts`, `src/components/ItemPhoto.test.tsx` (new), `src/features/items/ItemCard.test.tsx`, `src/features/items/Editor.test.tsx`, `src/App.test.tsx`.

Estimate: about 170–200 non-test lines (server about 100, client about 80, README about 15). No split.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/api.db.test.ts › GET photo streams the stored bytes with fixed headers` (upload via PUT, then set the fake file's `meta.mimeType = "text/html"`, then GET). Asserts: body bytes equal the upload; the exact headers listed in AC 1b; `Content-Length` equals the size; no `fakefile`, `googleapis` or token in the headers; the request log has `route: "/api/photos/:id"` and neither the photo id nor the Drive id. | AC 1, 1a, 1b |
| `server/api.db.test.ts › GET photo: If-None-Match "<photoId>" -> 304 with ETag and Cache-Control, no Drive media request` | ETag / caching |
| `server/api.db.test.ts › GET photo: unknown uuid -> 404 not_found, no Drive request` | AC 2a |
| `server/api.db.test.ts › GET photo: legacy storage_path-only row -> 404, no Drive request` | AC 2a |
| `server/api.db.test.ts › GET photo: Drive file gone -> 404 not_found` (delete from `fake.files`) | A4 |
| `server/api.db.test.ts › GET photo: Drive 500 on media -> 502 photo_fetch_failed, body exactly {error:{code}}` (`fake.fail.add("media")`, `sleep` no-op) | AC 2b |
| `server/api.db.test.ts › GET photo: Drive auth failure -> 503 photos_unavailable` (drive wrapper throwing `DriveError("drive_auth")`, as at line 428) | AC 2b |
| `server/api.db.test.ts › GET photo: Drive headers timeout -> 502` (`hang "media"`, short `timeouts.headers`) | AC 2b |
| `server/api.db.test.ts › GET /api/items carries primary_photo_id; primary_photo_path stays null` (existing shape test unchanged; confirm) | Wire contract unchanged |
| `server/api.test.ts › GET /api/photos/<uuid>: drive null -> 503 photos_unavailable; pool null with drive -> 503 db_unavailable` | Pre-DB paths |
| `server/api.test.ts › /api/photos routing: POST -> 405 Allow "GET"; bad id -> 400 invalid_input field id; /api/photos -> 404; /api/photos/<uuid>/x -> 404` | Routing |
| `server/app.test.ts › GET /api/photos/:id without a valid JWT -> 401, no DB query, no Drive call` | AC 2 |
| `server/photos.test.ts › servePhoto aborts the getMedia signal after the deadline` (stub drive whose body never ends, `deadlineMs: 50`; the response is destroyed and `signal.aborted` is true) | AC 2c |
| `server/photos.test.ts › servePhoto aborts the getMedia signal when the client disconnects mid-stream` | AC 2c |
| `server/photos.test.ts › stream error after headers destroys the response and logs photo_read_failed without ids` | Mid-stream failure |
| `server/drive.test.ts › failed streaming attempts remove their abort listener; a handed-over stream keeps it` (spy on `signal.addEventListener` / `removeEventListener` with responses 500 then 200) | T-005.1 note |
| `src/data/mappers.test.ts › apiPhotoUrl: uuid -> "/api/photos/<id>"; null, undefined or non-uuid -> ""; custom base` | Mapper |
| `src/data/repo.http.test.ts › list maps primary_photo_id to photo "/api/photos/<id>" and photoPath` (replaces "leaves photo empty") | AC 1 |
| `src/data/repo.http.test.ts › row without a photo maps to photo ""` | AC 1 |
| `src/data/repo.http.test.ts › save with data: photo returns photo "/api/photos/<new id>"` (update the existing test at line 185) | AC 1 |
| `src/data/repo.http.test.ts › save with an unchanged "/api/photos/<id>" photo makes no photo request` (extend the test at line 222) | No accidental upload or delete |
| `src/components/ItemPhoto.test.tsx › img has loading="lazy" and decoding="async"; error -> fallback; new src -> img again` | Lazy loading, fallback |
| `src/features/items/ItemCard.test.tsx › img error shows the "Chưa có ảnh" placeholder` | AC 5 |
| `src/features/items/Editor.test.tsx` (replace the "Ảnh đã lưu" test) `› API item with a photo URL shows the image and Bỏ ảnh`, `› img error shows loadFailed copy, keeps Bỏ ảnh`, `› Bỏ ảnh with photoById sets removedPhotoId` (existing, now with `photo: "/api/photos/<id>"`) | AC 4, 5 |
| `src/App.test.tsx` ("App (API mode photos)") `› duplicate in API mode clears the photo` (no img and no "Bỏ ảnh" in the duplicate editor) | A7 |

## Approach
1. **drive.js listener fix** (T-005.1 note).
   - In `once()`, add `let handedOver = false`. Set it to `true` just before `return { res, text: "" }` on the `streaming && res.ok` path.
   - In `finally`: `if (!handedOver) signal?.removeEventListener("abort", onAbort)`.
   - Failed attempts and retries no longer leave listeners behind. A handed-over stream keeps the `{ once: true }` listener, because that is how the caller's deadline aborts the body. The listener goes away with the per-request signal (A5).
   - Update the JSDoc.
2. **Routing** (`api.js`).
   - Add the `match()` entry. The existing method check gives 405 `Allow: GET`.
   - `Sec-Fetch-Site` only applies to writes, so it is skipped. The existing `isUuid(parts[3])` check gives 400 for a bad id.
   - Dispatch `servePhoto(req, res, { pool, drive, photoId: parts[3], id, log })` before the `readJson` block.
   - The access check has already run in `app.js` on the same raw `pathname`.
3. **`servePhoto`** (`photos.js`). Steps, in order:
   1. `drive` null → 503 `photos_unavailable`. `pool` null → 503 `db_unavailable`.
   2. `select drive_file_id from item_photos where id = $1`. No row, or `drive_file_id` null → 404 `not_found`. A DB error goes through the existing `mapDbError` + `db_error` log.
   3. Common headers, all constants: `Content-Type: image/jpeg`, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<photoId>"`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`. `nosniff`, `Referrer-Policy` and `X-Frame-Options` are already set by `app.js` `SECURITY_HEADERS`; keep them.
   4. `If-None-Match` contains `"<photoId>"` (exact match, or `*`) → 304 with the headers above minus Content-Type, and no Drive call.
   5. Create `ctl = new AbortController()` and `timer = setTimeout(() => ctl.abort(), deadlineMs)` (30 s default).
      - `res.once("close", () => ctl.abort())`; aborting after a normal finish is a no-op.
      - Clear the timer on `close`.
   6. `await drive.getMedia(driveFileId, { signal: ctl.signal })`. On `DriveError`:
      - `drive_not_found` → 404 `not_found`;
      - `drive_auth`, `drive_forbidden` or `drive_folder_not_found` → 503 `photos_unavailable`;
      - anything else (`drive_unavailable`, `drive_rate_limited`, `drive_bad_response`, `drive_invalid_id`) → 502 `photo_fetch_failed`.
      - Log `{event:"photo_read_failed", code}` only. Do this only if `!res.headersSent`.
   7. `res.writeHead(200, { ...headers, ...(contentLength !== null && { "Content-Length": contentLength }) })`. Drive's `contentType` is ignored.
   8. `pipeline(Readable.fromWeb(body), res, (err) => { … })`. On error: log `{event:"photo_read_failed", code:"stream"}` and let `pipeline` destroy `res`. Always clear the timer.
   9. Never log or send `driveFileId`, Drive headers or Google text (R3, A7 of T-005.2).
4. **Fake Drive.** Add `fail "media"` (500) and `hang "stream-stall"` (headers plus partial body, then silence), used by the photos/api tests.
5. **Client mapping** (R6).
   - `apiPhotoUrl` in `mappers.ts`.
   - `repo.http.ts` `toItem` → `{ ...rowToItem(row, apiPhotoUrl(row.primary_photo_id, base)), photoPath: row.primary_photo_id ?? undefined }`.
   - `save()` is unchanged. A `/api/photos/…` photo is neither `data:` nor `blob:`, so it is never re-uploaded. A delete still happens only via `removedPhotoId`.
   - The Supabase and local repos are untouched (R1).
6. **UI** (R9, R6).
   - `ItemPhoto` component used by `ItemCard` and `Hero`. It reuses the existing classes and markup, so 390px and dark styles carry over.
   - Editor: drop the interim "Ảnh đã lưu" state and copy, and add the load-failed state inside `.upload-zone` with the existing `upload-icon`/`b`/`small` markup.
   - The editor image stays eager (it is the opened item) with `decoding="async"`.
   - `isDirty` already compares `photo`. Pressing "Bỏ ảnh" on a displayed API photo now changes `photo` from the URL to `""`, so the discard prompt works. This also fixes the T-005.2 follow-up, with no code change needed.
7. **App duplicate** (A7): one conditional spread in `onDuplicate`.
8. **README** (contract) and checks.

Rules:
- R1: local mode is untouched. The repo boundary is kept, and the components only render `item.photo`.
- R3: no secrets; the Drive id never leaves the server.
- R4 (spirit): photos only through the Access-guarded same-origin route, never a Drive link.
- R5: nothing stored.
- R6: copy in `copy.ts`; the mapping in `mappers.ts`.
- R7: sweep (T-005.6) and server-side duplicate copy (A12) stay out.
- R8: tests above.
- R9: smoke at 390px in light and dark.
- R10: `AGENTS.md`, `.figma/` and `vite.config.ts` are untouched.

## Specialist input used
No consult files exist for T-005.3. Inputs used instead:
- **T-005.2 security review, attempt 1, 🟡 2 (adopted):** fixed `image/jpeg`, `nosniff`, `default-src 'none'; sandbox`, `inline`, and the EXIF note. CORP `same-origin` was added on top (A6).
- **T-005.1 security review item 3/7 (adopted):** a per-request signal with a deadline, the README rule, and listener removal. It is adapted so a handed-over stream keeps its listener (A5).
- **T-005.1 review 💭 (stale listeners on failed streaming attempts):** fixed by the same change.
- **T-005.1 consult-software-architect:** pipe with `Readable.fromWeb` (adopted).
- **T-005.2 plan A7, A8, A12, and review nits:** wire id = `primary_photo_id` (adopted). The interim state is removed (adopted). For the duplicate "Bỏ ảnh with nothing visible" nit: duplicate clears photo fields in API mode (A7). Server-side copy stays a follow-up.

## Assumptions
- **A1 — Route.** `GET /api/photos/:id`, where `:id` is the `item_photos.id` uuid. Only `GET` (405 `Allow: GET` otherwise, HEAD included). Non-uuid → 400 `invalid_input` field `id`, the existing convention for all `/api` ids. Unknown uuid → 404.
- **A2 — Caching.** `Cache-Control: private, max-age=31536000, immutable`. `private` keeps Cloudflare and other shared caches from storing an Access-protected image. `immutable` is safe because a replace creates a new `item_photos.id`.
  - `ETag: "<photoId>"`. A matching `If-None-Match` → 304, checked after the DB lookup, so a deleted photo is 404 and never 304.
  - Error responses keep `no-store` (from `sendJson`).
- **A3 — Deadline.** 30 s total per photo response (Drive's own header timeout is 10 s inside it). The deadline also covers slow clients: a stalled download is cut after 30 s. JPEGs are about 150–300 KB, so this is generous.
- **A4 — Error mapping.**
  - Drive file missing (`drive_not_found`) → 404 `not_found`, so the image just falls back.
  - Auth, forbidden or folder problem → 503 `photos_unavailable` (same set as upload).
  - Other Drive failures → 502 `photo_fetch_failed` (new code). The browser never reads these JSON bodies; `<img onError>` shows the fallback. No `apiErrors.ts` copy is needed.
- **A5 — Abort listener.** The T-005.1 note asks to remove the caller listener on the streaming path. Implemented as follows:
  - Removed on every streaming attempt that does not hand a body to the caller (errors, retries).
  - Kept, as `{ once: true }`, on the handed-over stream. That is the mechanism by which the caller's deadline aborts the body. The signal is per-request, so nothing accumulates.
  - If the reviewer prefers removal in all cases, `servePhoto` also destroys the stream on abort (`pipeline` + `res` close), so the behaviour holds either way.
- **A6 — Extra hardening.**
  - `Cross-Origin-Resource-Policy: same-origin` stops cross-site pages from embedding the image with Ming's Access cookie.
  - No `Sec-Fetch-Site` rejection on GET; `<img>` requests are same-origin `no-cors` and a 403 would add nothing over CORP.
- **A7 — Duplicate in API mode.** The copy starts without a photo: `photo`, `photoPath` and `removedPhotoId` are cleared. Copying the stored photo server-side (feature-list line 69, "duplicate (photo copied)") remains the T-005.2 A12 follow-up. It is not trivial: it needs a Drive `files.copy` plus a new row, or a browser re-upload that collides with the stale-view protection. Local and Supabase duplicate behaviour is unchanged.
- **A8 — No byte cap or concurrency limit on reads.** Files come only from the server's own upload path (2 MiB cap, scope `drive.file`, so the app sees only its own files). Lazy loading limits parallel grid requests. Drive 429s map to 502 and the image falls back. A per-process read semaphore can be a follow-up if Drive rate limits show up.
- **A9 — EXIF.** The server streams stored bytes unchanged. Photos uploaded through the app are re-encoded by the canvas resize (`src/data/photos.ts`), which strips EXIF/GPS. A hand-made `PUT /api/items/:id/photo` could store EXIF/GPS, and it would be served back unchanged, but only to Access-authenticated users. Recorded in `server/README.md`. Server-side stripping is a follow-up if ever needed.
- **A10 — URL building location.** `apiPhotoUrl` lives in `mappers.ts`, as a pure function with tests, and is called from `repo.http.ts`'s `toItem` with the repo's `base`. `rowToItem` keeps its `photoUrl` parameter, so Supabase signed-URL mapping is unchanged.
- **A11 — Local mode.** `ItemPhoto` (lazy loading and `onError` fallback) also applies to local and demo images. This changes nothing visible unless an image fails, which now shows the existing "Chưa có ảnh" placeholder instead of a broken image. Local data and repo are untouched (R1).
- **A12 — Editor image.** It is not lazy (it is visible when opened) but gets `decoding="async"`. Hero images are lazy; they are above the fold but small.
- **A13 — Hotspot files.** `server/api.js`, `server/photos.js`, `server/README.md`, `server/test/fake-drive.ts`, `src/data/repo.http.ts`, `src/features/items/Editor.tsx`, and `src/App.tsx` are shared with T-005.6 (sweep: `drive.js`, `fake-drive.ts`, README). No other open ticket is in progress on them.
- **A14 — Out-of-plan items (R7), recorded as follow-ups and not changed here:**
  - `server/README.md:20` D28 wording (T-005.2 A19);
  - optional `encodeURIComponent` nit in `repo.http.ts:85`;
  - feature-list line 143 "signed URLs refresh" wording is superseded by D27 (doc update for Ming/feature-list owner).

## Blocking questions
None.

## Split proposal
None. Estimate is about 170–200 non-test lines. T-005.6 (sweep) and the server-side duplicate copy (T-005.2 A12) stay separate follow-ups.
