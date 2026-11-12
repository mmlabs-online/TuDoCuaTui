# Review — T-005.2

## Attempt 1 — 2026-11-12
Verdict: PASS

Reviewed `git diff origin/main...HEAD` on `claude/loving-fermi-t90upb` (f4f7871 + f0832a7) against plan.md slice 1 (A1–A19 approved by Ming 2026-11-12), the ticket acceptance criteria for this slice, and R1–R10 of the TuDoCuaTui CLAUDE.md (D25 migrations, no RLS).

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exit 0.
- format:check: exit 0.
- test: `pnpm test` with `TEST_DATABASE_URL` set to a throwaway local PostgreSQL 16.15 (scram password auth, data dir under /tmp). 64 files, 781 tests passed. DB suites ran and were not skipped (verbose run of `api.db.test.ts` + `schema.db.test.ts`: 49 passed, including the 18 new photo cases).
- test:coverage: `CI=true pnpm test:coverage` exit 0. 781 passed. All files 95.52% stmts / 95.74% lines. `photos.js` 97.41% (uncovered 48 = 408 timer, 133 = semaphore 503), `api.js` 98.43%, `repo.http.ts` 100%.
- build: `vite build` ok (index 248.80 kB).
- The Postgres cluster, smoke servers and data dir were stopped and deleted afterwards.

### Independent verification
- **Migration over existing data (manual, psql).** Applied `20261110120000_init.sql` alone. Inserted an item, a `storage_path` photo row and a wear log. Then applied `20261112120000_item_photos_drive.sql`, which succeeded. `items_with_stats` columns before: `id … location_name, primary_photo_path`. After: the same 20 columns in the same order plus `primary_photo_id` last. The legacy row survived (`primary_photo_path = 'u/a.jpg'`, `wear_count = 1`, `primary_photo_id` set). A row with both refs null was rejected (`item_photos_ref_chk`). A malformed `drive_file_id` was rejected (`item_photos_drive_file_id_check`).
- **E2E smoke.** Setup: a scratch launcher wired `createApp({ pool, drive: createDriveClient({ config: fakeConfig, ...fake.urls }), distDir: dist })` with `server/test/fake-drive.ts`, on a migrated DB. Playwright drove Chrome at 390×844. The light and dark passes used `colorScheme` emulation, and the dark pass also set `tu-do-theme=dark`, because the app's dark mode is class-based and not driven by `prefers-color-scheme`; `html.dark` was confirmed true. Results were identical in light and dark:
  - Create with photo: no "Sắp có" on screen, the picker previews the picked image, Drive files 0→1, one row with a `drive_file_id`.
  - Reopen: the "Ảnh đã lưu" state and "Bỏ ảnh" are shown.
  - Replace: files stay at 1, the Drive id changed, one row.
  - "Bỏ ảnh" then save: 0 files, 0 rows, the item is kept.
  - Re-add, reload: "Ảnh đã lưu" is still shown.
  - Delete the item: 0 files, 0 rows, 0 items.
  - Partial save with the fake Drive failing uploads: the toast reads "Đã lưu món đồ nhưng chưa lưu được ảnh — Không tải ảnh lên được, thử lại nhé". The editor stays open and switches to the existing-item footer (Xoá/Nhân bản shown). The DB has 1 item and 0 files.
  - Retry after clearing the failure: still exactly 1 item with that name, 1 file, 1 row, and the editor closes.
  - Horizontal overflow was 0 px on every screen. The screenshots were checked visually in dark mode.
- **Local mode.** `dist` was served from a static host (python http.server, so `/healthz` is not JSON) at 390px in light and dark. The demo data loads. The picker is shown with no "Sắp có". A photo saves as a data URL and shows on reopen, with no "Ảnh đã lưu" state. "Bỏ ảnh" clears it. Zero `/api/` requests were made.
- **Semaphore 503 (not covered by automated tests; checked by hand).** With 3 uploads hanging in the fake Drive, a 4th PUT got `503 photos_unavailable` with `Retry-After: 5` and `Connection: close`. The 3 hung uploads then timed out with 502, and no row and no file were left.
- **408 (not covered by automated tests; checked by hand).** Sent `Content-Length: 100` and then 3 bytes over a raw socket. The server answered `408 request_timeout` with `Connection: close`.

### Acceptance criteria
- [x] Uploading creates a Drive file and an `item_photos` row with its id. Evidence: `api.db.test.ts › PUT photo creates one Drive file and one row` checks the bytes, `name <photoId>.jpg`, `appProperties {app, photoId, itemId}`, `is_primary`, and that the Drive id is not in the response. The smoke also confirmed it. The code is `server/photos.js:181-214`.
- [x] A failed Drive call leaves no row. Evidence: `› Drive 500 on create -> 502 photo_upload_failed, no row`, `› Drive timeout on create -> 502, no row`, `› Drive stores then times out -> 502, no row, the tagged file remains` (the orphan T-005.6 sweeps, A5), and `› Drive auth failure -> 503`. `photos.js:191-198` writes nothing to the DB before Drive succeeds.
- [x] A failed DB write deletes the Drive file. Evidence: `› DB insert fails after Drive success -> 500, Drive file deleted` (trigger), `› DB fails and Drive delete fails -> 500, logs photo_orphan`, and `› item deleted between pre-check and lock -> 404, Drive file deleted`. The code is `photos.js:215-222`.
- [x] Replacing or deleting removes the old Drive file, and deleting an item removes its photos. Evidence: `› second PUT replaces: one row, one file, old file gone`, `› replace with a failing old-file delete -> 200 … photo_orphan`, `› concurrent PUTs -> both 200, exactly one row and one file`, `› DELETE photo removes row and file; second DELETE 204; missing item 204`, `› DELETE item removes its Drive files; a failing Drive delete still 204; legacy rows skipped`, and `› DELETE item with Drive off -> 204 and a photo_orphan log` (A9). The code is `photos.js:137-149, 223`, `items.js:110-129` and `api.js:89-90`. The smoke confirmed the replace, remove and delete-item file counts.
- [x] The API tests run against real Postgres with a fake Drive. Evidence: the new `describe.skipIf(!dbAvailable)("/api photos with real Postgres and a fake Drive")` ran (not skipped) under `CI=true`.
- [x] Checks are green. See Checks.
- [x] 390px and dark mode (R9). See the E2E smoke: light and dark, 0 px overflow, and the "Ảnh đã lưu" state and partial-save toast checked visually.
- [x] Plan AC 4: local mode is unchanged (R1). Evidence: the local-mode smoke above, plus `Editor.test.tsx › local mode: Bỏ ảnh clears only photo` and the existing local tests, all green.
- [x] Plan AC 5: only `image/jpeg` reaches Drive, within the cap. Evidence: `› rejects before Drive: 415, 413 (Content-Length and chunked), 400 empty / bad magic / truncated` asserts `fake.requests` is empty. The checks run in order: content type `photos.js:124-125`, Content-Length `126-128`, streamed byte count `52-53`, magic bytes `175-177`. The mimeType sent to Drive is a constant (`187`).

