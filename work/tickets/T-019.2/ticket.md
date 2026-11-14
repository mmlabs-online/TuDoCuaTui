# T-019.2: Scope items, locations, wear logs and photos by user_id (contract migration)

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | T-019.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | claude@2026-11-14T16:16:11Z |
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
- 2026-11-14: **Plan approved** (Ming, in session: "duyệt T-019.2"; A1–A19 as in plan.md, one ticket, no split).
- 2026-11-14 (T-019.1 security review, rec 2): the straggler backfill must, before NOT NULL, raise with a constant message when `count(distinct user_id) where user_id is not null` > 1 or differs from the `tudo.owner_sub` GUC (no ownership split across two identities); the migrator must keep printing only `err.message`, never PG `detail` (which will contain full rows once NOT NULL/checks exist).
- 2026-11-14 (Ming: "đồng ý gỡ M-17 khỏi T-019"): M-17 is no longer a prerequisite to write or merge T-019.x code. `TUDO_OWNER_SUB` is only needed when the T-019.1 migration runs in production (M-18). The production release of T-019.1 waits until Ming has an Identity account (via TuDo's own sign-up from T-019.7, or another registered app); until then T-019.1+ can merge to `main` but no release that contains T-019.1 is cut (D37).
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff

### 2026-11-14 — claude — BLOCKED
- Done: consults (software-architect, database-optimizer) and plan.md (Status READY): contract migration `20261114120000`, `server/user.js` (branded `UserId`), required `auth.authenticate`, owner in every mode (exit 2), scoped `items.js`/`photos.js`, per-user photo cap 2 / total 3, compose owner anchor, check-image cases, guard + two-user isolation tests; A1–A19.
- In progress / next: Ming approves the plan, then implement → review → PR. On approval: add M-24 (PG ≥ 15) and update M-18 (done in this commit), forward A17 recommendations to T-019.3/.4/.5/.6.
- Gotchas: ~1,000 changed lines (over the guide; fallback split 2a/2b in the plan). Not image-rollback-safe after the contract (A8).
