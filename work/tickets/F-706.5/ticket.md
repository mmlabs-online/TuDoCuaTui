# F-706.5: Owner-only admin API for grants, credits, approvals and spend

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture, db |
| Gate | plan-approval |
| Depends on | F-706.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Give the owner server routes to change grant settings, add credits manually, approve welcome credits for new accounts and see spend, so the AI budget can be managed without database access.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.5 "Admin API"; OQ-1 (admin approval of welcome credits, D53). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Owner-only routes: read/update grant settings (welcome and monthly amounts), add credits to a user, list accounts waiting for welcome-credit approval and approve them, read the monthly spend.
- Cross-user reads through the narrow access path chosen in F-706.1.

## Out of scope
- Admin screen (F-706.6); shared key routes (F-706.3); paid credit purchase (non-goal).

## Acceptance criteria
- [ ] Non-owners get 403 on every admin route.
- [ ] The owner can change the welcome and monthly grant amounts, and later grants use the new amounts.
- [ ] The owner can add credits to a user; manual credits never expire (D53).
- [ ] The owner can list accounts waiting for welcome-credit approval and approve one; the approved account's 300 credits then count.
- [ ] The owner can read the current month's spend against the $20 cap.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Hotspot: shares ledger tables with F-706.1 and the meter with F-706.2.
- Owner exemptions from rate limits do not exempt the owner from the cap (D53).

## Test plan
- Unit/route: 403 for non-owners on each route, grant change, manual add, approval flow, spend read.
- Manual: none.

## Notes / answers from Ming

## Handoff
