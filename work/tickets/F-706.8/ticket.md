# F-706.8: Delete legacy BYOK ciphertext

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | F-706.4, F-706.7 |
| Needs Ming | Ming written confirmation (D52) |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Remove the stored per-user BYOK key ciphertext once Ming has confirmed in writing that the shared key works, so no unused user secrets remain.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.8 "Legacy ciphertext deletion". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- A new migration (or release-pipeline maintenance step) that deletes legacy BYOK ciphertext; never edit an applied migration.
- Retire code that only existed to read or delete BYOK keys, if the plan shows it is unused.

## Out of scope
- Any change to the shared key storage, ledger or meter.

## Acceptance criteria
- [ ] Ming's written confirmation that the shared key works is recorded in `## Notes / answers from Ming` before IMPLEMENT starts.
- [ ] After the change no legacy BYOK ciphertext remains in the database.
- [ ] Shared key storage, credits and spend data are unchanged (test).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- **Not runnable until Ming confirms in writing that the admin/shared key works** (D52). Irreversible.
- Migrations reach production only through the release pipeline, which backs up first; never run `server/migrate.js` from a dev machine (D45).

## Test plan
- Unit/DB: migration removes BYOK ciphertext and leaves shared-key and ledger tables intact.
- Manual: none.

## Notes / answers from Ming

## Handoff
