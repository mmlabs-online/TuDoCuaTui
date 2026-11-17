Status: READY

# Plan — F-603: Bulk photo import (slice F-603.1: batch runner, Photos tab, quota handling)

This plan covers **slice F-603.1** only; see `## Split proposal`. Off-main-thread resize and the CSP
`worker-src` change are slice F-603.2.

## Feature summary
`docs/feature-list.md` F-603:
> - Select or drop N photos; each one becomes an item. The name comes from the file name, and a default location and status are chosen once for the batch.
> - Process sequentially with progress; failed files are listed with a retry option.
> - **AC:** 30 phone photos import in one go; the browser does not freeze (resize work off the main thread if needed).

Ticket scope (2026-11-17 refresh) adds: name without extension (`IMG_2031`); item created then photo uploaded;
every photo through F-202.1's `preparePhoto`; photo-only retry with no duplicate item; `429 rate_limited` stops
the batch with imported count + `Retry-After`; `503` waits and retries once; warn before starting when the batch
is larger than the daily upload limit; worker resize with CSP `worker-src`; AI checkbox stays hidden (T-001).

`work/decisions.md`:
> D48 — EXIF/GPS is removed by re-encoding every photo in the browser (`preparePhoto`) … Every upload path (editor, F-603 bulk import, F-702) must go through `preparePhoto`.
> D47 — No client-side HEIC decoder. Browsers that can decode HEIC (Safari) upload it re-encoded as JPEG; elsewhere … a clear Vietnamese error and uploads nothing.
> D44 — the app always runs against the Node API … never demo data.

Server limits (`server/photoQuota.js`, `server/photos.js`, no change in this slice): 50 uploads per rolling
24 h (`429 rate_limited` + `Retry-After: <sec>`), 500 stored photos (`409 photo_quota_exceeded`), one upload in
flight per user (`503 photos_unavailable` + `Retry-After: 5`); the owner is exempt from both counts.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Pick (file input, `multiple`) or drop N photos; the tab lists them and the primary button reads "Nhập N ảnh". | `ImportPhotosTab.test.tsx › lists picked files and enables "Nhập N ảnh"`, `› accepts dropped files` |
| 2 | Default location (free text with the existing locations as suggestions) and status (default "Đang dùng") are chosen once and applied to every item. | `photoImport.test.ts › creates each item with the batch defaults`; `ImportPhotosTab.test.tsx › passes the chosen location and status` |
| 3 | Each item is named after the file name without the extension (NFC, trimmed, ≤ `NAME_MAX`; fallback when empty). | `photoImport.test.ts › itemNameFromFile …` cases |
| 4 | Files are processed one at a time, in order; progress shows the count and the current file name. | `photoImport.test.ts › runs sequentially in order and reports the current file`; `ImportPhotosTab.test.tsx › shows "Đang nhập k/N" and the current file name` |
| 5 | Every photo goes through `preparePhoto` (D48); a photo that fails preparation (HEIC on Chrome, too large, unsupported) creates no item, is listed as failed with the F-202.1 message, and the batch continues. | `photoImport.test.ts › a prep failure creates no item and the batch continues` (fake `save` that throws `PhotoPrepError` before "creating"); existing `repo.http.test.ts` already proves `save()` prepares before the item `PUT` |
| 6 | Failed files are listed with a retry button; retry re-runs only files not yet done. If the item was created but its photo failed, retry uploads the photo for the **same item id** — never a new item. | `photoImport.test.ts › photo failure keeps the saved item; retry reuses its id`, `› item failure retry reuses the pre-assigned id`, `› done files are skipped on retry`; `ImportPhotosTab.test.tsx › failed files are listed and "Thử lại" re-runs them` |
| 7 | On `429 rate_limited` the batch stops; the message says how many were imported and when to try again (from `Retry-After`); the not-yet-processed files and the photo-less item stay in the list and can be retried later (nothing is lost). | `photoImport.test.ts › 429 stops the batch and keeps the rest pending`; `ImportPhotosTab.test.tsx › 429 shows imported count and wait time`; `repo.http.test.ts › ApiError carries Retry-After` |
| 8 | On `409 photo_quota_exceeded` the batch stops the same way (stored-photo cap; continuing would only create photo-less items). | `photoImport.test.ts › photo_quota_exceeded stops the batch` |
| 9 | On `503` the runner waits `Retry-After` (default 5 s, capped at 30 s) and retries that file once; a second failure marks it failed and the batch continues. | `photoImport.test.ts › 503 waits Retry-After and retries once`, `› second 503 fails the file and continues`, `› wait is capped` |
| 10 | Before starting, a batch larger than the daily upload limit (50) shows a non-blocking Vietnamese warning. | `photoImport.test.ts › exceedsDailyLimit`; `ImportPhotosTab.test.tsx › warns when more than 50 photos are picked` |
| 11 | Object URLs, not data URLs: one `blob:` URL per file is created when that file is processed and revoked after it. Closing the modal stops the batch after the current file. | `photoImport.test.ts › creates and revokes one object URL per file`, `› abort stops before the next file and during a 503 wait` |
| 12 | No AI checkbox on the Photos tab (T-001). | existing `ImportModal.test.tsx › Photos tab shows no AI checkbox` still passes |
| 13 | Tabs are locked while a photo batch runs (as for CSV); toast "Đã thêm N món vào tủ" when it ends with N > 0. | `ImportPhotosTab.test.tsx › tabs are disabled while running`, `› calls onImported with the success count` |
| 14 | Saved items (and items whose photo failed) appear in the grid without reload. | `useWardrobe.test.tsx › importPhotos upserts saved items and PhotoSaveError items` |
| 15 | 390px viewport and dark mode: file list, warning, progress and summary wrap and use existing tokens. | CSS review (no fixed widths, existing color variables); `pnpm dev` at 390px in light and dark |
| 16 | Checks green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- 30 photos from an iPhone and from an Android phone on the real app: all 30 become items with photos (as
  owner you are quota-exempt; a non-owner test account shows the 50/day stop).
