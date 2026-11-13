# T-019.3: Per-user AI settings

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-019.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
Each user has their own AI provider settings and encrypted key (D33).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.3). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.3, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] `ai_settings` primary key is `user_id`; the legacy ciphertext is cleared.
- [ ] AAD v2 binds the ciphertext to the `sub`: a ciphertext copied to another row does not open.
- [ ] Each user's get/put/delete is independent; per-user limiter windows with eviction.
- [ ] Parity test with `src/shared/ai` updated; all checks pass.

## Technical notes
- Files (likely): `db/migrations/<new>.sql`, `server/ai/*`

## Test plan
- See the umbrella plan *Tests to write* (T-019.3 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
