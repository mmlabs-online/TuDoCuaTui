Status: READY

# Plan — T-027.1: Make the bulk photo import runner stop and retry sensibly

## Feature summary
Not a feature-list item: hardening of F-603 (bulk photo import) and F-703 (AI in bulk import). The ticket's scope,
quoted:

> - Stop the batch on `401` (session expired) and on a network error, like `rate_limited`, keeping the remaining
>   files listed for retry, with a Vietnamese message.
> - After a `429` stop, keep "Thử lại" disabled until `Retry-After` has passed (show the wait).
> - A `503` with no `Retry-After` (Drive not configured, `server/photos.js:148`) does not wait 5 s per file: stop
>   the batch after the first such answer with a clear message.
> - Picking or dropping the same file twice (same name, size and lastModified) adds it once.
> - With AI on, do not spend an AI call on a photo whose upload is known to fail (the photo quota is already used
>   up in this batch).

Sources it cites:
- `work/tickets/F-603/security-review.md` 🟡 1: "The batch keeps going after a 401 or a network error … also stop on
  `status === 401` (and possibly `status === 0`)." 🟡 2: "No client-side cooldown after a 429 stop … disable
  'Thử lại' until `retryAfterSec` has passed."
- `work/tickets/F-603/review.md` follow-ups: "When Drive is not configured the server answers `503 photos_unavailable`
  without `Retry-After` … Consider stopping the batch on a 503 without `Retry-After`"; "Picking the same file twice
  creates two items (no de-duplication of picks)."
- `work/tickets/F-703/security-review.md` 🟡 1: "one AI call can be wasted at the photo-quota stop … Optional
  follow-up: skip AI when the photo quota is known to be used up." 🟡 3 (`network`/`internal` not in
  `AI_BATCH_OFF`) is deliberate and stays as is.

Out of scope (ticket): server limits and error codes; the photo worker (T-027.2); UI polish (T-027.3: list
scrolling, live per-row AI labels, `formatWait` dedupe, dead code, repeated AI stop-reason code).

### How each case surfaces today (verified in code)
| Case | What `save` throws (after `apiError()` unwraps `PhotoSaveError.cause`) |
|---|---|
| 401 | `authFetch.ts:46-49`: retried once with a refreshed token, then `onAuthLost()` and `ApiError(401, "unauthorized")`; also `authFetch.ts:36` when `getToken` returns null (no `onAuthLost`). |
| Network | `repo.http.ts:47`: a `fetch` rejection becomes `ApiError(0, "network")`; `authFetch.ts:35`: a `getToken` throw becomes `ApiError(0, "network")`. |
| 429 | `server/photos.js:152-156`: `rate_limited` with `Retry-After` (photo PUT); `repo.http.ts:59-66` parses it into `retryAfterSec`. |
| 503, no `Retry-After` | `photos.js:148` Drive unset, `:149` / `api.js:156` `db_unavailable`, `:258` Drive config error. |
| 503, `Retry-After: 5` | `photos.js:160` upload slots busy (the case the wait-once is for). |
| Photo quota | `photos.js:233/297`: `409 photo_quota_exceeded` (photo PUT, after tagging, F-703 🟡 1). |

