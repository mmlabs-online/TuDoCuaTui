## Attempt 1 — 2026-11-14
Verdict: REWORK

### Checks (run by reviewer)
Branch `claude/magical-cori-2ssw8l`, diff base `origin/main`. My own throwaway Postgres 16.15 (fresh cluster under /tmp,
scram-sha-256 password auth, port 54331). `TEST_DATABASE_URL` was set, so every `*.db.test.ts` ran (none skipped). The
cluster was removed afterwards.
- typecheck: `pnpm typecheck` exit 0
- format:check: "All matched files use the correct format. Finished in 40ms on 206 files"
- test: `Test Files 82 passed (82)`, `Tests 1043 passed (1043)`, which matches impl-log
- build: `✓ built in 380ms`
- Verbose run of rls / isolation / photo-sweep / migrator: 81/81 passed. The guard tests "current_user is not a
  superuser and does not bypass RLS" pass in `rls.db.test.ts` and `isolation.db.test.ts`. Those suites use
  `createTestDb({ owner: true })`, with the app pool on `db.url` and fixtures on `db.adminUrl`. `photo-sweep.db.test.ts`
  also runs on the owner role (line 95). It has no explicit guard, but "a sweep run without maintenance context
  refuses" would fail under a superuser, so that suite does not pass vacuously.

Hand checks as a NOSUPERUSER, NOBYPASSRLS database owner (`rolsuper=f, rolbypassrls=f`). The DB was migrated with
`node server/migrate.js` (8 files applied). Fixtures for users A and B were inserted via the superuser.
- No GUC: the five tables and `items_with_stats` all return 0 rows. ✔
- `withUser`-style A transaction: 1 row on each table and `wear_count=1`. After commit, the same session has
  `current_setting('app.user_id', true) = ''` and counts are 0, with no 22P02. ✔
- B's GUC: only "B item" is visible. `items_with_stats where id = A` → 0. `update`/`delete` of A's row → 0 rows. ✔
- WITH CHECK: an insert with a foreign `user_id`, or `update items set user_id = B`, gives "new row violates row-level
  security policy" (42501). ✔
- B's upsert on A's id with the real `saveItem` SQL returns `INSERT 0 0` (rowCount 0), **not 42501**. See Issue 1.
  Without the `where items.user_id = excluded.user_id` clause it does raise 42501 (USING expression).
- Maintenance `begin read only` + `tudo.maintenance='photo-sweep'`: both users' `item_photos` are visible. items,
  locations, wear_logs and ai_settings → 0. In read-write mode, delete/update → 0 rows and insert → 42501. Value
  `other` → 0. ✔
- `runSweep` on the owner pool with a fake Drive (A's file, B's file, one orphan) and `--apply`: exit 0, "referenced 2",
  only the orphan is deleted. The same run through a pool that drops the `tudo.maintenance` set_config: exit 1,
  "refusing: no listed file is referenced", nothing deleted. ✔
- Migrator, as the owner: a file with `alter table items no force …; update items …` fails with "row level security
  not forced on items". A file with `create or replace view items_with_stats as <same def>` fails with
  "items_with_stats is not security_invoker". Both roll back: still 8 versions, FORCE still on,
  `security_invoker=true`. ✔
- No transaction spans Drive IO or streaming. `putPhoto` reads the body, then runs a read-only `withUser`, then
  `drive.createFile` outside any transaction, then `withLockedItem`, then `deleteDriveFiles` and `getItem`
  (`server/photos.js:174-238`). In `servePhoto` the lookup commits before `getMedia`/`pipeline` (`photos.js:269-323`).
  For DELETE, `removeItem` commits before `deleteDriveFiles` (`api.js:133-134`). The sweep runs `withMaintenance`
  only around the list and each re-check. No nested `withUser` call sites. ✔

### Acceptance criteria
- [x] ENABLE + FORCE on all five tables; view `security_invoker`. Evidence: `db/migrations/20261114200000_row_level_security.sql`,
  the only new migration (the seven applied files are unchanged); `rls.db.test.ts` › catalog and view; `schema.db.test.ts`;
  hand check of pg_class.
