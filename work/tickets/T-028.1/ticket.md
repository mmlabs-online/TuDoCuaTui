# T-028.1: Harden the Identity token verifier (JWKS outage → 503, refuse key-carrying headers)

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Size | S |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-19T01:32:13Z |
| PR | — |

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

## Handoff
