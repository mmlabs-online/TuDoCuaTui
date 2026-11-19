Status: READY

# Plan — T-028.4: GET /api/auth/me

## Scope summary
- Ticket scope (quoted): "`GET /api/auth/me` → `{ id: sub, email, role }` with `role` = `"owner"` when `sub` is
  `TUDO_OWNER_SUB` (D38), else `"user"`; behind the existing auth; no DB write." and "Optionally use it in the SPA after
  a token is obtained (only if the plan finds a real need)." Out of scope: "Users table, link by email, admin role,
  tombstone (D50)."
- `work/decisions.md` D50 (2026-11-19): "(1) **no users table** — rows stay keyed by `user_id` = mmlabs `sub`
  (D31/D32); no `mmlabs_sub` column, no link-by-email, no `account_link_conflict`; `GET /api/auth/me` returns the token
  identity; (2) **no admin role** — `TUDO_OWNER_SUB` stays the only special user (D38)".
- D38: "The owner `sub` (`TUDO_OWNER_SUB`, required in both auth modes) …" — the only special user; the server already
  has it as `ownerSub` in `createApp` (`server/index.js:78`, `ownerSubOf(authConfig)`, canonical lowercase UUID).
- D31/D32: data is owned by the mmlabs `sub`; the verifier already returns the canonical `sub` as `userId`
  (`server/identity.js`, `userId !== sub` → `sub_invalid`).
- D46: tokens up to 12 h old — unchanged.
- Contract (read-only, org-admin-api `docs/consumers.md`, "Verifying (backend) checklist"): "Claims: `iss`, `aud`,
  `sub`, `email`, `email_verified`, `roles`, `iat`, `exp`, `jti`" and "8. Never log tokens." So the access token does
  carry `email`; the consumer contract defines no `/me` endpoint of its own (the `{ id, email, role }` shape comes from the
  ricotdin-style consumer spec via the ticket and D50). `email_verified` is already required `true` by the verifier.
- T-028.1 (merged): `/api/*` is guarded in `server/app.js` by `auth.authenticate(req)`; `result.unavailable` → 503
  `auth_unavailable` with `Retry-After: 30`; any other failure → 401 `unauthorized`; only then `handleApi` routes. This
  ticket reuses that guard unchanged.

**SPA use: none.** The SPA already knows the signed-in account's email from the Identity token flow
(`src/features/auth/tokenStore.ts` keeps `email`; T-028.3 "Continue as {email}" uses `GET /accounts`), nothing in the
UI shows a role, and `src/data/` has no consumer that needs the server's view of the identity. Adding a repo method
with no caller would be dead code (R7). Recorded as a follow-up instead.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Authenticated `GET /api/auth/me` → 200 `{ id, email, role }` exactly (no other keys), `id` = token `sub`, `email` = token `email`, `role` = `"user"` when `sub ≠ TUDO_OWNER_SUB`; `Cache-Control: no-store`; no DB access. | `server/app.test.ts › identity auth › GET /api/auth/me -> 200 {id, email, role:"user"} from the token, no-store, no pool call` |
| 2 | Same request with `sub = TUDO_OWNER_SUB` → `role: "owner"`. | `server/app.test.ts › identity auth › GET /api/auth/me as TUDO_OWNER_SUB -> role "owner"`; `server/me.test.ts › owner / user / no owner configured` |
| 3 | Token without a string `email` claim (absent, empty, non-string) still authenticates as before and answers `email: null`. | `server/app.test.ts › identity auth › GET /api/auth/me without an email claim -> email null`; `server/identity.test.ts › ok result carries email; absent, empty or non-string email -> null` |
| 4 | No token or a bad token → 401 `{error:{code:"unauthorized"}}`, no pool call. | existing `server/app.test.ts › identity auth › every /api route without a bearer, or with a bogus one -> 401, no pool call` with `["GET", "/api/auth/me"]` added to its route list |
| 5 | JWKS unavailable → 503 `auth_unavailable`, `Retry-After: 30` (T-028.1 passthrough). | `server/app.test.ts › identity auth › GET /api/auth/me while JWKS is unavailable -> 503 auth_unavailable, Retry-After 30` |
| 6 | Any method other than GET (POST, PUT, PATCH, DELETE, HEAD) with a valid token → 405 `method_not_allowed`, `Allow: GET`, no pool call. Without a token the guard answers 401 first (existing order). | `server/app.test.ts › identity auth › /api/auth/me other methods -> 405 Allow: GET` |
| 7 | Nothing about the token is logged: the request log line for this route is `{ts,id,method,route:"/api/auth/me",status,ms}`; no log entry contains the raw token, `sub`, `email` or `jti`; nothing goes to `console`. | `server/app.test.ts › identity auth › GET /api/auth/me logs only the route line; no token, sub, email or jti` (+ `console` spies not called) |
| 8 | Path matching is exact: `/api/auth`, `/api/auth/me/`, `/api/auth/ME`, `/api/auth/me/x` → 404 `not_found` (authenticated). | `server/app.test.ts › identity auth › /api/auth/me path variants -> 404` |
| 9 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- After deploy, signed in: open `https://<tudo host>/api/auth/me` in the browser devtools console with the app's token
  (e.g. `fetch("/api/auth/me", { headers: { Authorization: "Bearer " + <token> } })`) → `role: "owner"` for Ming's
  account, `email` = Ming's Identity email. Optional; no UI depends on it.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `server/me.js` (new) | Pure `meBody({ userId, email, ownerSub })` → `{ id: userId, email, role: ownerSub !== null && userId === ownerSub ? "owner" : "user" }`. | AC1–3; pure logic first (planner rule 6). | Yes (`server/**`) |
