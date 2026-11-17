## Attempt 1 — 2026-11-17 (slice F-603.1)

### Files touched
| File | Required because |
|---|---|
| `src/data/photoImport.ts` (new) | Pure batch runner, naming, daily-limit constant, abortable wait (AC 2-11) |
| `src/data/apiErrors.ts` | `ApiError.retryAfterSec`; `PhotoSaveError.cause` made public so the runner reads status/code without string matching |
| `src/data/repo.http.ts` | Parse `Retry-After` (integer seconds only) into `ApiError` |
| `src/data/useWardrobe.ts` | `importPhotos` = runner bound to `save` (upserts saved and `PhotoSaveError` items) |
| `src/features/import-export/usePhotoImport.ts` (new) | UI state hook for the Photos tab |
| `src/features/import-export/ImportPhotosTab.tsx` | Replaces the mock: pick/drop, defaults, file list, warning, progress, summary, retry, stop note |
| `src/features/import-export/ImportModal.tsx` | `importPhotos` prop, tab-0 footer button, tabs locked while photos run |
| `src/features/import-export/copy.ts` | `import.photos.*` strings, local `formatWait`; removed unused `startImport`, `photos.defaultStatus` |
| `src/App.tsx` | One prop line |
| `src/index.css` | File list, warning, drag-over, summary button; `.bulk-drop` grows with content |
| tests | see below |

### Tests added / changed
- `src/data/photoImport.test.ts` (new): all 18 runner/naming cases from the plan, plus "429 on the item step leaves the file pending".
- `src/data/repo.http.test.ts`: ApiError carries Retry-After (429, 503); PhotoSaveError cause keeps retryAfterSec; missing/non-numeric Retry-After → undefined.
- `src/data/useWardrobe.test.tsx`: importPhotos upserts saved items and PhotoSaveError items.
- `src/features/import-export/ImportPhotosTab.test.tsx` (new): 9 tests from the plan (drop also ignores non-image files).
- `src/features/import-export/ImportModal.test.tsx`: new required prop in `setup()` and the no-AI-checkbox test.
- `src/App.test.tsx`: two existing tests asserted the mock ("Bắt đầu import", "Sắp có" on the Photos tab); updated to "Nhập 0 ảnh" disabled.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` — no errors
- format:check: "All matched files use the correct format."
- test: Test Files 115 passed | 11 skipped (126); Tests 1432 passed | 221 skipped (1653)
- build: `✓ built in 435ms`
- Playwright 390px light/dark check: not done (no API in this environment); CSS reviewed only (existing tokens, wrapping rules, `overflow-wrap: anywhere` on names).

### Out-of-plan files
- `src/App.test.tsx` — two assertions about the old mock Photos tab would fail otherwise.
- Plan said import `formatWait` from `src/features/auth/copy.ts`, but `auth/boundary.test.ts` allows only `src/main.tsx` to reference `features/auth`; added an identical local `formatWait` in `import-export/copy.ts` instead.

### Follow-ups (noticed, not done)
- Dedupe `formatWait` (auth copy vs import-export copy) by moving it to a shared module.
- `save()` re-reads the picked file through a blob URL, so a HEIC file with an empty MIME type (Windows) loses its extension hint before `preparePhoto`; same limitation as the editor.
- Item names are not de-duplicated if two files share a name (items are separate rows, fine).
- Worker resize + CSP `worker-src` remain for F-603.2; "no long task over 200 ms" AC is not met yet.

### Scope self-check
- Could the diff be smaller? No; the ImportModal re-indent of the `primary` ternary is the only avoidable noise.
- Diff size: ~+350 / -38 in modified files, plus ~620 lines in new files (about 360 of them tests).

## Attempt 2 (REWORK: review Issue 1, run status hidden under the footer at 390px)

### Files touched
- `src/features/import-export/ImportPhotosTab.tsx`: drop zone and defaults render only in the edit phase; the progress block and the summary (stop note, failed list, "Thử lại") now come before the count/warning/file list. Required because: review Issue 1 fix instruction.
- `src/features/import-export/ImportPhotosTab.test.tsx`: while running, "Chọn ảnh từ máy" is not rendered and the progress text precedes the file list; after a 429 stop the stop note and "Thử lại" precede the list. Required because: review Issue 1.
- `src/index.css`: `gap: 8px` on `.progress > div` (reviewer nit, one line).

### Checks
- typecheck: pass; format:check: pass ("All matched files use the correct format"); test: 115 files passed, 1432 tests passed (11 files skipped as before); build: pass.

### 390x844 re-check (harness copied to /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-r2, `check.cjs`)
8 files, viewport screenshots without scrolling; sticky footer top = 771 px, horizontal overflow none (scrollWidth 390), drop zone not rendered:
- running (light/dark): progress 403-451 px, above the footer.
- failed (light/dark): summary 303-517, "Thử lại" 462-506.
- stopped 429 (light/dark): summary 191-517, stop note 246-300, "Thử lại" 462-506.
Screenshots: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-r2/r2-{light,dark}-{running,failed,stopped}.png (`r2-dark-stopped.png` shows summary, stop note and retry all above the footer; the light running shot was taken mid slide-in animation, the geometry above is the settled position).

### Out-of-plan files
None.

### Follow-ups
None new (other nits left alone).

### Scope self-check
Only Issue 1 and the one-line gap nit changed.
