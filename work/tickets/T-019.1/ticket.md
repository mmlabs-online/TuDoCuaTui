# T-019.1: Ownership expand migration and owner backfill

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-016 |
| Needs Ming | M-17 |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
Every existing row gets an owner (`user_id` = Ming's mmlabs `sub`) without breaking the running code.

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.1). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.1, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] New migration file only; the four applied migrations are unchanged (`git diff --stat db/migrations`).
- [ ] After migrate with `TUDO_OWNER_SUB`, all five tables (`locations`, `items`, `item_photos`, `wear_logs`, `ai_settings`) have `user_id` = owner on every pre-existing row.
- [ ] Rows exist and owner unset → migration fails and the transaction rolls back; empty DB → passes; malformed owner → exit 2, value never printed.
- [ ] The existing API code still passes all current db tests (inserts work with nullable `user_id`).
- [ ] View `items_with_stats` keeps all old columns in order, `user_id` last.
- [ ] All checks pass.

## Technical notes
- Files (likely): `db/migrations/<new>.sql`, `server/migrate.js`, `server/migrator.js`, db tests
- Runnable only after M-17 (Ming's `sub`) is ticked.

## Test plan
- See the umbrella plan *Tests to write* (T-019.1 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
