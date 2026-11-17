Verdict: REWORK

## Attempt 1 — 2026-11-17 (slice F-603.1)

Scope note: per plan.md this attempt covers slice F-603.1 only. The worker/CSP part and the "no long task over
200 ms" criterion belong to F-603.2 (already on `main`) and were not judged here.

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`: exit 0, no errors
- format:check: "All matched files use the correct format." (289 files), exit 0
- test: Test Files 115 passed | 11 skipped (126); Tests 1432 passed | 221 skipped (1653), exit 0 (matches impl-log)
- build: `✓ built in 443ms`, exit 0
- 390px light/dark (R9), run by reviewer: throwaway Vite harness outside the repo rendering the real
  `ImportModal` with the real `runPhotoImport` and a fake `save` (one network failure, one 503 → photo failure,
  one 429 photo failure in "stopped" mode). Viewport 390×844, `.dark` on `<html>` for dark. No horizontal overflow
  in any state (`scrollWidth 390 = clientWidth 390`), no console errors. Screenshots (scratchpad, throwaway):
  - `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/rev-f603/f603-light-edit.png`, `…/f603-dark-edit.png`: files picked, long names wrap (`overflow-wrap`), badges aligned
  - `…/rev-f603/f603-light-warn.png`, `…/f603-dark-warn.png`: 51 files, daily-limit warning readable in both themes
  - `…/rev-f603/f603-light-running.png`, `…/f603-dark-running.png`, `…/f603-dark-running-bottom.png`, `…/f603-light-running-longname.png`: running
  - `…/rev-f603/f603-light-failed.png`, `…/f603-dark-failed.png`, `…/f603-light-stopped-scrolled.png`, `…/f603-dark-stopped-scrolled.png`: failed list, 429 stop note, retry button
  - Finding: see Issue 1 (progress and the summary/stop note start below the sticky footer).

### Acceptance criteria (plan.md table)
- [x] 1 Pick/drop, "Nhập N ảnh": `ImportPhotosTab.test.tsx › lists picked files and enables "Nhập N ảnh"`, `› accepts dropped files and ignores non-image files`: pass
- [x] 2 Batch defaults: `photoImport.test.ts › creates each item with the batch defaults …`, `ImportPhotosTab.test.tsx › passes the chosen location and status`: pass
- [x] 3 Name from file: `photoImport.test.ts › itemNameFromFile` cases (HEIC ext, inner dots "áo dài.tết", NFD→NFC, fallback, NAME_MAX): pass; `src/data/photoImport.ts:15-24`
- [x] 4 Sequential with progress: `photoImport.test.ts › runs sequentially in order and reports the current file`, `ImportPhotosTab.test.tsx › shows "Đang nhập k/N" and the current file name`: pass (visibility at 390px: Issue 1)
- [x] 5 Prep failure creates no item: `photoImport.test.ts › a prep failure creates no item and the batch continues`; `repo.http.ts:83-86` prepares before the item `PUT` (existing `repo.http.test.ts › a photo that fails preparation throws before any request`)
- [x] 6 Retry never duplicates: `itemId` assigned on pick (`usePhotoImport.ts:45`), every attempt uses it (`photoImport.ts:88-99`), photo-only retry reuses `job.item` with the same id; server `PUT /api/items/:id` is `on conflict (id) do update` (`server/items.js:97`). Tests `› photo failure keeps the saved item; retry reuses its id`, `› item failure retry reuses the pre-assigned id`, `› done files are skipped on retry`, `ImportPhotosTab.test.tsx › failed files are listed and "Thử lại" re-runs them`: pass. A photoFailed job that then fails preparation keeps its item (`photoImport.ts:114`).
- [x] 7 429 stops, imported count + wait, nothing lost: `› 429 stops the batch and keeps the rest pending`, `› 429 on the item step leaves the file pending`, `ImportPhotosTab.test.tsx › 429 shows imported count and wait time`, `repo.http.test.ts:279 ApiError carries Retry-After seconds`, `:292 PhotoSaveError cause keeps retryAfterSec`: pass (visibility at 390px: Issue 1)
- [x] 8 409 `photo_quota_exceeded` stops: `› photo_quota_exceeded stops the batch`: pass
- [x] 9 503 waits once (default 5 s, cap 30 s): `› 503 waits Retry-After and retries once`, `› second 503 fails the file and continues`, `› wait is capped …`: pass; `photoImport.ts:120-125`
- [x] 10 Daily-limit warning: `› exceedsDailyLimit`, `ImportPhotosTab.test.tsx › warns when more than 50 photos are picked`: pass; screenshot `f603-*-warn.png`
- [x] 11 Object URLs created per attempt and revoked in `finally` (`photoImport.ts:105,126-128`); `› creates and revokes one object URL per file (also on failure)`, `› abort stops before the next file and during a 503 wait`: pass. Grid items carry the server photo path (`toItem(saved)`, `repo.http.ts:104-106`), never the revoked `blob:` URL.
- [x] 12 No AI checkbox: `ImportModal.test.tsx › Photos tab shows no AI checkbox`: pass
- [x] 13 Tabs locked while running; toast: `ImportPhotosTab.test.tsx › tabs are disabled while running`, `› calls onImported with the success count`: pass; `ImportModal.tsx` `disabled={phase === "running" || photosBusy}`
- [x] 14 Saved and photo-less items appear without reload: `useWardrobe.test.tsx › importPhotos upserts saved items and PhotoSaveError items`: pass (runner bound to `save`, which upserts both)
- [ ] 15 390px / dark mode: FAILED, see Issue 1. Wrapping, tokens and dark colours are fine; the run status is not visible.
- [x] 16 Checks green: see above

### Issues
#### Issue 1 — 🔴 blocker — R9 / AC 15, ticket AC "clear Vietnamese message" at 390px
- **Where**: `src/features/import-export/ImportPhotosTab.tsx:42-67` (drop zone and defaults stay rendered after the run starts), `:111` (progress) and `:122` (summary) placed after the file list.
- **Expected**: at a 390px phone viewport the user sees, without scrolling, that the batch is running (k/N + file name) and, when it ends or stops, the summary, the 429/409 stop message and the "Thử lại" button.
- **Actual**: measured at 390×844 with 8 picked files: `.progress` top = 800 px (light) / 766 px (dark), behind the sticky modal footer (~770–844 px); `.import-summary` starts at the same position and runs to ~1100 px. `scrollIntoViewIfNeeded` treats it as already in view, so it stays hidden under the footer (`f603-dark-running.png`, `f603-light-stopped.png`). A real phone has less height (browser chrome), so after tapping "Nhập 30 ảnh" only the button changes to "Đang xử lý…", and after a 429 only "Xong" shows: the stop note and the retry button are below the fold and easy to miss (a tap on "Xong" closes the modal). The disabled drop zone and defaults (~330 px) take the top of the modal for the whole run.
- **Fix instruction**: in `ImportPhotosTab.tsx`, when `phase !== "edit"`, do not render the `.bulk-drop` block and the defaults block (`.photo-defaults`); render the progress block and the summary block (with the stop note and "Thử lại") **before** the file list, so the order is: (edit) drop zone → defaults → count/warning → list; (running/done/stopped) progress or summary → count → list. Add a test in `ImportPhotosTab.test.tsx`: while running, "Chọn ảnh từ máy" is not rendered and the progress text precedes the file list in document order; after a 429 stop the stop note precedes the list. Re-check at 390px light and dark (the harness above is enough) and record it in impl-log.

### Out-of-plan changes
- `src/App.test.tsx`: justified (two assertions targeted the removed mock: "Bắt đầu import", "Sắp có" on the Photos tab).
- Local `formatWait` in `src/features/import-export/copy.ts:15`: justified. `src/features/auth/boundary.test.ts:59-67` forbids any file but `src/main.tsx` from mentioning `features/auth`, so importing it as the plan said would fail the suite. It is an exact copy of `src/features/auth/copy.ts:130`; dedupe is a follow-up.
- Removal of `startImport` and `photos.defaultStatus` from `copy.ts`: in the plan's file (copy.ts row), no remaining users.

### Rules R1–R10 (CLAUDE.md)
- R1: data access stays in the data layer (`useWardrobe.importPhotos` → `save` → `repo.save`); components call no `fetch`. `src/data/photoImport.ts` imports feature copy/`blankItem`, the same pattern as `apiErrors.ts`/`photoPrep.ts`.
- R2–R5: untouched (no schema, secret or storage-path change; photos still go through `PUT /api/items/:id/photo`; no derived values stored).
- R6: all new copy is Vietnamese in `import-export/copy.ts`.
- R7: within plan apart from the justified items above.
- R8: runner, Retry-After parsing and the hook/upsert have unit tests.
- R9: Issue 1.

### Nits (do not block)
- 💭 `src/index.css:845` `.progress > div` has no `gap`: with a long name without spaces the label touches the percent ("…rất-dài-225%", `f603-dark-running-bottom.png`). `gap: 8px` would fix it (shared with CSV, so optional).
- 💭 Failed-list messages use `(j.error as Error).message`; a non-API error (e.g. a browser `TypeError` when reading the blob) would show English text. Unlikely; could map through the existing `message()` helper.
- 💭 The summary box keeps the green CSV summary background while showing red stop text; readable in both themes.

### Ming verification after merge (from plan.md)
- 30 photos from an iPhone and from an Android phone on the real app: all 30 become items with photos (owner is quota-exempt; a non-owner account shows the 50/day stop).
- HEIC from desktop Chrome shows the D47 error for that file and the rest of the batch continues.
- 390px and dark mode on a real phone.
- "No long task over 200 ms" is verified with F-603.2, not this slice.

### Follow-ups (out of scope)
- Move `formatWait` to a shared module (outside `features/auth`) and use it from both copies.
- When Drive is not configured the server answers `503 photos_unavailable` without `Retry-After` (`server/photos.js:148`): the runner then waits 5 s and retries every file once, so a 30-photo batch spends ~2.5 min failing. Consider stopping the batch on a 503 without `Retry-After`, or after two consecutive 503 failures.
- Picking the same file twice creates two items (no de-duplication of picks).
