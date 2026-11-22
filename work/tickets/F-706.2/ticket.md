# F-706.2: App-wide monthly spend meter and model price table

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/104 |

## Goal
Keep total AI spend under $20 a month by metering every paid call against a versioned price table, so AI turns off at the cap while the rest of the app keeps working.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.2 "Spend cap". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Versioned per-model price table (pessimistic estimates); unpriced models are refused.
- App-wide monthly spend meter (UTC+7 month) in Postgres with no user data and a narrow RLS policy; migration with RLS in the same file.
- `reserveSpend(model, estimate)` added atomically before the provider call; settle keeps the estimate unless the provider confirms no charge.
- A distinct cap error code, added to both error mirrors (`src/shared/ai/errors.ts`, `server/ai/catalog.js`).

## Out of scope
- Wiring the meter into the AI routes (F-706.4); spend view for the admin (F-706.5/F-706.6).
- Reconciliation with the provider dashboard (manual, Ming); the provider-console cap (M-42).

## Acceptance criteria
- [x] Reservations count against the cap before the provider call, so parallel calls cannot pass $20 (DB test with parallel reservations).
- [x] A failed call's estimated cost stays in the spend meter unless the provider confirms no charge.
- [x] At the cap the meter refuses with a distinct error and no provider call is made.
- [x] A model with no price entry is refused.
- [x] Owner exemptions from rate limits (D38) do not exempt anyone from the cap (test with the owner sub).
- [x] The new table has RLS and is covered by the RLS tests.
- [x] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Adapters discard usage today (`server/ai/gemini.js:147`, `server/ai/claude.js:79`); v1 uses pessimistic per-model estimates (ai-stylist-notes.md:64).
- RLS: a global budget row does not fit `owner_only`; consider an `ai_budget_months` table with no user data and a narrow policy; `SECURITY DEFINER` does not help because the app is the owner role under FORCE (ai-stylist-notes.md:65).
- Owner exemptions live in `server/ai/rateLimit.js:75-81` and `server/app.js:71-75` (ai-stylist-notes.md:75).
- Prices in the feature list are search snapshots and must be rechecked against the live pricing pages before this ships (feature list "Known limit").

## Test plan
- Unit/DB: parallel reservations at the cap, failed-call estimate retained, unpriced model refused, owner not exempt, RLS.
- Manual: none.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-22 — Plan approved by Ming ("duyệt"), with default assumptions A1–A12 (cap as code constant, ai_cap_reached 503, no-charge list, all six models priced, pessimistic estimates).

## Handoff

### 2026-11-22 — claude — DONE
- Done: migration 20261122140000_ai_spend_meter (ai_spend_ops, maintenance session RLS); server/ai/spendPrices.js (frozen table, $20 cap, estimateMicroUsd, isConfirmedNoCharge, spendPeriod UTC+7); server/ai/spend.js (reserve, settle, status, advisory lock); ai_cap_reached 503 error; inert; all checks & tests PASS (attempt 1).
- In progress / next: Ming merges PR #104; next ticket in backlog is BUG-013 or F-706.3.
- Gotchas: M-45 recheck prices before F-706.4 ships; migration version must stay newer than F-706.1.

### 2026-11-22 — claude — plan approved
- Done: M-44 plan approved by Ming.
- In progress / next: waiting for Ming to review and merge PR #102 (F-706.1). Once PR #102 is merged into main, cut branch `ticket/F-706.2` and start implementation.

### 2026-11-22 — claude — BLOCKED
- Done: consults database-optimizer + software-architect; plan READY (ai_spend_ops with per-command RLS on tudo.maintenance='ai-spend', withSpendMeter helper, spendPrices.js + spend.js inert, ai_cap_reached 503 in both mirrors + copy). Planning committed on main because the session branch holds open PR #102 (F-706.1).
- In progress / next: waiting for Ming's plan approval (M-44, assumptions A1–A12); implementation starts after PR #102 merges (migration must be newer than 20261122120000).
- Gotchas: hotspots with F-706.1 (RLS_TABLES, rls/migrator/schema test lists, READMEs).
