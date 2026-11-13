# T-019: Sign in with mmlabs Identity (api.mmlabs.online)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | L (planner proposes a split) |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | architecture, security, db |
| Gate | plan-approval |
| Depends on | T-016 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
TuDo gets real accounts by using the shared mmlabs Identity service (`org-admin-api`, `api.mmlabs.online`) for sign-in, the
same way ricotdin is moving to it, so that the app no longer relies only on Cloudflare Access to know who is using it.

## Feature reference
- Not in `docs/feature-list.md` (the E1 Auth entries F-101/T-006 describe the removed Supabase login). `T-` ticket from
  Ming's request (2026-11-13): "ricotdin move sang sử dụng user service của API-admin. Plan để move sang dùng".
- `work/decisions.md`: D23 (no in-app login, Cloudflare Access in front), D25 (no RLS / no `user_id`, single user; "when a
  second user or in-app auth arrives, every table gets a `user_id`"), D30 (AI settings, single row).
- Reference (read-only clones, outside this repo):
  - `/home/user/mmlabs-online/org-admin-api`: `docs/consumers.md` (token + verification checklist),
    `docs/identity-architecture.md` (flows, API, D1–D20), `docs/adr/0004–0006`, `work/tickets/USR-07/ticket.md`
    (register an app from the CLI, first consumer ricotdin), `work/backlog.md` (USR-03b client libs, USR-04 email).
  - `/home/user/mmlabs-online/ricotdin`: the first consumer (FastAPI + React SPA).

## Scope
- SPA: sign-in / sign-out against `https://api.mmlabs.online/api/v1/auth/*` (`credentials: "include"`, header
  `X-MM-App: tudocuatui`, cookie `__Host-mm_device` set by the Identity API), `mm_account_id` in localStorage,
  per-app access token from `POST /api/v1/auth/token {audience:"tudocuatui"}` kept **in memory only**, refreshed
  before `exp`; `not_member` / `email_unverified` / `session_invalid` handled with Vietnamese UI copy.
- HTTP repo sends `Authorization: Bearer <token>` to the TuDo Node server.
- Node server: verify the JWT on every `/api` route per `consumers.md` (ES256 only, JWKS from
  `https://api.mmlabs.online/.well-known/jwks.json` cached with `kid` refetch limit, `iss` exact, `aud=tudocuatui`,
  `typ=at+jwt`, `email_verified === true`, required claims, leeway ≤ 60 s, never log tokens).
- Data ownership decision (Ming): stay single-user (allow-list of one `sub`) or add `user_id` to every table (D25 note).
- Ming items: register app `tudocuatui` in org-admin-api (origin `https://tudocuatui.mmlabs.online`, join policy),
  deploy config (issuer/JWKS URL as server env), Cloudflare Access decision.

## Out of scope
- Changes to org-admin-api itself (registration CLI, client libraries, email verification): tracked there.
- Organizations / org-aware tokens (org-admin-api USR-06).
- Local mode and the Figma Make preview: stay without login (R1).

## Acceptance criteria
- [ ] In API mode the app shows a sign-in screen until a valid `tudocuatui` token is obtained; sign-out revokes the account
      session (`POST /api/v1/auth/logout`) and returns to sign-in. Local mode is unchanged (no login).
- [ ] Every `/api` request without a valid token gets 401; the server's verification follows the `consumers.md`
      checklist, with unit tests for wrong `alg`, `aud`, `iss`, `typ`, expired token, unknown `kid`, `email_verified=false`.
- [ ] The access token never reaches localStorage, sessionStorage, URLs or logs (test + boundary check).
- [ ] Data ownership matches Ming's decision (single allowed `sub`, or `user_id` on every table with a new migration).
- [ ] All checks pass; works at 390px and in dark mode.

## Technical notes
- Files (likely): `src/data/repo.http.ts`, `src/data/mode.ts`, a new `src/features/auth/` (High tier), `server/app.js`,
  `server/access.js` (or a new verifier), `db/migrations/**` if `user_id` is added, `Dockerfile` / deploy env.
- Dependencies outside this repo (org-admin-api): USR-04 (verified email; no token before it, D16), registration of app
  `tudocuatui` (USR-07-style CLI), USR-03b (`@mmlabs/auth-client` + join flow). Until USR-03b, the SPA may need a small
  in-repo client.
- Same-site: `tudocuatui.mmlabs.online` and `api.mmlabs.online` share the registrable domain, so the cookie flow works
  (identity-architecture §7).
- Open questions for Ming:
  1. Keep Cloudflare Access in front of TuDo (defence in depth; note that Access also intercepts the SPA) or drop it?
  2. Single user (allow-list of Ming's `sub`) or multi-user with `user_id` on every table?
  3. Join policy for `tudocuatui`: `open` like ricotdin, or `closed`/`approval`?
- Risks: JWKS fetch from the Node server (egress, Cloudflare blocking default User-Agent), clock skew, token refresh while
  offline, existing single-user data must stay visible to Ming after the switch.

## Test plan
- Unit: server JWT verifier (all checklist cases, JWKS cache/refetch), SPA token store (memory only, refresh before
  `exp`), error mapping; HTTP repo sends the bearer token.
- Manual: sign in / out on a phone and desktop against production Identity, after Ming registers the app.

## Notes / answers from Ming
- 2026-11-13: Ming asked for a plan to move TuDo onto the org-admin-api user service, following ricotdin.

## Handoff
