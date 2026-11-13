# T-019.5: Identity JWT verifier and TUDO_AUTH_MODE switch

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-019.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
The Node server can verify mmlabs Identity access tokens, selected by `TUDO_AUTH_MODE` (`access` stays the production default until M-21).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.5). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.5, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] Verifier follows `consumers.md` (A11, A12): ES256 only, exact `iss`, `aud=tudocuatui`, `typ=at+jwt`, required claims, `email_verified === true`, UUID `sub`, a `tudocuatui:` role; unit tests for every failure case incl. unknown `kid` refetch cooldown.
- [ ] `TUDO_AUTH_MODE` validated; bad or missing config in production → exit 2.
- [ ] `/healthz` → `{status:"ok", auth}`; logs carry only the error `code`, never the token or claims.
- [ ] All checks pass.

## Technical notes
- Files (likely): `server/identity.js` (new), `server/app.js`, `server/index.js`, tests

## Test plan
- See the umbrella plan *Tests to write* (T-019.5 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
