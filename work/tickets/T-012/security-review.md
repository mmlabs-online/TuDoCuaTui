# Security review — T-012

## Attempt 1 (2026-11-10) — security-ai-generated-code-auditor

No 🔴 blockers.

### 🟡 Should fix
1. **Transaction-control statement in a migration file can leave a half-applied schema** — `server/migrator.js:163-171`, lint `server/migrator.test.ts:74`. `end;` (= COMMIT), `abort;`, `commit/rollback and chain`, or a final `commit` without `;` ends the runner's transaction; the rest autocommits incl. the `schema_migrations` row. Lint only catches `(begin|commit|rollback)\s*;`. Fix: `set local tudo.migrating = 'on'` before the file, check `current_setting('tudo.migrating', true) = 'on'` after, throw if not; widen the lint (`\bend\s*;` outside `$$`, `\babort\b`, `and\s+chain`); add an `end;` fixture test. (AC 1a)
2. **CI smoke step ignores the second run's exit code** — `.github/workflows/ci.yml:43-45`. Default `bash -e` has no pipefail, so `node server/migrate.js | tee /dev/stderr | grep -q "up to date"` discards migrate's status. Fix: `shell: bash` (→ `-eo pipefail`) or capture output then grep. (AC 1)

### 🟢 Notes
3. DATABASE_URL/password leakage: clean (fixed messages + `err.code`; handlers print fixed text; CLI tests assert no password/URL). Optional: CLI test with a malformed URL containing a password (`postgres://u:s3cret@[bad`) to pin the `ERR_INVALID_URL` path.
4. SQL injection: none (filename regex, parameterised insert, constant lock key; test DDL interpolates only random hex).
5. DB-ahead branch also skips legitimately pending files with exit 0 (`migrator.js:149-152`, `planMigrations :49-69`), e.g. local `[A,B]`, DB `[A,C]`. Optional: fail when both `ahead` and `pending` are non-empty.
6. Lock/checksum/transaction logic otherwise sound (session advisory lock for the whole run, per-DB scope, applied set read under lock, per-file tx with lock/statement timeouts, tamper test).
7. CI permissions/secrets fine (`contents: read`, throwaway service password). Actions and `postgres:17` pinned by tag, not SHA — optional follow-up.
8. R3 / `src` boundary holds: nothing in `src/**` imports `pg` or reads `DATABASE_URL`; separate `tsconfig.server.json`; no new `VITE_*`.
9. `pg@8.23.1` and deps from the default registry with sha512 integrity; CI uses `--frozen-lockfile`.
10. D25 schema consistent (no RLS/user_id/grants/extensions; `set_updated_at` with `search_path = ''`; stats only in the view).

### Risks / open questions
- Postgres 17 first exercised by CI (local run was 16.15).
- 🟢5 fail-vs-warn when DB is ahead and files are pending is Ming's call under A5.

## Attempt 2 (2026-11-10) — security-ai-generated-code-auditor

No 🔴, no 🟡. Both attempt-1 🟡 items resolved (verified by reading code; nothing run).

### 🟢 Notes
1. **Item 1 fixed** — `server/migrator.js:163-183`: `set local tudo.migrating = 'on'` (:166) before the file, check (:170-173) before the `schema_migrations` insert (:174-177). `end;`, `commit;`, `abort;`, `rollback;`, `… and chain`, `prepare transaction` all drop the SET LOCAL value → throw; catch (:179-182) rolls back and rethrows `MigrationError` (exit 1); no ledger row. Pinned by `server/migrator.db.test.ts:76-85`. Fixed guard message; no DATABASE_URL leak. Limitation: statements before `end;` are already committed (loud failure, manual cleanup; the lint prevents it).
2. **Deliberate bypass possible, not accidental** — a file can end the tx and re-set the flag (`commit; set tudo.migrating = 'on';`). Optional hardening: record `pg_current_xact_id()` before the file and compare `pg_current_xact_id_if_assigned()` after.
3. **Lint widened** — `server/migrator.test.ts:69-76`. Gap: `prepare transaction` (caught at runtime; `max_prepared_transactions=0`). Possible false positives: `end;\n$$;` function-body style, `case … end and …`. Optional: strip `$tag$…$tag$` bodies and `/* */` comments before matching; add `prepare\s+transaction`.
4. **Item 2 fixed** — `.github/workflows/ci.yml:43` `shell: bash` → `-eo pipefail`.

### Risks / open questions
- Partial DDL on a self-ending file needs manual cleanup.
- Postgres 17 first exercised by CI (local 16.15).
- Transaction-id hardening (🟢2): now or follow-up — low priority.
