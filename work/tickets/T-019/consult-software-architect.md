# Consult — software-architect — T-019 (2026-11-13)

## Consult: software-architect on T-019 (TuDo sign-in through mmlabs Identity)

Read-only consult. Files read: `server/{app,api,access,index,items,http}.js`, `server/photos.js` (grep), `server/ai/store.js` (grep), `src/data/{mode,repo.http,useWardrobe,mappers}.ts`, `db/migrations/*.sql`, `deploy/deployment-repo/apps/tudocuatui/compose.yml`, org-admin-api `docs/consumers.md`, `docs/identity-architecture.md`, ADR-0004/0005, `work/backlog.md`, USR-03b, USR-07, and ricotdin `docs/architecture/auth.md`.

### Findings

**External dependencies**
- **F1. ricotdin cannot serve as a code reference.** It still runs its own EdDSA auth with refresh tokens (`ricotdin/docs/architecture/auth.md`), and its Identity work (USR-07) is still BACKLOG. TuDo would be a first consumer alongside it. The only usable references are `consumers.md` and the ADRs.
- **F2. Joining the app is a hard blocker that the ticket does not list.** `POST /auth/token` returns 403 `not_member` until the user is a member of `tudocuatui`. Joining (`POST /auth/apps/{key}/join`) only arrives with USR-03b. USR-07's `register-app` creates the app and its member role but assigns nobody, so even Ming has no route to a token. The only stopgap is a staff role assignment (USR-02c), which is behind a flag. USR-04 (verified email, D16) also blocks every token. Both are BACKLOG in `org-admin-api/work/backlog.md`.

**Server**
- **F3. The server change is small.** `jose@^6.2.17` is already a dependency. `server/access.js` already has the right shape: an injectable `jwks` and `{ok, code}`. But `app.js` only gets a yes/no answer today. Nothing carries an identity into `handleApi`, and `handleApi` and `items.js` take no user argument.

**Photos**
- **F4. Bearer tokens break photo display.** Photos render as `<img src="/api/photos/<id>">` (`mappers.ts:173`, `ItemCard`). An `<img>` request cannot carry an `Authorization` header. Today this works only because the Cloudflare Access cookie goes along. Once every `/api` route requires a bearer token, every photo returns 401. The ticket scope does not mention this.

