# T-028.4: GET /api/auth/me

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P2 |
| Size | S |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | security |
| Gate | plan-approval |
| Depends on | T-028.1 |
| Needs Ming | M-36 |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-19T08:17:31Z |
| PR | — |

## Goal
The SPA can ask the API who the signed-in user is, as the shared mmlabs consumer spec expects.

## Feature reference
"Sign in with mmlabs" consumer spec (reference ricotdin; contract org-admin-api `docs/consumers.md`, which wins on conflict); `work/decisions.md` D50 (what TuDoCuaTui adopts and where it differs), D31/D32 (rows keyed by `sub`), D37, D38 (owner sub), D46 (12 h tokens). No users table: the identity comes from the verified token (D50, D31/D32).

## Scope
- `GET /api/auth/me` → `{ id: sub, email, role }` with `role` = `"owner"` when `sub` is `TUDO_OWNER_SUB` (D38), else `"user"`; behind the existing auth; no DB write.
- Optionally use it in the SPA after a token is obtained (only if the plan finds a real need).

## Out of scope
- Users table, link by email, admin role, tombstone (D50).

## Acceptance criteria
- [ ] Authenticated request → 200 with the token's `sub` and email and the role rule above (server tests).
- [ ] No or bad token → 401; method other than GET → 405.
- [ ] Nothing about the token is logged.
- [ ] All checks pass.

## Technical notes
- High path (`server/**`): plan approval; security auditor at review.

## Notes / answers from Ming

## Handoff

### 2026-11-19 — claude — BLOCKED
- Done: plan READY (GET /api/auth/me → {id, email, role} behind the existing auth guard; verifier also returns the email claim; new server/me.js; 405 Allow: GET; no DB access; no SPA change). No consult (area security only).
- In progress / next: waiting for Ming's plan approval (M-36; server/** is High); then implement; security auditor at review.
- Gotchas: assumptions A1–A5 in plan.md; identity.test.ts happy path and app.test.ts auth stubs gain email.
