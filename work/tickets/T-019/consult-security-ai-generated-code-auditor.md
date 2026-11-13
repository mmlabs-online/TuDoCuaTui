# Consult — security-ai-generated-code-auditor — T-019 (2026-11-13)

## T-019 security consult (read-only, no diff yet)

Summary: dropping Cloudflare Access combined with an `open` join policy makes TuDo an internet-facing, multi-tenant app. Anyone who signs up and verifies an email can use it. Today every query, the AI settings row, the rate limiter and the Drive upload slot are global and have no owner. The JWT verifier is the easy part. The ownership scoping (IDOR) is where the real risk is, and it all has to ship before Access comes off.

### Findings

**F1 [CRITICAL once Access is gone]: no data access is scoped to an owner.**
- `server/items.js`: `listItems`, `listLocations`, `getItem`, `removeItem` and `wearItem` all query by `id` only.
- `server/photos.js`: `withLockedItem` at :98, `putPhoto` at :192 and `servePhoto` at :265 do the same.
- `server/ai/store.js`: one row, `where id`.
- What each gap allows, as user B holding a valid token:
  - `PUT /api/items/<A's uuid>`: `saveItem` upserts with `on conflict (id) do update`, so B overwrites A's item. Item ids are client-chosen UUIDs.
  - `DELETE /api/items/<A's id>`: deletes A's item and A's Drive files.
  - `PUT /api/items/<A's id>/photo`: replaces A's photo and deletes the old Drive file.
  - `DELETE .../photo?photo=`: removes A's photo.
  - `POST .../wear`: changes A's stats.
  - `GET /api/photos/<id>`: serves A's photo.
  - `GET /api/items`: lists everyone's wardrobe.
- CWE-639 / CWE-862.

**F2 [HIGH]: `locations` has a global `unique (name)`** (`db/migrations/20261110120000_init.sql:36`), and `saveItem` does `on conflict (name)`. Two users who type the same location name would share one row. The self-FK `parent_id` and the `items.location_id` FK can also point across users.

**F3 [HIGH]: AI settings are a single shared row** (`id boolean primary key`).
- User B could read Ming's masked hint and model, replace Ming's key, or delete it.
- When the T-018.2 `/test` endpoint lands, B would be spending Ming's provider key.
- The AAD in `server/ai/crypto.js:13` is `…|v1|single|<provider>`, so ciphertext is not bound to a user. A sealed key copied into another user's row would still decrypt.

**F4 [HIGH]: limiters and caps are process-global.**
- The `ai/rateLimit.js` limiter is shared, so one user can use up 30 saves an hour for everyone.
- `MAX_IN_FLIGHT = 3` in `server/photos.js` is global, so one user can hold all upload slots and block photos for everyone.
- There are no per-user quotas. All users' JPEGs land in Ming's personal Google Drive folder (`drive.file` refresh token). The only content check is the `FF D8 FF` magic bytes. This means strangers could fill Ming's Drive quota or store abusive content in Ming's account.

**F5 [MEDIUM]: photos are loaded as `<img src="/api/photos/<id>">`** (`src/data/repo.http.ts`, `ItemCard`). An `<img>` cannot send `Authorization: Bearer`, so bearer-only auth breaks photos.
- Also, `Cache-Control: private, max-age=31536000, immutable` with no `Vary: Authorization` means a browser can serve a cached photo to the next account on the same device without asking the server.
- In `servePhoto`, the `If-None-Match` → 304 shortcut must keep running after the ownership lookup. It does today; keep it that way.

**F6 [MEDIUM]: the SPA has no CSP** (`server/http.js` `SECURITY_HEADERS`).
- Once a bearer token lives in JS memory, XSS is the token-theft path.
- External origins in use today: `fonts.googleapis.com` / `fonts.gstatic.com` (`src/index.css:1`) and Unsplash (demo data, local mode only).
- There is no HSTS header either.

