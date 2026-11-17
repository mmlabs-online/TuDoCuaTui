# Security review — F-603 (slice F-603.1)

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-17

**Overall result: PASS. No 🔴 blockers; 3 🟡 non-blocking items.**

The auditor had no shell, so it reviewed by reading the changed files directly rather than running
`git diff origin/main...HEAD`: `photoImport.ts`, `apiErrors.ts`, `repo.http.ts`, `useWardrobe.ts`,
`usePhotoImport.ts`, `photos.ts`, `authFetch.ts`, plus the server-side `server/items.js`, `server/photos.js`
and `server/photoQuota.js`.

### Findings
1. **Every upload still goes through `preparePhoto` (D48): holds.** `runPhotoImport` only calls `deps.save`
   (`useWardrobe.save` → `repo.save`, `src/data/useWardrobe.ts:122-135`). The photo is always a fresh `blob:`
   URL (`src/data/photoImport.ts:105`), including on the photo-only retry (`:89-90`). `repo.save` runs
   `prepare(urlToBlob(...))` before the item `PUT` (`src/data/repo.http.ts:83-86`), so a photo that fails
   preparation creates no item. No other upload path was added.
2. **R1, data access only through `WardrobeRepo`: holds.** The components and the hook do no fetching; the only
   `fetch` is `urlToBlob` on a local `blob:` URL, inside `src/data/photos.ts`.
3. **`Retry-After` parsing is safe.** `src/data/repo.http.ts:58-65` accepts only `/^\d+$/`, so negative,
   decimal, HTTP-date, empty and missing values become `undefined`. For 503 the wait is clamped
   (`Math.min(x ?? 5, 30) * 1000`, `photoImport.ts:121-124`); for 429 the value is only displayed, and
   `formatWait` handles non-finite and ≤ 0 values (`src/features/import-export/copy.ts:15-20`).
4. **Retries are bounded and the server quotas are respected.** Files run one at a time with at most 2 attempts
   each; only a 503 triggers the retry, and only once (`photoImport.ts:120`). A 429 `rate_limited` or 409
   `photo_quota_exceeded` ends the run at once (`:112-119`). Sequential uploads respect the one-upload-in-flight
   limit (`server/photos.js:160`). The wait can be aborted.
5. **Object URLs are revoked.** One per attempt, revoked in `finally` (`photoImport.ts:105, 126-128`).
6. **No secrets in client code.** No new `VITE_*` variable, key or token.
7. **No cross-user data.** Item ids come from `crypto.randomUUID()` when files are picked
   (`src/features/import-export/usePhotoImport.ts:45`); the server upsert is scoped by `user_id`
   (`server/items.js:97-103`). File names are rendered as React text, and there is no `innerHTML` under
   `src/features`.

### Non-blocking items
- 🟡 **The batch keeps going after a 401 or a network error** (`src/data/photoImport.ts:115, 120`). Only 429 and
  409 stop the run. If the session expires mid-batch, every remaining file still runs `preparePhoto`, then a
  request, a token refresh, a retry and `onAuthLost()` (`src/data/authFetch.ts:44-49`): about 90 requests and
  30 `onAuthLost` calls for a 30-photo batch. Bounded by N, so not a storm, but wasteful. Fix in a follow-up:
  also stop on `status === 401` (and possibly `status === 0`).
- 🟡 **No client-side cooldown after a 429 stop.** "Thử lại" can be pressed again before `Retry-After` has passed
  (`usePhotoImport.ts:52-72`). The server enforces the limit, so impact is low. Optional fix: disable "Thử lại"
  until `retryAfterSec` has passed.
- 🟡 **A 429 or 409 on the photo step leaves an item with no photo** (planned behaviour, AC 7). A retry reuses the
  same id, so nothing is duplicated. Not a security issue; noted because the photo-less item persists if the
  user never retries.

### Risks
- An abort does not cancel the request already in flight; the run stops after the current file (AC 11).
- `PHOTO_DAILY_LIMIT = 50` copies `PHOTO_LIMITS.dailyMax` in `server/photoQuota.js:6` and can drift. It only
  drives an advisory warning; the server is the real gate.

### Open questions
None.