- [x] Every scoped call runs in `withUser`; no GUC → 0 rows; another user's GUC → 0 rows. Evidence: grep shows no
  `pool.query`/`pool.connect` outside `db.js`; `scoping.test.ts` guards; `rls.db.test.ts` (no GUC, per-user, residual
  GUC); hand checks above.
- [x] Sweep and migrations work through the documented maintenance path. Evidence: `photo-sweep.db.test.ts` (two users
  kept; refuses without context); `migrator.db.test.ts` › row level security (T-019.4) ×5; hand checks above; docs in
  `db/migrations/README.md` and `server/README.md`.
- [ ] All T-019.2/T-019.3 isolation tests green; all checks pass. The tests and checks are green, but plan AC4's
  evidence that "B PUT on A's item → 404 now goes through the 42501 path" is false. See Issue 1.

### Issues
#### Issue 1 — 🔴 blocker — R8 / correctness of claimed evidence (saveItem 42501 branch is dead and untested)
- **Where**: `server/items.js:75` (doc comment), `server/items.js:121-127` (the 42501 catch), and the
  `rls.db.test.ts:143` "saveItem(B, A's id) -> null" test.
- **Expected**: Plan AC4 and A5 say a foreign-id save maps 42501 to `null` (404). That new repo branch needs a test (R8).
- **Actual**: The upsert keeps `on conflict (id) do update … where items.user_id = excluded.user_id`. Postgres evaluates
  that WHERE before the RLS conflict check, so B's upsert on A's id returns rowCount 0 and no 42501 (verified by hand
  on PG 16). The `rowCount === 0` branch is what returns `null`. The `code === "42501"` → `NotOwned` branch is never
  reached by any test, and the doc comment "RLS raises 42501" is wrong.
- **Fix instruction**:
  - (a) Add a unit test (for example in `server/db.test.ts` or a new `server/items.test.ts`, using `fakePool`). The stub
    rejects the `insert into items` statement with `Object.assign(new Error("rls"), { code: "42501" })`. Assert that
    `saveItem` resolves to `null`, that `rollback` is sent and `commit` is not, and that `release` is called. Add a
    second case where another error code (for example `23505`) is rethrown.
  - (b) Reword `items.js:75`, for example: "changes nothing … returns null: the `where items.user_id =
    excluded.user_id` clause makes the upsert a no-op (rowCount 0); a 42501 from RLS is mapped the same way in case
    that clause is ever dropped."
  - (c) Rename or annotate `rls.db.test.ts:143` so it does not claim the 42501 path. Keep the SQL as is; do not remove
    the WHERE clause.

### Rules R1–R10 (CLAUDE.md)
- R1: `src/` untouched; local mode is unaffected (server only).
- R2: one new migration file with RLS in it; no applied file edited. `src/types/database.ts` does not apply (umbrella
  A18).
- R3: no new env var, `VITE_*` value or secret.
- R4: Drive paths unchanged.
- R5: stats still derived through the view.
- R6, R9, R10: no UI change; `AGENTS.md`, `.figma/` and `vite.config.ts` untouched.
- R7: every changed file is in the plan. `work/ming-todo.md` is the plan's A9 edit. The plan's list includes
  `ai/store.db.test.ts`, which was not changed; it did not need adapting.
- R8: violated by Issue 1. Otherwise no violations found.

### Nits (do not block)
- `server/photo-sweep.db.test.ts` has no explicit `rolsuper/rolbypassrls` guard test, which plan *Approach* 5 asks
  for in owner-role suites. Add the same one-line guard as `rls.db.test.ts:67`.
- `server/db.js` `inTx`: if `client.release()` on the success path ever threw, the catch would roll back and release
  again. This is theoretical; moving `release()` after the try (as the old code did) avoids it.

### Follow-ups (out of scope)
- The DB tests ran on Postgres 16 locally; CI covers 17.
- Least-privilege runtime role (D24 follow-up) would remove the A1/A4 residual: any session can set
  `tudo.maintenance` or `no force`.

## Attempt 2 — 2026-11-14
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/magical-cori-2ssw8l`, diff base `origin/main`. Fresh throwaway Postgres 16 cluster (scram-sha-256
password auth, port 54333), `TEST_DATABASE_URL` set so every `*.db.test.ts` ran. Removed afterwards.
- typecheck: `pnpm typecheck` exit 0
- format:check: exit 0, "Finished in 23ms on 207 files"
- test: `Test Files 83 passed (83)`, `Tests 1049 passed (1049)`, which matches impl-log attempt 2
- build: `✓ built in 363ms`
- Verbose run of rls / migrator / photo-sweep / isolation / items / db / scoping: 103/103 passed, including the
  three owner-role guard tests (rls, isolation and now photo-sweep).

