## Attempt 1 — 2026-11-22

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261122120000_credit_ledger.sql` (new) | Plan Approach §1: three tables, seed, existing-account snapshot, RLS + FORCE, rollback header. |
| `server/ai/creditMath.js` (new) | Pure helpers (AC 4, R8). |
| `server/ai/credits.js` (new) | Ledger module: reserve, commit, refund, balance (AC 1-5). |
| `server/migrator.js` | `RLS_TABLES` becomes a per-table from-version map; credit tables guarded from 20261122120000. |
| `server/ai/creditMath.test.ts`, `credits.test.ts`, `credits.db.test.ts` (new) | Every planned test. |
| `server/rls.db.test.ts` | Plan: catalog, `pg_policies`, truncate, maintenance loop, new `credit ledger (F-706.1)` tests; fixtures for A and B credit rows. |
| `server/schema.db.test.ts` | Plan: RLS list and `user_id NOT NULL` list. |
| `server/migrator.db.test.ts` | Plan: `withExtra` version 29991231235959; new `credit ledger (F-706.1)` describe; shared top-level `forced(url, tables)` helper. |
| `db/migrations/README.md`, `server/README.md`, `docs/data-model.md` | Plan: `credit_settings` policy exception, not in backup. |

### Tests added / changed
- New: `creditMath.test.ts` (7), `credits.test.ts` (4), `credits.db.test.ts` (22), `rls.db.test.ts › credit ledger (F-706.1)` (2), `migrator.db.test.ts › credit ledger (F-706.1)` (4).
- Changed as named in the plan: `rls.db.test.ts` (catalog, pg_policies, maintenance, truncate list, READABLE), `schema.db.test.ts` (RLS and user_id lists, title), `migrator.db.test.ts` (`withExtra` version).
- Changed, not named in the plan: `migrator.db.test.ts › empty DB passes with and without owner` expected 8 applied migrations, now 9 (the new file is applied). Unavoidable.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: all matched files use the correct format.
- test: 151 files, 2211 tests passed, 0 skipped, with TEST_DATABASE_URL set (Postgres 16 throwaway cluster). DB suites: 13 `*.db.test.ts` files, 259 tests, all run, none skipped.
- build: built OK.

### Out-of-plan files
None.

### Deviations from the plan
- **Monthly grants are created with `approved_at` = the injected clock.** The plan's `check (bucket = 'welcome' or approved_at is not null)` and its `ensureGrants` (monthly insert without `approved_at`) contradict each other: the monthly insert violated the check. Smallest fix: `ensureGrants` sets `approved_at` for monthly rows. The schema is as planned; the balance query is unaffected (it does not read `approved_at` for monthly).
- Scratch Postgres cluster lives in `/tmp/pg-f7061` (not the scratchpad): the session resets the scratchpad's parent directory to mode 700, which locked the `postgres` user out and crashed the cluster.

### Follow-ups (noticed, not done)
- As listed in plan.md (F-706.4 balance route, F-706.5 `withAdmin` and policies, stale R2/R3/R4 wording in CLAUDE.md).
- Test pools in `credits.db.test.ts` use the real `createPool` (max 5), as planned.

### Scope self-check
- Could the diff be smaller? No; the production code is about 330 lines (migration 100, credits.js 240, creditMath.js 45, migrator 15), the rest are the planned tests.
- Diff size: about +1150 / -21 lines including tests and docs.

## Attempt 2 (REWORK: review attempt 1)

### Changes
- `git rm .vitest/json/output.json` (stray Vitest JSON report committed by mistake; it broke `pnpm format:check`). `.vitest/` in `.gitignore` left as a follow-up.
- `server/ai/credits.db.test.ts`: the 8-parallel test now pre-inserts a pending welcome row (`grant(OWNER_A, "welcome", 300, { approved: false })`), so the welcome unique index no longer serializes the calls; the 7 losers return `welcome_pending`.
- New test `concurrency › reserve waits for the per-user advisory lock; another user is not blocked`: an admin client holds `pg_advisory_xact_lock(hashtextextended('credits:'||A,0))`; reserve(B) completes meanwhile; reserve(A) has not settled after 300 ms and returns `reserved` after the admin commits.
- Nits: README bullet indent (`db/migrations/README.md` lines 24-25); renamed the over-stated "OWNER_A as owner sub" test title.

### Mutation evidence (scratch Postgres 16 cluster /tmp/pg-f7061b, scram auth, TEST_DATABASE_URL set)
- With the lock: `-t concurrency` 4/4 passed, 3 runs in a row.
- With the `lock()` helper body in `credits.js` replaced by `Promise.resolve()` (file restored afterwards, `git diff` on credits.js empty): 5 of 5 runs failed 3 of 4 concurrency tests (the 8-parallel photo_fill test, the new lock test, the sticker test).

### Checks
- typecheck clean; `format:check` exit 0 (verified by exit code, `.vitest/` gone); test 151 files, 2212 passed, 0 skipped (DB suites ran); build OK.

### Out-of-plan files / deviations
None. Cluster stopped and removed afterwards.
