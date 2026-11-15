## Attempt 1 — 2026-11-15
Verdict: REWORK

### Checks (run by reviewer)
Branch `claude/magical-cori-2ssw8l`, base `origin/main`. DB tests ran against the reviewer's own throwaway Postgres 16 (initdb `--auth=scram-sha-256`, 127.0.0.1:55439, `TEST_DATABASE_URL` set). It was stopped and its directory removed afterwards.
- typecheck: green (`tsc --noEmit && tsc -p tsconfig.server.json`).
- format:check: "All matched files use the correct format."
- test (no DB): 78 files passed, 8 skipped. 957 tests passed, 167 skipped.
- test (with DB): 86 files passed. 1124 tests passed, 0 skipped. This matches the impl-log.
- build: `✓ built`, `dist/assets/index-*.js 261.84 kB`.
- Playwright (Chromium, 390×844, Vite dev, light and dark):
  - Local mode: 14 grid `<img>` use the demo `https://images.unsplash.com/…` URLs. The editor shows the demo URL. No `/api/photos` requests. No horizontal overflow.
  - API harness: `/src/main.tsx` was rewritten in flight to `<App mode="api" getToken={async () => "tok-123"}>`, with `/api/*` stubbed.
    - Every grid and editor `<img>` is a `blob:` URL (editor `naturalWidth=1`).
    - All 20 photo requests are `GET /api/photos/<uuid>` with `Authorization: Bearer tok-123`, no query string and no cookie.
    - Lazy loading works: 4 requests before scrolling.
    - Saving an edited item sends only `PUT /api/items/<id>`, with no `PUT …/photo`. After the save the grid keeps the same `blob:` URL.
  - Dark mode was checked. No overflow.
- Fast-scroll check with the same harness: 40 items, photos delayed 600 ms, quick jump to the bottom, then scroll back slowly. 24 cards ("Áo số 8"–"Áo số 32") stay on the "Chưa có ảnh" placeholder for good, even though they have photos. See Issue 1.

### Acceptance criteria
- [ ] "In API + identity mode the SPA fetches photos with the bearer and renders `blob:` URLs, revoked on sign-out." FAILED, see Issue 1. What does work:
  - Bearer fetch with the exact URL: `photoUrls.test.ts` › "fetches the exact URL with the bearer, same-origin credentials, manual redirect", plus the Playwright run.
  - `blob:` rendering: `ItemPhoto.test.tsx` › "with a loader: pending block, then the blob: img"; `Editor.test.tsx` › "a stored photo is shown from the blob: URL".
  - Revoke on unmount: `useWardrobe.test.tsx` › "photo loader: … unmount revokes"; `photoUrls.test.ts` › "clear revokes every URL, aborts in-flight and rejects queued; …".
  - Late response: "a response that resolves after clear creates no unrevoked URL". This is guarded by the generation check in `src/data/photoUrls.ts:78`.
  - StrictMode: "the loader works again after clear". The `useWardrobe` memo plus the clear-on-cleanup effect survive the double effect run.
  - Concurrency cap and FIFO: "at most maxConcurrent fetches at once, FIFO".
  - LRU: "released entries stay cached; keepUnused evicts and revokes the oldest, never referenced ones".
  - `item.photo` is never replaced: `Editor.tsx` only renders `stored.src`.
  - The problem: in a real grid, a photo that leaves the viewport while it is queued turns into a permanent "no photo" placeholder.
- [x] "Local mode unchanged (demo URLs)." Evidence: `useWardrobe.test.tsx` (`photos` is null in local mode), `photoUrls.test.ts` › "handles only API photo URLs", and the existing `ItemPhoto` test, unchanged and green. Playwright local mode shows demo URLs and no photo requests.
- [x] "Server photo responses are `private, no-cache` + ETag; 304 only after the ownership check." Evidence:
  - `server/photos.js:244`.
  - `server/photos.test.ts` › "200 carries private, no-cache and the ETag", "matching If-None-Match on an owned row -> 304 …", "If-None-Match %s with no row for this user -> 404, never 304" (`"<id>"` and `*`).
  - `server/api.db.test.ts` and `server/isolation.db.test.ts` are green on real Postgres.
  - `grep immutable server/photos.js` finds no match.
