## Attempt 1 — 2026-11-15

### Files touched
| File | Required because |
|---|---|
| `server/photos.js` | `Cache-Control` -> `private, no-cache` (AC3, D34); comment on owner check before 304 |
| `server/photos.test.ts` | 200 headers, 304 after owner lookup, 404 (never 304) with `If-None-Match` and `*` when no row |
| `server/api.db.test.ts` | two expectations updated to `private, no-cache` |
| `server/README.md` | photo row: new cache header, 304 rule, bearer/blob note |
| `src/data/mappers.ts` | `apiPhotoId`, inverse of `apiPhotoUrl` |
| `src/data/mappers.test.ts` | `apiPhotoId` tests |
| `src/data/photoUrls.ts` (new) | `createPhotoLoader`: bearer fetch, cache by id, concurrency cap, LRU, revoke on clear |
| `src/data/photoUrls.test.ts` (new) | loader tests |
| `src/data/usePhotoUrl.ts` (new) | `PhotoLoaderContext`, `usePhotoUrl` (passthrough, lazy IntersectionObserver) |
| `src/components/ItemPhoto.tsx` / `.test.tsx` | pending block, resolved src, failure fallback; loader cases |
| `src/features/items/Editor.tsx` / `.test.tsx` | stored photo through `usePhotoUrl(lazy: false)`; loader failure -> `loadFailed`; pending block |
| `src/data/useWardrobe.ts` / `.test.tsx` | optional `{ getToken }`, `photos` loader (api + getToken only), cleared on unmount |
| `src/App.tsx` | optional `getToken` prop, `PhotoLoaderContext.Provider` |
| `src/index.css` | `.photo-pending` rule |

### Tests added / changed
- `mappers.test.ts` › apiPhotoId; `photoUrls.test.ts` (17 cases: handles, exact fetch/headers, dedupe, concurrency, queue release, LRU eviction, 6 error kinds, getToken null/reject, clear/late response/reuse, token hygiene)
- `ItemPhoto.test.tsx` (4 new), `Editor.test.tsx` (3 new), `useWardrobe.test.tsx` (1 new), `photos.test.ts` (4 new)

### Checks (actual output summary)
- typecheck: green (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test: 78 files passed, 8 skipped; 957 passed, 167 skipped (DB tests skipped without Postgres)
- test with DB (throwaway PG16, scram password auth, stopped and deleted afterwards): `pnpm test server/` 39 files, 522 tests passed
- test:coverage: same counts, all files 84.73% statements
- build: built OK
- Playwright (Chromium, 390x844, no horizontal overflow): local mode light/dark shows the unchanged demo https URLs, no photo requests. API harness (temporary entry with stubbed `/healthz`, `/api/items`, `/api/photos/*` and `getToken`, removed afterwards): grid and editor `<img>` are `blob:` URLs, 4 photo requests (visible cards, lazy), all with `Authorization: Bearer`, none with a query string; light and dark checked.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Loader does not retry on 401 (A3); T-019.7 may add token refresh.
- Eviction runs only on release; entries that finish loading with 0 refs are not re-trimmed until the next release.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see git diff --shortstat of the commit.

## Attempt 2 (REWORK)

### Files touched
- `src/data/usePhotoUrl.ts`: the single `stale` flag is replaced by a per-`start()` token (`current`). `stop()` and the effect cleanup null it, so a released handle's resolve or reject is ignored (no `failed`, no late flip to `<img>`). The element stays observed. Required because of review Issue 1.
- `src/data/photoUrls.ts`: blob is wrapped in `new Blob([...], { type: "image/jpeg" })` (security-review 🟢).
- `src/components/ItemPhoto.test.tsx`: two regression tests with the real loader (`maxConcurrent: 1`) and a stub IntersectionObserver: leave while queued, leave while loading. Both fail on the attempt-1 hook and pass now.
- `src/data/photoUrls.test.ts`: blob type pinned to image/jpeg.

### Checks
- typecheck: green. format:check: all files formatted. test: 78 files passed, 8 skipped; 962 passed, 167 skipped (DB tests not run, no server files changed). build: OK.
- Playwright Chromium 390x844 (API stub, 40 items, fast scroll down then up): 0 placeholder cards (was 24 stuck), 8 `<img>` for cards near the viewport, rest `.photo-pending`, no horizontal overflow.

### Out-of-plan files
None.

### Follow-ups
None new.

### Scope self-check
Only the listed issues fixed; the optional nit about `setNode` was not touched.
