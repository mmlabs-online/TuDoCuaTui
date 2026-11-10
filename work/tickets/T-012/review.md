## Attempt 1 — 2026-11-10
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb`, diff `git diff origin/main...HEAD` (25 files, +1663/−3), working tree clean.
- typecheck: pass, exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no diagnostics).
- format:check: "All matched files use the correct format." (137 files).
- test (no DB): 45 files; 498 passed, 24 skipped (the DB-backed `describe.skipIf` blocks).
- test (with DB): local PostgreSQL **16** (`/usr/lib/postgresql/16`, initdb under `/tmp`, scram auth, port 55432). `TEST_DATABASE_URL=… pnpm test` → **45 files, 522/522 passed**. Verbose run of `server/`: all 34 server tests ✓, none skipped.
- test:coverage with `CI=true` + DB (the CI step): exit 0, 522/522; `server/migrator.js` 95.95 % lines (no threshold, A8).
- `CI=true` without `TEST_DATABASE_URL`: the 3 DB files fail with "TEST_DATABASE_URL is required when CI is set" (`server/test/pg.ts:7-8`), vitest exit 1. Confirmed CI cannot silently skip.
- CI smoke (`node server/migrate.js` twice) on a fresh database: first run `applied 20261110120000_init (23 ms)`, exit 0; second `up to date`, exit 0; `bash -e` + `tee | grep -q "up to date"` exit 0. Same pipeline with a wrong password: prints `migrate failed: cannot connect to the database (DATABASE_URL not printed) [28P01]` and the step exits 1.
- build: pass (`vite build`).
- Postgres server stopped and data dir deleted afterwards. **Postgres 17 not exercised locally** (no Docker daemon); CI's `postgres:17` service is the first 17 run. Nothing in the SQL or runner is version-sensitive (`gen_random_uuid()` core since 13, `drop database … with (force)` since 13).

### Acceptance criteria
- [x] Fresh DB → all migrations apply; re-run is a no-op — evidence: `server/migrator.db.test.ts` › "applies all migrations to a fresh database", › "second run is a no-op (same rows, same applied_at)" (✓); `server/migrate.cli.test.ts` › "exit 0 twice on a fresh DB; second says up to date" (✓); reviewer smoke run above. Transactional/drift/lock behaviour (plan 1a): rollback, checksum mismatch, missing file, out-of-order, DB-ahead, concurrent runs, lock timeout tests all ✓; per-file tx at `server/migrator.js:163-174`, session advisory lock at `server/migrator.js:129`.
- [x] CLI contract (plan 1b) — `server/migrate.js` exits 2 when unset (`:31`), 1 on connect failure; no URL/password in output (`migrate.cli.test.ts` wrong-password and unreachable-host tests ✓; fixed message at `server/migrator.js:119`). No `console.*(err)` or env/config logging anywhere in `server/migrat*.js`.
- [x] Schema supports everything `WardrobeRepo` needs — evidence: `server/schema.db.test.ts` (12 tests ✓): location get-or-create race (`unique (name)`, `db/migrations/20261110120000_init.sql:36`), item upsert with client uuid, wear +1 twice → `already` (`unique (item_id, worn_on)`, `:88`), wear −1 latest day, view columns/order, pg JS shapes, primary photo, cascades, constraints, trigger. Matches the Supabase init (`supabase/migrations/20261106000000_init.sql`) minus `user_id`/RLS/grants/storage, as scoped.
- [x] D25 / R5 — no RLS, no `user_id` (test "no table has RLS or a user_id column" ✓); `wear_count`/`last_worn` only in the view (`init.sql:97,103`).
- [x] Owner role (plan 2b) — "applies as a NOSUPERUSER database owner" ✓.
- [x] CI runs the migration tests against Postgres 17 — `.github/workflows/ci.yml:22` `image: postgres:17` on the `ci` job, `TEST_DATABASE_URL` on `pnpm test:coverage` (`:39`), smoke step `:44-45`; non-skip guard verified above. (Actual 17 run is visible only on the CI run.)
- [x] No app behaviour change — diff touches no `src/**`, `supabase/**`, `vite.config.ts`, `Dockerfile`, `docker/**`, `scripts/**`, release workflow; no `src/` file imports `pg`.

### Issues
None blocking or should-fix.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: `src/` untouched, local mode unaffected. R2: replaced by D25 for this DB — new folder, no RLS by design, Supabase migrations untouched. R3: no `VITE_*`/secret; CI password is a throwaway service value. R4: `storage_path` opaque per A6 (Drive re-plan owns it). R5: view only. R6: no UI. R7: all files in the plan list; `work/ming-todo.md` / ticket.md are workflow bookkeeping. R8: checks green, pure helpers unit-tested, DB tests cannot skip in CI. R9: no UI. R10: `vite.config.ts`, `AGENTS.md`, `.figma/` untouched.

### Nits (do not block)
- `server/migrate.js:14,20,24`: plan step 4 says the unexpected-error message includes `[<code>]`; the implementation prints only `migrate failed: unexpected error`. Fine for safety, slightly less useful for diagnosis.
- `server/migrator.js` runs `create table if not exists schema_migrations` outside the `lock_timeout` transaction; harmless (lock already held, table is tiny).
- `server/migrate.cli.test.ts` wrong-password test hard-codes the admin user `postgres`; on a dev DB with another admin name it still exits 1, so the test stays valid.
- `server/migrate.js` shows 0 % coverage because it runs in a child process; expected.

### Follow-ups (out of scope)
- Confirm the first CI run on `postgres:17` is green (the only 17 evidence).
- Plan follow-ups stand: T-013 date parser (OID 1082) + NFC location names; T-015 image layout (`server/`, `db/migrations/`, prod `node_modules` with `pg`); `.github/risk-tiers.yml` entries for `db/migrations/**` and `server/migrat*.js`; `docs/data-model.md` in T-016; ask Ming about Supabase data (A9) before T-016.

### Security follow-ups to fix (Ming, 2026-11-10: "Sửa cả 2 rồi mở PR")
From security-review.md attempt 1 (🟡, not blocking, fixed before the PR at Ming's request):
1. `server/migrator.js:163-171` — a transaction-control statement in a migration file (`end;`, `abort;`, `commit/rollback and chain`, a final `commit` without `;`) ends the runner's transaction and leaves a half-applied schema. Add the runtime guard (`set local tudo.migrating = 'on'` before the file; check `current_setting('tudo.migrating', true) = 'on'` after; throw if not), widen the lint in `server/migrator.test.ts:74`, add an `end;` fixture test.
2. `.github/workflows/ci.yml:43-45` — the smoke step ignores migrate's exit code in the pipe. Use `shell: bash` (pipefail) or capture output then grep.