### Attempt-1 issue and nits
- Issue 1 fixed. `server/items.test.ts` (new) covers the 42501 → `NotOwned` → `null` branch: rollback sent, commit not,
  released once. A 23505 is rethrown. The second case proves the stub really throws on the item upsert, so the first
  case is not passing through the `rowCount 0` path. The doc comment at `server/items.js:74-76` is accurate. The
  `rls.db.test.ts` test is relabelled "via the upsert's WHERE (rowCount 0)", and the WHERE clause is kept.
- Nit 1 fixed: `photo-sweep.db.test.ts` has the rolsuper/rolbypassrls guard.
- Nit 2 fixed: `server/db.js` `inTx` releases after the try. `db.test.ts` asserts that a throwing `release()` gives no
  rollback and no second release.

### Security-review items (orchestrator request), checked for correctness
- 🟡1 `server/migrator.js:111-121`: the guard is active when `file.version >= "20261114200000"`, not when the items
  flag is set. Versions are 14-digit strings (`FILENAME_RE`), so the string comparison is sound. The new test
  "a later file that disables RLS fails the guard" fails as expected and rolls back.
- 🟡2 `rls.db.test.ts` "pg_policies: exactly …" pins all six policies (table, name, cmd, permissive, qual,
  with_check). This passes on PG 16.
- 🟡3 `server/db.js`: `withUser` sets `app.user_id` and clears `tudo.maintenance`, and `withMaintenance` sets the task
  and clears `app.user_id`, each in one `set_config` statement. These are local to the transaction. `fake-pool.ts` and
  `db.test.ts` are updated.
- 🟢 `inTx` throws when COMMIT returns the ROLLBACK tag (the rollback that follows is a harmless no-op), and this has
  a unit test. The rls "writes" test was adjusted correctly: it used to swallow an error inside `fn`, which the new
  check now rejects. The scoping test limits `withMaintenance` to `db.js` and `photo-sweep.js`.
- Scope: every file touched in attempt 2 is in the plan's file list or is the test file attempt 1 asked for
  (`server/items.test.ts`). The migration SQL is unchanged.

### Acceptance criteria
- [x] ENABLE + FORCE on five tables, view security_invoker: migration unchanged since attempt 1. `rls.db.test.ts`
  catalog, view and pg_policies tests pass. `schema.db.test.ts` passes.
- [x] Scoped calls only through `withUser`, no GUC → 0 rows, foreign GUC → 0 rows: `scoping.test.ts` and
  `rls.db.test.ts` pass.
- [x] Sweep and migrations work through the documented maintenance path: `photo-sweep.db.test.ts` and
  `migrator.db.test.ts` › row level security (T-019.4) pass, including the new disable-RLS test.
- [x] T-019.2/T-019.3 isolation green and all checks pass. A foreign-id save → null is now evidenced on both paths:
  WHERE/rowCount 0 (`rls.db.test.ts`) and 42501 (`items.test.ts`).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. `src/` is untouched (R1). There is one new migration and no applied migration was edited (R2).
No secrets or `VITE_*` changes (R3). The new repo branch is tested (R8). No Figma Make files were touched (R10).

### Nits (do not block)
- No DB-level test that a session-level `tudo.maintenance` (e.g. `set tudo.maintenance = 'photo-sweep'` on the
  connection) is neutralised inside `withUser`. Only the SQL text is unit-tested. Postgres semantics make the
  behaviour correct.
- The `pg_policies` test compares deparsed `qual` text. If PG 17 in CI deparses differently, adjust the expected
  strings; this would not mean a security change.

### Follow-ups (out of scope)
- CI on PG 17: confirm the pg_policies text and the `create or replace view` guard test (open question from the
  security review).
- Least-privilege runtime role (D24 follow-up); pin `search_path` on `app_user_id()` at that time.