- HEIC from desktop Chrome shows the clear D47 error for that file and the rest of the batch continues.
- 390px and dark mode on a real phone.
- The "no long task over 200 ms" AC is **not** expected to pass in this slice (resize is still on the main
  thread); it is verified after F-603.2.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/photoImport.ts` (new) | Pure batch runner `runPhotoImport`, `itemNameFromFile`, `exceedsDailyLimit`, `PHOTO_DAILY_LIMIT = 50` (comment: mirrors `PHOTO_LIMITS.dailyMax` in `server/photoQuota.js`), job/stop types | Sequential run, retry without duplicates, 429/409/503 handling (AC 2–11) |
| `src/data/photoImport.test.ts` (new) | Unit tests with a fake `save`, fake `wait`, fake URL fns | R8 |
| `src/data/apiErrors.ts` | `ApiError` gains optional `retryAfterSec?: number` (constructor param after `requestId`) | AC 7, 9 need `Retry-After` |
| `src/data/repo.http.ts` | In `call()`, on a non-ok response parse `Retry-After` (integer seconds ≥ 0, else `undefined`) into the `ApiError` | AC 7, 9 |
| `src/data/repo.http.test.ts` | Tests: 429 and 503 carry `retryAfterSec`; inside `PhotoSaveError` the cause keeps it; missing/invalid header → `undefined` | R8 |
| `src/data/useWardrobe.ts` | `importPhotos(jobs, opts)` = `runPhotoImport` bound to `repo.save`, upserting saved items and `PhotoSaveError.item` (like `save`) | AC 14; keeps data access in the data layer (R1) |
| `src/data/useWardrobe.test.tsx` | One test for `importPhotos` upserts | R8 |
| `src/features/import-export/usePhotoImport.ts` (new) | UI state hook: picked jobs, defaults, phase (`edit`/`running`/`done`/`stopped`), progress, abort on unmount, `start()` / `retry()` | Keeps `ImportModal` changes small (shared file with F-602.2) |
| `src/features/import-export/ImportPhotosTab.tsx` | Replace the mock: file input + drop zone, defaults (location `<input list>` + status `<select>`), file list, daily-limit warning, progress with current file, summary + failed list + retry button, stop message | AC 1, 2, 4, 6, 7, 10, 15 |
| `src/features/import-export/ImportPhotosTab.test.tsx` (new) | Component tests with a fake `importPhotos` | R8 |
| `src/features/import-export/ImportModal.tsx` | Accept `importPhotos` prop; call `usePhotoImport`; tab 0 footer button ("Nhập N ảnh" / "Đang xử lý…" / "Xong"); tabs disabled while either CSV or photos run; pass state to `ImportPhotosTab` | AC 1, 13 |
| `src/features/import-export/ImportModal.test.tsx` | Pass the new required prop in `setup()`; existing tests unchanged otherwise | Keeps the suite compiling |
| `src/features/import-export/copy.ts` | `import.photos.*` strings: `importN`, `running(k, n, name)`, `dailyWarning(limit)`, `stopped.rateLimited(imported, wait)`, `stopped.quota(imported)`, summary labels, `photoPending`, `retry`, `fallbackName`, `fileCount(n)`; remove `comingSoon` use from the Photos tab only (CSV text "hiện chỉ nhập được bằng CSV" no longer true: drop `comingSoon` if no other user) | R6: copy in one place |
| `src/App.tsx` | Pass `importPhotos={wardrobe.importPhotos}` to `ImportModal` (one line) | Wiring |
| `src/index.css` | Small rules for the photo file list / warning / stop note, reusing `.progress`, `.import-summary`, `.csv-error`, `.bulk-drop` (drag-over state) | AC 15 |

No server, CSP, Vite or dependency change in this slice.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `photoImport.test.ts › itemNameFromFile: "IMG_2031.HEIC" → "IMG_2031"` | AC 3 |
| `… › itemNameFromFile keeps inner dots: "áo dài.tết.jpg" → "áo dài.tết"` | AC 3, Vietnamese |
| `… › itemNameFromFile normalizes NFD (macOS) Vietnamese to NFC` | AC 3, diacritics |
| `… › itemNameFromFile: no extension kept; ".jpg" / "   .png" → fallback name; > 120 chars truncated to NAME_MAX` | AC 3, empty values |
| `… › exceedsDailyLimit: 50 → false, 51 → true` | AC 10 |
| `… › creates each item with the batch defaults (location, status, name, pre-assigned id, blob: photo)` | AC 2 |
| `… › runs sequentially in order and reports the current file` (second `save` not called before the first resolves) | AC 4 |
| `… › creates and revokes one object URL per file` (also on failure) | AC 11 |
| `… › a prep failure creates no item and the batch continues` | AC 5 |
| `… › photo failure keeps the saved item; retry reuses its id` (`PhotoSaveError` → state `photoFailed` with `item`; second run calls `save` with that item's id and stored values + new blob URL) | AC 6 |
| `… › item failure retry reuses the pre-assigned id` (network `ApiError(0)` on first run) | AC 6 |
| `… › done files are skipped on retry` | AC 6 |
| `… › 429 stops the batch and keeps the rest pending` (returns `{ stopped: { code: "rate_limited", retryAfterSec } }`, later jobs untouched, `save` not called again) | AC 7 |
| `… › photo_quota_exceeded stops the batch` | AC 8 |
| `… › 503 waits Retry-After and retries once` (fake `wait` called with 5000; second `save` same id) | AC 9 |
| `… › second 503 fails the file and continues` | AC 9 |
| `… › wait is capped at 30 s and defaults to 5 s without Retry-After` | AC 9 |
| `… › abort stops before the next file and during a 503 wait` | AC 11 |
| `repo.http.test.ts › ApiError carries Retry-After seconds (429, 503)` | AC 7, 9 |
| `repo.http.test.ts › PhotoSaveError cause keeps retryAfterSec` | AC 7 |
| `repo.http.test.ts › missing or non-numeric Retry-After → undefined` | edge |
| `useWardrobe.test.tsx › importPhotos upserts saved items and PhotoSaveError items` | AC 14 |
| `ImportPhotosTab.test.tsx › lists picked files and enables "Nhập N ảnh"` | AC 1 |
| `… › accepts dropped files` | AC 1 |
| `… › passes the chosen location and status` | AC 2 |
| `… › warns when more than 50 photos are picked` | AC 10 |
| `… › shows "Đang nhập k/N" and the current file name` | AC 4 |
| `… › failed files are listed and "Thử lại" re-runs them` | AC 6 |
| `… › 429 shows imported count and wait time` (uses `formatWait`) | AC 7 |
| `… › tabs are disabled while running` | AC 13 |
| `… › calls onImported with the success count` | AC 13 |

## Approach
1. **Retry-After on errors.** `ApiError` gets `retryAfterSec?`. In `repo.http.ts › call()`, for a non-ok
   response read `res.headers.get("Retry-After")`; accept only `/^\d+$/` (seconds; HTTP-dates are not sent by
   our server) → number, else `undefined`. `PhotoSaveError` already keeps the `ApiError` as its cause; expose
   the cause as `public cause` (or a readonly field) so the runner can read `code`/`status`/`retryAfterSec`
   without string matching.
2. **Pure runner** `src/data/photoImport.ts`:
   - `type PhotoJob = { key: string; file: File; name: string; itemId: string; state: "pending" | "done" | "failed" | "photoFailed"; item?: Item; error?: unknown }`.
     `itemId = crypto.randomUUID()` is assigned **when the job is created** (on pick), so every attempt for that
     file targets the same id; `PUT /api/items/:id` is an upsert (`server/items.js` `on conflict (id)`), so a
     retry after a lost response or a photo failure can never create a second item.
   - `runPhotoImport(jobs, deps, opts)` where `deps = { save(item): Promise<Item>; wait(ms, signal): Promise<void>; createUrl(file): string; revokeUrl(url): void }`
     and `opts = { defaults: { location: string; status: Status }; signal?; onUpdate?(jobs snapshot / index); onCurrent?(index) }`.
     Returns `{ stopped?: { code: "rate_limited" | "photo_quota_exceeded"; retryAfterSec?: number } }`.
   - Loop in order over jobs whose state ≠ `done`; check `signal` before each. Item to save:
     `photoFailed` → `{ ...job.item, photo: url }` (stored values, same id: only the photo is new);
     otherwise `{ ...blankItem(), id: job.itemId, name: job.name, location: defaults.location, status: defaults.status, photo: url }`.
   - `deps.save` is `repo.save`, which already runs `preparePhoto` **before** the item `PUT` (D48, and a bad
     photo creates no item), then `PUT /items/:id/photo`, and throws `PhotoSaveError(item, cause)` when only the
     photo step failed.
   - Error classification (`classify(e)` reads `ApiError` directly or `PhotoSaveError.cause`):
     `rate_limited` or `photo_quota_exceeded` → set the job (`photoFailed` with item when `PhotoSaveError`, else
     unchanged `pending`), return `stopped`. `status === 503` → `await wait(min(retryAfterSec ?? 5, 30) * 1000)`
     then retry that job once (photo-only if the first attempt produced a `PhotoSaveError`); a second error is
     classified again but never waited on twice. Anything else → `failed` (or `photoFailed` with the item).
   - `revokeUrl` in `finally` per attempt. Do not reuse `runImport` (`importRunner.ts`): it has no stop, no
     per-job state and no retry; sharing would change the CSV path (R7).
3. **`useWardrobe.importPhotos`** binds `runPhotoImport` to `repo.save`, `URL.createObjectURL/revokeObjectURL`
   and a `setTimeout`-based abortable `wait`, and upserts `saved` items and `PhotoSaveError.item` into state
   (same as `save`). R1: no `fetch` in components.
4. **`usePhotoImport` hook** (features): holds jobs, defaults, phase, progress `{ done, total, current }`,
   last stop; `addFiles(FileList)` creates jobs (name via `itemNameFromFile`, fresh `itemId`) — allowed only
   in `edit`; `start()`/`retry()` call `importPhotos` with an `AbortController`; abort on unmount (same as CSV).
   After a run: `ok` count → `onImported(n)` when n > 0.
5. **`ImportPhotosTab`**: hidden `<input type="file" multiple accept="image/*,.heic,.heif">` behind the
   existing "Chọn ảnh từ máy" button; `onDragOver/onDrop` on `.bulk-drop`; defaults block (location input with
   `<datalist>` from `locations`, status select over `statuses`, default "Đang dùng"); list of picked file names
   with state badges; `dailyWarning` when `exceedsDailyLimit`; progress bar (`.progress`) with
   `running(k, n, name)`; after the run, summary + failed list (`error` message via `useWardrobe.message`-style
   text: `ApiError`/`PhotoPrepError`/`PhotoSaveError` messages are already Vietnamese) + "Thử lại" button;
   stop note for 429 (`formatWait(retryAfterSec)` from `src/features/auth/copy.ts`) and 409. No AI checkbox.
6. **`ImportModal`**: new required prop `importPhotos`; tab 0 primary button driven by the hook (mirrors the
   CSV branch); `disabled` on tabs when `csv running || photos running`. Leave the CSV and JSON branches as
   they are.
7. Copy in `copy.ts` (R6). CSS additions only (R9: wraps at 390px, existing tokens for dark mode).

Rules: R1 (repo only; components never fetch), R5 (no derived values), R6 (copy in `copy.ts`), R7 (no
worker/CSP here; no per-file thumbnails), R8 (tests above), R9 (390px/dark). R2–R4 untouched (no
schema/secret/storage-path change; photos keep going through `PUT /api/items/:id/photo`).

## Specialist input used
None (no consult files; areas `ui, data`).

## Assumptions
- **Shared files with F-602.2** (JSON backup/restore client, `PLANNING` on `ticket/F-602.2`): it very likely
  edits `src/features/import-export/ImportModal.tsx`, `ImportModal.test.tsx`, `copy.ts`, `src/App.tsx` (modal
  props), possibly `src/data/useWardrobe.ts`, `src/data/repo.http.ts` and `src/index.css`. Expect a rebase.
  To keep conflicts small, the photo state lives in `usePhotoImport.ts` and the `ImportModal` diff is limited
  to the tab-0 footer branch, the tab `disabled` expression, one prop and the `ImportPhotosTab` props.
- **Photo-only retry through `save()`**: `WardrobeRepo` has no photo-only method. Retrying a `photoFailed`
  job calls `save()` with the stored item (same id, the values the server returned) plus the new `blob:` URL:
  the item `PUT` is a no-op upsert and the photo `PUT` is the only real change. No repo interface change.
- **`photo_quota_exceeded` also stops the batch** (ticket: "Handle the server's photo limits"; the 500 cap
  would otherwise make every later file a photo-less item). `401` is left to `authFetch`/`onAuthLost` as today.
- **Daily-limit warning is advisory**: the client cannot know the remaining daily count or whether the user
  is the exempt owner, so the warning compares the batch size with the 50 constant and does not block.
- **New items use `blankItem()` for every other field** (category "Áo", no colors/seasons); Ming edits later.
  Grouping several photos into one item and AI tagging are out of scope (F-703).
- Retry is one button for all not-done files (failed, photo-failed and still-pending after a stop), which
  satisfies "failed files are listed with a retry option"; per-file buttons are not added.
- `src/App.tsx` is a hotspot (one prop line).

## Blocking questions
None.

## Split proposal
The full ticket is well over one implement/review cycle (~450 production lines + ~400 test lines for the
runner/UI alone, plus a worker, a CSP change and its tests). Proposed slices:

- **F-603.1 — Batch runner, Photos tab, quota handling (this plan).** Everything in scope except the worker:
  pick/drop, defaults, naming, sequential run with progress, failed list + retry without duplicates, 429/409
  stop, 503 wait-and-retry, daily-limit warning, object URLs. Resize stays on the main thread via
  `preparePhoto`'s default deps. Tier: Medium. Depends on: F-601.3, F-202.1 (both merged).
- **F-603.2 — Resize off the main thread + CSP `worker-src`.** A module worker
  (`new Worker(new URL("./photoPrep.worker.ts", import.meta.url), { type: "module" })`, emitted by Vite as a
  same-origin `/assets/*.js` chunk) that runs decode + encode with `createImageBitmap` + `OffscreenCanvas`
  (`convertToBlob({ type: "image/jpeg", quality })`), exposed as `PhotoDeps` for `preparePhoto` so size steps,
  HEIC (D47) and error codes stay identical; feature-detect (`Worker`, `OffscreenCanvas`, `createImageBitmap`)
  and fall back to the current main-thread deps; check EXIF orientation parity (`imageOrientation: "from-image"`).
  **Security-relevant (CSP):** add an explicit `["worker-src", "'self'"]` to `CSP_DIRECTIVES` in
  `server/http.js` and update the exact-directive test in `server/static.test.ts`. Today `worker-src` falls
  back to `script-src` (`'self' https://challenges.cloudflare.com`), so a same-origin worker already loads;
  the explicit directive narrows workers to `'self'` only, with no `blob:` or `'unsafe-eval'`. Route it to the
  `security-ai-generated-code-auditor` at review (CLAUDE.md: diff touching env/headers), and add a Ming
  check that Turnstile sign-up/forgot still work. Covers the AC "no long task over 200 ms".
