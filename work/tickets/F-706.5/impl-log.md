## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261123120000_credit_admin.sql` | New: `grant_key` column and partial unique index, guard trigger, per-command user policies replacing `owner_only` (note 10), `credit-admin` policies, manual rollback comment |
| `server/db.js` | `withCreditAdmin` (the `withAppKeys` shape) |
| `server/ai/creditLock.js` | New: `lockCreditUser`, the advisory lock moved verbatim out of `credits.js` |
| `server/ai/credits.js` | Uses `lockCreditUser`; header comment updated |
| `server/ai/creditAdmin.js` | New: settings, pending list, approve, manual add |
| `server/ai/adminValidate.js` | New: pure body and param parsers |
| `server/ai/adminCreditRoutes.js` | New: the six routes |
| `server/api.js` | Owner check on the `/api/admin` prefix before `match()`, six `match()` entries, dispatch |
| `server/app.js` | Optional `creditAdmin` / `spendMeter` deps, default-built from the pool |
| `server/me.js` | `isOwner`, used by `meBody` |
| `server/ai/adminRoutes.js` | Uses `isOwner` (no behaviour change) |
| `server/README.md`, `db/migrations/README.md` | Route rows and the credit-table policy line |
| `server/ai/adminValidate.test.ts`, `creditAdmin.test.ts`, `creditAdmin.db.test.ts`, `adminCreditRoutes.test.ts`, `server/db.test.ts`, `server/me.test.ts` | New and extended tests |
| `server/rls.db.test.ts` | New `describe("credit admin (F-706.5)")`; `pg_policies` expectation and title updated |
| `server/migrator.db.test.ts` | `beforeCredit()` also removes the new file; migration count 11 -> 12; the "later file" fixture copies it back |

### Tests added / changed
- `server/ai/adminValidate.test.ts` › parseSettingsBody, parseManualGrantBody, parseUserIdParam
- `server/ai/creditAdmin.test.ts` › invalid userId throws before connect; advisory lock is the first statement after set_config; source rules (only creditAdmin.js and db.js mention `withCreditAdmin`, no import of credits.js / creditMath.js, backup.js free of `credit_`)
- `server/ai/creditAdmin.db.test.ts` › settings update and later grants; listPending; approve (stored amount kept, already_approved, not_found, welcome_pending then reserved); addManual (UTC+7 months and the 2026-12-31T17:00Z boundary, replay, grant_key_mismatch, same key for another user, unknown_user); GET /api/admin/spend through `createApp` with a real pool
- `server/ai/adminCreditRoutes.test.ts` › non-owner 403 on every route x method incl. unknown paths and `/api/admin/ai-keys*`; owner 200/201/400/404/409/503 shapes; 405 with Allow; cross-site 403, 415, 413; no pool -> 503 (still 403 for non-owner); log fields
- `server/db.test.ts` › withCreditAdmin; `server/me.test.ts` › isOwner
- `server/rls.db.test.ts` › credit admin policies, user-side narrowing, isolation from other maintenance values, guard trigger, updated `pg_policies` list

### Checks (actual output summary)
Run in WSL Ubuntu 24.04 against a throwaway Postgres 17 container (DB suites ran, not skipped).
- typecheck: PASS (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: PASS (after `pnpm format` on the new and changed files)
- test: PASS, 166 files, 2358 tests (baseline 2317; +41). One earlier full run had two 5 s timeouts (`migrate.cli.test.ts`, `schema.db.test.ts`, both create databases and run all migrations under load); the immediate re-run passed with no change.
- build: PASS

### Out-of-plan files
- `server/ai/spend.test.ts` — the F-706.2 inertness test asserted that nothing imports `spend.js`. The plan's `app.js` default meter (`createSpendMeter(pool)`) makes `app.js` the one importer, so the assertion now expects `["app.js"]`.

### Follow-ups (noticed, not done)
- F-706.6: copy should say a monthly-amount change applies only to users whose monthly grant for the month does not exist yet (A10), and that a welcome-amount change does not alter pending rows (A1).
- `parseUserIdParam` could drop its `toUserId` call (the lowercase regex already rejects what it would change) except for the nil UUID; kept for the nil check.

### Scope self-check
- Could the diff be smaller? No; every file is in the plan except the one-line `spend.test.ts` change above.
- Diff size: +1526 / -21 lines including tests and docs (product code about 450, as estimated); no split needed.
