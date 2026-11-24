# F-706.9: GET /api/ai/credits (user balance, costs and AI state)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture, data |
| Gate | plan-approval |
| Depends on | F-706.4 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-24 |
| Claimed by | — |
| PR | — |

## Goal
Give the signed-in user one read endpoint with their credit balance, the cost of each AI action, whether they wait for welcome approval and whether the app-wide cap is reached, so the credit UI (F-706.7) can show it before a tap.

## Scope reference
Split from F-706.4 (slice 2 of `work/tickets/F-706.4/plan.md`, approved by Ming 2026-11-24, M-51). Contract agreed in F-706.7 (M-50 defaults, 2026-11-24). `docs/feature-list.md` E7 → F-706; D52, D53, D55. Consult: `work/tickets/F-706.4/consult-software-architect.md` R-G.

## Scope
- `GET /api/ai/credits` → `{ credits: { balance: { period, monthly, lasting, total }, welcome: "approved"|"pending", capReached, costs: { photo_fill, suggest }, provider } }`.
- `balance`/`welcome` from `ledger.balance()` (a write transaction because of lazy grants; comment it). `costs` from `CREDIT_PRICES`. `capReached` when the remaining cap is below the next cheapest call's estimate (a small `spend` helper so only `spend.js` imports `spendPrices.js`). `provider` is the shared provider, or null when no shared key is stored.
- 503 `server_misconfigured` when the AI context is missing; same auth as the rest of `/api`.

## Out of scope
- Client UI (F-706.7). Admin views (F-706.5/F-706.6).

## Acceptance criteria
- [ ] A signed-in user gets their own balance, welcome state, costs, capReached and provider; never another user's.
- [ ] A user with no ledger rows gets the lazy grants (welcome pending or approved per D53) in the response.
- [ ] capReached is true exactly when the next cheapest AI call would be refused by the spend meter.
- [ ] Route tests with injected fakes; DB test for the balance path.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier (`server/**`): plan-approval gate.
- Release rule D52/D55: ships in the same release as F-706.4 and F-706.7.

## Test plan
- Route: shape, auth, 503 without AI context, capReached edge. DB: balance for a new and an existing user.
- Manual: none.

## Notes / answers from Ming

## Handoff
