## Attempt 1 — 2026-11-10

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261110120000_init.sql` | Schema (AC2, D25, R5) |
| `db/migrations/README.md` | Migration rules (D24/D25) |
| `server/migrator.js` | Runner logic and pure helpers (AC1) |
| `server/migrate.js` | D24 entry point, exit codes, no secret output |
| `server/test/pg.ts` | Test DB helper; throws in CI without `TEST_DATABASE_URL` (R8) |
| `server/test/fixtures/ok/*`, `bad/*` | Fixture migrations (tamper/out-of-order/ahead cases copy `ok/` to a temp dir at runtime, so no separate fixture dirs) |
| `server/migrator.test.ts`, `server/migrator.db.test.ts`, `server/schema.db.test.ts`, `server/migrate.cli.test.ts` | Tests listed in the plan |
| `tsconfig.server.json` | Typecheck of `server/**` |
| `package.json`, `pnpm-lock.yaml` | `pg` 8.23.1, `@types/pg` 8.23.1; `typecheck` also runs `tsconfig.server.json` |
| `vitest.config.ts` | `server/**/*.js` in coverage.include (no threshold, A8) |
| `.github/workflows/ci.yml` | Postgres 17 service, `TEST_DATABASE_URL`, "migrate CLI smoke" step |

### Tests added / changed
- `server/migrator.test.ts`: filename parsing, checksum, planMigrations (5 cases), migration lint over real files.
- `server/migrator.db.test.ts`: fresh apply, no-op rerun, rollback on failure, checksum mismatch, missing file, out-of-order, DB ahead, concurrent runs, lock timeout, NOSUPERUSER owner.
- `server/schema.db.test.ts`: location get-or-create race, item insert, wear +1/-1, view columns, pg JS shapes, primary photo, cascades, constraints, updated_at trigger, no RLS/user_id.
- `server/migrate.cli.test.ts`: exit 2 unset, exit 1 unreachable host, exit 1 wrong password, exit 0 twice. No URL/password in output.

### Checks (actual output summary)
Database used: local PostgreSQL 16.15 (Ubuntu, /usr/lib/postgresql/16). Docker was not usable (no daemon socket), so Postgres 17 was NOT used locally; CI uses `postgres:17`. The data dir was under `/tmp/tudo-pgdata` (the scratchpad path became untraversable for the postgres user). Server stopped and removed afterwards.
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test with TEST_DATABASE_URL: 45 files, 522 tests passed. `pnpm test:coverage` with the DB: same, passed.
- test without TEST_DATABASE_URL: 43 files passed, 2 skipped; 498 passed, 24 skipped.
- `CI=true` without TEST_DATABASE_URL: the 3 DB test files FAIL with "TEST_DATABASE_URL is required when CI is set" (confirmed).
- build: pass (vite build).
- CI smoke commands run locally against a fresh DB: first run `applied 20261110120000_init`, second output contains `up to date`.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Same as plan: T-013 `date` type parser and NFC location names; T-015 image layout; risk-tiers entries; `docs/data-model.md` in T-016.
- Postgres 17 not exercised locally; first CI run is the 17 check.
- `pnpm test:coverage` does not typecheck the server tests under the DOM tsconfig; they are covered by `tsconfig.server.json`.

### Scope self-check
- Could the diff be smaller? No; every file is in the plan list (the unused `out-of-order/` and `tamper/` fixture dirs were not created, as the tests build them at runtime).
- Diff size: modified files +143 / -1; new files about 900 lines (SQL ~100, runner+entry ~210, tests/helpers the rest).

## Attempt 2 (REWORK: security follow-ups only)

Files touched
- `server/migrator.js`: `set local tudo.migrating = 'on'` before the file, check `current_setting('tudo.migrating', true) = 'on'` after it; throw (-> rollback, MigrationError) if the file ended the transaction. Required because: follow-up 1.
- `server/migrator.test.ts`: lint regex widened to begin/commit/rollback/end/abort (with `;`, end of text, work/transaction/and). Required because: follow-up 1.
- `server/migrator.db.test.ts`: added `end;` fixture test (created inline in a temp dir). Required because: follow-up 1.
- `.github/workflows/ci.yml`: `shell: bash` on the smoke step (pipefail). Required because: follow-up 2.

Checks (local PostgreSQL 16, TEST_DATABASE_URL set)
- pnpm typecheck: pass
- pnpm format:check: pass
- pnpm test: 45 files, 523 tests passed
- pnpm build: pass

Out-of-plan files: none. Follow-ups: none.
Scope self-check: only the two listed items changed.
