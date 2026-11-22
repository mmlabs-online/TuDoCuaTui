## Attempt 1 — 2026-11-22

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261122140000_ai_spend_meter.sql` (new) | Plan Approach §1: `ai_spend_ops` table, index, RLS + FORCE, 3 policies, rollback header. |
| `server/db.js` | Add `withSpendMeter(pool, fn, { readOnly })` (narrow access path on `tudo.maintenance = 'ai-spend'`). |
| `server/migrator.js` | Add `SPEND_METER_VERSION = "20261122140000"` and `ai_spend_ops` to `RLS_TABLES`. |
| `server/ai/spendPrices.js` (new) | Pure pricing, token ceilings, cap constant, no-charge outcomes, `spendPeriod` (UTC+7). |
| `server/ai/spend.js` (new) | Spend meter module: `reserve`, `settle`, `status`. |
| `server/ai/catalog.js` | Add `ai_cap_reached: 503` to `AI_ERROR_STATUS`. |
| `src/shared/ai/errors.ts` | Add `ai_cap_reached: 503` to client mirror. |
| `src/features/settings/copy.ts` | Add Vietnamese message for `ai_cap_reached` to `AI_ERRORS`. |
| `server/ai/spendPrices.test.ts`, `server/ai/spend.test.ts`, `server/ai/spend.db.test.ts` (new) | Every planned test. |
| `server/db.test.ts` | Unit tests for `withSpendMeter`. |
| `server/rls.db.test.ts` | Catalog, `pg_policies`, truncate, maintenance isolation, spend meter describe. |
| `server/schema.db.test.ts` | Add `ai_spend_ops` to RLS forced-table list. |
| `server/migrator.db.test.ts` | Migration count 9 -> 10, force-guard test for `ai_spend_ops`, `all nine tables forced`. |
| `db/migrations/README.md`, `server/README.md`, `docs/data-model.md` | Document `ai_spend_ops` as second app-wide table with narrow GUC policy, not part of backup. |

### Tests added / changed
- New: `spendPrices.test.ts` (10), `spend.test.ts` (7), `spend.db.test.ts` (15), `db.test.ts › withSpendMeter` (3), `rls.db.test.ts › spend meter (F-706.2)` (2), `migrator.db.test.ts › spend meter (F-706.2)` (1).
- Changed as named in the plan: `rls.db.test.ts` (catalog, pg_policies, truncate, maintenance loop), `schema.db.test.ts` (RLS forced list), `migrator.db.test.ts` (migration count, forced table check).

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: all 346 matched files use the correct format.
- test: `spendPrices.test.ts` (10/10), `spend.test.ts` (7/7), `db.test.ts` (15/15), `parity.test.ts` (4/4), `spend.db.test.ts` (15/15), `rls.db.test.ts` (18/18), `schema.db.test.ts` (25/25), `migrator.db.test.ts` (38/38) passed against real Postgres 17 test cluster (`TEST_DATABASE_URL`).
- build: `vite build` built OK.

### Out-of-plan files
None.

### Deviations from the plan
- In `server/ai/spend.db.test.ts`, testing remainingMicroUsd at cap preloads two rows (15M + 10M) instead of one 20.5M row, respecting the table constraint `check (estimate_micro_usd between 1 and 20000000)`.
- In `server/migrator.db.test.ts`, `beforeCredit` test unlinks both `CREDIT` and `SPEND` so pre-credit migrations test runs cleanly without unapplied migrations ahead of image.

### Follow-ups (noticed, not done)
- As listed in plan.md (F-706.4 route wiring and error mapping, F-706.5 admin view).