### Write ordering and orphan guarantees (code reading)
- **Drive first, then the DB.** The DB transaction runs only after Drive succeeds. It locks the items row (`photos.js:95`) and replaces with delete-then-insert. If the item is missing or the DB fails, the new file is deleted (`photos.js:215-222`). Old files are deleted only after commit (`223`). No path leaves a row pointing at a missing file. The only paths that can leave a file without a row are a create that times out after Google stored the file, a failed best-effort delete, and Drive being off at item delete. All three are tagged and logged as `photo_orphan`, matching A5/A9.
- **Concurrent uploads.** Both PUTs serialize on `select … for update`. The second deletes the first's row and file after commit. The test asserts one row and one file.
- **Upload vs item delete.** `removeItem` takes the same items-row lock (`items.js:113-120`), so either:
  - it commits first, the PUT's lock finds 0 rows, and the new file is deleted with a 404; or
  - the PUT commits first, `removeItem` sees the new row, and its file is deleted.
  Lock order is items → item_photos everywhere, so there is no deadlock.
- **Logging and secrets (R3).** Logs carry only `{event, photoId, code}` and never Drive ids or Google text (`photos.js:80, 193`).
- **CSRF.** The PUT needs the non-simple `image/jpeg` type, and `Sec-Fetch-Site` is checked before dispatch (`api.js:50-60`).

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: local and Supabase repos are untouched. `photoById` defaults to false, so non-API editors behave as before.
- R2/D25: new migration file, expand-only, no RLS (D25), applied migration not edited.
- R3: Drive client and secrets are server-only, and only photo row ids go on the wire.
- R5: nothing derived is stored.
- R6: new copy is in `copy.ts` / `apiErrors.ts`.
- R7: every changed file is in the plan or is a named test file. `work/ming-todo.md` and `ticket.md` are workflow bookkeeping.
- R8: checks are green, and the new logic has tests.
- R9: verified above.
- R10: `AGENTS.md`, `.figma/` and `vite.config.ts` are untouched.

### Nits (do not block)
- `src/App.tsx:180-187` together with `src/features/items/Editor.tsx:164`: in API mode, "Nhân bản" keeps `photoPath`. The new duplicate editor shows the empty picker but also a "Bỏ ảnh" button with nothing visible to remove. Saving is harmless: the new row has no `primary_photo_id`, so no photo request is sent. This could clear `photoPath` on duplicate when A12 is picked up.
- The partial-save toast uses the success check icon. The toast component has a single style and this predates the diff.
- The 408 deadline and the semaphore 503 have no automated test (`photos.js:48, 133`). Both were verified by hand above. A fake-timer or slow-socket test would lock them in.
- `photos.js:13`: `inFlight` is module-global, so it is shared across `createApp` instances. That is fine with one server per process.
- `photos.js:57-59`: the Content-Length/byte-count mismatch branch on `end` is effectively unreachable, because Node's parser enforces Content-Length. It is harmless as a guard.
- A legacy `storage_path`-only row would show "Ảnh đã lưu" in API mode. No such rows exist in API-mode data.

### Follow-ups (out of scope)
- T-005.6: orphan sweep for tagged files (create timeouts, failed best-effort deletes, item delete with Drive off).
- A12: duplicate does not copy the stored photo in API mode (conflicts with docs/feature-list.md line 69).
- A19: `server/README.md:20` still says GitHub environment `tudocuatui`; D28 made these repository secrets.
- T-005.3 must ship in the same release (A8). M-15 gates that release.

### Security follow-up to fix (Ming, 2026-11-12: "Cả hai (a)+(b)")
From security-review.md attempt 1, 🟡 1 (not blocking, fixed before the PR at Ming's request; Ming approves the small A1 contract change):
1. **Stale-view photo deletion** — `src/data/repo.http.ts:83`.
   - (a) Client: send the photo DELETE only when the user explicitly removed the photo in the editor (e.g. a `photoRemoved` flag, or the editor's opening `photoPath` was a stored photo and is now cleared) — never just because the saved row has a photo and the local item doesn't.
   - (b) Server: `DELETE /api/items/:id/photo?photo=<uuid>` — the `photo` query param is required and must be a uuid (400 otherwise); delete only if that id is still the item's primary photo, under the item lock; if it isn't (already replaced/removed), return 204 and change nothing (or 409 — choose, document in server/README.md). The client sends the id it saw. Tests for both sides incl. the stale two-tab scenario.
