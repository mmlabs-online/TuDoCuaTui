## Attempt 1 — 2026-11-12

Plan approved by Ming (A1–A19 as written). Slice 1 only; the orphan sweep is T-005.6.

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261112120000_item_photos_drive.sql` (new) | `drive_file_id`, nullable `storage_path`, ref check, unique index, `primary_photo_id` last in the view (D25, expand-only) |
| `server/photos.js` (new) | PUT/DELETE photo handler, body reader, semaphore, locked transaction, `deleteDriveFiles` |
| `server/api.js` | route `/api/items/:id/photo`, dispatch before `readJson`, Drive cleanup after item delete |
| `server/items.js` | `primary_photo_id` on the wire, `getItem`, `removeItem` in a locked transaction returning photo refs |
| `server/app.js`, `server/index.js` | pass the Drive client in; index creates it when configured |
| `server/README.md` | endpoint, error codes, file tagging, lock rule |
| `server/test/fake-drive.ts` | `fail` set and `upload-after-store` hang mode |
| `src/data/repo.http.ts` | upload / delete the photo after the item PUT, `PhotoSaveError`, injectable `resize` |
| `src/data/apiErrors.ts` | Vietnamese copy for the new codes, `PhotoSaveError` |
| `src/data/useWardrobe.ts` | upsert the saved item on `PhotoSaveError` |
| `src/App.tsx` | `photoById` prop, partial save keeps the editor open with the saved id |
| `src/features/items/Editor.tsx` | removed the "Sắp có" branch, "Ảnh đã lưu" state, "Bỏ ảnh" for stored photos |
| `src/features/items/copy.ts` | `stored` / `storedHint` copy replace `comingSoon*` |
| `src/types/item.ts` | `photoPath` comment only |

### Tests added / changed
- `server/schema.db.test.ts`: migration over init data (legacy row survives); nullable storage_path, both-null 23514, format 23514, unique 23505; one primary per item; `primary_photo_id` semantics and cascade; view column list updated.
- `server/api.db.test.ts` (new describe, real Postgres + fake Drive): create (bytes, tags, name, row); 404 missing item; Drive 500; Drive timeout; stored-then-timeout leaves tagged file; Drive auth -> 503; DB insert fails -> file deleted; DB and Drive delete fail -> `photo_orphan`; item deleted before lock -> 404 and file deleted; replace; replace with failing old delete; concurrent PUTs; DELETE photo (+ idempotent, missing item); DELETE item (files, failing delete, legacy row skipped, Drive off); 415/413 (header and chunked)/400 empty, bad magic, truncated with no Drive request; guards (503, 405 Allow, 403, bad uuid); item PUT leaves photos alone. Existing shape test now checks `primary_photo_id`.
- `server/api.test.ts`: photo PUT/DELETE without pool -> 503 `db_unavailable` after header checks.
- `src/data/repo.http.test.ts`: list mapping; data: photo upload; remove -> DELETE; unchanged / http photo -> no request; `PhotoSaveError`.
- `src/data/apiErrors.test.ts`: new codes; `PhotoSaveError`.
- `src/features/items/Editor.test.tsx`: API mode picker, "Ảnh đã lưu", Bỏ ảnh with `photoById`, local Bỏ ảnh clears only photo (replaced the "photoUpload off" block).
- `src/App.test.tsx`: API mode photo failure keeps the editor open and the retry PUTs the same item id (mocks `@/data/photos`).

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: 64 files, 781 tests passed (with TEST_DATABASE_URL set to a local PostgreSQL 16; DB tests ran, not skipped).
- test:coverage (`CI=true`): 64 files, 781 tests passed; all files 95.5% lines; photos.js 97.4%.
- build: `vite build` ok.
- Local PostgreSQL 16 was stopped and its data dir deleted afterwards.
- Smoke (migrated local DB, fake Drive, built `dist`, Playwright Chromium at 390px): create with photo -> 1 Drive file; reopen shows "Ảnh đã lưu"; replace -> old file gone, 1 new; Bỏ ảnh + save -> 0 files; re-add, reload, "Ảnh đã lưu" still shown; delete item -> 0 files; no horizontal overflow. Local mode (static host, no /healthz) still shows the picker, no "Sắp có". The launcher was a scratch script wiring `createApp` with fake Drive URLs, because `server/index.js` has no override for the Google endpoints; `index.js` itself is only covered by its existing CLI tests. Dark mode was only eyeballed on one screenshot (class toggle), the layout reuses existing classes.

### Out-of-plan files
- `server/api.test.ts` — the plan lists the test (`api.test.ts › photo PUT without pool`) but not the file in the table; one `start()` parameter added.
- `src/App.test.tsx`, `src/data/repo.http.test.ts`, `src/data/apiErrors.test.ts`, `src/features/items/Editor.test.tsx`, `server/*.test.ts` — test files named in the plan's test list.

### Deviations from the plan
- "Ảnh đã lưu" state is gated on `photoById` as well as `!photo && photoPath && !isNew`, so Supabase mode (where `photoPath` is a storage path) can never show the "will display in next update" hint.
- `getItem` was added to `items.js` (small helper reused by `saveItem` and the photo handler).

### Follow-ups (noticed, not done)
- T-005.6: orphan sweep (tagged files from create timeouts, failed best-effort deletes, item delete with Drive off).
- Duplicate in API mode does not copy the stored photo (A12, conflicts with feature list line 69).
- `server/README.md` line 20 still says GitHub environment `tudocuatui` (D28 made them repository secrets) (A19).
- A 408 `request_timeout` path (30 s body deadline) and the semaphore 503 are untested (needs fake timers or a slow socket).

### Scope self-check
- Could the diff be smaller? No; Editor.tsx diff is mostly de-indentation after removing the ternary.
- Diff size (production code, excluding tests and README): +463 / -96 lines, about 367 net (Editor.tsx accounts for +68 / -69 of re-indentation).

## Attempt 2 (REWORK: security follow-up, stale-view photo deletion)

Scope: only the "Security follow-up to fix" item of review.md.

### Files touched
- `src/types/item.ts`: new optional `removedPhotoId` (id of the stored photo the user explicitly removed). Required because the client must know which id it saw once `photoPath` is cleared.
- `src/features/items/Editor.tsx`: "Bỏ ảnh" in API mode also sets `removedPhotoId`. Required for (a).
- `src/data/repo.http.ts`: DELETE only when `removedPhotoId` is set and `photoPath` is cleared; sends `?photo=<id>`; only nulls `primary_photo_id` locally if it equals that id. Required for (a).
- `server/app.js`, `server/api.js`: pass the query string (parsed separately from the raw pathname, which still drives routing) to the photo handler. Required for (b).
- `server/photos.js`: DELETE requires exactly one uuid `photo` (400 `invalid_input`, field `photo`, checked before Drive/pool availability); deletes `where item_id and id` under the item lock. Stale id: 204 no-op (chosen over 409). Required for (b).
- `server/README.md`: contract documented (204 no-op for stale id).
- Tests: `src/data/repo.http.test.ts`, `src/features/items/Editor.test.tsx`, `server/api.db.test.ts`, `server/api.test.ts`.

### Tests added
Client: explicit removal sends `DELETE ...?photo=<id>`; stale view without removal sends no DELETE; stale removal keeps the newer primary id; Editor sets `removedPhotoId`. Server (DB): 400 for missing/empty/non-uuid/duplicate/wrong-name `photo`; stale two-tab scenario (tab B replaced the photo, tab A's DELETE with the old id is 204, newer row and Drive file kept); existing delete tests updated for the new param.

### Checks (local PostgreSQL 16 for DB tests, stopped and deleted afterwards)
- pnpm typecheck: pass
- pnpm format:check: pass
- pnpm test: 64 files, 785 tests passed
- CI=true pnpm test:coverage: 64 files, 785 tests passed
- pnpm build: pass

### Out-of-plan files
None beyond the review item.

### Follow-ups
- Removing a stored photo alone does not make the editor dirty (`photo` stays ""), pre-existing; not changed.

### Scope self-check
Only the review's security item was changed.
