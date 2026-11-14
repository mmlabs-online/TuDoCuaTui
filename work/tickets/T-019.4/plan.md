Status: READY

# Plan — T-019.4: Row level security with per-request app.user_id

High tier (migration, RLS). Ming waived plan approval for this ticket on 2026-11-14, on one condition: the plan adds no
High-tier decision beyond the approved umbrella plan, and no new DB role or Ming step. This plan meets that condition.
It adds no DB role (D24 holds), no grant, no new secret or env var, and no new M-item. Only the role in the existing
M-18 psql checks changes (A9). Everything here falls under umbrella A3 and D32. See *Assumptions* A1–A16.

## Feature summary
Not in `docs/feature-list.md` (T- ticket, slice of T-019). Ticket goal: "Postgres enforces ownership as a second
layer: RLS `ENABLE` + `FORCE` on every TuDo table (D32)."

Sources (quoted):
- D32 (`work/decisions.md`): "RLS `ENABLE` + `FORCE` arrives in its own migration (T-019.4) before Access is removed,
  not in the migration that adds `user_id`."
- D25 (amended by D32): "every table gets a `user_id` and RLS (`ENABLE` + `FORCE ROW LEVEL SECURITY`)".
- D24: "One owner role for both the app and `migrate` for now (least-privilege runtime role is a follow-up)."
- Umbrella plan A3: "RLS now, as its own slice T-019.4 … It must merge before M-21 [M-22 here]. Sweep/migrations use a
  documented maintenance GUC path (no new DB role: D24 one owner role)."
- Umbrella *Files* (T-019.4 rows): migration "`enable` + `force row level security` on 5 tables, policies on
  `current_setting('app.user_id', true)::uuid`, view `security_invoker = true`, maintenance path for the sweep (A3)";
  `server/db.js` "`withUser(pool, userId, fn)` (begin → `set_config('app.user_id', $1, true)` → fn → commit)";
  `items.js`, `photos.js`, `ai/store.js`, `photo-sweep.js` "run through `withUser` / the maintenance path";
  `server/rls.db.test.ts` "no GUC → 0 rows; wrong GUC → 0 rows; sweep still sees all".
- Umbrella *Tests*: "`server/rls.db.test.ts` › no `app.user_id` → 0 rows; other user's GUC → 0 rows; insert with other
  `user_id` rejected".
