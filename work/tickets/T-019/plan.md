Status: READY

# Plan — T-019: Sign in with mmlabs Identity (api.mmlabs.online)

This is the **umbrella plan** for a size-L ticket. It fixes the target design, splits the work into sub-tickets of size
M or smaller (T-019.1 … T-019.10), sets the rollout order, and lists the Ming items, the decisions to record and the
assumptions (A-n). Each sub-ticket still gets its own short plan from `/run`, which may refine file names but must not
widen the scope here. The first slice to run is **T-019.1**.

## Feature summary
Not in `docs/feature-list.md`. Ticket goal: "TuDo gets real accounts by using the shared mmlabs Identity service
(`org-admin-api`, `api.mmlabs.online`) for sign-in … so that the app no longer relies only on Cloudflare Access".

Ming's answers (ticket, *Notes / answers from Ming*, 2026-11-13):
1. "**Drop Cloudflare Access** in front of TuDo … mmlabs Identity becomes the only access control; the server-side
   Access JWT check is replaced by the Identity token check."
2. "**Multi-user; data belongs to the user id** … every table gets a `user_id` (the mmlabs `sub`), every query is
   scoped to it. Supersedes D25's single-user note; existing single-user rows need an owner (planner proposes how)."
3. "Join policy for app `tudocuatui`: **`open`**."

