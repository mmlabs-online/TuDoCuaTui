# F-706.2: App-wide monthly spend meter and model price table

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | claude@2026-11-22T04:54:28Z |
| PR | — |

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
- [ ] Reservations count against the cap before the provider call, so parallel calls cannot pass $20 (DB test with parallel reservations).
- [ ] A failed call's estimated cost stays in the spend meter unless the provider confirms no charge.
- [ ] At the cap the meter refuses with a distinct error and no provider call is made.
- [ ] A model with no price entry is refused.
- [ ] Owner exemptions from rate limits (D38) do not exempt anyone from the cap (test with the owner sub).
- [ ] The new table has RLS and is covered by the RLS tests.
- [ ] All checks pass (format, typecheck, test, build).

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

## Handoff
