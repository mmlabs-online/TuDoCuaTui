# T-028.4: GET /api/auth/me

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P2 |
| Size | S |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | security |
| Gate | plan-approval |
| Depends on | T-028.1 |
| Needs Ming | — |
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