- D37: no release that contains T-019.1 goes out until M-17 is done. After M-17 come M-18 (backup) and the release.
- Ticket notes (T-019.2 security review, 2026-11-14): "(1) recreate `items_with_stats` `with (security_invoker =
  true)` … test that it returns no rows of another user under RLS. (2) Under `FORCE` RLS the unscoped photo sweep would
  see only one user's rows … run the sweep as a `BYPASSRLS` role or give it a dedicated policy, plus a two-user sweep
  test under RLS." This plan picks the dedicated policy (A1).
- Ticket note (T-019.2 plan A17): "RLS must be live before multi-user sign-up (T-019.7) reaches production."

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "`ENABLE` + `FORCE` RLS on all five tables; view `security_invoker`." | `git diff --stat main -- db/migrations`: one new file `20261114200000_row_level_security.sql` plus `README.md`. The seven applied files are unchanged. `server/rls.db.test.ts` › "catalog: every public base table except schema_migrations has relrowsecurity, relforcerowsecurity and ≥ 1 policy" and "items_with_stats has security_invoker=true". `server/schema.db.test.ts` › "RLS enabled and forced on all five tables; user_id is NOT NULL on all five tables" replaces the "no table has RLS" test. |
| 2 | "Every scoped call runs in `withUser`; no GUC → 0 rows; another user's GUC → 0 rows." | `server/rls.db.test.ts`, run as the NOSUPERUSER owner role. No GUC → 0 rows on all five tables and the view. Another user's GUC → 0 rows. Same result on a pooled connection that already ran a `withUser`. A write without the GUC, or with a foreign `user_id`, is rejected with 42501. `server/db.test.ts` › withUser unit tests. `server/scoping.test.ts` › "items.js, photos.js, ai/store.js and photo-sweep.js never call pool.query/pool.connect directly"; "set_config only in db.js and migrator.js"; "tudo.maintenance only in db.js". `server/isolation.db.test.ts` now runs as the owner role, so a route that skips `withUser` returns 0 rows and its test fails. |
| 3 | "Sweep and migrations still work through the documented maintenance path." | `server/photo-sweep.db.test.ts` runs as the owner role: two users' referenced files are both kept, an unreferenced file is deleted, and the re-check still works. `server/rls.db.test.ts` › maintenance block: `tudo.maintenance='photo-sweep'` → SELECT on `item_photos` sees all users; no rows on the other tables; insert/update/delete still limited to the owner GUC; any other value → 0 rows. `server/migrator.db.test.ts` › RLS guard tests: a forgotten re-`force` fails and rolls back; `no force … force` passes; upgrade with rows ends with FORCE on. Docs: `db/migrations/README.md` and `server/README.md` describe both paths. |
| 4 | "All T-019.2/T-019.3 isolation tests still green; all checks pass." | `server/isolation.db.test.ts` (items, photos, wear, AI blocks) passes unchanged in substance under the owner role, with direct reads through the admin pool. "B PUT on A's item → 404" now goes through the 42501 path. `pnpm typecheck`, `pnpm format:check`, `pnpm test` (DB tests in CI on Postgres 17), `pnpm build`, CI image check (db smoke: migrate + `/readyz`) all green. |

## Ming verification after merge
Merging needs nothing from Ming. This ticket ships in the **same first release as T-019.1, T-019.2 and T-019.3**. None of
them is released yet, and M-17, M-18 and M-24 are still open (A8). No new M-item. The orchestrator updates the existing
M-18 (and M-24) text as listed in A9.

**After the deploy (read-only, on the Mac):**
- The deploy log shows `applied 20261114200000_row_level_security` after the T-019.1–T-019.3 files, and the app
  container is healthy.
- The existing M-18/M-24 psql checks run as `postgres` (`psql -U postgres -d tudocuatui`). As the `tudocuatui` role
  they now return 0 rows, which is expected, not data loss (A9).
- One more read-only line, as `postgres`: `select relname, relrowsecurity, relforcerowsecurity from pg_class where
  relname in ('locations','items','item_photos','wear_logs','ai_settings');` → all `t`.
- In the app: the wardrobe lists, adding or editing an item works, a photo loads and uploads, wear ±1 works.
- The next deploy's `backup` step succeeds, which confirms A10 (the `pg-backup` sidecar dumps as a superuser).

### Release and rollback
- **Same release, same image:** the migration and the `withUser` code must ship together. An older image on the RLS
  schema reads 0 rows (it looks like an empty wardrobe; no data is lost) and its writes fail. A new image on the old
  schema works, because `withUser` only sets a GUC.
- **Order inside one deploy run:** `backup` → `migrate` applies expand, contract, ai_settings_per_user, then this file,
  each in its own transaction → app replaced.
  - This file fails (for example `lock_timeout`, or the migrator RLS guard): T-019.1–T-019.3 stay applied and this file
    rolls back. The deploy stops before the swap, and the old app keeps running on the contract schema (T-019.2 A8
    applies). Fix and re-release.
  - Everything applied but the new app fails to start: the deploy starts the old image again. It is already broken on
    the contract schema (T-019.2/.3 rollback text). With RLS it also reads 0 rows. Fix forward, or restore the M-18
    `pg_dump`, or run the manual down SQL in the migration headers (newest first).
- **Manual down SQL for this file** goes in the header and is never run automatically: `drop policy owner_only on
  <t>` (×5); `drop policy photo_sweep_read on item_photos`; `alter table <t> no force row level security; alter table
  <t> disable row level security` (×5); `alter view items_with_stats reset (security_invoker)`; `drop function
  app_user_id()`. This file alone is image-rollback-safe only toward an image that already uses `withUser`.
- The PR description must say: "migration and withUser code ship in one image; an older image on this schema reads no
  rows; release together with T-019.1–T-019.3 (M-17, M-18, M-24)".

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261114200000_row_level_security.sql` | New. Header: purpose, "ship with withUser code", maintenance policy is SELECT-only on `item_photos` (A1), manual rollback SQL. Body: `app_user_id()`; for each of the five tables `enable` + `force row level security` + policy `owner_only`; policy `photo_sweep_read`; `alter view items_with_stats set (security_invoker = true)`. See *Approach* 1. | AC1, AC2, AC3 |
| `db/migrations/README.md` | Add the RLS rules (*Approach* 7): data migrations wrap row work in `no force` … `force`; new tables need RLS + FORCE + a policy in the same migration; `create or replace view items_with_stats` must repeat `with (security_invoker = true)`; the runner's RLS guard. Add `20261114200000_row_level_security` to the "Exception" bullet (needs the withUser image). The "Ownership (D32)" line already names T-019.4. | AC3, R2 |
| `server/db.js` | `withUser(pool, userId, fn, { readOnly })` and `withMaintenance(pool, task, fn)` (see *Approach* 2); nesting guard; `ping` unchanged. | AC2, AC3 |
| `server/items.js` | `listItems`, `listLocations`, `getItem` use read-only `withUser`. `saveItem`, `removeItem` and `wearItem` each run in one `withUser`. `saveItem` maps 42501 from the item upsert to `null`. Internal `getItemOn(client, userId, id)` is shared by `saveItem` and `wearItem`. Exported signatures stay the same. | AC2, consult F6 |
| `server/photos.js` | `withLockedItem` becomes `withUser` + `for update`, without the hand-written begin/commit. The `putPhoto` existence check is its own short read-only `withUser`, and the Drive upload stays outside any transaction. `servePhoto` does a short read-only lookup and releases the client before the 304 or the stream. | AC2, consult F7 |
| `server/ai/store.js` | `get`/`getSecret` use read-only `withUser`. `save` (current `for update` transaction) and `clearKey` use `withUser`. `need(userId)` still runs first. | AC2 |
| `server/photo-sweep.js` | The list query and each per-delete re-check run in their own `withMaintenance(pool, "photo-sweep", …)`. The Drive delete stays outside any transaction. The header comment gains a line on the maintenance policy. The `pool` typedef gains `connect()`. | AC3 |
| `server/migrator.js` | RLS guard after each file, inside its transaction, before the `schema_migrations` insert (see *Approach* 6). | AC3, A3 |
| `server/test/pg.ts` | `TestDb.adminUrl` (same database, admin credentials) so owner-role tests can truncate and read directly. | AC2–AC4 |
| `server/test/fake-pool.ts` (new) | `fakePool(stub)`: adds `connect()` to a query-only fake. The client answers `begin` / `begin read only` / `commit` / `rollback` / `select set_config(…)` itself with `{rows:[],rowCount:0}` and sends everything else to `stub.query`. `release` is a spy. | test adaptation |
| `server/rls.db.test.ts` (new) | See *Tests to write*. | AC1–AC3 |
| `server/db.test.ts` | withUser / withMaintenance unit tests with a fake client. | AC2, R8 |
| `server/isolation.db.test.ts` | `createTestDb({ owner: true })`; app pool = owner URL; `admin` pool for `truncate` and direct reads; superuser guard; recorder control regex accepts `begin read only`. | AC2, AC4 |
| `server/photo-sweep.db.test.ts` | Owner role + admin pool for fixtures; `lateInsertPool` and the 57P01 fake gain `connect()` (via `fakePool` or a wrapper); new test "a sweep run without maintenance context sees no rows and refuses". | AC3 |
| `server/migrator.db.test.ts` | RLS guard tests; version counts +1 where asserted. | AC3 |
| `server/schema.db.test.ts` | Replace "no table has RLS …" with the RLS-on version. | AC1 |
| `server/scoping.test.ts` | New guards (see *Tests to write*). The header comment says RLS is live. | AC2 |
| `server/api.test.ts`, `server/app.test.ts`, `server/photos.test.ts`, `server/ai/routes.test.ts`, `server/ai/tagPhoto.test.ts`, `server/ai/store.db.test.ts` | Query-only fakes wrapped with `fakePool`. Tests that bring their own `connect()` client keep it and still see `begin` first. "Pool without connect() → 500" stays (fails closed). Assertions are unchanged in substance. | test adaptation |
| `server/README.md` | Database section: RLS + FORCE, `withUser` is the only way to query user tables, the maintenance policy for the sweep, the accepted residual (A4), and that psql checks run as `postgres` or set `app.user_id` first. | docs, A9 |
| `docs/data-model.md` | One line: every table has RLS + FORCE with policy `user_id = app.user_id` (T-019.4, D32); `items_with_stats` is `security_invoker`. | docs |

