## Attempt 1 — 2026-11-19 — security-ai-generated-code-auditor

Scope: read-only review of the T-028.4 diff. Files read: `server/me.js`, `server/api.js`, `server/app.js`, `server/auth.js`, `server/identity.js`, `server/http.js`, `server/app.test.ts` (identity auth block), `server/identity.test.ts`, `server/me.test.ts`, `server/test/auth.ts`, `server/README.md` and `server/index.js` (ownerSub wiring), against plan.md (A1–A5) and impl-log.md. I could not run git or the checks. The implementer reports all four checks green (impl-log.md).

### Findings

No 🔴 or 🟡 findings.

**What I checked, item by item**

- **Auth guard, no bypass.** The `/api` and `/api/` prefix guard in `server/app.js:119-129` is unchanged and runs before `handleApi`. 401 and 503 answers come back before any routing.
  - `server/api.js:39-40` matches `/api/auth/me` only when `parts.length === 4 && a === "auth" && b === "me"`. The pathname is never decoded, so `/api/auth/%6De` does not match.
  - `/api/auth`, `/api/auth/me/`, `/api/auth/ME` and `/api/auth/me/x` all get 404 (test at `server/app.test.ts:562-570`).
  - The match sits before the `items/:id` and `photos/:id` patterns, and `a === "auth"` cannot collide with them.
  - The handler at `server/api.js:129` returns before the `isUuid(parts[3])` check, so `"me"` never hits the 400, and before `if (!pool)`, so no DB is touched.
- **Verification not loosened.** In `server/identity.js:115-142`, these are all unchanged: `jwtVerify` options (ES256 only, issuer, `aud=tudocuatui`, `typ=at+jwt`, required claims, `maxTokenAge` 12 h, 30 s tolerance), the `jku/x5u/jwk/x5c` header rejection, and the `aud`, `jti`, `email_verified === true`, canonical-`sub` and `tudocuatui:` role checks. The email is read only after every check has passed, and it never causes a token to be rejected (A1).
- **Email handling is type-safe.** `typeof payload.email === "string" && payload.email !== "" ? payload.email : null` (`server/identity.js:140-141`). The value is a signed claim that has already been verified. It goes back only to the same bearer, JSON-encoded by `sendJson`, with `nosniff` and `no-store`. Its size is bounded because the token is capped at 4096 chars.
- **Role reveals only the caller's own status (A2).** `server/me.js:9` does a strict `===` against `ownerSub`, which `server/index.js:78` sets via `ownerSubOf` (canonical UUID). The verifier also requires the canonical `sub`. If either value ever came in non-canonical, the result is `"user"`, so it fails safe. `TUDO_OWNER_SUB` never appears in a response. The body is a fresh object with exactly the keys `id`, `email` and `role`.
- **No DB access.** This is asserted for the 200, 405 and 503 paths with a recording pool (`server/app.test.ts:449-459, 478-534`).
- **Cache-Control.** `sendJson` sets `no-store` (`server/http.js:41`), and the test asserts it (`server/app.test.ts:456`).
- **CORS and origin.** No CORS headers are added, which matches the other `/api` routes. Only GET is allowed, so the `Sec-Fetch-Site` write check does not apply. The token is bearer-only, with no cookie, so cross-site reads are not possible.
- **405, 401 and 503.** The guard runs before the 405 (existing order). POST, PUT, PATCH, DELETE and HEAD return 405 with `Allow: GET` (A4). The 503 `auth_unavailable` response with `Retry-After: 30` passes through unchanged.
- **Logging.** No new log call on this path. The verifier success path does not log. The request line is `{ts,id,method,route,status,ms}`, and the route template has no identifier in it. The denied path logs only `{event, code}`. The test checks that no token, sub, email or jti appears in the logs and that `console` is never called (`server/app.test.ts:536-560`).
- **Secrets (R3).** `server/README.md` uses placeholders only (`TUDO_OWNER_SUB=<uuid>`, `DATABASE_URL=...`). Nothing new goes into `VITE_*` and no `src/` files change.

**💭 Notes (non-blocking, no change needed for PASS)**

1. `server/app.test.ts:559`: `vi.restoreAllMocks()` sits at the end of the test body. If an earlier `expect` fails, the `console` spies leak into later tests. Fix: move it to `afterEach(() => vi.restoreAllMocks())` or wrap the body in `try/finally`. This is test hygiene only.
2. `server/me.js:5`: the JSDoc types `ownerSub` as `UserId | string | null`, which is looser than the canonical `UserId | null` that production passes in. This is harmless because the comparison is exact and fails safe to `"user"`. Optional fix: narrow it to `UserId | null` (`server/api.js:61` also says `string | null`).
3. In the log test (`server/app.test.ts:550`), the 401 request is logged under route `/api`, not `/api/auth/me`, so the key-shape assertion covers only the 200 line. The global `JSON.stringify(logs)` check still covers the 401 path, so there is no gap.

### Follow-ups (out of scope)
- None beyond the plan's follow-ups: an SPA consumer and README error-code tidy-up.

### Verdict
**PASS** (security). This assumes the checks reported green in impl-log.md are confirmed by the reviewer's run.