**F7 [MEDIUM]: the Access-specific code and checks become wrong.**
- `server/access.js`: RS256, header `cf-access-jwt-assertion`, `clockTolerance: 30`.
- `index.js`: `TUDO_ACCESS_DISABLED`.
- `scripts/check-image.sh`: start checks at :100-101, dummy `CF_ACCESS_*` at :23, env prefix allow-list at :55.
- `deploy/deployment-repo/apps/tudocuatui/compose.yml:41-42`.
- `src/data/mode.ts:13-20`: treats an opaque redirect from the Access login as "API mode".

**F8 [LOW]: endpoints that become public.** `/healthz`, `/readyz` (does a DB ping) and the SPA bundle become public. That is acceptable: `check-image.sh` already guards the bundle against secrets and source maps.

**F9 [INFO]: things that are already right and should be kept.**
- One `pathname` is parsed and the guard sits in front of all of `/api`.
- The `Sec-Fetch-Site` guard on writes.
- JSON-only bodies.
- No CORS headers.
- Logs carry `code` only. This matters: jose's `JWTClaimValidationFailed.payload` carries claims, including `email`.

### Recommendations

**JWT verification.** Write a new `server/identity.js` that replaces `access.js` and keeps the `{ verify(req) → {ok, code, sub} }` shape (AC2).
1. Read only `Authorization: Bearer <t>`, case-insensitive scheme, exactly one header. Reject tokens over about 4 KB before parsing. Never accept a token from a query string or cookie.
2. Use jose `jwtVerify` with:
   - `algorithms: ["ES256"]`
   - `issuer: "https://api.mmlabs.online"` (exact)
   - `audience: "tudocuatui"` (a constant, not env)
   - `typ: "at+jwt"`
   - `requiredClaims: ["exp","iat","sub","jti","iss","aud"]`
   - `clockTolerance: 30`
3. After verification:
   - require `email_verified === true` (strict boolean);
   - require `sub` to be a UUID (it becomes the DB owner key);
   - require `roles` to include `tudocuatui:member`. The role check is Ming's only ban lever with an open join: removing the role takes effect within the 15-minute TTL.
4. Build the JWKS with `createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"), { cooldownDuration: 60_000, cacheMaxAge: 600_000 (≤ 1 h), timeoutDuration: ~5_000, headers: { "User-Agent": "tudocuatui-server" } })`.
   - Never honour `jku` / `x5u` / `jwk` from the header (jose does not by default).
   - Fail closed (401) when the JWKS is unreachable.
5. Config:
   - `MM_IDENTITY_ISSUER` validated as `https://<host>` with no path, no port and no trailing slash. Production must use exactly `https://api.mmlabs.online`, or hardcode it.
   - A dev-only `TUDO_AUTH_DISABLED=1` with a fixed dev `sub`, refused when `NODE_ENV=production` (exit 2).
   - Missing config in production → exit 2.
6. Logging: log `{event:"auth_denied", code}` with the code only. Never log the header, the token, the claims, `email` or the error object. Logging `sub` in the request line for audit is acceptable; email is not.
7. Unit tests (AC2):
   - wrong `alg` (HS256 signed with the public key, `none`, RS256);
   - wrong `aud`;
   - an `iss` with a prefix or suffix variant;
   - `typ` missing or `JWT`;
   - expired token, and `iat` / `exp` just outside 30 s;
   - unknown `kid` → one refetch, then no refetch within 60 s;
   - `email_verified` false, missing, or the string `"true"`;
   - missing `jti` / `sub`;
   - non-UUID `sub`;
   - roles without member;
   - oversized token;
   - a token in `?access_token=` is ignored.

**Ownership (IDOR).** Covers AC4 and R2.
1. Migration:
   - Add `user_id uuid` to `items`, `locations`, `item_photos`, `wear_logs` and `ai_settings`.
   - Make `ai_settings` keyed by `user_id` and drop the `id boolean` key.
   - `locations`: `unique (user_id, name)`.
   - Add composite FKs `(location_id, user_id) → locations(id, user_id)`, `(item_id, user_id) → items(id, user_id)` for photos and wear logs, and the same pattern for `parent_id`. Then the DB itself cannot hold cross-user references.
   - `items_with_stats` exposes `user_id`.
