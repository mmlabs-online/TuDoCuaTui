# T-019.10: Join flow UX

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, ui |
| Gate | plan-approval |
| Depends on | T-019.7 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
New users can join `tudocuatui` from the app once org-admin-api ships the join endpoint (USR-03b).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.10). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.10, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] `not_member` with `join_available` shows "Tiếp tục với <email>"; join, then token.
- [ ] A refused join shows Vietnamese copy.
- [ ] All checks pass; 390px and dark mode.

## Technical notes
- Files (likely): `src/features/auth/*`
- Upstream: org-admin-api USR-03b (join endpoint) must be live.

## Test plan
- See the umbrella plan *Tests to write* (T-019.10 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
