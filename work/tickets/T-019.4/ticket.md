# T-019.4: Row level security with per-request app.user_id

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-019.2, T-019.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
Postgres enforces ownership as a second layer: RLS `ENABLE` + `FORCE` on every TuDo table (D32).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.4). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.4, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] `ENABLE` + `FORCE` RLS on all five tables; view `security_invoker`.
- [ ] Every scoped call runs in `withUser`; no GUC → 0 rows; another user's GUC → 0 rows.
- [ ] Sweep and migrations still work through the documented maintenance path.
- [ ] All T-019.2/T-019.3 isolation tests still green; all checks pass.

## Technical notes
- Files (likely): `db/migrations/<new>.sql`, `server/db.js` (or new helper), `server/items.js`, `server/photos.js`, `server/ai/store.js`, `server/photo-sweep.js`

## Test plan
- See the umbrella plan *Tests to write* (T-019.4 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