2. Backfill: never "first sign-in claims the unowned rows". On an open-join app, a stranger could win that race and take Ming's wardrobe.
   - Use an explicit one-shot step with Ming's `sub` from env or a CLI argument, run as a Ming step after he has registered and verified.
   - Columns stay nullable until the backfill, then `set not null` in a follow-up migration. Null-owner rows are invisible (fail closed).
   - Clear the legacy `ai_settings` key so Ming re-enters it. Do not carry v1 "single" ciphertext forward.
3. RLS: R2 and the init-migration comment promise `ENABLE` + `FORCE ROW LEVEL SECURITY` when `user_id` arrives. The plan must either do it, or record a decision to replace it with app-level enforcement. Doing it means:
   - a per-request transaction with `set_config('app.user_id', sub, true)`;
   - policies `user_id = current_setting('app.user_id', true)::uuid`;
   - `FORCE`, because the app role owns the tables;
   - a separate path for `photo-sweep`, which must see all rows: a BYPASSRLS role, or a sweep-only policy.

   My recommendation is RLS as defence in depth. It is High tier either way.
4. App level, regardless of (3): every function in `items.js`, `photos.js` and `ai/store.js` takes `owner` as a required first argument, and every statement filters on it.
   - `saveItem`: `on conflict (id) do update … where items.user_id = excluded.user_id`. When no row comes back, return 404 and never reassign `user_id`.
   - `wearItem`: insert via `select … from items where id=$1 and user_id=$2`; the delete subquery is scoped too.
   - `withLockedItem` lock: `where id=$1 and user_id=$2`.
   - `servePhoto`: join `item_photos` → `items` on `user_id`. A foreign id returns 404, the same as unknown.
5. Tests: a DB test suite with users A and B for every route and method. B must get 404 or a no-op, and A's rows and Drive files must be untouched. Add a static test that every SQL string in those modules mentions `user_id`.

**What replaces Access, by item.**

| Item | Requirement |
|---|---|
| `/api/photos/:id` | Fetch with Bearer and render as `blob:` URLs (cache in memory, `URL.revokeObjectURL` on sign-out or account switch). Change caching to `private, no-cache` plus the ETag, or add `Vary: Authorization`. Do not use a cookie: that brings CSRF back and needs a cookie design. |
| `/healthz` | Stays public, static body. `/readyz` can stay public (no detail in the body) or be restricted to localhost/Docker. Low priority. |
| Rate limits | Key the limiter per `sub`: AI save and test, photo PUT, item writes. Add a coarse per-IP limit on unauthenticated 401s using `CF-Connecting-IP`. That header is trustworthy only because the container has no published ports and only cloudflared reaches it; note this as an assumption. Make the photo in-flight cap per user, plus a global cap. |
| Quotas | Per-user caps on items, photos and total Drive bytes, enforced on the server. Without them, `open` join gives strangers free storage in Ming's Drive. |
| AI keys and `AI_KEK` | One row per `user_id`. Bump the AAD to `tudocuatui-ai-key|v2|<sub>|<provider>` so a ciphertext only opens for its owner. Decrypt only for the authenticated `sub`. A single KEK is fine. Document KEK rotation (re-seal all rows) now that the KEK protects many people's keys. Per-user limiter. The `/test` endpoint (T-018.2) must use the caller's own key only. |
| Drive sweep | Must stay global and unscoped (the referenced set covers all users), and the existing guards stay. If RLS lands, it needs a bypass role. Optionally tag uploads with `userId` in `appProperties` for later per-user cleanup or export. |
| CSRF | Keep the `Sec-Fetch-Site` guard and the JSON content-type rule. Bearer tokens already defeat classic CSRF. Send no CORS headers from TuDo: same origin, nothing needed. |