**Network error detection (decided):** `err instanceof ApiError && err.status === 0 && err.code === "network"`.
AI tag errors are `AiSettingsError`, not `ApiError`, so they never trigger a batch stop (unchanged F-703 behaviour).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A `401` stops the batch; the file that hit it is `pending` (item step) or `photoFailed` (photo step); later files stay `pending`; `stopped = { code: "unauthorized" }`; no further `save` call. | `photoImport.test.ts › 401 stops the batch and keeps the rest pending` and `› 401 on the photo step keeps the saved item (photoFailed)` |
| 2 | A network error (`ApiError(0, "network")`) stops the batch the same way, `stopped = { code: "network" }`. | `photoImport.test.ts › network error stops the batch and keeps the rest pending` |
| 3 | Files left by a 401/network stop are retried by "Thử lại" (done files skipped, same `itemId`). | `photoImport.test.ts › a second run after a network stop finishes the rest with the same ids`; `ImportPhotosTab.test.tsx › network stop shows its message and "Thử lại" re-runs` |
| 4 | After a `429` stop with `retryAfterSec`, "Thử lại" is disabled and shows the remaining wait; it becomes enabled once `Retry-After` seconds have passed; `run()` does nothing while cooling down. | `ImportPhotosTab.test.tsx › 429 stop keeps "Thử lại" disabled until Retry-After has passed` (fake timers) |
| 5 | A `429` with no `retryAfterSec` and every other stop leave "Thử lại" enabled (today's behaviour). | `ImportPhotosTab.test.tsx › 429 without Retry-After leaves "Thử lại" enabled`; criterion 3 test |
| 6 | A `503` without `Retry-After` stops the batch at once (no `wait` call, no second attempt), `stopped = { code: "unavailable" }`; the file is `pending` (item step) or `photoFailed` (photo step). | `photoImport.test.ts › 503 without Retry-After stops the batch without waiting` (item and photo step) |
| 7 | A `503` with `Retry-After` keeps today's behaviour: wait once (capped at 30 s), retry once, a second 503 with `Retry-After` fails the file and the batch continues. | existing `› 503 waits Retry-After and retries once`, `› second 503 fails the file and continues`; updated `› wait is capped at 30 s` |
| 8 | Adding the same file twice (same name, size, `lastModified`) — in one pick, in two picks, or pick + drop — gives one job. Different files with the same name are both kept. | `photoImport.test.ts › newPhotoFiles drops files already picked and repeats within one pick`; `ImportPhotosTab.test.tsx › picking the same file twice lists it once` |
| 9 | After a run stopped on `rate_limited` or `photo_quota_exceeded`, the next run makes no tag call until a photo upload in that run has succeeded; a file saved before that gets `ai: "off"` without a tag call; once an upload succeeds, later files are tagged again. | `photoImport.test.ts › photoQuotaHit: no tag call until an upload succeeds` and `› photoQuotaHit: tagging resumes after the first successful upload` |
| 10 | The hook remembers a quota stop across runs of the same batch and passes `photoQuotaHit: true`; it clears it after a run that adds at least one item. | `ImportPhotosTab.test.tsx › after a photo-quota stop the retry passes photoQuotaHit` |
| 11 | Each stop shows its own Vietnamese message from `copy.ts` (R6), with the imported count and "the rest are still listed". | `ImportPhotosTab.test.tsx › unauthorized / network / unavailable stops show their messages` |
| 12 | All checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- Usual phone check of the Photos tab at 390px light/dark (R9): a stop message and the disabled "Thử lại sau …"
  button read well. Optional: with Drive credentials unset on a dev server, a 3-photo batch stops at once with the
  "unavailable" message instead of taking ~15 s.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/photoImport.ts` | Widen `PhotoStop.code`; add pure `photoStopFor(err)`, `isPhotoQuotaStop(stop)`, `photoFileKey(file)`, `newPhotoFiles(existing, files)`; use `photoStopFor` in the runner; add `photoQuotaHit` option and the AI hold; drop `DEFAULT_WAIT_SEC` (only reached by 503 without `Retry-After`, which now stops). | Runner behaviour (AC 1–2, 6–9) |
| `src/data/photoImport.test.ts` | New tests below; replace the "defaults to 5 s" half of `› wait is capped at 30 s and defaults to 5 s without Retry-After`. | R8 |
| `src/features/import-export/usePhotoImport.ts` | De-duplicate in `addFiles`; 429 cooldown (`retryAt`, 1 s ticker, `cooldownSec` exposed, guard in `run`); remember the quota stop and pass `photoQuotaHit`. | AC 4, 5, 8, 10 |
| `src/features/import-export/ImportPhotosTab.tsx` | Stop message per code; "Thử lại" disabled with the wait label while `cooldownSec > 0`. | AC 4, 11 |
| `src/features/import-export/copy.ts` | New Vietnamese strings (below). | R6 |
| `src/features/import-export/ImportPhotosTab.test.tsx` | New tests below; the existing `› 429 shows imported count and wait time` asserts the disabled "Thử lại sau 2 giờ" button. | R8 |

`src/data/repo.http.ts`, `apiErrors.ts`, `authFetch.ts` and the server are **not** touched (no security auditor
routing needed from the ticket's note).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `photoImport.test.ts › photoStopFor maps 429, 409 quota, 401, network and 503-without-Retry-After; other errors → null` | Pure mapping: `rate_limited` keeps `retryAfterSec`; `ApiError(401,"unauthorized")` → `unauthorized`; `ApiError(0,"network")` → `network`; `ApiError(503,"photos_unavailable")` and `ApiError(503,"db_unavailable")` → `unavailable`; `ApiError(503,…,5)` → null; `ApiError(502,"photo_upload_failed")`, `ApiError(400,"invalid_input")`, `null` → null |
| `photoImport.test.ts › 401 stops the batch and keeps the rest pending` | AC 1 (item step: `["done","pending","pending"]`, `save` called twice) |
| `photoImport.test.ts › 401 on the photo step keeps the saved item (photoFailed)` | AC 1 (photo step) |
| `photoImport.test.ts › network error stops the batch and keeps the rest pending` | AC 2 |
| `photoImport.test.ts › a second run after a network stop finishes the rest with the same ids` | AC 3 |
| `photoImport.test.ts › 503 without Retry-After stops the batch without waiting` | AC 6: `wait` not called, `save` called once, item step → `pending`, photo step → `photoFailed`, `stopped.code === "unavailable"` |
| `photoImport.test.ts › wait is capped at 30 s` (edit of the existing test) | AC 7 |
| `photoImport.test.ts › newPhotoFiles drops files already picked and repeats within one pick` | AC 8: same name+size+lastModified dropped (vs existing jobs and within the list); same name but different size or lastModified kept; Vietnamese NFC/NFD names compared as given (no normalisation, a different name is a different file) |
| `photoImport.test.ts › photoQuotaHit: no tag call until an upload succeeds` | AC 9: jobs `[photoFailed(with aiFields), pending]`, save throws `photo_quota_exceeded` again → `tag` never called, stop returned |
| `photoImport.test.ts › photoQuotaHit: a file saved before any upload succeeds gets ai "off" without a tag call` | AC 9: first job `failed` without `aiFields`, its photo fails with quota → `ai: "off"`, `tag` not called |
| `photoImport.test.ts › photoQuotaHit: tagging resumes after the first successful upload` | AC 9: photoFailed job succeeds → next pending job is tagged |
| `photoImport.test.ts › isPhotoQuotaStop` | `rate_limited`/`photo_quota_exceeded` true; `unauthorized`/`network`/`unavailable`/undefined false |
| `ImportPhotosTab.test.tsx › 429 stop keeps "Thử lại" disabled until Retry-After has passed` | AC 4 with `vi.useFakeTimers()`: `retryAfterSec: 90` → button "Thử lại sau 2 phút" disabled; clicking does not call `importPhotos`; advance 30 s → "Thử lại sau 1 phút"; advance to 90 s → "Thử lại (1)" enabled and re-runs |
| `ImportPhotosTab.test.tsx › 429 without Retry-After leaves "Thử lại" enabled` | AC 5 |
| `ImportPhotosTab.test.tsx › unauthorized / network / unavailable stops show their messages` | AC 11 (one `it.each`) and "Thử lại (n)" enabled |
| `ImportPhotosTab.test.tsx › network stop shows its message and "Thử lại" re-runs` | AC 3 at the hook level |
| `ImportPhotosTab.test.tsx › picking the same file twice lists it once` | AC 8: same `File` object picked twice, then dropped → "1 ảnh đã chọn" |
| `ImportPhotosTab.test.tsx › after a photo-quota stop the retry passes photoQuotaHit` | AC 10: run 1 returns `stopped: photo_quota_exceeded` → run 2's opts has `photoQuotaHit: true`; run 2 returns a network stop with nothing added → run 3 still `true`; run 3 adds one → run 4 `false` (or absent) |

## Approach
1. **`photoImport.ts` — stop mapping.**
   ```ts
   export type PhotoStop = {
     code: "rate_limited" | "photo_quota_exceeded" | "unauthorized" | "network" | "unavailable";
     retryAfterSec?: number;
   };
   export function photoStopFor(err: ApiError | null): PhotoStop | null
   ```
   Order: `rate_limited` → `{code, retryAfterSec}`; `photo_quota_exceeded` → `{code}`; `status === 401` →
   `unauthorized`; `status === 0 && code === "network"` → `network`; `status === 503 && retryAfterSec === undefined`
   → `unavailable`; else `null`. In the catch block replace `const stop = …` with `const stop = photoStopFor(err)`;
   the state patching stays as today (`PhotoSaveError` → `photoFailed`, an already-`photoFailed` job keeps its state,
   otherwise `stop ? "pending" : "failed"`), then `return { jobs: cur, stopped: stop, …aiStopped }`. The 503
   wait-once path is unchanged except it is now only reached with a `retryAfterSec`
   (`Math.min(err.retryAfterSec!, MAX_WAIT_SEC)`); remove `DEFAULT_WAIT_SEC`. A second 503 with `Retry-After` still
   fails the file and continues (AC 7); a second 503 without it stops (follows from the order: stop check first).
2. **`photoImport.ts` — AI hold.** `PhotoImportOptions.photoQuotaHit?: boolean` ("the previous run of this batch
   stopped on the photo quota"). In `runPhotoImport`: `let quotaHeld = !!opts.photoQuotaHit;`. In `withPrepared`,
   after the existing `photoFailed` / `aiFields` / already-tagged returns and next to the `aiOff` check:
   `if (quotaHeld) { patch(i, { ai: "off" }); return item; }`. After a successful `save`: `quotaHeld = false`.
   A `photoFailed` job (the one that hit the quota, normally the first non-done file) never tags, so it is the probe;
   if the quota is still used up the run stops with zero tag calls. `export const isPhotoQuotaStop = (s?: PhotoStop |
   null) => s?.code === "rate_limited" || s?.code === "photo_quota_exceeded"`.
3. **`photoImport.ts` — de-duplication (pure).** `photoFileKey(f) = \`${f.name}\u0000${f.size}\u0000${f.lastModified}\``;
   `newPhotoFiles(existing: PhotoJob[], files: File[]): File[]` returns the files whose key is in neither `existing`
   nor earlier in `files`.
4. **`usePhotoImport.ts`.**
   - `addFiles`: filter `isPhotoFile` as today, then inside `setJobs((p) => …)` use `newPhotoFiles(p, files)` before
     mapping to jobs (functional update so two quick picks cannot race).
   - Cooldown: `const [retryAt, setRetryAt] = useState<number | null>(null)` and `const [now, setNow] =
     useState(Date.now)`. After a run: `setRetryAt(out.stopped?.code === "rate_limited" && out.stopped.retryAfterSec
     ? Date.now() + out.stopped.retryAfterSec * 1000 : null)`. An effect runs `setInterval(() => setNow(Date.now()),
     1000)` while `retryAt` is set and clears it on cleanup / when the time has passed (`setRetryAt(null)`).
     Expose `cooldownSec = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0`. `run()` returns early when
     `cooldownSec > 0`.
   - Quota memory: `const quotaHitRef = useRef(false)`; pass `photoQuotaHit: quotaHitRef.current` in the options;
     after the run: `quotaHitRef.current = isPhotoQuotaStop(out.stopped) || (quotaHitRef.current && added <= 0)`.
5. **`ImportPhotosTab.tsx`.** Replace the two-way stop ternary with a lookup by `stopped.code`:
   `rate_limited` → `stoppedRateLimited(done, formatWait(…))` (unchanged), `photo_quota_exceeded` →
   `stoppedQuota(done)`, `unauthorized` → `stoppedUnauthorized(done)`, `network` → `stoppedNetwork(done)`,
   `unavailable` → `stoppedUnavailable(done)`. The retry button: `disabled={photos.cooldownSec > 0}` and label
   `cooldownSec > 0 ? PHOTOS.retryIn(formatWait(cooldownSec)) : PHOTOS.retry(n)`. No layout change (T-027.3 owns polish).
6. **`copy.ts`** (inside `import.photos`):
   - `stoppedUnauthorized: (imported) => \`Đã dừng: đã nhập ${imported} ảnh. Phiên đăng nhập đã hết hạn — hãy đăng nhập lại rồi thử lại. Các ảnh còn lại vẫn nằm trong danh sách.\``
   - `stoppedNetwork: (imported) => \`Đã dừng: đã nhập ${imported} ảnh. Không kết nối được máy chủ — kiểm tra mạng rồi bấm Thử lại. Các ảnh còn lại vẫn nằm trong danh sách.\``
   - `stoppedUnavailable: (imported) => \`Đã dừng: đã nhập ${imported} ảnh. Máy chủ tạm thời chưa lưu được món đồ hoặc ảnh, thử lại sau nhé. Các ảnh còn lại vẫn nằm trong danh sách.\``
   - `retryIn: (wait: string) => \`Thử lại sau ${wait}\``

   Per-file states need no new copy: the stopping file shows "Chờ" (`pending`) or "Chưa có ảnh" (`photoFailed`, its
   `PhotoSaveError` message listed as today, e.g. "Đã lưu món đồ nhưng chưa lưu được ảnh — Không kết nối được máy
   chủ, thử lại nhé").
7. Run the checks.

Rules: R1 — no `fetch` in components, the runner still goes through `save` (= `repo.save`); R3/R4 untouched; R6 —
all new text in `import-export/copy.ts`; R7 — only the listed files; R8 — every new pure function and runner path
has unit tests; R9 — only a button label/disabled state and one text line change, existing layout.

## Specialist input used
None (no consults). Security inputs are the cited F-603/F-703 security reviews.

## Assumptions
- A 401 that goes through `onAuthLost()` signs the user out (`AuthGate.tsx:156-162`), which unmounts the app and
  aborts the batch; the list is then gone. The runner still stops at once (the point of the 🟡: no ~90 requests and
  30 `onAuthLost` calls). The "remaining files stay pending" guarantee is about the runner's result and the case
  where `getToken` returned null (`authFetch.ts:37`, no `onAuthLost`).
- The cooldown lives in hook state: closing the modal forgets it (the server still enforces the limit). A 429 without
  a parsable `Retry-After` gets no cooldown (ticket: "until `Retry-After` has passed").
- The AI hold can leave one file without AI (`ai: "off"`) in the rare case a non-`photoFailed` file is saved before
  the probe; that is the trade-off the ticket asks for (no AI call while the quota is known to be used up). The very
  first run cannot know the quota and may still spend one call (F-703 🟡 1 accepted that bound).
- Hotspots: T-027.3 (BACKLOG, depends on T-027.1) edits the same files (`photoImport.ts`, `ImportPhotosTab.tsx`,
  `copy.ts`); it starts after this merges, so no rebase conflict now. No `IN_PROGRESS`/`REVIEW`/`DONE` ticket touches
  these files. `src/App.tsx` is not touched.
- Expected size ≈ 120 lines of code + ≈ 200 lines of tests.

## Blocking questions
None

## Split proposal
None