Not changed: the seven applied migrations; `src/` (R1: local mode and the Figma Make preview untouched);
`server/errors.js` (42501 handled at the call site, consult R-4); `server/app.js`, `server/api.js`, `server/index.js`;
`compose.yml`, `scripts/check-image.sh`, `.env.example` (no new env); `.github/**`.

## Tests to write
Fixed users `OWNER_A`, `OWNER_B` from `server/test/auth.ts`. "Owner role" means `createTestDb({ owner: true })`, with
migrations run on `db.url` and fixtures and direct reads on `db.adminUrl`.

| Test (file › name) | Covers |
|---|---|
| `server/rls.db.test.ts` › guard: the test pool's `current_user` has `rolsuper = false` and `rolbypassrls = false` | AC2 (no vacuous pass) |
| `server/rls.db.test.ts` › no GUC: `select count(*)` is 0 on `locations`, `items`, `item_photos`, `wear_logs`, `ai_settings`, `items_with_stats` (fixtures for both users inserted via admin) | AC2 |
| `server/rls.db.test.ts` › `withUser(A)`: sees only A's rows on all five tables and the view; `withUser(B)` sees only B's | AC2 |
| `server/rls.db.test.ts` › residual GUC: on a `max: 1` pool, after a committed `withUser(A)`, a plain `pool.query` sees 0 rows and does not raise 22P02 (`nullif` path) | AC2, consult F2 |
| `server/rls.db.test.ts` › writes: insert without GUC → 42501; under `withUser(A)` insert with `user_id = B` → 42501; `update items set user_id = B` → 42501; update/delete of B's row under A → 0 rows, B's row unchanged | AC2 |
| `server/rls.db.test.ts` › malformed GUC (`set_config('app.user_id','x',true)`) → 22P02 (fails closed) | AC2 |
| `server/rls.db.test.ts` › `saveItem(pool, B, A's id, …)` → `null`, A's row and locations unchanged (42501 path) | AC2, AC4 |
| `server/rls.db.test.ts` › FK actions under RLS: `removeItem(A)` cascades A's photos and wear logs; deleting A's location sets `items.location_id` null (composite FK `set null (location_id)`) | AC2 |
| `server/rls.db.test.ts` › view: `items_with_stats` `reloptions` contains `security_invoker=true`; under `withUser(B)` A's item is not returned even with an explicit `where id = <A's id>`; `wear_count` counts only own logs | AC1 |
| `server/rls.db.test.ts` › catalog: every `public` base table except `schema_migrations` has `relrowsecurity`, `relforcerowsecurity` and ≥ 1 row in `pg_policies` | AC1 (future tables) |
| `server/rls.db.test.ts` › maintenance: in `withMaintenance(pool, "photo-sweep")` SELECT on `item_photos` returns both users' rows; `items`, `locations`, `wear_logs`, `ai_settings` → 0 rows; in a plain read-write transaction with `set_config('tudo.maintenance','photo-sweep',true)` set directly by the test (not `withMaintenance`, which is read-only and would raise 25006), insert into `item_photos` → 42501, update/delete of any row → 0 rows; `tudo.maintenance = 'other'` → 0 rows | AC3, A1 |
| `server/db.test.ts` › withUser: order `begin` → `select set_config('app.user_id', $1, true)` with `[userId]` → fn → `commit` → `release()`; `readOnly` sends `begin read only`; fn throws → `rollback`, `release(err)`, the error is rethrown; rollback failure is swallowed; `release(err)` when `begin` fails | AC2 |
| `server/db.test.ts` › withUser rejects `undefined`, `""`, an uppercase or nil uuid, and a pool without `connect()`, before any connect | AC2 |
| `server/db.test.ts` › nested `withUser` / `withMaintenance` inside `fn` throws `nested transaction` without a second connect | AC2, consult R-3 |
| `server/db.test.ts` › withMaintenance: only `"photo-sweep"` accepted (anything else throws before connect); sets `tudo.maintenance`, `begin read only` | AC3 |
| `server/migrator.db.test.ts` › empty DB → all files applied, five tables end with RLS + FORCE; version count +1 | AC1 |
| `server/migrator.db.test.ts` › upgrade with existing owned rows (contract state + rows, `OWNER`) → applies; rows intact (admin read); FORCE on | AC3 |
| `server/migrator.db.test.ts` › extra test file after the RLS file that runs `alter table items no force row level security; update items set notes = 'x'` with no re-force → fails "row level security not forced on items", version absent, FORCE still on (rolled back) | AC3, A3 |
| `server/migrator.db.test.ts` › extra test file with `no force` … `update` … `force` → applied; the update reached the rows (admin read); as owner role | AC3 |
| `server/migrator.db.test.ts` › extra test file `create or replace view items_with_stats …` without `security_invoker` → guard fails | AC1, A3 |
| `server/photo-sweep.db.test.ts` › (owner role) existing tests green, including "files referenced by two users' rows are both kept; an unreferenced file is still a candidate" and the late-insert re-check | AC3, security rec 2 |
| `server/photo-sweep.db.test.ts` › a pool whose `connect()` client drops the `tudo.maintenance` `set_config` (simulated missing context) → the listing sees 0 rows, apply refuses ("no listed file is referenced"), nothing deleted | AC3 |
| `server/isolation.db.test.ts` › all existing tests under the owner role; direct reads and `truncate` via admin; the recorder allows `begin read only`; `set_config('app.user_id'…)` already contains `user_id` | AC4 |
| `server/schema.db.test.ts` › "RLS enabled and forced on all five tables; user_id is NOT NULL on all five tables" | AC1 |
| `server/scoping.test.ts` › `items.js`, `photos.js`, `ai/store.js`, `photo-sweep.js` contain no `pool.query(` and no `pool.connect(` | AC2 |
| `server/scoping.test.ts` › `set_config(` appears only in `db.js` and `migrator.js`; `tudo.maintenance` and `app.user_id` only in `db.js` (server JS, recursive over `server/**/*.js` excluding tests) | AC2, A1 |
| Adapted fakes in `api.test.ts`, `app.test.ts`, `photos.test.ts`, `ai/routes.test.ts`, `ai/tagPhoto.test.ts`, `ai/store.db.test.ts` | regression |

## Approach
1. **Migration `db/migrations/20261114200000_row_level_security.sql`** (consult R-2):
   ```sql
   create function app_user_id() returns uuid language sql stable
     as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
   -- for t in locations, items, item_photos, wear_logs, ai_settings:
   alter table t enable row level security;
   alter table t force row level security;
   create policy owner_only on t for all
     using (user_id = (select app_user_id()))
     with check (user_id = (select app_user_id()));
   create policy photo_sweep_read on item_photos for select
     using (current_setting('tudo.maintenance', true) = 'photo-sweep');
   alter view items_with_stats set (security_invoker = true);
   ```
   No `grant`, no `create role`, no `to <role>` clause (README rule; D24). No data is touched, so no owner GUC check. No
   PG-version guard (the contract already requires ≥ 15, which `security_invoker` needs). The header carries the
   rollback SQL from *Release and rollback*.
2. **`server/db.js`** (consult R-3):
   - `withUser(pool, userId, fn, { readOnly = false } = {})` checks, in order:
     - `toUserId(userId) === userId`, else throw `Error("userId required")`;
     - `pool.connect` exists, else throw `Error("pool has no connect()")`;
     - not already inside a `withUser`/`withMaintenance` (`AsyncLocalStorage` flag), else throw
       `Error("nested transaction")`.

     Then it runs `connect` → `begin` or `begin read only` → `select set_config('app.user_id', $1, true)` → `await
     fn(client)` → `commit` → `release()`. On error it runs `rollback` (errors swallowed), then `release(err)`, then
     rethrows.
   - `withMaintenance(pool, task, fn)` has the same shape. `task` must be in `MAINTENANCE_TASKS = ["photo-sweep"]`. It
     sets `tudo.maintenance` and always uses `begin read only`.
   - Values only as `$1`. The guard never logs the user id.
3. **Move every scoped query into `withUser`** (consult R-4). A transaction never spans Drive IO, a body read or
   streaming (pool `max: 5`).
   - `items.js`:
     - `listItems`, `listLocations` and `getItem` use read-only `withUser`.
     - `saveItem` runs one `withUser`: location upsert, item upsert, then `getItemOn(client, …)` for the result. A 42501
       from the item upsert makes it return `null`: catch inside `fn`, return a sentinel, rollback, and the caller
       answers 404. `where items.user_id = excluded.user_id` stays as defence in depth. `rowCount === 0` → `null` stays.
     - `removeItem` runs one `withUser`.
     - `wearItem` runs one `withUser`, including the stats read.
   - `photos.js`:
     - `withLockedItem(pool, userId, itemId, fn)` becomes `withUser(pool, userId, async c => { lock … for update; if
       none return false; await fn(c); return true })`. A missing item now commits an empty transaction instead of
       rolling back; the effect is the same.
     - The `putPhoto` existence check uses read-only `withUser`. After the Drive upload, `withLockedItem` runs, then
       `getItem`, each a separate short transaction.
     - `servePhoto`: the lookup uses read-only `withUser` and returns `drive_file_id` before the ETag and Drive steps.
   - `ai/store.js`: `get`/`getSecret` use read-only `withUser`. `save` is the existing logic inside `withUser` (the
     `key_required` early return becomes a value returned from `fn`, which commits a read-only-effect transaction).
     `clearKey` uses `withUser`.
   - Error mapping stays at the callers (`mapDbError`); `server/errors.js` is unchanged.
4. **Sweep** (consult R-5): `rows = await withMaintenance(pool, "photo-sweep", c => c.query(<list sql>))`. Each re-check
   is `withMaintenance(pool, "photo-sweep", c => c.query(<recheck sql>, [f.id]))` before the Drive delete, which stays
   outside the transaction. The SQL text does not change, so the `scoping.test.ts` allow-list entries stay valid. A
   missing context means 0 rows, and then the existing "no listed file is referenced" guard refuses.
5. **Tests infrastructure:** `server/test/pg.ts` exposes `adminUrl` per `TestDb` (`urlFor(adminUrl, name)`).
   `server/test/fake-pool.ts` provides the `fakePool` helper. Owner-role suites assert the superuser guard.
6. **Migrator RLS guard** (consult R-1, A3), after `client.query(file.sql)` and the existing `tudo.migrating` guard,
   still inside the transaction:
   - Query `pg_class` for the five tables plus `items_with_stats` (`to_regclass`).
   - If `items` exists and has `relrowsecurity`, all five tables must have `relrowsecurity` and `relforcerowsecurity`,
     and the view's `reloptions` must contain `security_invoker=true`. Otherwise throw `Error("row level security not
     forced on <table>")` / `Error("items_with_stats is not security_invoker")`, which rolls back through the existing
     catch.
   - Messages contain only table names. Before T-019.4 (no RLS on `items`) the guard is a no-op, so the older
     migrations in `migrator.db.test.ts` are unaffected.
7. **Docs:**
   - `db/migrations/README.md`:
     - "A migration that reads or writes rows of the five tables wraps the work in `alter table <t> no force row level
       security;` … `alter table <t> force row level security;` in the same file. Without that, the owner sees 0 rows
       and the update silently changes nothing. The runner fails a file that leaves a table unforced."
     - "A new table gets `enable` + `force row level security` and an `owner_only` policy in the same migration (the
       catalog test enforces it)."
     - "`create or replace view items_with_stats` must say `with (security_invoker = true)`."
   - `server/README.md`: the same rules for the app side, plus the A4 residual and psql as `postgres`.
   - `docs/data-model.md`: one line.
8. **Rules:**
   - R1: server only; `src/`, local mode and the Figma Make preview are untouched.
   - R2: one new migration file with RLS in it; applied files are not edited. There is no `src/types/database.ts` in
     this Node/Postgres setup (umbrella A18). Applying to production is the deploy's `migrate` step under M-18.
   - R3: no secret, no new env, no `VITE_*`.
   - R4: Drive paths are not changed.
   - R5: the view still derives the stats.
   - R6/R9/R10: no UI and no Figma Make files.
   - R7: least-privilege runtime role, quotas and T-019.5 remain follow-ups.
   - R8: tests above.

## Specialist input used
- database-optimizer (`consult-database-optimizer.md`):
  - Findings 1–9: all used.
    - F1: owner-role tests and the admin pool.
    - F2: `nullif` plus the residual-GUC test.
    - F3: owner + FORCE; residual in A4.
    - F4: data-migration trap, handled by the guard and the README.
    - F5: no BYPASSRLS role (A1).
    - F6: 42501 → `null`.
    - F7: transaction boundaries.
    - F8: `security_invoker`.
    - F9: psql as `postgres`, backup (A9, A10).
  - R-1: adopted as written. There is no BYPASSRLS role, no general `tudo.migrating` bypass policy, a SELECT-only
    `photo_sweep_read` on `item_photos`, `no force`/`force` for data migrations, and a strict migrator guard. The
    guard is extended to the view's `security_invoker`, because `create or replace view` resets view options (A3).
  - R-2 to R-7: adopted. One small addition to R-3: `withMaintenance` accepts only listed task names. R-7 decision
    entry: not a new decision (A6).
  - Open questions 1–4 → A1, A2, A3, A9.
- T-019.2 security review recs 1 and 2: adopted. The dedicated policy is used, not a `BYPASSRLS` role (A1), and there
  is a two-user sweep test under FORCE.

## Assumptions
- **A1 — No new DB role; the sweep reads through a SELECT-only maintenance policy** (consult open question 1, umbrella
  A3). The policy `photo_sweep_read` on `item_photos` is permissive and OR-ed with `owner_only`. It is reached only
  through `withMaintenance(pool, "photo-sweep")` in `server/db.js`, and a guard test checks that. Writes still need
  the owner GUC (WITH CHECK / USING of `owner_only`). Accepted exposure: code running SQL on the app connection could
  set `tudo.maintenance` and read every user's photo row ids and `drive_file_id`s. That same code could already set
  `app.user_id` or run `alter table … no force`. The BYPASSRLS alternative (a new role, password secret, sweep
  `DATABASE_URL`, deployment-repo change) would be a new Ming step and is not planned.
- **A2 — The sweep stays a manual CLI job run as the app role** (`node server/photo-sweep.js`, same `DATABASE_URL`;
  consult open question 2). Scheduling it is a follow-up. If it ever gains writes, revisit A1.
- **A3 — Strict migrator guard** (consult open question 3). Once `items` has RLS, any file that leaves one of the five
  tables without `relrowsecurity`/`relforcerowsecurity`, or the view without `security_invoker`, fails and rolls back.
  It does not just warn, because a warning in a deploy log is easy to miss. The guard cannot catch a data migration
  that forgets `no force` (that one silently updates 0 rows); the README rule and review cover it.
- **A4 — What RLS protects (documented in `server/README.md`).** It is a second layer against app bugs (a forgotten
  `where user_id`) and SQL injection through parameter mistakes. It does not protect against stolen DB credentials or
  arbitrary SQL on the app connection: the owner can `no force`, and any session can set any GUC. Splitting roles is
  the D24 follow-up.
- **A5 — 42501 is mapped only at the `saveItem` call site** (→ 404). Elsewhere a 42501 means a bug, for example a
  missing GUC, and stays 500 `internal` through `mapDbError`. `server/errors.js` is unchanged.
- **A6 — No new decision entry.** D32 plus umbrella A3 cover this design (RLS + FORCE in its own migration, a
  maintenance GUC path, no new role). The details (policy names, guard, A1 exposure) are recorded in this plan and the
  READMEs. The orchestrator may append "completed by T-019.4; sweep via SELECT-only maintenance policy, no BYPASSRLS
  role" to D32's row as a note. That is not a change of decision.
- **A7 — Tests.** Suites that assert isolation or RLS (`rls`, `isolation`, `photo-sweep`, the RLS part of `migrator`)
  run as the NOSUPERUSER owner role with a superuser guard. `schema.db.test.ts`, `api.db.test.ts`, `app.db.test.ts` and
  `ai/store.db.test.ts` keep the admin connection. They test behaviour, and RLS is bypassed there, but they still go
  through `withUser`.
- **A8 — Release together with T-019.1–T-019.3** in the first T-019 release, after M-17, M-24 and M-18 (D37). Then RLS
  is live long before T-019.7 sign-up reaches production (T-019.2 A17), and well before M-22.
- **A9 — Ming's psql checks run as `postgres`** (consult open question 4). This changes the role in an existing step;
  it is not a new step. The orchestrator edits `work/ming-todo.md`:
  - M-18, after-deploy lines (the `user_id is null` count, `select distinct user_id`, the `ai_settings` check): add
    "run as `postgres` (`psql -U postgres -d tudocuatui`); as the `tudocuatui` role these return 0 rows once
    T-019.4's RLS is applied". Also add the read-only `pg_class` RLS line from *Ming verification after merge*.
  - M-24: no change (`current_setting('server_version_num')` reads no table).
  - Alternative for Ming: as `tudocuatui`, `select set_config('app.user_id', '<sub>', false);` first.
- **A10 — The deploy `backup` step (`pg-backup` sidecar `/backup.sh`) dumps as a superuser,** so RLS does not affect
  it (consult F9). If it dumped as the app role, `pg_dump` would fail loudly on FORCE tables and the deploy would stop
  before migrating, which is a safe failure. Ming sees it on the next deploy (*Ming verification*). Restore with
  `--no-owner --role=tudocuatui` keeps working (RLS is DDL in the dump).
- **A11 — `withUser` adds about 3 round trips per request** (`begin`, `set_config`, `commit`). That is negligible on
  the `db` network. Reads use `begin read only`.
- **A12 — Migration version `20261114200000`**, after `20261114180000_ai_settings_per_user`. No other open ticket adds a
  migration.
- **A13 — Policy names:** `owner_only` on each table and `photo_sweep_read` on `item_photos`. The function is
  `public.app_user_id()`, `stable`, default `security invoker`. The default EXECUTE grant to PUBLIC is harmless (it
  returns the caller's own GUC).
- **A14 — Hotspots:** `server/items.js`, `server/photos.js`, `server/ai/store.js`, `server/isolation.db.test.ts`,
  `server/scoping.test.ts` and the test fakes are also edited by T-019.5/T-019.6 (BACKLOG) and F-701.1 (BACKLOG). The
  only other ticket not in BACKLOG is the T-019 umbrella row (`IN_PROGRESS`), which has no diff. `src/App.tsx` is not
  touched.
- **A15 — Size above the guide, kept as one ticket.** About 750 changed lines: roughly 200 production (migration ≈ 55
  with header, db.js ≈ 60, items/photos/store/sweep ≈ 60 net, migrator ≈ 25) and roughly 550 tests and docs
  (`rls.db.test.ts` ≈ 220, migrator ≈ 70, isolation/sweep ≈ 80, fakes ≈ 100 mechanical, scoping/db ≈ 60, docs ≈ 30). The
  fallback seam is in *Split proposal*.
- **A16 — Dependencies:** T-019.2 and T-019.3 must be `MERGED` before `/run` implements. The branch starts from `main`
  with the contract and ai_settings migrations present.

## Blocking questions
None. No new DB role, grant, secret or Ming step is needed. The open consult questions are answered by A1, A2, A3 and A9.

## Split proposal
None by default (A15). Fallback if the first implement/review cycle runs over:
- **T-019.4a:** `withUser`/`withMaintenance` in `db.js`, all call sites moved (items, photos, store, sweep), the 42501
  handling, `fakePool` and the adapted fakes, `db.test.ts`, the `scoping.test.ts` guards. This is safe to merge alone:
  without RLS the GUC is simply ignored.
- **T-019.4b:** the migration, the migrator guard, `rls.db.test.ts`, the owner-role switch of the isolation and sweep
  suites, the schema/migrator test updates, docs.

Both must ship in the same release as T-019.1–T-019.3 (A8).
