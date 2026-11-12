# Review — T-005.3

## Attempt 1 — 2026-11-12
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb`, diff `origin/main...HEAD` (27 files, +787 / −42, of which 25 code/test/docs files from commit 9324f6c).
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0, no output.
- format:check: "All matched files use the correct format." (178 files)
- test: with a scratch local PostgreSQL 16 (data dir under /tmp, scram-sha-256, `TEST_DATABASE_URL` set): `Test Files 66 passed (66)`, `Tests 807 passed (807)`. No suites skipped, so the `*.db.test.ts` suites ran.
- test:coverage (`CI=true`): 66 / 807 passed. All files 95.4 % statements, 94.56 % branches. `photos.js` 95.12 %, `api.js` 98.52 %, `drive.js` 99.49 %. The only uncovered `servePhoto` lines are 268-271 (DB error branch).
- build: `vite build`, `✓ built in 392ms`.
- These match the impl-log numbers (807 tests, same coverage figures). The cluster, smoke servers and data dir were stopped and deleted afterwards.

**Browser smoke (reviewer-run).**
- Setup: a scratch launcher wired `createApp({ pool, drive: createDriveClient({ config: fakeConfig, ...fake.urls }), distDir: dist, access })` with `server/test/fake-drive.ts`, on a freshly migrated DB (`server/migrate.js`: `20261110120000_init`, `20261112120000_item_photos_drive`). Playwright Chromium at 390×844. Dark mode was set via `localStorage["tu-do-theme"]="dark"`, and `html.dark` was confirmed true (light: false).
- Results, identical in light and dark:
  - **Upload**: added an item, picked a JPEG and saved. Network: `PUT /api/items/<id>`, then `PUT …/photo`, then `GET /api/photos/<uuid>` → 200 `image/jpeg`.
    - Grid card `<img src="/api/photos/<uuid>" loading="lazy" decoding="async">`, naturalWidth 300.
    - Hero collage img showed the same src, lazy, naturalWidth 300.
    - Editor `.upload-zone img` showed the same src, `decoding="async"`, not lazy (A12), naturalWidth 300.
  - **Replace**: a new `primary_photo_id`. The card shows the new image (new src, naturalWidth 300).
  - **Reload**: the image still shows.
  - **Remove** ("Bỏ ảnh" + save): `DELETE …/photo?photo=<id>`. The card shows "Chưa có ảnh" with no img, and still does after reload.
  - Horizontal overflow was 0 px in the grid and the editor.
  - Apart from Google Fonts, the browser made no request off-origin. No Drive host, `fakefile…` id or token was seen. `GET /api/items` contains no `fakefile` (count 0).
- **Drive down**: stopped the fake Drive and opened fresh contexts (no cache).
  - `/api/photos/<id>` → `502 application/json` (after retries).
  - The card shows the "Chưa có ảnh" placeholder.
  - The editor shows `upload-zone` without `has-photo` and "Không tải được ảnhNhấp để chọn ảnh khác", and "Bỏ ảnh" is still present.
  - Light and dark both had 0 px overflow. Screenshots were checked visually and are legible in dark.
- **curl** (Access off):
  - `GET /api/photos/<id>` → 200 with these headers: `Content-Type: image/jpeg`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<photoId>"`, `Content-Length: 2217`, plus `Referrer-Policy` and `X-Frame-Options: DENY` from `app.js`. The body is byte-identical to the uploaded file (`cmp`). No Drive header is forwarded.
  - `If-None-Match: "<photoId>"` → `304 Not Modified` with the same cache and security headers and no Content-Type.
  - HEAD → 405.
  - Unknown uuid → 404 `{"error":{"code":"not_found"}}`.
  - `not-a-uuid` → 400 `invalid_input` field `id`.
  - The server log has route `/api/photos/:id` and status only; grep finds neither the photo id nor the Drive id (0 hits).
- **Access on** (`CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` set to dummy values):
  - With no JWT: `GET /api/photos/<id>` → 401 `{"error":{"code":"unauthorized"}}`, `Cache-Control: no-store`, logged `access_denied code missing`.
  - With a garbage `Cf-Access-Jwt-Assertion`: 401, `ERR_JWS_INVALID`.
