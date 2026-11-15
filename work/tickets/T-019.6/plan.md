Status: READY

# Plan — T-019.6: Photos under bearer auth (blob URLs)

## Feature summary
Not in `docs/feature-list.md` (T-019 slice). Sources:

- `work/decisions.md` D34 (amends D27): "`GET /api/photos/:id` sits behind the Identity bearer check and is scoped by
  owner; the SPA fetches photos with the bearer and renders `blob:` URLs; responses `private, no-cache` + ETag. Still
  no signed URLs, no new secret." Reason: "`<img>` cannot send a bearer token".
- Umbrella plan `work/tickets/T-019/plan.md`, A5: "Photos by bearer fetch → `blob:` URLs … `Cache-Control: private,
  no-cache` + ETag." Split entry: "**T-019.6 — Photos under bearer.** ACs: SPA fetches photos with the bearer and
  renders `blob:` URLs, revoked on sign-out; local mode unchanged (demo URLs); server photo responses `private,
  no-cache` + ETag, 304 only after the ownership check." Files row: "`server/photos.js` … `src/data/photoUrls.ts`
  (new), `src/data/mappers.ts`, `src/data/repo.http.ts` | fetch photo with bearer → object URL cache, revoke on
  sign-out; local mode keeps plain URLs". Tests row: "`src/data/photoUrls.test.ts` › bearer fetch, cache by id, revoke
  on clear".
- Ticket notes: "2026-11-14 (T-019.2 plan A17, recommendation): photo responses are `private, max-age=31536000,
  immutable` today; a shared browser can show a cached photo after a user switch. Fix before identity mode."
- T-019.5 `security-review.md` item 4: "T-019.6/T-019.7: token only in `Authorization`; no `?access_token=` or cookie
  fallback for `<img>` (use blob URLs); the verifier rejects such fallbacks."
- T-019.7 ticket (BACKLOG) wires the real token later; there is no token store in the SPA yet. So this slice adds an
  injectable seam `getToken?: () => Promise<string | null>`. With no getter (today's production, `TUDO_AUTH_MODE=access`)
  photos stay plain `<img src="/api/photos/<id>">` sent with the Access cookie, exactly as now.

State on `main` already found while planning: the server side of "304 only after the ownership check" is in place.
`servePhoto` looks up `item_photos` by `id and user_id` before it reads `If-None-Match`, and
`server/isolation.db.test.ts` › "B GET of A's photo -> 404, also with If-None-Match (never 304)" covers it. In
identity mode, `server/app.js` already runs `auth.authenticate(req)` (bearer only, T-019.5) before every `/api/*` route,
photos included. The only server change left is the `Cache-Control` value, plus a unit test that does not need
Postgres.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "In API + identity mode the SPA fetches photos with the bearer and renders `blob:` URLs, revoked on sign-out." | `src/data/photoUrls.test.ts` (bearer fetch: exact URL with no query string, `Authorization: Bearer <t>` header, `credentials: "same-origin"`; returns the `blob:` URL; dedupe; concurrency cap; `clear()` revokes every URL and aborts in-flight requests); `src/components/ItemPhoto.test.tsx` (with a loader, the `<img>` gets the `blob:` src); `src/features/items/Editor.test.tsx` (stored photo shown from the `blob:` URL); `src/data/useWardrobe.test.tsx` (api + `getToken` → loader exists; unmount, which is what sign-out does in T-019.7, revokes every created URL). Code read: `item.photo` stays `/api/photos/<id>`; no `blob:` URL is written into an `Item`. |
| 2 | "Local mode unchanged (demo URLs)." | `useWardrobe.test.tsx` › local mode has no photo loader; `ItemPhoto.test.tsx` existing test unchanged and green (no provider → `src` used as is); `photoUrls.test.ts` › demo `https://…`, `data:` and `""` are not handled (no fetch); `pnpm dev` (local mode) shows the demo photos in the grid, hero and editor. |
| 3 | "Server photo responses are `private, no-cache` + ETag; 304 only after the ownership check." | `server/photos.test.ts` › 200 carries `Cache-Control: private, no-cache` + `ETag`; matching `If-None-Match` + owned row → 304 with the same headers and no Drive call; matching `If-None-Match` + no row for this user → 404, never 304, no Drive call. `server/api.db.test.ts` expectations updated to `private, no-cache`; `server/isolation.db.test.ts` (existing, unchanged) still green when Postgres is available. `grep -rn "immutable" server/photos.js` → no match. |
| 4 | "All checks pass; 390px and dark mode." | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all green. Pending state is a transparent `.photo-pending` block filling the existing fixed `aspect-ratio: 3/4` / collage boxes (no new width; the frame colour shows in light and dark); placeholder and error UI are the existing components. Reviewer checks the CSS diff and, in `pnpm dev`, the 390px grid in light and dark (local mode, so this exercises the unchanged path). |

## Ming verification after merge
- After the next release (production is still `TUDO_AUTH_MODE=access`, no token getter): photos still load in the
  grid, hero and editor on phone and desktop. DevTools may show a 304 revalidation per photo after reload (the
  intended `no-cache` behaviour).
- Part of M-20, once T-019.7 has wired the token: in identity mode the photo `<img>` sources are `blob:` URLs; the
  `/api/photos/…` requests carry `Authorization: Bearer` and no `access_token` in the URL; after signing out and in
  as the second test account in the same browser, none of Ming's photos appear (from cache or otherwise).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/photos.js` | `PHOTO_HEADERS["Cache-Control"]` → `"private, no-cache"`; comment that 304 is only reached after the owner-scoped lookup. No other logic change. | AC3, D34, ticket note (A17 of T-019.2) |
| `server/photos.test.ts` | new cases: 200 headers, 304 after the owner lookup, 404 (not 304) with `If-None-Match` when the lookup returns no row | AC3, R8 |
| `server/api.db.test.ts` | two expectations `private, max-age=31536000, immutable` → `private, no-cache` | AC3 (existing tests assert the old value) |
| `server/README.md` | `GET /api/photos/:id` row: new `Cache-Control`, "a matching `If-None-Match` gives 304 only after the owner check", "in identity mode the SPA fetches with the bearer and shows `blob:` URLs" | docs match behaviour |
| `src/data/mappers.ts` | add `apiPhotoId(src, base = "/api"): string \| null`, the inverse of `apiPhotoUrl`: returns the uuid only for exactly `${base}/photos/<uuid>`, else `null` | the loader must handle only same-origin API photo URLs (pure parser, R6/R8) |
| `src/data/mappers.test.ts` | tests for `apiPhotoId` | R8 |
| `src/data/photoUrls.ts` (new) | `createPhotoLoader({ getToken, fetchFn?, base?, maxConcurrent? = 4, keepUnused? = 40, createUrl?, revokeUrl? })` → `{ handles(src), acquire(src) → { promise, release }, clear() }`: bearer fetch, object URL cache keyed by photo id, ref counts, FIFO queue with concurrency cap, LRU of unused entries, revoke on evict/clear | AC1, A5, D34 |
| `src/data/photoUrls.test.ts` (new) | loader tests (see below) | AC1, R8 |
| `src/data/usePhotoUrl.ts` (new) | `PhotoLoaderContext` (default `null`) and `usePhotoUrl(src, { lazy })` → `{ src: string \| null, failed: boolean, ref }`; passthrough when no loader or `!loader.handles(src)`; `IntersectionObserver` (rootMargin `300px`) acquires when near the viewport and releases when it leaves; immediate when `IntersectionObserver` is missing or `lazy: false` | AC1; keeps components free of fetch logic (R1) |
| `src/components/ItemPhoto.tsx` | use `usePhotoUrl(src, { lazy: true })`: pending → `<span className="photo-pending" aria-hidden>` (carries the observer ref), ready → today's `<img>` with the resolved src, failed or `<img>` error → `fallback` | AC1, error/placeholder states |
| `src/components/ItemPhoto.test.tsx` | keep the existing test; add loader cases | R8 |
| `src/features/items/Editor.tsx` | the stored photo `<img>` uses `usePhotoUrl(item.photo, { lazy: false })`; `loadFailed` also true when the loader fails; `item.photo` itself is never replaced | AC1 (the editor shows stored photos too) |
| `src/features/items/Editor.test.tsx` | loader cases | R8 |
| `src/data/useWardrobe.ts` | optional 4th argument `{ getToken? }`; when `mode === "api"` and `getToken` is set, `useMemo` creates one loader; returns `photos: PhotoLoader \| null`; effect cleanup calls `photos.clear()` on unmount | AC1 (revoke on sign-out = unmount), AC2 (null in local mode) |
| `src/data/useWardrobe.test.tsx` | loader presence by mode; unmount revokes | R8 |
| `src/App.tsx` | optional prop `getToken?: () => Promise<string \| null>` passed to `useWardrobe`; wrap the returned tree in `<PhotoLoaderContext.Provider value={wardrobe.photos}>` | wiring only; T-019.7 will pass the getter (hotspot, A9) |
| `src/index.css` | `.photo-pending { display: block; width: 100%; height: 100%; border-radius: 13px; }` (transparent, so the frame or `.photo-wrap` background shows in light and dark) | pending state at 390px / dark (R9) |

Not changed, against the umbrella's file list: `src/data/repo.http.ts`. Bearer on JSON `/api` calls and the
401 retry belong to T-019.7 (umbrella row "`src/data/repo.http.ts`, `src/data/useWardrobe.ts` | `getToken` injected …
bearer + one retry"). This slice needs nothing from it: photos are loaded at render time, not in `list()` (A2).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/data/mappers.test.ts` › `apiPhotoId` returns the id for `/api/photos/<uuid>`; `null` for `""`, demo `https://…`, `data:`, `blob:`, `/api/photos/<uuid>?x=1`, `/api/photos/<uuid>/x`, non-uuid id, other base, `//evil/api/photos/<uuid>`; honours a custom base | AC1, AC2 |
| `src/data/photoUrls.test.ts` › handles only API photo URLs; demo, `data:` and `""` are passed through with no fetch | AC2 |
| `photoUrls.test.ts` › fetches `/api/photos/<id>` exactly (no query string, no `access_token`), header `Authorization: Bearer t`, `credentials: "same-origin"`, `redirect: "manual"`; resolves to the URL from `createUrl` | AC1, T-019.5 security item 4 |
| `photoUrls.test.ts` › two acquires of the same src → one fetch, same object URL | cache by id |
| `photoUrls.test.ts` › 10 srcs with `maxConcurrent: 4` → at most 4 fetches pending at once; the next starts when one settles; FIFO | concurrency |
| `photoUrls.test.ts` › a release before the fetch starts removes it from the queue (never fetched) | grid scroll cost |
| `photoUrls.test.ts` › release to 0 refs keeps the URL (re-acquire → no fetch, same URL); with `keepUnused: 2` the oldest unused entry is evicted and revoked; referenced entries are never evicted | memory |
| `photoUrls.test.ts` › 401, 404, 500, network throw, `opaqueredirect`, non-`image/` content type, `getToken` → `null` (no fetch), `getToken` rejects → promise rejects; nothing cached, so the next acquire fetches again; no `createUrl` call on failure | error states |
| `photoUrls.test.ts` › `clear()` revokes every created URL, aborts the in-flight signals and rejects queued acquires; a fetch that resolves after `clear()` leaves no unrevoked URL; the loader works again after `clear()` (React StrictMode remount) | AC1 revoke on sign-out |
| `photoUrls.test.ts` › the token never appears in a `console.*` call (spies) or in an error message | token hygiene |
| `src/components/ItemPhoto.test.tsx` › existing test unchanged; with a fake loader: pending renders `.photo-pending` and no `<img>`, then `<img src="blob:…">` keeping `loading="lazy"`/`decoding="async"`; failure → fallback; unmount → `release` called; with a stub `IntersectionObserver` nothing is acquired until it reports intersecting, and leaving the viewport releases | AC1, lazy loading |
| `src/features/items/Editor.test.tsx` › with a fake loader, an item with `photo: "/api/photos/<id>"` shows `<img src="blob:…">`; loader failure shows `EDITOR_COPY.photo.loadFailed`; a new `data:` photo is shown as is (no acquire) | AC1 |
| `src/data/useWardrobe.test.tsx` › local mode → `photos` is `null` even with `getToken`; api mode without `getToken` → `null`; api + `getToken` → loader; unmount → every created object URL revoked | AC1, AC2 |
| `server/photos.test.ts` › 200 head: `Cache-Control: private, no-cache` and `ETag: "<id>"`; `If-None-Match` matching + owned row → 304 with the same `Cache-Control` and `ETag`, no `getMedia` call; `If-None-Match` matching (also `*`) + lookup returns no row → 404 `not_found`, no `getMedia` call | AC3 |
| `server/api.db.test.ts` › "GET photo streams …" and "If-None-Match -> 304 …" assert `private, no-cache` | AC3 |

## Approach
1. **Server (`server/photos.js`).** Change only the `Cache-Control` constant to `private, no-cache`. Order in
   `servePhoto` stays: drive/pool checks → owner-scoped `select … where id = $1 and user_id = $2` → 404 if none →
   `If-None-Match` → 304, else stream. Add the unit tests with `fakePool` (one query returning `rowCount: 0`), update
   `api.db.test.ts`, update the README row. `no-cache` lets the browser keep the body but revalidate every use, so a
   second user in the same browser gets 404 from the owner check and never a cached photo (ticket note, A17). No
   `Vary` header (A6).
2. **Parser (`mappers.ts`).** `apiPhotoId(src, base)`: exact match `^${base}/photos/(<uuid>)$`, reusing `isUuid`.
   Relative same-origin paths only, so the bearer can only go to our own `/api` (T-019.5 security item 4).
3. **Loader (`src/data/photoUrls.ts`), plain TS, no React.**
   - Entry per photo id: `{ state: queued|loading|ready, refs, url?, promise, ctrl }`; `unused` is an insertion-ordered
     `Map` used as an LRU.
   - `acquire(src)`: ref+1; ready → resolved promise; loading/queued → same promise; new → queue. A pump keeps at
     most `maxConcurrent` (default 4, leaving browser connections for the JSON API) in flight.
   - Fetch: `token = await getToken()`; `null` → reject `ApiError(401, "unauthorized")` with no request;
     `fetchFn(url, { headers: { Authorization: \`Bearer ${token}\` }, credentials: "same-origin",
     redirect: "manual", signal })`. `credentials: "same-origin"` keeps the Cloudflare Access cookie during M-20 while
     Access is still on; the token is never put in the URL and there is no cookie fallback. Uses the default fetch
     cache mode, so the browser revalidates with `If-None-Match` and a 304 gives back the cached body.
     `opaqueredirect` → 401; `!ok` → `ApiError(status, …)`; content type not `image/…` → `ApiError(status,
     "unexpected")`; then `createUrl(await res.blob())`.
   - A failed entry is deleted (not cached) so a later acquire retries. Errors and logs never contain the token
     (nothing is logged at all).
   - `release`: ref−1; still queued → drop from the queue; at 0 refs → move to `unused`; over `keepUnused` (default
     40, about 40 × ≤300 KB for 1200 px JPEGs) → revoke the oldest. Loading entries at 0 refs finish and park
     (StrictMode acquire/release/acquire stays cheap).
   - `clear()`: abort every controller, reject queued promises, revoke every URL, reset maps, bump a generation
     counter so a late response is revoked immediately (or never turned into a URL). The loader stays usable after
     `clear()` (StrictMode runs effect cleanup and then re-runs the effect).
4. **Hook (`src/data/usePhotoUrl.ts`).** `PhotoLoaderContext = createContext<PhotoLoader | null>(null)`.
   `usePhotoUrl(src, { lazy })`: no loader or not handled → `{ src, failed: false }` on the first render (local mode
   and access mode render exactly as today). Otherwise `null` while pending; `lazy` uses one `IntersectionObserver`
   per element (rootMargin `300px`): entering → acquire, leaving → release and go back to pending (memory stays about
   on-screen + `keepUnused`); no `IntersectionObserver` or `lazy: false` → acquire on mount. Cleanup releases; a
   stale resolve after a `src` change or unmount is ignored.
5. **Components.** `ItemPhoto` (grid card and hero): pending → `.photo-pending` span (carries the ref), ready → today's
   `<img>`, failed or `onError` → `fallback` (card: existing "Chưa có ảnh" placeholder; hero: nothing). `Editor`:
   `usePhotoUrl(item.photo, { lazy: false })`; the `<img>` gets the resolved src; `loadFailed` = loader failed or
   `<img>` error → existing `EDITOR_COPY.photo.loadFailed` UI. No new copy (R6).
   `item.photo` is never set to the `blob:` URL. `repo.http.ts` `save()` treats `blob:`/`data:` as a new upload, so
   a stored blob URL would re-upload the photo on every save (A2).
6. **Wiring.** `useWardrobe(starter, locs, mode, { getToken } = {})` creates the loader only for `mode === "api"` with
   a getter, exposes `photos`, and clears it on unmount. `App` takes an optional `getToken` prop and provides the
   context. `main.tsx` is not changed: nobody passes a getter yet, so production behaviour is unchanged until T-019.7
   (A1). Sign-out in T-019.7 unmounts `App` (AuthGate), which revokes everything; `photos.clear()` is also exposed
   for an explicit call.
7. **CSS.** One `.photo-pending` rule (block, 100% × 100%, radius 13px, transparent). Boxes already have fixed
   sizes (`aspect-ratio: 3/4`, collage 125×158 / 112×145), so 390px layout and dark mode are unaffected (R9).

Rules: R1 — local mode never creates a loader and keeps demo URLs; all fetch logic lives in `src/data/`, components
only use a hook. R3 — no secret added; the token comes from an injected getter and goes only into the `Authorization`
header of same-origin `/api/photos/<uuid>` requests. R4/D34 — no signed URLs, owner-scoped server lookup before
any 304. R5 not touched. R6 — no new copy. R7 — `repo.http.ts` bearer work left to T-019.7. R8 — the parser, the
loader and the hook have unit tests. R9 — see step 7. R10 — no Figma Make files touched.

Size: about 250 lines of code plus about 350 lines of tests. Above the 400-line guide only because of the tests.
It is one cohesive change (the loader is useless without the hook and the wiring), so no split.

## Specialist input used
No `consult-*.md` in this ticket. Used: the T-019 umbrella consults as quoted in its plan ("security auditor: adopted
… blob photos + cache headers (A5)"), the T-019.5 `security-review.md` item 4 (token only in `Authorization`, no
`?access_token=` / cookie fallback) and T-019.2 A17 (ticket note: immutable cache across users).

## Assumptions
- **A1 — Token seam, default.** `getToken?: () => Promise<string | null>` is injected through `App` → `useWardrobe` →
  `createPhotoLoader`. With no getter (production today, Access mode), photos render as plain `<img>` with the cookie,
  as now. T-019.7 passes its single-flight `tokenStore.getToken` from `main.tsx` / AuthGate; `src/data` never imports
  `src/features/auth` (umbrella: "`getToken` injected (no import of `features/auth` from `src/data`)").
- **A2 — Resolve at render time, not in `repo.list()`, default.** `Item.photo` keeps `/api/photos/<id>`. Reasons: lazy,
  capped loading for big grids; the list does not wait for every photo; `save()` and `isDirty` keep working (a `blob:`
  value in `item.photo` would be taken as a new upload).
- **A3 — No 401 retry in the loader in this slice, default.** A 401 shows the placeholder; remounting or a new `src`
  retries. T-019.7 adds token invalidation + one retry for JSON calls and may extend the loader the same way (with a
  getter that can force a refresh). Ticket T-019.7 is told via Handoff.
- **A4 — Limits, default.** `maxConcurrent = 4`, `keepUnused = 40`, observer rootMargin `300px`. Tunable constants,
  not configuration.
- **A5 — Loading state, default.** A blank block on the frame colour (no spinner, no copy) while pending; the existing
  placeholder / "load failed" UI on error. Failures are not cached.
- **A6 — No `Vary: Authorization`, default.** `no-cache` already forces a revalidation that passes the owner check,
  and the response is `private`, so shared caches do not store it. Adding `Vary` would change nothing that can be
  observed.
- **A7 — Access mode keeps cookie `<img>`s with the new `no-cache` header, default.** Each photo use becomes a cheap
  conditional request (304, DB lookup, no Drive call) instead of no request at all. Accepted by D34.
- **A8 — `HEAD` and `Range` are not added**, default. Not needed by the SPA.
- **A9 — Hotspots.** `src/App.tsx` is edited (prop + Provider, a few lines). T-019.7 (BACKLOG, depends on this ticket)
  also edits `src/App.tsx`, `src/main.tsx`, `src/data/useWardrobe.ts` and `src/data/repo.http.ts`; it starts after
  this merges, so no rebase is expected. No other open ticket (IN_PROGRESS / REVIEW / DONE) edits these files.
- **A10 — db tests.** `server/api.db.test.ts` and `server/isolation.db.test.ts` need Postgres. The new
  `server/photos.test.ts` cases prove AC3 under plain `pnpm test`; the db test edits are only the two header strings.

## Blocking questions
None.

## Split proposal
None. Size S; one implement/review cycle (code about 250 lines, rest are tests).