**SPA token handling (AC3).**
- Store the token in a module-scoped variable only: not React state that gets persisted, not context exported to devtools, never in storage, URLs or `console.*`.
- Single-flight refresh about 60 s before `exp`. On a 401 from TuDo, refresh once and retry once, then show the sign-in screen.
- Send the token only to same-origin `/api/*`. Build the header inside the repo's `fetch` wrapper and refuse absolute URLs.
- Tests: spy on `Storage.prototype.setItem` and `history` (the token never appears); check that `Authorization` is never sent to `api.mmlabs.online`. Boundary check: grep the built bundle and `check-image.sh` for token-like literals.
- Sign-out: `POST /api/v1/auth/logout`, drop the token, clear the in-memory wardrobe cache and blob URLs. Account switch does the same.
- `mm_account_id` in localStorage is fine (not a credential without the HttpOnly cookie).
- `mode.ts`: remove the Access opaque-redirect branch.

**CSP and headers** (on the SPA in `static.js`, not on `/api` JSON):
- `default-src 'self'; script-src 'self'; connect-src 'self' https://api.mmlabs.online; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`.
- Add `https://challenges.cloudflare.com` to `script-src` and `frame-src` if Turnstile is shown (login after 3 failures, signup).
- Ship it as `Content-Security-Policy-Report-Only` first if unsure, but enforce before Access is removed.
- Add `Strict-Transport-Security: max-age=31536000`.
- On the Identity side, register only `https://tudocuatui.mmlabs.online` in production `origins`; no localhost.

**Must land before Access is removed (ordering).**
1. Release N, with Access still on:
   - server checks both the Access JWT and the Identity Bearer token;
   - migration and backfill run;
   - all queries scoped by owner;
   - per-user AI and limits, quotas, CSP, `check-image.sh` updates (prod refuses no-identity config, `/api/items` without Bearer → 401, `MM_IDENTITY_*` in the env prefix allow-list).
2. Ming verifies sign-in and the two-user isolation with a second test account.
3. Release N+1: remove the Access check and the `CF_ACCESS_*` values. Then Ming deletes the Cloudflare Access application. That is a Ming step (M-n) and must be the last step.

The current code fails closed: if Access is removed early, the missing header gives 401 on everything. But removing Access before the IDOR work exposes all of Ming's data to any member.

### Risks
- Open signup plus open join plus Ming's personal Drive and shared server resources is an abuse surface. Quotas are mandatory, not optional.
- Revocation lag: up to 15 minutes after logout, a ban or a role removal (accepted by ADR-0005).
- JWKS egress from the container to `api.mmlabs.online`. If it hairpins through the same tunnel or host, an Identity outage means TuDo is down (fail closed).
- Moving to RLS is a broad refactor (every query in a transaction). Skipping it contradicts R2 unless a decision records that.
- A wrong `sub` in the backfill hides all existing data (recoverable) or gives it to the wrong account (not acceptable). Verify the `sub` before applying.
- Leftover local-mode fallback: if `/healthz` probing fails in production, a user silently writes into a device-global localStorage wardrobe.
- `check-image.sh`'s "no `KEY|SECRET|TOKEN` env name" rule: a new name like `MM_IDENTITY_*` is fine, but avoid names containing those words.

### Open questions for Ming
1. Is `open` join final, given that strangers' photos go into Ming's Google Drive? If yes, what per-user quotas (items, photos, MB)? Or should it be `approval` / `closed` for now?
2. RLS with `FORCE` (keeps R2) or app-level only (needs a new decision entry)?
3. Ming's `sub` for the backfill: who supplies it, and is it fine to clear the existing AI key so Ming re-enters it?
4. Is signup / Turnstile in scope in TuDo (it changes the CSP), or sign-in only, with signup elsewhere?
5. Account deletion and data export: when a user leaves Identity, what happens to their TuDo rows and Drive files? There is no webhook today.
6. `/readyz`: public, or internal only?