- **Local mode** (static `dist` served by `serve -s`, no Node server):
  - 17 items (16 demo + 1 added), 0 `/api/` requests, 0 px overflow, in light and dark.
  - A picked photo saves as `data:image/jpeg…` and persists after reload.
  - The Unsplash demo images are unreachable from this sandbox. They now fall back to the "Chưa có ảnh" placeholder instead of a broken image, which is the expected A11 behaviour.

### Acceptance criteria
- [x] **Photos show in the grid and editor in API mode.**
  - Tests: `repo.http.test.ts › list maps primary_photo_id to photo "/api/photos/<id>" and photoPath`, `ItemCard.test.tsx › renders the photo lazily`, `Editor.test.tsx › API item with a photo URL shows the image and Bỏ ảnh`.
  - Code: `src/data/mappers.ts:90`, `src/data/repo.http.ts:19`.
  - The smoke above confirms it.
- [x] **No Google token or direct Drive link reaches the browser.**
  - `servePhoto` builds headers only from the `PHOTO_HEADERS` constant and the ETag (`server/photos.js:242-248, 304-308`). Drive's `contentType` is ignored.
  - `api.db.test.ts › GET photo streams the stored bytes with fixed headers` checks the headers and logs for the Drive id, `googleapis`, the token and the photo id, and checks that `/api/items` does not contain the Drive id. It also sets the stored mimeType to `text/html` and still expects `image/jpeg`.
  - The smoke and curl runs confirmed it.
- [x] **Serving headers per Ming's 2026-11-12 note.**
  - Fixed `image/jpeg`, `nosniff` (from `app.js` SECURITY_HEADERS), `default-src 'none'; sandbox` and `inline` (`photos.js:242-248`), verified by curl.
  - The EXIF/GPS note is at `server/README.md:67`.
  - The id on the wire is `item_photos.id` (`api.js:18,64`, `photos.js:270`).
- [x] **401 without a valid Access JWT, and a test covers it.**
  - Test: `app.test.ts › GET /api/photos/:id without a valid JWT -> 401, no DB query, no Drive call`.
  - The guard runs before `handleApi` (`server/app.js` `/api` branch). Reproduced with Access on.
- [x] **404 for unknown ids, and tests cover it.**
  - Tests in `api.db.test.ts`: `› unknown uuid -> 404 not_found, no Drive request`, `› legacy storage_path-only row -> 404`, `› Drive file gone -> 404 not_found`.
  - Code: `photos.js:274, 298`.
- [x] **Per-request getMedia deadline, documented, abort listener handled (2026-11-11 note).**
  - Code: `photos.js:283-289` (30 s deadline, aborted on `res` close), `photos.js:310` (`pipeline` with the signal).
  - Documented at `server/README.md:67` and in the `drive.js` JSDoc.
  - Tests: `photos.test.ts › aborts the getMedia signal after the deadline` and `› … when the client disconnects mid-stream`.
  - Listener handling: `drive.js:141,148,155` removes the listener on every attempt that is not handed over. `drive.test.ts › failed streaming attempts remove their abort listener; a handed-over stream keeps it` covers it.
  - Keeping the `{once:true}` listener on the handed-over stream is plan A5, and it is sound. The listener is how the per-request deadline reaches the Drive fetch, and the signal is created per request (`photos.js:283`), so nothing accumulates.
- [x] **Failures are generic.**
  - `api.db.test.ts`: `› Drive 500 on media -> 502 photo_fetch_failed` (exact body; logs without ids), `› Drive auth failure -> 503 photos_unavailable`, `› Drive headers timeout -> 502`.
  - `api.test.ts`: `drive null -> 503 photos_unavailable; pool null -> 503 db_unavailable`.
  - `photos.test.ts › stream error after headers destroys the response and logs photo_read_failed without ids`.