Decisions this changes (`work/decisions.md`):
- D23: "**No in-app authentication for now** (single user); **Cloudflare Access** protects `tudocuatui.mmlabs.online`".
- D25: "when in-app auth or a second user arrives, every table gets a `user_id` and RLS (`ENABLE` + `FORCE ROW LEVEL
  SECURITY`) in the same migration that adds them."
- D27: "images served by `GET /api/photos/:id` behind the Cloudflare Access check (no signed URLs)."
- D30: "One `ai_settings` row … AAD is `tudocuatui-ai-key|v1|single|<provider>`; adding users later means keys are
  re-entered … Rate limits are in memory (save 30/h, test 20/h)."

Upstream (org-admin-api `work/backlog.md`, 2026-11-13): USR-04 (verified email) BACKLOG, USR-07 (register app from
CLI) BACKLOG, USR-03b (join flow, `@mmlabs/auth-client`) BACKLOG, USR-02c (staff role assignment, flag-gated) DONE.
`consumers.md`: "joining an app or getting any token needs a verified email, which only works after USR-04" (D16 there).

### Target design
- **Mode stays "where data lives"** (R1). `detectMode` and local mode are unchanged; the Figma Make preview never loads
  the auth module. In API mode, `/healthz` returns `{status:"ok", auth:"access"|"identity"}`; only `identity` shows
  the sign-in gate. An auth failure never falls back to local mode (shows a Vietnamese error with retry).
- **SPA** (`src/features/auth/`, lazy-loaded): small in-repo Identity client (`login`, `logout`, `token`, later
  `join`) with `credentials:"include"`, `X-MM-App: tudocuatui`; token in a module closure only, single-flight
  `getToken()`, refresh at `expires_in − 60 s` measured from receipt; only `mm_account_id` in localStorage.
  `createHttpRepo({ getToken })` adds `Authorization: Bearer` to same-origin `/api` only, retries once after a 401.
- **Server**: `server/identity.js` (jose, ES256, exact `iss`, `aud=tudocuatui`, `typ=at+jwt`, required claims,
  `email_verified === true`, UUID `sub`, a `tudocuatui:*` role, 30 s leeway, remote JWKS with cache + kid-refetch
  cooldown + User-Agent). `app.js` passes `{ userId }` into `handleApi`; every query in `items.js`, `photos.js`,
  `ai/store.js` takes `userId` first and filters on it. A config switch (`TUDO_AUTH_MODE=access|identity`) lets the
  scoped server run under Access first, with every Access request mapped to `TUDO_OWNER_SUB` (Ming).
- **Database**: `user_id uuid not null` on `locations`, `items`, `item_photos`, `wear_logs`, `ai_settings`;
  per-user uniques; composite FKs so rows cannot reference another user's rows; `items_with_stats` exposes `user_id`;
  `ai_settings` keyed by `user_id`; then RLS `ENABLE` + `FORCE` with per-transaction `app.user_id` (D25).
- **Photos**: fetched by the SPA with the bearer token and shown as `blob:` URLs (A5).
- **AI settings**: one row per user, bring-your-own-key, AAD bound to `sub`, per-user rate limits (A6).

## Acceptance criteria → verification
Umbrella ACs (ticket) mapped to the sub-ticket that proves each one. Each sub-ticket's own ACs are in *Split proposal*.

| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "In API mode the app shows a sign-in screen until a valid `tudocuatui` token is obtained; sign-out revokes the account session (`POST /api/v1/auth/logout`) and returns to sign-in. Local mode is unchanged (no login)." | T-019.7: `src/features/auth/AuthGate.test.tsx` (gate states with a fake client; sign-out calls `logout {account_id}`, clears memory and `mm_account_id`); `src/data/mode.test.ts` unchanged and green; `pnpm dev` (local mode) shows demo items with no sign-in. |
| 2 | "Every `/api` request without a valid token gets 401; the server's verification follows the `consumers.md` checklist, with unit tests for wrong `alg`, `aud`, `iss`, `typ`, expired token, unknown `kid`, `email_verified=false`." | T-019.5: `server/identity.test.ts` (every case listed there) and `server/app.test.ts` (identity mode: no / bad bearer → 401 on every `/api` route, `/healthz` stays public). |
| 3 | "The access token never reaches localStorage, sessionStorage, URLs or logs (test + boundary check)." | T-019.7: `tokenStore.test.ts` spies on `Storage.prototype.setItem`, `history.pushState/replaceState`, `console.*`; `repo.http.test.ts` checks the header goes only to same-origin `/api`; T-019.5: `identity.test.ts` asserts logs carry `code` only; T-019.9 boundary: `scripts/check-image.sh` grep of `dist/` for `localStorage.setItem(` with token-like keys. |
| 4 | "Data ownership matches Ming's decision (… `user_id` on every table with a new migration)." | T-019.1–T-019.4: `schema.db.test.ts`, `migrator.db.test.ts`, two-user isolation in `api.db.test.ts` / `app.db.test.ts` / `ai/store.db.test.ts`, SQL guard test `server/scoping.test.ts`, RLS tests in T-019.4. |
| 5 | "All checks pass; works at 390px and in dark mode." | Every sub-ticket: typecheck, `pnpm format:check`, `pnpm test`, `pnpm build`; T-019.7: `SignInScreen.test.tsx` renders every state and checks `dark:` classes and no fixed width over 390px; the real-device check at 390px + dark is part of M-20. |

## Ming verification after merge
- After the T-019.1 release (M-17): app works as before under Access; `select count(*) … where user_id is null` is 0 on
  all five tables (read-only psql on the Mac).
- M-20 (identity switch, Access still on): sign in / out on a phone and on desktop against production Identity;
  photos load; a second test account sees an empty wardrobe and cannot see Ming's items; `not_member` shows the
  Vietnamese message for an account that is not a member.
- M-21: after Access is removed, an incognito window gets TuDo's sign-in screen (not the Access page);
  `curl -i https://tudocuatui.mmlabs.online/api/items` → 401.

## Files to create / modify
Grouped by sub-ticket. Sub-ticket plans may split a file further but not add areas.

| File | Change | Required because |
|---|---|---|
| **T-019.1** | | |
| `db/migrations/20261113120000_user_ownership_expand.sql` | new: nullable `user_id uuid` on 5 tables; backfill from GUC `tudo.owner_sub` (raise if rows exist and unset); indexes `items(user_id, created_at desc, id)`, `locations(user_id, sort_order, name)`; `create or replace view items_with_stats` appending `i.user_id` last | AC4, A1, A2 |
| `server/migrator.js` | accept an optional `ownerSub`; `select set_config('tudo.owner_sub', $1, true)` next to `set local tudo.migrating` | A2 (pass a value into SQL safely) |
| `server/migrate.js` | read `TUDO_OWNER_SUB`, UUID-validate, exit 2 if malformed, never print it | A2 |
| `db/migrations/README.md` | the ownership note, the two-step expand/contract rule for this change, rollback text | A1, R2 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | `TUDO_OWNER_SUB: <Ming's sub>` on the `migrate` service | A2, M-16 |
| `scripts/check-image.sh` | allow-list `TUDO_OWNER_SUB` in the env prefix check if needed | existing image check |
| `server/schema.db.test.ts`, `server/migrator.db.test.ts`, `server/migrate.cli.test.ts` | tests below | R8 |
| **T-019.2** | | |
| `db/migrations/2026111xxxxxxx_user_ownership_contract.sql` | backfill stragglers, `set not null` on 4 tables, `unique(user_id, name)` replaces `locations_name_key`, `unique(user_id, id)` on `items`/`locations`, composite FKs (`on delete set null (location_id)` / `(parent_id)`), PG ≥ 15 guard, location join `and l.user_id = i.user_id` in the view | AC4, A13 |
| `server/app.js`, `server/api.js` | carry `ctx.userId` from the auth layer; never from body/query/header | AC4 |
| `server/access.js`, `server/index.js` | Access mode returns `userId = TUDO_OWNER_SUB` (required in production in Access mode) | A4 |
| `server/items.js`, `server/photos.js` | `userId` first parameter on every function; `where … user_id = $n` everywhere; guarded upsert `where items.user_id = excluded.user_id` → 404; per-user photo in-flight cap plus the global cap | AC4, security F1/F4 |
| `server/photo-sweep.js` | stays unscoped; comment only | DB consult B |
| `server/scoping.test.ts` (new), `server/api.db.test.ts`, `server/app.db.test.ts`, `server/schema.db.test.ts`, `server/photo-sweep.db.test.ts`, `server/photos.test.ts` | two-user isolation, guard test | R8 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml`, `scripts/check-image.sh`, `server/README.md`, `.env.example` | `TUDO_OWNER_SUB` on the app service; image check starts with it | A4 |
| **T-019.3** | | |
| `db/migrations/2026111xxxxxxx_ai_settings_per_user.sql` | backfill, `user_id not null`, drop `id`, `primary key (user_id)`, clear legacy `v1:` ciphertext | A6 |
| `server/ai/store.js`, `server/ai/routes.js`, `server/ai/crypto.js`, `server/ai/rateLimit.js` | `userId` everywhere; AAD `tudocuatui-ai-key|v2|<sub>|<provider>`; per-user limiter `Map` with eviction | A6 |
| `server/ai/*.test.ts` (store.db, crypto, rateLimit, routes, parity) | per-user tests | R8 |
| **T-019.4** | | |
| `db/migrations/2026111xxxxxxx_rls.sql` | `enable` + `force row level security` on 5 tables, policies on `current_setting('app.user_id', true)::uuid`, view `security_invoker = true`, maintenance path for the sweep (A3) | D25, A3 |
| `server/db.js` | `withUser(pool, userId, fn)` (begin → `set_config('app.user_id', $1, true)` → fn → commit) | A3 |
| `server/items.js`, `server/photos.js`, `server/ai/store.js`, `server/photo-sweep.js` | run through `withUser` / the maintenance path | A3 |
| `server/rls.db.test.ts` (new) + existing db tests | no GUC → 0 rows; wrong GUC → 0 rows; sweep still sees all | R8 |
| **T-019.5** | | |
| `server/identity.js` (new) | verifier per `consumers.md` + A11/A12 | AC2 |
| `server/index.js`, `server/app.js` | `loadAuthConfig`: `TUDO_AUTH_MODE=access|identity`, `MM_IDENTITY_ISSUER` validated; exit 2 on bad config; `/healthz` adds `auth` | AC2, A4 |
| `server/identity.test.ts` (new), `server/app.test.ts`, `server/index.cli.test.ts` | checklist tests | AC2 |
| `server/README.md`, `.env.example` | env names, no values | docs |
| **T-019.6** | | |
| `server/photos.js` | `servePhoto` under bearer; `Cache-Control: private, no-cache` + ETag (304 after the ownership check) | A5 |
| `src/data/photoUrls.ts` (new), `src/data/mappers.ts`, `src/data/repo.http.ts` | fetch photo with bearer → object URL cache, revoke on sign-out; local mode keeps plain URLs | A5, R1 |
| tests: `src/data/photoUrls.test.ts`, `server/photos.test.ts` | | R8 |
| **T-019.7** | | |
| `src/features/auth/identityClient.ts`, `tokenStore.ts`, `errors.ts`, `copy.ts`, `AuthGate.tsx`, `SignInScreen.tsx` (+ tests) | sign-in / sign-out, error screens, Vietnamese copy in one place (R6) | AC1, AC3 |
| `src/data/repo.http.ts`, `src/data/useWardrobe.ts` | `getToken` injected (no import of `features/auth` from `src/data`); bearer + one retry | AC1 |
| `src/main.tsx` (or `src/App.tsx`) | lazy-load `AuthGate` only when `mode === "api"` and `auth === "identity"` | R1 |
| **T-019.8** | | |
| `server/http.js` / `server/static.js` (+ `static.test.ts`) | CSP and HSTS on SPA responses (A20) | AC3 defence |
| **T-019.9** | | |
| delete `server/access.js`, `server/access.test.ts`; edit `server/index.js`, `server/app.js`, `src/data/mode.ts`, `src/data/repo.http.ts` (drop `opaqueredirect`), `scripts/check-image.sh`, `deploy/…/compose.yml` (drop `CF_ACCESS_*`, add `TUDO_AUTH_MODE`/`MM_IDENTITY_ISSUER`), `server/README.md`, `.env.example`, `README.md` | Access removed from code and config | Ming answer 1 |
| **T-019.10** | | |
| `src/features/auth/identityClient.ts`, `JoinScreen.tsx` (+ tests) | "Tiếp tục với <email>" → `POST /api/v1/auth/apps/tudocuatui/join` | `not_member` + `join_available` |

## Tests to write
Main ones; each sub-ticket plan lists the full set.

| Test (file › name) | Covers |
|---|---|
| `server/migrator.db.test.ts` › upgrade with rows + owner backfills all 5 tables; rows + no owner fails; empty DB passes without owner | T-019.1, A2 |
| `server/migrate.cli.test.ts` › malformed `TUDO_OWNER_SUB` exits 2 and is not printed | T-019.1 |
| `server/schema.db.test.ts` › `user_id` present (T-019.1) / NOT NULL, per-user location names, cross-user FK rejected, location delete nulls only `location_id`, view's last column is `user_id` (T-019.2) | AC4 |
| `server/api.db.test.ts` › two users: list, PUT on other's id → 404 and original unchanged, DELETE, wear ±1, photo PUT/DELETE/GET → 404, body `user_id` ignored | T-019.2 |
| `server/scoping.test.ts` › every SQL string touching a TuDo table in `server/*.js`, `server/ai/*.js` mentions `user_id` (sweep allow-listed) | T-019.2/.3 |
| `server/photo-sweep.db.test.ts` › files of two users are both kept | T-019.2 |
| `server/ai/store.db.test.ts`, `crypto.test.ts`, `rateLimit.test.ts` › independent rows; wrong sub fails to open; per-user windows + eviction | T-019.3 |
| `server/rls.db.test.ts` › no `app.user_id` → 0 rows; other user's GUC → 0 rows; insert with other `user_id` rejected | T-019.4 |
| `server/identity.test.ts` › HS256/none/RS256 rejected; wrong `aud`; `iss` prefix/suffix variants; `typ` missing/`JWT`; expired and `iat`/`exp` outside 30 s; unknown `kid` → one refetch then none within 60 s (`customFetch`); `email_verified` false/missing/`"true"`; missing `jti`/`sub`; non-UUID `sub`; no `tudocuatui:` role; token > 4 KB; `?access_token=` ignored; JWKS down → 401 `jwks_unavailable`; logs carry only `code` | AC2 |
| `server/app.test.ts` › identity mode: `/api/*` without bearer → 401, `/healthz` → `{auth:"identity"}` | AC2 |
| `src/features/auth/tokenStore.test.ts` › memory only (storage/history/console spies), single-flight, refresh at `expires_in − 60 s` with fake timers, `invalidate()` | AC3 |
| `src/features/auth/identityClient.test.ts` › headers + credentials; error mapping `session_invalid`, `not_member` (+`join_available`), `email_unverified`, `turnstile_required`, `rate_limited` (+`Retry-After`), `invalid_credentials`, `network` | AC1 |
| `src/data/repo.http.test.ts` › bearer on same-origin `/api` only; one retry after 401; second 401 → `ApiError(401)` | AC1, AC3 |
| `src/data/photoUrls.test.ts` › bearer fetch, cache by id, revoke on clear | T-019.6 |

## Approach
1. **Ming items first:** M-16 (Ming's `sub`) before T-019.1 merges; backup (M-17) before its release.
2. **Ownership under Access (T-019.1 → T-019.2 → T-019.3 → T-019.4).** Each merges and releases on its own while
   Access stays on; the server maps every Access request to `TUDO_OWNER_SUB`. `main` stays releasable after every
   merge (two-step migration, A1). R2: new migration files only, never editing applied ones; D25 amended for RLS
   timing (A3). R5: the view still derives stats.
3. **Identity on the server (T-019.5)** behind `TUDO_AUTH_MODE`; production keeps `access` until M-20.
4. **Photos (T-019.6), SPA sign-in (T-019.7), CSP (T-019.8)** can be built and unit-tested before the upstream items;
   R1: auth code is lazy-loaded in API + identity mode only; R3: no secret added (`MM_IDENTITY_ISSUER` and
   `TUDO_OWNER_SUB` are not secret); R6: copy in `src/features/auth/copy.ts`; R9: 390px + dark.
5. **Upstream gate:** USR-04 and USR-07 done in org-admin-api; M-18 (register app), M-19 (Ming verified + member).
6. **Switch (M-20):** release with T-019.5–T-019.8, set `TUDO_AUTH_MODE=identity` in compose, Access still on. Verify.
   Rollback = set the env back to `access`.
7. **Cleanup (T-019.9):** remove the Access code path and `CF_ACCESS_*`; release.
8. **Last Ming step (M-21):** delete the Cloudflare Access application.
9. **After USR-03b:** T-019.10 (join UX) so other users can join; until then only staff-assigned members get tokens.

### Rollout order (summary)
`M-16 → T-019.1 → M-17 + release → T-019.2 → release → T-019.3 → T-019.4 → release` (all under Access) ·
`T-019.5, T-019.6, T-019.7, T-019.8` (merge any time, prod stays `access`) · `USR-04 + USR-07 upstream → M-18 → M-19`
· `release + M-20 (identity on, Access still on, verify)` · `T-019.9 → release` · `M-21 remove Access` ·
`USR-03b upstream → T-019.10`.

### Ming items (proposed; `/run` adds them to `work/ming-todo.md`)
- **M-16 — Your mmlabs `sub`.** Create / use your account on `api.mmlabs.online` (sign-up exists, USR-01); read
  `user.id` from the login response (or ask the org-admin-api operator). Paste it under T-019 *Notes / answers from
  Ming*. Not secret. Double-check it: a wrong value hands the wardrobe to another account.
- **M-17 — Backup before the ownership migration.** Before merging the first release PR that contains T-019.1: take a
  manual `pg_dump` of `tudocuatui` on the Mac (in addition to the deploy's `backup` step) and keep it; after deploy,
  run the read-only `user_id is null` count (expect 0).
- **M-18 — Register app `tudocuatui`** in org-admin-api production (USR-07 CLI): origin
  `https://tudocuatui.mmlabs.online` only (no localhost), `join_policy = open`.
- **M-19 — Make your account usable:** verify your email (after USR-04) and become a member of `tudocuatui` through
  the staff role assignment (USR-02c) until USR-03b ships the join flow (A9).
- **M-20 — Switch production to Identity (Access stays on):** release containing T-019.5–T-019.8; set
  `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER: https://api.mmlabs.online` in the release PR's compose; verify
  sign-in/out on phone and desktop, photos, and isolation with a second test account temporarily added to the Access
  policy (A16). Rollback: `TUDO_AUTH_MODE: access`.
- **M-21 — Remove Cloudflare Access (last step):** only after T-019.9 is released and M-20 verified: delete the Access
  application for `tudocuatui.mmlabs.online`; check incognito shows TuDo's sign-in and `/api/items` → 401.

### Decisions to record (orchestrator writes them after plan approval)
- **D31 (amends D23):** TuDo signs in with mmlabs Identity (`api.mmlabs.online`, app `tudocuatui`, join `open`);
  multi-user, data owned by the mmlabs `sub`; Cloudflare Access stays until Identity sign-in and owner scoping are
  verified in production (M-20), then is removed (M-21). Local mode unchanged (R1).
- **D25 amendment:** ownership = `user_id uuid` (mmlabs `sub`) on every table, scoped in every Node query plus
  composite FKs; RLS `ENABLE` + `FORCE` arrives in its own migration (T-019.4) before Access is removed, not in the
  migration that adds `user_id`; the ownership change uses two migrations (expand, then contract) (A1, A3).
- **D30 amendment:** `ai_settings` is one row per user (BYOK); AAD `…|v2|<sub>|<provider>`; legacy `v1` ciphertext
  cleared; rate limits per user (A6).
- **D27 amendment:** `GET /api/photos/:id` sits behind the Identity bearer check; the SPA fetches photos as blobs; still
  no signed URLs (A5).

## Specialist input used
- software-architect: adopted F2 (join/USR-04 blockers → M-18/M-19, A9), F4 (photos), F7 (mode stays data-only, A14),
  R-A verifier, R-B request context, R-C reversible switch (A4), R-F SPA module, R-G, R-H split (re-ordered, RLS and
  CSP added as own slices). Rejected R-D "one migration with RLS" in favour of A1/A3 (keeps `main` releasable).
  F9 stale `CLAUDE.md` → follow-up (A18).
- database-optimizer: adopted A (columns, GUC backfill, composite FKs with `set null (col)`, per-user uniques,
  indexes, view column last), B (one Drive folder, DB is authority, sweep unscoped), C (userId first param, guarded
  upsert, scoped `wearItem`), D tests. Not adopted: "single one-way file" (A1) and "no RLS in this ticket" (A3,
  D25 asks for RLS). Drive `appProperties.userId` left out (not needed for authorization; follow-up).
- security auditor: adopted the verifier rules and tests, role check (A11), per-user AI/AAD/limits (A6), per-user
  photo in-flight cap, blob photos + cache headers (A5), CSP/HSTS (A20), ordering (Access last), explicit owner, clear
  legacy AI key. Quotas → A7 (follow-up), sign-up/Turnstile → A8, account deletion → A19, `/readyz` stays public
  with no detail (no change).

## Assumptions
- **A1 — Two-step migration (expand → contract), default.** Expand (T-019.1): nullable `user_id`, backfill, indexes,
  view column; old code keeps working. Contract (T-019.2 / T-019.3, shipped with the scoped code): straggler backfill,
  NOT NULL, uniques, composite FKs, `ai_settings` PK. Alternative: one one-way file + restore-from-backup rollback.
- **A2 — Explicit owner, default.** Existing rows go to `TUDO_OWNER_SUB` (Ming's `sub`, M-16), passed by `migrate.js`
  as GUC `tudo.owner_sub`; the migration raises if rows exist and it is unset; empty DBs need nothing. Never "first
  sign-in claims the rows" (open join). The value is non-secret and goes in `compose.yml`.
- **A3 — RLS now, as its own slice T-019.4, default** (D25; architect + security). It must merge before M-21.
  Sweep/migrations use a documented maintenance GUC path (no new DB role: D24 one owner role). Alternative: app-level
  scoping only now, RLS as a follow-up after cutover (database-optimizer) — needs D25 amended that way instead.
- **A4 — Reversible auth switch, default.** `TUDO_AUTH_MODE=access` maps every Access request to `TUDO_OWNER_SUB`;
  `identity` uses the verifier; production requires exactly one valid config. Alternative: hard cutover (nothing
  ships until upstream is ready).
- **A5 — Photos by bearer fetch → `blob:` URLs, default** (security; D27 "no signed URLs" stays; no new secret).
  `Cache-Control: private, no-cache` + ETag. Alternative: HMAC-signed short-lived URLs (architect; new server secret
  `TUDO_PHOTO_URL_KEY`, D27 amended).
- **A6 — AI settings per user, bring-your-own-key, default.** Legacy `v1` ciphertext is cleared (the KEK is not yet
  deployed: T-018.2 is BACKLOG), AAD v2 bound to `sub`, per-user limiter with eviction. Alternatives: Ming-only AI,
  or shared key with quotas.
- **A7 — Per-user quotas (items, photo bytes) are out of T-019, default;** a follow-up `T-` ticket is proposed.
  T-019.2 includes only the per-user photo in-flight cap (the global cap becomes a cross-user DoS). Ming may make M-21
  wait for the quota ticket (security calls quotas mandatory with open join + his Drive).
- **A8 — No sign-up or Turnstile in TuDo, default.** Sign-in only; `turnstile_required` and `rate_limited` show a
  Vietnamese "thử lại sau" message with the wait time; `email_unverified` tells the user to verify by email. Sign-up
  page + Turnstile site key (and CSP `challenges.cloudflare.com`) is a follow-up.
- **A9 — Interim membership via USR-02c, default.** Ming becomes a member by staff role assignment so the switch does
  not wait for USR-03b; other users can join only after T-019.10. USR-04 has no workaround (no token without a
  verified email).
- **A10 — In-repo Identity client** shaped like `@mmlabs/auth-client`; swapping it in after USR-03b is a follow-up.
- **A11 — Role check:** the verifier requires at least one `tudocuatui:`-prefixed entry in `roles` (Ming's ban lever).
- **A12 — Verifier details:** jose (already a dependency), `algorithms:["ES256"]`, issuer from `MM_IDENTITY_ISSUER`
  validated as `https://<host>` (production must equal `https://api.mmlabs.online`), audience constant `tudocuatui`,
  `clockTolerance: 30`, JWKS `cacheMaxAge 300 s`, `cooldownDuration 60 s`, `timeoutDuration 5 s`,
  `User-Agent: tudocuatui-server`; only `Authorization: Bearer`; fail closed; `/readyz` stays DB-only.
- **A13 — Production Postgres is ≥ 15** (CI runs 17); the contract migration raises on `server_version_num < 150000`.
- **A14 — Mode detection unchanged;** no fallback to local on auth failure; `opaqueredirect` branches removed only in
  T-019.9.
- **A15 — 15-minute revocation lag** (ADR-0005 TTL) accepted and documented.
- **A16 — Isolation check in production** uses a second test account temporarily allowed in the Access policy.
- **A17 — Hotspots:** T-019.7 edits `src/main.tsx` / `src/App.tsx`; T-019.2/.3/.9 edit `compose.yml`,
  `scripts/check-image.sh`, `server/index.js`, `server/ai/*`, which T-018.2 (BACKLOG) also edits — whichever merges
  second rebases.
- **A18 — Stale `CLAUDE.md`** (Supabase wording in Stack/R2/R4): Ming's follow-up, not in any T-019 diff.
- **A19 — Account deletion / data export** (no webhook from Identity): follow-up `purge-user` script.
- **A20 — CSP + HSTS (T-019.8) is included,** because the token now lives in JS memory; it must be enforced before
  M-21 (`connect-src 'self' https://api.mmlabs.online`, `img-src 'self' blob: data:`, fonts.googleapis/gstatic).

## Blocking questions
None. Every open choice has a default above (A1–A20); Ming can overturn any of them at plan approval.

## Split proposal
Ticket is L. Sub-tickets (each ≤ M). This plan's first runnable slice is **T-019.1**.

| ID | Title | Size | Tier / Gate | Depends on |
|---|---|---|---|---|
| T-019.1 | Ownership expand migration + owner backfill | M | High (migration) / plan-approval | T-016; Needs Ming M-16 |
| T-019.2 | Scope items, locations, wear logs, photos by `user_id` + contract migration; Access mode → owner `sub` | M | High (migration, deploy config) / plan-approval | T-019.1 released (M-17) |
| T-019.3 | Per-user AI settings (PK, AAD v2, per-user limits) | S–M | High (migration, security) / plan-approval | T-019.2 |
| T-019.4 | RLS `ENABLE` + `FORCE` with per-request `app.user_id` | M | High (migration) / plan-approval | T-019.2, T-019.3 |
| T-019.5 | Identity JWT verifier + `TUDO_AUTH_MODE` switch + `/healthz auth` | M | High (auth, security) / plan-approval | T-019.2 |
| T-019.6 | Photos under bearer auth (blob URLs, cache headers) | S | security / none | T-019.5 |
| T-019.7 | SPA sign-in / sign-out, token store, AuthGate, bearer in HTTP repo | M | High (`src/features/auth`) / plan-approval | T-019.5, T-019.6 |
| T-019.8 | CSP and HSTS for the SPA | S | security / none | T-019.7 |
| T-019.9 | Cutover cleanup: remove Access code + `CF_ACCESS_*`, Identity env in compose | S | High (deploy config) / plan-approval | T-019.4, T-019.7, T-019.8; M-20 verified |
| T-019.10 | Join flow UX ("Tiếp tục với …") | S | High (auth) / plan-approval | T-019.7; org-admin-api USR-03b |

Upstream gates outside this repo: USR-04 (before M-19/M-20), USR-07 (before M-18), USR-03b (before T-019.10).

**T-019.1 — Ownership expand migration (first slice).**
Goal: every existing row gets an owner without breaking the running code.
ACs: (1) new file only, four applied migrations unchanged (`git diff --stat db/migrations`); (2) after migrate with
`TUDO_OWNER_SUB`, all five tables have `user_id` = owner on every pre-existing row; (3) rows exist + owner unset →
migration fails, transaction rolled back; empty DB → passes; malformed owner → exit 2, value never printed;
(4) the existing API code still passes all current db tests (inserts work with nullable `user_id`); (5) view keeps all
old columns in order, `user_id` last; (6) checks green. Tests: see *Tests to write* (T-019.1 rows) plus re-running
`api.db.test.ts` unchanged.

**T-019.2 — Owner scoping (items, locations, wear, photos).**
ACs: contract migration (NOT NULL, per-user uniques, composite FKs, PG guard); `ctx.userId` only from the auth layer;
every query scoped; PUT on another user's id → 404, original unchanged; photo GET/PUT/DELETE of another user → 404;
per-user photo in-flight cap; sweep unscoped and keeps both users' files; SQL guard test; image check starts with
`TUDO_OWNER_SUB`.

**T-019.3 — Per-user AI settings.** ACs: `ai_settings` PK `user_id`; legacy ciphertext cleared; v2 AAD with `sub`
(ciphertext copied to another row does not open); each user's get/put/delete independent; per-user limiter windows
with eviction; parity test updated.

**T-019.4 — RLS.** ACs: `ENABLE` + `FORCE` on all five tables; view `security_invoker`; every scoped call runs in
`withUser`; no GUC → 0 rows; another user's GUC → 0 rows; sweep and migrations still work through the documented
maintenance path; all T-019.2/.3 isolation tests still green.

**T-019.5 — Identity verifier.** ACs: ticket AC2 with the full case list (A11, A12); `TUDO_AUTH_MODE` validated,
exit 2 on bad/missing config in production; `/healthz` → `{status:"ok", auth}`; logs carry only `code`.

**T-019.6 — Photos under bearer.** ACs: SPA fetches photos with the bearer and renders `blob:` URLs, revoked on
sign-out; local mode unchanged (demo URLs); server photo responses `private, no-cache` + ETag, 304 only after the
ownership check.

**T-019.7 — SPA sign-in.** ACs: ticket AC1 and AC3; error copy for `not_member`, `email_unverified`,
`session_invalid`, `turnstile_required`, `rate_limited`, `network`; reload restores the session silently via
`mm_account_id`; 390px + dark; auth code not in the local-mode path (lazy import).

**T-019.8 — CSP/HSTS.** ACs: CSP header on SPA responses (A20), HSTS; app and fonts load; `static.test.ts` checks
the header.

**T-019.9 — Cutover cleanup.** ACs: no `access.js`, no `CF_ACCESS_*`/`TUDO_ACCESS_DISABLED` anywhere outside
`work/`; production requires identity config; `check-image.sh` asserts `/api/items` without bearer → 401;
`opaqueredirect` branches gone with tests updated; runbook text for M-21.

**T-019.10 — Join UX.** ACs: `not_member` with `join_available` shows "Tiếp tục với <email>"; join then token; join
refused shows Vietnamese copy.

Follow-ups (not in T-019): per-user quotas (A7), sign-up + Turnstile (A8), swap to `@mmlabs/auth-client` (A10),
`purge-user` / export (A19), `CLAUDE.md` refresh (A18), Drive `appProperties.userId`, cross-tab sign-out.
