# Implementation log — T-005.3

## Attempt 1 — 2026-11-12

### Files touched
| File | Required because |
|---|---|
| `server/photos.js` | `servePhoto`: lookup, fixed headers, ETag/304, per-request deadline + client-disconnect abort, error mapping, `pipeline` with the abort signal |
| `server/api.js` | `/api/photos/:id` route (GET only; 405 / 400 from the existing checks) |
| `server/drive.js` | Abort listener removed on every streaming attempt that is not handed over; JSDoc rule (T-005.1 note) |
| `server/test/fake-drive.ts` | `fail "media"` and `hang "stream-stall"` |
| `server/README.md` | Route row, `ItemRow` sentence, getMedia deadline rule, EXIF note |
| `src/data/mappers.ts` | `apiPhotoUrl` |
| `src/data/repo.http.ts` | `toItem` sets `photo` from `primary_photo_id` (moved inside `createHttpRepo` for `base`) |
| `src/components/ItemPhoto.tsx` (new) | Lazy image with per-src error fallback |
| `src/features/items/ItemCard.tsx`, `src/features/layout/Hero.tsx` | Use `ItemPhoto` |
| `src/features/items/Editor.tsx`, `copy.ts` | Remove "Ảnh đã lưu" state/copy; load-failed state |
| `src/App.tsx` | API-mode duplicate clears photo fields |

### Tests added / changed
- `server/photos.test.ts` (new): deadline abort, client-disconnect abort, mid-stream error log.
- `server/api.db.test.ts`: GET photo headers/bytes/no leaks, 304, unknown uuid 404, legacy row 404, Drive file gone 404, media 500 -> 502, auth -> 503, headers timeout -> 502 (test wrapper gets a `getMedia` hook; `timeouts.headers: 300`).
- `server/api.test.ts`: drive null / pool null 503; routing 405/400/404.
- `server/app.test.ts`: 401 without JWT, no DB or Drive call.
- `server/drive.test.ts`: listener removal on failed streaming attempts, kept on handed-over stream.
- `src/data/mappers.test.ts`, `src/data/repo.http.test.ts` (list/save/no-photo-request cases updated), `src/components/ItemPhoto.test.tsx` (new), `src/features/items/ItemCard.test.tsx`, `src/features/items/Editor.test.tsx` (stored-state test replaced), `src/App.test.tsx` (API duplicate).

### Checks (actual output summary)
Local PostgreSQL 16 (data dir under /tmp, password auth, `TEST_DATABASE_URL` set), stopped and deleted afterwards.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: 66 files, 807 tests passed (DB suites ran, none skipped).
- test:coverage (`CI=true`): 66 files, 807 passed; All files 95.4 stmts / 94.56 branches; `photos.js` 95.1, `api.js` 98.5, `drive.js` 99.5.
- build: `vite build` ok (`✓ built in 679ms`).
- Browser smoke (Playwright/Chromium, 390x844, real `createApp` + fake Drive + migrated DB, Access off):
  - Upload: the photo shows in the grid card, hero collage and editor (naturalWidth > 0). `src` is `/api/photos/<uuid>`.
  - `GET /api/photos/<id>` headers: 200, `image/jpeg`, `nosniff`, `default-src 'none'; sandbox`, `inline`, `private, max-age=31536000, immutable`, `ETag "<id>"`, CORP `same-origin`, Content-Length equal to body. No Drive id, token or Drive header.
  - Replace: new photo id, new image shows. Reload / revisit: photo shows; only 3 server hits over several loads (browser cache).
  - Remove: card shows "Chưa có ảnh", persists after reload.
  - Dark (`tu-do-theme=dark`): images show. Horizontal overflow 0 px in grid, editor, dark and fallback.
  - Fake Drive stopped: server returns 502 `photo_fetch_failed` (JSON). The card shows "Chưa có ảnh". The editor shows "Không tải được ảnh". Drive retry backoff makes this take about 2 s.
  - Local mode (static dist, no server): 16 demo cards, 0 `/api/` requests, 0 overflow.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- As in plan A14: `server/README.md:20` D28 wording; `encodeURIComponent` nit in `repo.http.ts`; feature-list line 143 "signed URLs refresh" wording.
- Drive 5xx on media retries with backoff (about 2 s) before the 502; a failing Drive therefore delays broken-image fallback. Consider `retry: false` for reads if this matters.
- `servePhoto` destructures an unused `_type` to drop Content-Type from the 304 headers.

### Scope self-check
- Could the diff be smaller? No; the `_type` destructure could become a second constant if preferred.
- Diff size: see `git diff --shortstat` in the commit.

## Attempt 2 — 2026-11-12

Fixes only the two "Security follow-ups to fix" items in review.md.

### Files touched
- `server/drive.js`: `getMedia` sends `accept-encoding: identity`, so Drive's `Content-Length` matches the bytes streamed. Required by follow-up 1.
- `server/app.js`, `server/api.js`: `return await handleApi(...)` / `return await servePhoto(...)`, so a handler rejection reaches the existing catch (500) instead of an unhandled rejection. Required by follow-up 2.
- `server/drive.test.ts`: getMedia request carries `accept-encoding: identity`.
- `server/api.test.ts`: a rejecting handler (DB down on `GET /api/photos/:id`) returns 500 and `/healthz` still answers.

### Checks (actual output summary)
Local PostgreSQL 16 (data dir under /tmp, password auth, `TEST_DATABASE_URL` set), stopped and deleted afterwards.
- typecheck: clean.
- format:check: "All matched files use the correct format."
- test: 66 files, 809 tests passed.
- test:coverage (`CI=true`): 66 files, 809 passed; All files 95.59 stmts / 94.63 branches.
- build: `✓ built in 342ms`.

### Out-of-plan files
None.

### Follow-ups
None new.

### Scope self-check
- Smaller diff possible? No. `handlePhoto` was left without `await` (not in the review item).