- [x] **ETag/304.** Test: `api.db.test.ts › If-None-Match -> 304 … no Drive media request`. Code: `photos.js:276-281`. The check runs after the DB lookup, so a deleted photo gives 404, not 304. Verified by curl.
- [x] **Local mode unchanged (R1).** The existing local tests are green, and the local smoke above confirms it. The local and Supabase repos are untouched; `rowToItem` keeps its `photoUrl` parameter.
- [x] **390px and dark mode (R9).** See the smoke: 0 px overflow in the grid, the editor and the fallback, in light and dark.
- [x] **The interim copy is gone (plan AC 4).** `copy.ts` replaces `stored`/`storedHint` with `loadFailed`/`loadFailedHint`. `grep -rn "sẽ hiển thị\|photo.stored" src` finds nothing.
- [x] **Broken image fallback (plan AC 5).** Tests: `ItemCard.test.tsx › img error shows the "Chưa có ảnh" placeholder`, `Editor.test.tsx › img error shows loadFailed copy, keeps Bỏ ảnh`, `ItemPhoto.test.tsx`. Code: `Editor.tsx:66-67, 89-111`. Confirmed in the smoke with Drive down.
- [x] **API duplicate clears the photo (A7).** Code: `App.tsx:187-191`. Test: `App.test.tsx › duplicate in API mode clears the photo`.
- [x] **Checks are green.** See above.

### Issues
None.

### Scope
Every changed code file is in the plan's file list, and the impl-log lists no out-of-plan files. The only other changes are the work files (`plan.md`, `impl-log.md`, `ticket.md`). No migrations were changed. `AGENTS.md`, `.figma/` and `vite.config.ts` are untouched.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: data access stays in `WardrobeRepo`, and local mode was verified.
- R2: there is no schema change.
- R3: no secret or `VITE_*` variable was added, and the Drive id and token stay server-side.
- R4: photos are served only through the access-guarded same-origin route (D27 supersedes signed URLs).
- R5: nothing derived is stored.
- R6: copy is in `copy.ts`, and the wire→UI mapping is in `mappers.ts`.
- R7: the diff stays inside the plan.
- R8: checks are green, and the new logic has tests.
- R9: verified at 390px in light and dark.
- R10: Figma Make files are untouched.

### Nits (do not block)
- `server/test/fake-drive.ts:81-86`: the new `hang "stream-stall"` mode is never used by any test. The plan listed it for the photos/api tests, but `photos.test.ts` uses an in-memory stream instead. Either use it (for example, a real-HTTP mid-stream stall that hits the deadline) or drop it.
- `server/photos.js:268-271`: the DB-error branch of `servePhoto` has no test (it is the only uncovered part). A spy pool that throws in `api.test.ts` would cover it.
- `server/photos.js:276`: `_type` is destructured on every request only to drop Content-Type from the 304 headers. A second constant would be cleaner (the impl-log already notes this).
- `Editor.tsx:66`: `brokenSrc` persists while the editor stays open, so a photo that failed once does not retry until the editor is reopened or the src changes. This is acceptable.
- `Hero.tsx:34`: with `fallback={null}`, a collage card whose image fails shows an empty frame with only its label. The upstream filter is on `item.photo`, which is still truthy. Acceptable for now.

### Follow-ups (out of scope)
- Drive retries 5xx on media with backoff (about 2 s) before the 502, which delays the broken-image fallback. Consider `retry: false` or a shorter policy for reads (impl-log follow-up).
- Plan A14 items: `server/README.md:20` D28 wording, the `encodeURIComponent` nit in `repo.http.ts`, and the feature-list line 143 "signed URLs refresh" wording, which D27 supersedes.
- The header "Thêm món đồ" button has no accessible name at 390px (its label `<span>` is hidden). This is pre-existing and was noticed while scripting the smoke. Add an `aria-label`.
- Server-side copy of the photo on duplicate (T-005.2 A12).

### Security follow-ups to fix (Ming, 2026-11-12: "Sửa cả 2 rồi mở PR")
From security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request):
1. `server/drive.js:370-374` / `server/photos.js:307` — Drive `Content-Length` may be the compressed length: send `accept-encoding: identity` on the `getMedia` request (preferred), and/or return `contentLength: null` when `content-encoding` is set and not `identity`; test with the fake Drive (e.g. a gzip/`content-encoding` response → no Content-Length mismatch).
2. `server/app.js:69` and `server/api.js:64` — `return await handleApi(...)` / `return await servePhoto(...)` so a rejection reaches the existing catch (500) instead of an unhandled rejection that exits the process; add a test where a handler throws → 500 and the server keeps serving.