| `server/me.test.ts` (new) | Unit tests for `meBody`. | R8 | Yes |
| `server/identity.js` | On success also return `email`: `typeof payload.email === "string" && payload.email !== "" ? payload.email : null`. Update the `verify` JSDoc return type. Nothing else (no new rejection, no logging). | AC1, AC3 — the verifier is the only place that sees the payload. | Yes |
| `server/auth.js` | `AuthResult` ok branch becomes `{ ok: true, userId, email: string \| null }`. | Types for app.js/api.js. | Yes |
| `server/app.js` | Pass `email: result.email` and `ownerSub` into the `handleApi` context. No change to the guard. | AC1–2 | Yes |
| `server/api.js` | `match`: `parts.length === 4 && a === "auth" && b === "me"` → `{ route: "/api/auth/me", allow: "GET" }`. Context gets `email`, `ownerSub`. After the 405 / origin checks and **before** the `itemId`/`isUuid` check and the `!pool` check: `return sendJson(res, 200, meBody({ userId, email, ownerSub }))`. | AC1, AC6, AC8 | Yes |
| `server/test/auth.ts` | `fixedAuth(userId, email = null)` and `headerAuth()` return `email: null` (or the given email). | Typecheck of the new `AuthResult`. | Yes |
| `server/identity.test.ts` | Happy-path expectation at line 100 gains `email: "someone@example.com"`; new email-claim test. | AC3 | Yes |
| `server/app.test.ts` | `start()` auth returns `email: null` (line 37); `startIdentity` gets an optional `ownerSub`; new tests listed below; add `/api/auth/me` to the 401 route list. | AC1–8 | Yes |
| `server/README.md` | Endpoint table row: `GET /api/auth/me` → 200 `{ id, email, role }` (`role` `"owner"` for `TUDO_OWNER_SUB`, else `"user"`; `email` null when the token has none; from the verified token only, no DB access; `Cache-Control: no-store`). | Docs match behaviour. | Yes |

No `src/` change, no migration, no env change.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/me.test.ts › owner sub -> role "owner"` | AC2 |
| `server/me.test.ts › other sub -> role "user"; ownerSub null -> "user"` | AC1, AC2 |
| `server/me.test.ts › returns exactly {id, email, role}; email null passes through` | AC1, AC3 |
| `server/identity.test.ts › ok result carries email; absent, empty or non-string email -> null` (sign with `email` dropped, `""`, `42`; each `toEqual({ ok: true, userId: SUB, email: null })`; still `ok`) | AC3 |
| `server/app.test.ts › identity auth › GET /api/auth/me -> 200 {id, email, role:"user"} from the token, no-store, no pool call` (pool records calls; `ownerSub` = another UUID; `toEqual({ id: SUB, email: "me@example.com", role: "user" })`; `cache-control: no-store`; `calls` empty) | AC1 |
| `server/app.test.ts › identity auth › GET /api/auth/me as TUDO_OWNER_SUB -> role "owner"` (`ownerSub: SUB`) | AC2 |
| `server/app.test.ts › identity auth › GET /api/auth/me without an email claim -> email null` (`token({ email: undefined })`) | AC3 |
| `server/app.test.ts › identity auth › every /api route without a bearer, or with a bogus one -> 401, no pool call` (existing; add `["GET", "/api/auth/me"]`) | AC4 |
| `server/app.test.ts › identity auth › GET /api/auth/me while JWKS is unavailable -> 503 auth_unavailable, Retry-After 30` (same verifier setup as the existing T-028.1 503 test) | AC5 |
| `server/app.test.ts › identity auth › /api/auth/me other methods -> 405 Allow: GET` (POST, PUT, PATCH, DELETE, HEAD with a valid token; `allow` header `GET`; JSON code `method_not_allowed` except HEAD body; no pool call) | AC6 |
| `server/app.test.ts › identity auth › GET /api/auth/me logs only the route line; no token, sub, email or jti` (clear `logs`, one 200 call and one 401 call with a token signed for `aud: "other"`; the `/api/auth/me` entries have exactly the keys `ts,id,method,route,status,ms`; `JSON.stringify(logs)` contains none of `t`, `SUB`, `"me@example.com"`, `"jti-xyz-123"`; `vi.spyOn(console, …)` for log/error/warn/info/debug not called) | AC7 |
| `server/app.test.ts › identity auth › /api/auth/me path variants -> 404` (`/api/auth`, `/api/auth/me/`, `/api/auth/ME`, `/api/auth/me/x`, valid token) | AC8 |

## Approach
1. `server/me.js`: `// @ts-check`, one exported pure function `meBody` (JSDoc types `UserId`, `string | null`,
   `UserId | null`); returns a fresh object with exactly three keys.
