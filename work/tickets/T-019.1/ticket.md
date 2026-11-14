# T-019.1: Ownership expand migration and owner backfill

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-016 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/48 |

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
- 2026-11-14: **Plan approval waived** (Ming, in session: "bỏ qua bước xem plan, chạy thẳng T-019.1"). If plan.md comes back READY with no new High-tier decision beyond the approved umbrella plan (A1, A2, A13; D32, D37), the loop goes straight to implement; otherwise it stops and asks.
- 2026-11-14 (Ming: "đồng ý gỡ M-17 khỏi T-019"): M-17 is no longer a prerequisite to write or merge T-019.x code. `TUDO_OWNER_SUB` is only needed when the T-019.1 migration runs in production (M-18). The production release of T-019.1 waits until Ming has an Identity account (via TuDo's own sign-up from T-019.7, or another registered app); until then T-019.1+ can merge to `main` but no release that contains T-019.1 is cut (D37).
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff

### 2026-11-14 — claude — DONE
- Done: plan approval waived by Ming (no new High-tier decision); attempt 1 PASS; security review no 🔴. PR https://github.com/mmlabs-online/TuDoCuaTui/pull/48.
- In progress / next: Ming merges PR #48. No production release containing it until M-17 + M-18 (D37). Next slice: T-019.2.
- Gotchas: T-019.2's release needs `TUDO_OWNER_SUB` again (straggler rows); single-owner assertion noted on T-019.2.
