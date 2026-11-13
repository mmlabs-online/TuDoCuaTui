# T-019.2: Scope items, locations, wear logs and photos by user_id (contract migration)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | T-019.1 |
| Needs Ming | M-18 |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
Every item, location, wear-log and photo query is scoped to the caller's `user_id`; under Access every request maps to `TUDO_OWNER_SUB`.

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.2). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.2, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] Contract migration: NOT NULL `user_id`, per-user uniques (`locations (user_id, name)`), composite FKs, PG ≥ 15 guard.
- [ ] `ctx.userId` comes only from the auth layer; every query in `items.js` and `photos.js` is scoped.
- [ ] PUT on another user's id → 404 and the original is unchanged; photo GET/PUT/DELETE of another user's id → 404.
- [ ] Per-user photo in-flight cap; the Drive sweep stays unscoped and keeps both users' files.
- [ ] A guard test fails when a SQL statement on a TuDo table lacks `user_id`; the image check starts with `TUDO_OWNER_SUB`.
- [ ] All checks pass.

## Technical notes
- Files (likely): `db/migrations/<new>.sql`, `server/items.js`, `server/photos.js`, `server/app.js`, `server/api.js`, `server/index.js`, `scripts/check-image.sh`, compose
- Needs T-019.1 released to production (M-18 backup done) before its contract migration ships.

## Test plan
- See the umbrella plan *Tests to write* (T-019.2 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