2. `server/identity.js`: in `verify`, after all existing checks pass, compute `email` as above and return
   `{ ok: true, userId, email }`. The email is not validated further: it is a signed claim from Identity and is only
   echoed back to the same caller as JSON. Never logged (the verifier has no log call on this path).
3. `server/auth.js`: typedef update only.
4. `server/app.js`: add `email: result.email, ownerSub` to the `handleApi(...)` context object. The guard (401 / 503
   `auth_unavailable` / log lines `auth_denied` / `auth_unavailable`) stays as T-028.1 left it.
5. `server/api.js`: add the match entry and context fields (JSDoc). Handle the route right after the existing
   origin check, before `const itemId = parts[3]` (otherwise `"me"` would hit the `isUuid` 400) and before
   `if (!pool) …` (the route needs no DB). The existing per-route 405 gives `Allow: GET`; HEAD gets 405 like every
   other GET-only `/api` route. `sendJson` already sets `Cache-Control: no-store`.
6. Test helpers, tests, README as listed. Run the checks.

Rules:
- **R1**: server-only; the SPA keeps going through `WardrobeRepo`; no SPA change.
- **R3**: no secret added; nothing new in `VITE_*`; the token stays in the `Authorization` header.
- **R5**: nothing stored; `role` and `email` are computed per request from the verified token and `TUDO_OWNER_SUB`;
  no DB read or write (asserted by the "no pool call" tests).
- **R7**: no users table, no admin role, no link-by-email, no SPA consumer; anything else → follow-ups.
- **R8**: new pure logic (`meBody`) and the verifier change have unit tests; route tests for every AC.
- Logging: the route log line is the existing `{ts,id,method,route,status,ms}`; the handler adds no log call. The
  route template `/api/auth/me` contains no identifier.

## Specialist input used
None (area `security` has no consult; the security auditor runs at REVIEW).

## Assumptions
Needing Ming's approval (non-blocking; defaults used in this plan):
- **A1 — `email` null when the token has no usable email.** Identity always sends `email` today (consumers.md
  claim list), but a missing/empty/non-string claim does not reject the token (it did not before either); `/me` answers
  `email: null`. Alternative: reject such tokens with 401 — rejected here because it changes auth for every route (R7).
- **A2 — `role` tells the caller only their own role.** Ming's account sees `"owner"`, everyone else `"user"`. It
  reveals to a user that they are not the owner (and that an owner concept exists) but never who the owner is; no other
  user's data. Alternative: drop `role` — the ticket and D50 ask for it, so it stays.
- **A3 — response is the flat `{ id, email, role }`** as the ticket states, not wrapped (`{ me: … }`) like
  `{ item }` / `{ settings }` elsewhere in this API.
- **A4 — HEAD → 405** (`Allow: GET`), consistent with the other GET-only `/api` routes; only `/healthz`/`/readyz` and
  static allow HEAD.
- **A5 — no email normalisation** (no lowercasing/NFC): it is returned exactly as Identity signed it.

Other:
- Verifier/`AuthResult` change means existing auth stubs must carry `email` (`server/test/auth.ts`, `server/app.test.ts`
  line 37). The ok-branch field is required (`string | null`) so a future auth stub cannot silently omit it.
- Hotspots: none — no other ticket is `IN_PROGRESS`/`REVIEW`/`DONE` (T-028.1–T-028.3 are `MERGED`).
- Size: ~150–200 changed lines incl. tests; one cycle.

Existing tests that change:
- `server/identity.test.ts › verifier › happy path returns the canonical sub` (line 100): expected object gains
  `email: "someone@example.com"`.
- `server/app.test.ts` helper `start()` (line 37): stub result gains `email: null`; helper `startIdentity` gains an
  optional `ownerSub` argument (default `null`, existing callers unchanged).
- `server/app.test.ts › identity auth › every /api route without a bearer, or with a bogus one -> 401, no pool call`:
  route list gains `["GET", "/api/auth/me"]`.
- `server/test/auth.ts` `fixedAuth` / `headerAuth`: return `email` (default `null`); callers unchanged.

Follow-ups (not in this diff):
- SPA consumer for `/api/auth/me` (e.g. an account menu showing email/role, or a startup check that the server agrees on
  the identity) when a UI needs it: a `WardrobeRepo` method in `src/data/` then.
- `server/README.md` error-code paragraph still does not list 401 `unauthorized` / 503 `auth_unavailable` alongside
  the other codes (T-028.1 documented them in the auth paragraph only) — doc tidy-up if wanted.

## Blocking questions
None.

## Split proposal
None.
