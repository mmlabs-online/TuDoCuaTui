## Attempt 1 — 2026-11-14

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261114200000_row_level_security.sql` (new) | AC1-3: `app_user_id()`, ENABLE + FORCE + `owner_only` on 5 tables, `photo_sweep_read`, view `security_invoker`, manual rollback in header |
| `db/migrations/README.md` | RLS rules, exception bullet (plan) |
| `server/db.js` | `withUser` / `withMaintenance` with nesting guard |
| `server/items.js` | all queries in `withUser`; 42501 and `rowCount 0` -> `null` via an internal sentinel; `getItemOn` |
| `server/photos.js` | `withLockedItem` on `withUser`; short read-only lookups; Drive IO outside transactions |
| `server/ai/store.js` | `withUser` for get/save/getSecret/clearKey |
| `server/photo-sweep.js` | list and re-check through `withMaintenance`; pool typedef has `connect()` |
| `server/migrator.js` | `assertRlsForced` guard before the `schema_migrations` insert |
| `server/test/pg.ts` | `TestDb.adminUrl` |
| `server/test/fake-pool.ts` (new) | `fakePool` helper |
| `server/rls.db.test.ts` (new) | RLS suite as the NOSUPERUSER owner role |
| `server/db.test.ts`, `server/scoping.test.ts`, `server/migrator.db.test.ts`, `server/schema.db.test.ts`, `server/isolation.db.test.ts`, `server/photo-sweep.db.test.ts` | tests listed in the plan |
| `server/api.test.ts`, `server/app.test.ts`, `server/photos.test.ts`, `server/ai/routes.test.ts`, `server/ai/tagPhoto.test.ts` | fakes wrapped with `fakePool` |
| `server/README.md`, `docs/data-model.md` | docs (plan) |

### Tests added / changed
- `rls.db.test.ts`: guard (not superuser/bypassrls), no GUC -> 0 rows, per-user view, residual GUC on a max-1 pool, writes (42501), malformed GUC (22P02), saveItem foreign id -> null, FK actions, view security_invoker, catalog, maintenance (read-only, SELECT-only, other value -> 0 rows).
- `db.test.ts`: withUser / withMaintenance unit tests (order, readOnly, rollback, release(err), id validation, nesting, task whitelist).
- `migrator.db.test.ts`: RLS guard tests (unforced fails and rolls back, no force...force passes as owner, view without security_invoker fails, upgrade with rows as owner); version count 7 -> 8.
- `isolation.db.test.ts`: app pool is the owner role, admin pool for fixtures/reads, superuser guard, recorder accepts `begin read only`.
- `photo-sweep.db.test.ts`: owner role; late-insert and 57P01 fakes via `connect()`; new "run without maintenance context refuses".
- `schema.db.test.ts`: RLS enabled + forced replaces "no table has RLS".
- `scoping.test.ts`: no direct `pool.query/connect` in items/photos/store/sweep; `set_config(`, `tudo.maintenance`, `app.user_id` location guards.

### Checks (actual output summary)
Local throwaway Postgres 16.15 (password auth, fresh cluster under /tmp, port 54329), `TEST_DATABASE_URL` set so every `*.db.test.ts` ran; RLS suites ran as a NOSUPERUSER owner role (guards assert it).
- typecheck: `pnpm typecheck` exit 0
- format:check: `Finished ... 206 files`, no issues
- test: `Test Files 82 passed (82)`, `Tests 1043 passed (1043)`
- test:coverage: same 82 files / 1043 tests passed
- build: `built in 403ms`

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Tests of Postgres 16 here; CI runs 17 (not run locally).
- In the migrator view-guard test the replaced view is re-created from `pg_get_viewdef`; it asserts that `create or replace` resets the options (it does on PG 16).

### Scope self-check
- Could the diff be smaller? No; mostly tests and mechanical call-site moves.
- Diff size: +582 / -192 tracked lines plus 3 new files (migration, rls.db.test.ts, fake-pool.ts).
- Deviation: `withUser` / `withMaintenance` share one internal `inTx` helper in `db.js` (smaller than two copies); the saveItem rollback uses an internal `NotOwned` sentinel thrown inside the transaction (so a `rowCount === 0` still rolls back the location upsert, as before).
