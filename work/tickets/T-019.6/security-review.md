# Security review — T-019.6

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor, read-only; tests not run)

**Verdict: no 🔴; meets the security parts of AC1–AC3.** Three 🟡 (none blocks PASS; two are T-019.7 obligations), two 🟢 hardening notes.

### Findings
**Token handling**
- 🟢 `src/data/photoUrls.ts:63-70`: token only in `Authorization`; URL rebuilt from the parsed id `${base}/photos/${e.id}` (never the caller's `src`) → no query, no `access_token`, no cookie fallback; `credentials: "same-origin"`; no logging; `ApiError` messages lack the token (`photoUrls.test.ts:205-215`).
- 🟢 `src/data/mappers.ts:177-182` `apiPhotoId`: exact prefix + anchored UUID regex (`:169`); `?x`, `/x`, `//evil/...`, `blob:`, `data:`, `https:` → `null` (`mappers.test.ts:273-286`). Relative same-origin path; no `<base>` in `index.html`, no service worker.
- 🟢 `photoUrls.ts:68,71`: `redirect: "manual"` → any 3xx (expired Access) is an error before reading; bearer never replayed.
- 🟢 DOM holds only `blob:` in `<img src>` (`ItemPhoto.tsx:19-20`, `Editor.tsx:102-103`); nothing in localStorage; `item.photo` stays `/api/photos/<id>` (`Editor.tsx:68`) so `repo.http.ts:79` never re-uploads.

**Server cache headers and 304**
- 🟢 `server/photos.js:241-248`: `private, no-cache`, `immutable` gone (no shared caches; browser revalidates each use).
- 🟢 `server/photos.js:268-295`: 304 only after `item_photos where id = $1 and user_id = $2` (`:274-276`), else 404 (`:287`); `If-None-Match: *` also needs an owned row; tests `server/photos.test.ts:139-150`, `server/isolation.db.test.ts:207-218`; errors `no-store` (`server/http.js:20`).
- 🟡 **Residual copy on disk:** `no-cache` still lets the browser keep A's JPEG in its HTTP disk cache after sign-out. B cannot get it via the app (revalidation with B's bearer → 404; no stale serving for `no-cache` on network error), but someone with the browser profile on disk could. D34 trade-off (cheap 304s). If Ming wants no trace on shared devices: `no-store` on the photo route in identity mode. Known residual; no change here.

**Blob URL lifetime**
- 🟢 `photoUrls.ts:152-163` `clear()` aborts requests, revokes URLs, rejects the queue, bumps `generation`; in-flight responses fail the check at `:77` before `createUrl` (no `await` between) (`photoUrls.test.ts:180-195`); old-generation releases no-op (`:129`); evicted URLs revoked (`:55-56, 140-144`).
- 🟢 `src/data/useWardrobe.ts:37`: `clear()` on unmount; StrictMode cleanup + re-run keeps the loader usable (`photoUrls.test.ts:197-203`).
- 🟡 **`useWardrobe.ts:33-36` memo with `[]` deps** captures the loader and `getToken` at first mount → revocation on sign-out depends on App unmounting. **T-019.7 must:** (1) unmount App on sign-out and account switch (e.g. `key={userId}` under AuthGate) or call `wardrobe.photos.clear()` before the next user's token is used; (2) pass a stable getter that reads the current token (not a closure over one value); (3) pass `getToken` on App's first render in API mode (a later getter leaves the loader `null` → cookie-only `<img>` → 401 under identity, fails closed but looks broken). No cross-account display while mounted (B's items never reference A's ids), but A's blob URLs stay in memory until evicted.

**Local mode**
- 🟢 `mode !== "api"` or no `getToken` → loader `null` (`useWardrobe.ts:34`); context default `null` (`usePhotoUrl.ts:5`); no loader → `src` unchanged (`:15,63`). Production access mode (no getter) unchanged except new 304 revalidations.

**Content type**
- 🟢 (optional) `photoUrls.ts:73-76` accepts any `image/*` and keeps the response type; a `blob:` URL has the app origin, so an `image/svg+xml` response opened in a new tab would render scriptable SVG in our origin (server `CSP: sandbox` doesn't carry over). Server always sends `image/jpeg` (`photos.js:242`) → not exploitable now. Fix: require `image/jpeg` or wrap as `new Blob([await res.arrayBuffer()], { type: "image/jpeg" })`.

### Recommendations
1. No change needed for PASS; add the three T-019.7 obligations to T-019.7.
2. Record the disk-cache residual next to D34.
3. Optional follow-up: pin the blob type to `image/jpeg`.

### What T-019.7 must keep
- Bearer only in `Authorization`, only to `apiPhotoId`-validated same-origin `/api/photos/<uuid>`, `redirect: "manual"`, no query/cookie fallback.
- Server order: owner-scoped lookup → 404 → `If-None-Match`/304; keep `private, no-cache`; never reintroduce `max-age`/`immutable`.
- Sign-out / account switch revokes every blob URL; a 401 retry uses a fresh token, doesn't loop, doesn't leak the token in `getToken` errors.
- `item.photo` never holds a `blob:` URL.

### Risks
- Loading entries at 0 refs block eviction (`photoUrls.ts:142`) → cache can briefly exceed `keepUnused` (not security).

### Open questions
- Accept the disk-cache residual on shared devices (D34), or `no-store` once identity mode is on?
