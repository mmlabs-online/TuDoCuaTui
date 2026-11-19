# T-028.1: Harden the Identity token verifier (JWKS outage → 503, refuse key-carrying headers)

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | S |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/89 |

## Goal
A JWKS outage at mmlabs no longer signs everyone out of TuDoCuaTui, and tokens that try to carry their own key are refused.

## Feature reference
"Sign in with mmlabs" consumer spec (reference ricotdin; contract org-admin-api `docs/consumers.md`, which wins on conflict); `work/decisions.md` D50 (what TuDoCuaTui adopts and where it differs), D31/D32 (rows keyed by `sub`), D37, D38 (owner sub), D46 (12 h tokens).

## Scope
- `server/identity.js`: reject (401) any token whose protected header has `jku`, `x5u`, `jwk` or `x5c`.
- Keep the last good JWKS for up to 24 h when a refetch fails (unknown `kid` still refetches at most once a minute; cache ≤ 1 h otherwise).
- When no keys are available at all, answer **503** (stable code, e.g. `auth_unavailable`), not 401 (`server/app.js` auth path).
- `src/data/authFetch.ts`: a 503 from the auth layer keeps the session (no `onAuthLost`); only 401/403 sign out.

## Out of scope
- Renaming env vars (D50); a users table (D50).

## Acceptance criteria
- [ ] Tokens with `jku`/`x5u`/`jwk`/`x5c` → 401 (server tests).
- [ ] JWKS refetch failure keeps verifying with cached keys up to 24 h; after that, or with no keys ever, → 503 (fake clock tests).
- [ ] Unknown `kid` refetches at most once a minute (test).
- [ ] The SPA does not sign out on a 503 from the API (`authFetch` tests).
- [ ] All checks pass.

## Technical notes
- High path (`server/**`): plan approval; route to `security-ai-generated-code-auditor` at review.
- jose's `createRemoteJWKSet` drops keys on failure; likely a small custom key resolver around `createLocalJWKSet`.

## Notes / answers from Ming
Plan approved (2026-11-19) — Ming: "duyệt T-028.1" (assumptions accepted: Retry-After 30; unknown kid during an outage → 503; 24 h stale-key window per D50).
Ming 2026-11-19 (after review PASS + security PASS): fix the JWKS key filter in this PR — keep only EC P-256 signing keys (`use` sig or absent, `alg` ES256 or absent), ignore other key types instead of rejecting the whole set, fail only when none are left; add a test with an EC P-256 key next to an unknown-type key (security-review 🟡 1–2, review should-fix).

## Handoff

### 2026-11-19 — claude — BLOCKED
- Done: consult software-architect; plan READY (new server/jwks.js cache, key_in_header 401, 503 auth_unavailable + Retry-After 30, authFetch regression tests, copy).
- In progress / next: waiting for Ming's plan approval (server/** is High); then implement.
- Gotchas: identity.test.ts:244 changes to expect key_in_header (stricter, not weaker).

### 2026-11-19 — claude — DONE
- Done: plan approved; server/jwks.js cache (300 s fresh, ≤ 24 h stale on failure, 60 s cooldown, unknown kid ≤ 1/min, hardened fetch, EC P-256 signing keys only), key_in_header 401, 503 auth_unavailable + Retry-After 30, authFetch regression tests, copy. Attempt 1 PASS; attempt 2 (key filter, Ming's request) PASS; security PASS. PR https://github.com/mmlabs-online/TuDoCuaTui/pull/89.
- In progress / next: Ming merges PR #89; then T-028.2 (cross-tab session) and T-028.4 (/api/auth/me).
- Gotchas: decide whether a 403 should sign out in authFetch (follow-up).