- [ ] "All checks pass; 390px and dark mode." All checks are green and the layout holds at 390px in light and dark. The criterion stays open until Issue 1 is fixed.

### Issues
#### Issue 1 — 🔴 blocker — correctness: a lazily loaded photo gets stuck on the placeholder after it leaves the viewport while queued
- **Where**: `src/data/usePhotoUrl.ts:27-38` (`start` / `stop`), together with `src/data/photoUrls.ts:135-139`. The release of a queued entry rejects its promise.
- **Expected**: A card that enters the 300px margin, is queued behind the 4-fetch cap, and leaves again before its fetch starts goes back to pending. When it comes back into view it loads normally.
- **Actual**: Here is the sequence.
  1. `stop()` calls `release()`. The loader rejects the queued entry's promise with `ApiError(0, "network")`.
  2. `stale` is only set in the effect cleanup, not in `stop()`. So the old `.then` rejection handler runs and calls `setState({ src, failed: true })`. This happens after `stop()`'s own reset, because it runs as a microtask.
  3. `ItemPhoto` renders `fallback`, which carries no `ref`. `node` becomes null, the effect returns early at `if (!node) return;`, and the card is never observed again.
  4. The card shows "Chưa có ảnh" until a remount or a new `src`.
  - Reproduced in two ways:
    - jsdom, with the real `createPhotoLoader` + `ItemPhoto` + a stub `IntersectionObserver` and `maxConcurrent: 1`. B enters, then leaves while queued. Result: `<p>noB</p>`, and there is no observer after leaving.
    - Chromium, in the fast-scroll check above: 24 of 40 cards stuck.
  - A similar race happens for an entry that is `loading` when it leaves. Its later resolve calls `setState` with the URL after `stop()`, so the out-of-view card flips to `<img>` and back.
- **Fix instruction**:
  - In `usePhotoUrl`, make the result handler ignore a handle that has already been released. For example, give each `start()` its own token or flag (`let current = {}` per acquire; `stop()` and cleanup set it to null; the handlers check `token === current`). This replaces the single `stale` flag.
  - Do not report a release-triggered rejection as `failed`.
  - Optionally, in `photoUrls.ts`, reject a released queued entry with a recognisable cancel error, so callers can tell it apart from a real failure.
  - Add regression tests:
    - In `src/components/ItemPhoto.test.tsx`, with a real `createPhotoLoader({ maxConcurrent: 1, fetchFn: <pending promises> })` and a stub `IntersectionObserver` that keeps one callback per element: two photos enter, the second leaves while queued, and the test asserts it renders `.photo-pending` (not the fallback). Then it re-enters, the fetches resolve, and the test asserts `<img src="blob:…">`.
    - A case where a `loading` entry leaves the viewport and then resolves: the card stays `.photo-pending` while it is out of view.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: local mode never creates a loader. Fetch logic lives in `src/data/`, and components only use the hook.
- R3: the token is only in the `Authorization` header of same-origin `/api/photos/<uuid>` requests. It never appears in a URL or a log.
- R4/D34: there are no signed URLs, and the owner-scoped lookup runs before any 304.
- R5: not touched.
- R6: no new copy.
- R7: every file is in the plan. The `App.tsx` diff is the Provider wrap plus re-indentation (`git diff -w` shows 8 lines).
- R8: tests are present.
- R9: 390px works in light and dark.
- R10: no Figma Make files touched.

### Nits (do not block)
- `usePhotoUrl` calls `setNode` from the ref callback even when no loader is present. In local mode this causes one extra render per `ItemPhoto`. It would be cheaper to call `setNode` only when `observe` is true.
- `photoUrls.ts:141-145`: eviction stops at the first unused entry that is not `ready`, and entries that finish loading with 0 refs are only trimmed on the next release. The impl-log already notes this.

### Follow-ups (out of scope)
- 401 retry or token refresh in the loader (plan A3), for T-019.7.
- Ming, after merge: see plan *Ming verification after merge* (production photos still load in Access mode with a 304 revalidation; M-20: `blob:` sources, bearer-only requests, no cross-account photo after switching user).
