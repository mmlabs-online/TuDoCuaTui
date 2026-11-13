# T-019.9: Cutover cleanup: remove Cloudflare Access code

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-019.4, T-019.7, T-019.8 |
| Needs Ming | M-21 |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
After Identity is verified in production, remove the Access code path so only Identity remains.

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.9). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.9, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] No `access.js`, no `CF_ACCESS_*` / `TUDO_ACCESS_DISABLED` anywhere outside `work/`; production requires identity config.
- [ ] `check-image.sh` asserts `/api/items` without a bearer → 401.
- [ ] `opaqueredirect` branches in `mode.ts` and `repo.http.ts` removed, tests updated.
- [ ] Runbook text for M-22; all checks pass.

## Technical notes
- Files (likely): `server/access.js` (delete), `server/app.js`, `server/index.js`, `src/data/mode.ts`, `src/data/repo.http.ts`, `scripts/check-image.sh`, compose, README
- Also depends on M-21 (Identity verified in production with Access still on).

## Test plan
- See the umbrella plan *Tests to write* (T-019.9 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
