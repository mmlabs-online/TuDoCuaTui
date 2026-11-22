## Attempt 1 — 2026-11-22
Verdict: PASS

### Checks (run by reviewer)
- `pnpm typecheck` — clean (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- `pnpm format:check` — clean (`oxfmt --check`, 346 files checked).
- `pnpm test` — all new and modified test suites passed against test Postgres cluster (`TEST_DATABASE_URL`):
  - `spendPrices.test.ts` (10 passed)
  - `spend.test.ts` (7 passed)
  - `db.test.ts` (15 passed)
  - `parity.test.ts` (4 passed)
  - `spend.db.test.ts` (15 passed)
  - `rls.db.test.ts` (18 passed)
  - `schema.db.test.ts` (25 passed)
  - `migrator.db.test.ts` (38 passed)
- `pnpm build` — built OK.

### Acceptance criteria
- [x] 1. Reservations count against the cap before the provider call, so parallel calls cannot pass $20. Evidence: `spend.db.test.ts` › "8 parallel reserves (pool max 5) with room for exactly 3 estimates -> exactly 3 reserved, 5 cap_reached" and "reserve waits for the global advisory lock while settle is not blocked".
- [x] 2. A failed call's estimated cost stays in the spend meter unless the provider confirms no charge. Evidence: `spend.db.test.ts` › "settle(ok) -> charged, settled_at set, spent unchanged; other errors also charge" and "settle with confirmed no-charge outcome -> released, spent drops"; `spendPrices.test.ts` › "isConfirmedNoCharge".
- [x] 3. At the cap the meter refuses with a distinct error and no provider call is made. Evidence: `spend.db.test.ts` › "at the cap reserve returns cap_reached and inserts no row"; `parity.test.ts` verifies `ai_cap_reached` 503 parity.
- [x] 4. A model with no price entry is refused. Evidence: `spend.test.ts` › "reserve of an unpriced model / prototype-key model returns { status: 'unpriced' } without touching the pool"; `spend.db.test.ts` › "unpriced model inserts no row".
- [x] 5. Owner exemptions from rate limits (D38) do not exempt anyone from the cap. Evidence: `spend.db.test.ts` › "at the cap, with TUDO_OWNER_SUB set, reserve still returns cap_reached"; `spend.test.ts` › "reserve throws on extra keys (owner, userId)" and static check that `spend.js` / `spendPrices.js` never match `/owner|TUDO_OWNER_SUB|rateLimit|inflight/i`.
- [x] 6. The new table has RLS and is covered by the RLS tests. Evidence: `rls.db.test.ts` catalog snapshot and `spend meter (F-706.2)` suite; `schema.db.test.ts` forced list; `migrator.db.test.ts` guard check.
- [x] 7. All checks pass. Evidence: format, typecheck, DB tests, build all green.
- [x] 8. The month is the UTC+7 month; a reservation stays in the month it was made in. Evidence: `spendPrices.test.ts` › "spendPeriod: UTC+7 month boundary"; `spend.db.test.ts` › "month boundary: preload Nov at the cap; reserve at Nov 30 16:59:59Z is cap_reached; 17:00:00Z is reserved in Dec" and "a reservation made in Nov and settled in Dec keeps period 2026-11".
- [x] 9. Inert: nothing calls the meter yet. Evidence: `spend.test.ts` › "inert: no non-test file under server/ or src/ imports spend.js; only spend.js imports spendPrices.js; only spend.js and db.js mention withSpendMeter".

### Blockers from review agents
None (`security-review.md` verdict: PASS).