**Multi-user data model (Ming's answer 2)**
- **F5. The schema assumes one user.** It affects much more than adding a column:
  - `locations.unique(name)` (`init.sql:36`).
  - `items` upsert is `on conflict (id) do update` with a client-chosen id (`items.js:63-71`). Scoped only by a `where`, this lets one user overwrite another user's row if the id is known.
  - `ai_settings` is a single row (`id boolean primary key check (id)`, D30).
  - `items_with_stats` is a plain view, so RLS would not apply through it unless it gets `security_invoker`.
  - `item_photos` and `wear_logs` reach the owner only through `items`.
  - All Drive photos sit in one `DRIVE_FOLDER_ID`, and `servePhoto` looks up by photo id only (`photos.js:265`).
  - `photo-sweep` and `migrate` work across all users.
- **F6. The 20261110 migration commits to RLS.** Its header says a later `user_id` comes with "ENABLE and FORCE ROW LEVEL SECURITY in the same migration". This is self-hosted Postgres, not Supabase, so RLS means a per-transaction `set_config('app.user_id', …, true)`. Today most queries are single `pool.query` calls outside a transaction, so this is a real refactor.

**Mode detection and current Access handling**
- **F7. Mode detection is independent of auth today, and should stay that way.** `detectMode` probes `/healthz`. Its `opaqueredirect → "yes"` branch and the one in `repo.http.ts:44` exist only for Cloudflare Access. Once Access is gone, a `/healthz` redirect should never happen. `useWardrobe` creates the repo once, with no token dependency.
- **F8. Production refuses to start without Access env.** `loadAccessConfig` throws unless `CF_ACCESS_*` is set, and `TUDO_ACCESS_DISABLED` is refused in production. `compose.yml` hard-codes `CF_ACCESS_*`. Removing Access is therefore a coordinated code + config + Cloudflare dashboard change. There is no CSP today, so `connect-src` needs no change.
- **F9. Stale docs.** `CLAUDE.md` still describes Supabase, `supabase/migrations`, signed Storage URLs and Cloudflare Pages. Migrations are actually in `db/migrations/` and hosting is a Node container. Reviewers enforcing R2/R4 literally will be confused. This is a follow-up for Ming, not part of this diff.

### Recommendations

**R-A. Server verifier: new `server/identity.js` using jose, not hand-rolled `node:crypto`** (AC2, checklist in `consumers.md`)
- Call `jwtVerify(token, jwks, {...})` with:
  - `algorithms: ["ES256"]`
  - `issuer: "https://api.mmlabs.online"`
  - `audience: "tudocuatui"`
  - `typ: "at+jwt"`
  - `requiredClaims: ["exp","iat","sub","jti"]`
  - `clockTolerance: 30`
- After it succeeds, also require `payload.email_verified === true` and `sub` to be a UUID (org-admin `users.id` is a uuid).
- Create the key set with `createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks.json"), {...})`:
  - `cacheMaxAge: 300_000` (matches the server's `max-age=300`, within the 1 h limit)
  - `cooldownDuration: 60_000` (refetch on an unknown `kid` at most once a minute)
  - `timeoutDuration: 5_000`
  - `headers: { "User-Agent": "tudocuatui-server" }`
- jose never reads `jku`, `x5u` or `jwk` from the token. Keep `jwks` injectable so tests can use `createLocalJWKSet` with a generated ES256 key. Test the cooldown with jose's `customFetch` hook.
- Read only `Authorization: Bearer`, never a cookie.
- Return `{ ok: true, userId: sub }` or `{ ok: false, code }`. Log only the jose `code` (as `access_denied` does now), never the header.
- Issuer, audience and JWKS URL come from server env (`MM_IDENTITY_ISSUER`, `MM_IDENTITY_AUDIENCE`). Validate them at startup and exit with code 2 on error, like the existing config loaders.

**R-B. Pass the identity through as a request context**
- `app.js` becomes `const auth = await verifier.verify(req)`, then `handleApi(..., { userId: auth.userId })`.
- Every function in `items.js`, `photos.js` and `ai/store.js` takes `userId` explicitly, and the server code (not the database) adds `where user_id = $n` everywhere.
- For the upsert, use `on conflict (id) do update … where items.user_id = excluded.user_id`. Zero rows means 404 (F5).
- This explicit `where` scoping is the main guard. RLS (R-D) is the second layer.

**R-C. Keep the transition reversible with a config switch rather than one big release** (rule: reversibility)
- `loadAuthConfig` accepts either:
  - Identity config, or
  - legacy Access config plus `TUDO_OWNER_SUB`, which maps every Access-authenticated request to Ming's `sub`.
- Production requires exactly one of the two.
- `/healthz` returns `{status:"ok", auth:"identity"|"access"}`, so the SPA knows whether to show the sign-in screen.
- This way the data-ownership migration and the scoped server ship and run in production under Access before any Identity dependency exists. Other TuDo releases are not blocked while USR-04/07/03b are pending. Rollback is an env change.
- Remove the Access branch in a final cleanup ticket.
- Alternative: one hard-cutover release. Less code, but nothing on `main` can ship until org-admin-api is ready. I recommend the switch.

**R-D. Data ownership migration (High tier; AC4)**
One expand migration that, in a single transaction:
- Adds `user_id uuid` to `locations`, `items`, `item_photos`, `wear_logs` and `ai_settings`.
- Backfills existing rows to Ming's `sub` and then sets `NOT NULL`:
  - `server/migrate.js` sets a session GUC (`tudo.legacy_owner_sub`) from env `TUDO_LEGACY_OWNER_SUB`, after checking it is a UUID. The value is not secret and goes only on the `migrate` service.
  - The migration raises if rows exist and the GUC is unset, so empty and test databases need nothing.
- Replaces `unique(name)` with `unique(user_id, name)`.
- Adds composite FKs: `items(user_id, location_id) → locations(user_id, id)`, and `item_photos` / `wear_logs (user_id, item_id) → items(user_id, id)`, so rows cannot point across users.
- Makes `ai_settings` PK `user_id` (supersedes D30).
- Recreates `items_with_stats` with `security_invoker = true` and a `user_id` column.
- Enables and forces RLS with policies on `current_setting('app.user_id', true)::uuid`.
- Adds a `withUser(pool, userId, fn)` helper (begin → `set_config` local → fn → commit).
- `photo-sweep` needs a deliberate bypass: a role with `BYPASSRLS`, or a documented owner-only path. Ask `database-optimizer` to confirm the Postgres version (≥15 for `security_invoker`) and the role/RLS setup.
- **Rejected: "the first user to sign in claims the orphan rows".** With an open join policy a stranger could win that race.

**R-E. Photos under bearer auth (F4)** — two options:
1. **Signed photo URLs (recommended).**
   - The list/save response carries `/api/photos/<id>?u=<sub-hash>&exp=<t>&sig=<HMAC>`, signed with a server-only secret (`TUDO_PHOTO_URL_KEY`, R3-compliant, never `VITE_*`).
   - `servePhoto` checks the signature and the expiry (for example 1 h) and is exempt from the bearer check for that route only.
   - The browser cache keeps working, and the signature is not the access token, so AC3 holds.
   - Cost: one new secret, and URLs expire on long-open tabs (refresh on the next list).
2. **Fetch with the bearer token into a Blob, then `URL.createObjectURL`.**
   - No new secret, but it loses HTTP caching, needs revoke bookkeeping, and costs memory on large grids.

Either way, scope Drive lookups by `user_id`.

**R-F. SPA auth module** (`src/features/auth/`, High tier; AC1, AC3)
- **`identityClient.ts`**: a thin `fetch` wrapper, about 100 lines, shaped like the `@mmlabs/auth-client` API so it can be swapped later.
  - Calls `login`, `logout`, `token`, and later `join` / `listAccounts`.
  - Every call uses `credentials:"include"`, `X-MM-App: tudocuatui` and `Content-Type: application/json`.
  - Errors map to typed codes: `session_invalid`, `not_member` (+`join_available`), `email_unverified`, `turnstile_required`, `rate_limited` (+`Retry-After`), `invalid_credentials`, `network`.
- **`tokenStore.ts`**:
  - Keeps the token in a module closure only.
  - One shared in-flight `getToken()` promise.
  - Refresh is scheduled from `expires_in` measured from receipt time, minus 60 s. This avoids client clock skew; never compare `exp` with `Date.now()`.
  - `invalidate()` on a 401.
  - Only `mm_account_id` goes to localStorage. On reload, a silent `POST /token` with the stored account id restores the session without re-entering the password.
- **`AuthGate.tsx`**:
  - Rendered by `main.tsx`/`App` only when `mode === "api"` and `/healthz` reports `auth === "identity"`.
  - States: checking → sign-in form → ready → error states.
  - Vietnamese copy lives in one place (R6). 390px and dark mode (R9).
  - Sign-out calls `POST /auth/logout {account_id}`, clears memory and `mm_account_id`, and shows the sign-in screen.
- **`repo.http.ts`**:
  - `createHttpRepo` takes a `getToken: () => Promise<string>` parameter (dependency inversion: `src/data` must not import `features/auth`).
  - It adds `Authorization: Bearer` and retries once after `invalidate()` on a 401.
  - A second 401 raises `ApiError(401)`, which the gate handles by returning to sign-in.
  - Its `same-origin` credentials stay.
- **Tests**:
  - The token never touches `localStorage`, `sessionStorage`, URLs or `console` (spy on all four).
  - Refresh timing.
  - Single-flight `getToken()`.
  - Error mapping.
  - Bearer header present, and the retry happens once only.

**R-G. Mode detection and local mode (R1)**
- Mode means "where the data lives"; auth is a separate layer applied only in API mode. Never fall back to local because Identity is unreachable or the token fails. That would show demo data and split writes into localStorage. Show a Vietnamese error with a retry instead.
- `pickMode` and the dev → local rule stay unchanged.
- Remove the `opaqueredirect` branches in `mode.ts` and `repo.http.ts` only in the cleanup ticket, after Access is gone.
- Load the auth module with a dynamic `import()` in API mode so the Figma Make preview and local mode never load it.

**R-H. Proposed split (each ≤ M)**

| # | Ticket | Size | Tier | Depends on |
|---|---|---|---|---|
| T-019.1 | Migration: `user_id` + RLS + composite keys + GUC backfill; `migrate.js` reads `TUDO_LEGACY_OWNER_SUB`; database tests | M | High (migration, plan-approval) | Ming's `sub` (M-item) |
| T-019.2 | Server scoping: `withUser` helper, every query in items/photos/ai/sweep takes `userId`; Access mode maps to `TUDO_OWNER_SUB`; database tests for cross-user isolation (including upsert-overwrite and cross-user location FK) | M | High | T-019.1 |
| T-019.3 | Identity verifier (`server/identity.js`) + `loadAuthConfig` switch + `/healthz` `auth` field; full checklist unit tests (alg, aud, iss, typ, exp, unknown kid / cooldown, `email_verified=false`, missing claims, User-Agent) | S–M | High (security) | T-019.2 |
| T-019.4 | Photo access under bearer auth (signed URLs per R-E) | S–M | security | T-019.3 |
| T-019.5 | SPA auth module + AuthGate + sign-in/out UI + `repo.http` bearer/retry; `not_member` / `email_unverified` / `session_invalid` screens | M | High (auth) | T-019.3, T-019.4 |
| T-019.6 | Join UX ("Tiếp tục với <email>" → `POST /join`) | S | High | T-019.5 + org-admin USR-03b API |
| T-019.7 | Cutover + cleanup: compose env (Identity vars, remove `CF_ACCESS_*`), runbook, then delete `access.js`, the `opaqueredirect` branches and Access tests; decisions.md entries superseding D23/D25/D30 | S | High (deploy config) | T-019.5, USR-04, USR-07 run for `tudocuatui`, Ming member of the app; Ming removes Access in Cloudflare after verifying |

- T-019.1–T-019.4 can be merged and released under Access before any org-admin-api work lands.
- T-019.5 can be built and unit-tested earlier. Manual end-to-end needs the registered app.
- Optional follow-ups: replace the in-repo client with `@mmlabs/auth-client` (after USR-03b); a sign-up page with Turnstile; logout across tabs via `BroadcastChannel`.

### Risks
1. **Open join and open sign-up let anyone with a verified email use TuDo's resources.** Their photos go into Ming's Google Drive and Postgres, and they could configure AI settings (identity-architecture §"Open join (D9)…"). Suggest per-user caps (item count, photo bytes) as a follow-up, and decide whether the AI feature is per-user bring-your-own-key or restricted.
2. **Dependency stall.** USR-04, USR-07 and USR-03b are all BACKLOG upstream. Without the join endpoint, not even Ming can get a token (F2). R-C keeps TuDo releasable meanwhile.
3. **JWKS egress.** The container must reach `api.mmlabs.online` through the `web` network (Cloudflare round trip from the home server). Cloudflare bot rules may block the default Node UA, so set `User-Agent`. If the JWKS fetch fails, every `/api` call is 401. Log a distinct `jwks_unavailable` code and consider failing `/readyz`? No: keep `/readyz` database-only, as was done for Drive.
4. **Revocation lag.** A logout or disabled user stays valid for up to 15 min (ADR-0005 TTL). Accepted upstream; document it.
5. **RLS refactor.** Missing `set_config` gives empty results (fail closed, but the UI looks like data loss). The upsert under RLS without the `where` guard raises an RLS error, which maps to 500 instead of 404.
6. **Cutover order.** Dropping Access before Identity sign-in has been verified in production leaves TuDo either open (if Access is removed while the server is still in Access mode with no Identity config, startup fails, which is fail closed and fine) or unreachable. The runbook must order: release → switch env → verify sign-in → remove the Access app.
7. **No staging origin for `tudocuatui`, and dev cannot use the production API** (`consumers.md`: loopback origins are ignored there). End-to-end testing happens only in production unless a local org-admin-api is run.
8. **`turnstile_required` after 3 failed logins.** If TuDo has no Turnstile widget, the user is locked out until the backoff ends. This needs a Turnstile site key valid for `tudocuatui.mmlabs.online`, or a deliberate deferral.

### Open questions (for Ming)
1. **Ming's `sub`.** He needs an Identity account (sign-up works now, USR-01). His `user.id` from the login response is needed for `TUDO_LEGACY_OWNER_SUB` and `TUDO_OWNER_SUB`. OK to put it in `compose.yml` as non-secret?
2. **Interim access while waiting on USR-03b.** Should TuDo wait for the join endpoint, or should Ming be made a member through the flag-gated staff assignment API (USR-02c) so the cutover can happen earlier?
3. **Sign-up and email verification UX.** Does TuDo host a sign-up form (Turnstile site key + where USR-04's verification link lands), or does it link to a central mmlabs account page (does one exist)?
4. **AI settings when there are several users.** Per-user key (each user brings their own), Ming-only, or a shared key with quotas? This supersedes D30 either way.
5. **Photo URLs.** OK with a new server-only secret for signed photo URLs (R-E option 1), or prefer blob fetching (no new secret)?
6. **Per-user quotas.** Should caps for open-join users be in M1 scope or a follow-up?
7. **Stale `CLAUDE.md`.** Should a separate `/solo` or `T-` ticket update its stack and rule text (Supabase → Node/Postgres, R2/R4 wording), since reviewers enforce it literally?
