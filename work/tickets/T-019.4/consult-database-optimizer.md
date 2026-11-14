# Consult — database-optimizer — T-019.4 (2026-11-14, read-only; no SQL run — PG behaviours from docs, confirm with the listed tests)

## Findings
1. **Test connections are superusers.** `createTestDb()` (`server/test/pg.ts`) connects as the admin URL (`postgres`) unless `{owner:true}`; a superuser bypasses RLS even with FORCE → `isolation.db.test.ts`, `api.db.test.ts` etc. would pass vacuously. RLS/isolation/sweep tests must use `createTestDb({owner:true})` (NOSUPERUSER table owner, the D24 production shape); direct-read assertions and `truncate` need a separate admin pool (owner without GUC sees 0 rows; TRUNCATE not subject to RLS).
2. **Residual GUC gotcha.** After a committed `set_config('app.user_id', x, true)`, a pooled session reports `current_setting('app.user_id', true)` as `''`, not NULL; `''::uuid` raises 22P02. Policy must use `nullif(current_setting('app.user_id', true), '')::uuid`. The "no GUC → 0 rows" test must run on a connection that already ran a `withUser` (pool `max:1` or run `withUser` first).
3. **Owner and FORCE.** App role owns the tables; FORCE makes RLS apply to it. `row_security = off` errors for the owner instead of bypassing; only superuser/BYPASSRLS bypass; the owner can `alter table … no force row level security`. RLS here is a second layer against app bugs and SQL injection, not against stolen DB credentials (with or without a BYPASSRLS role). Record in the decision.
4. **Maintenance paths:** the sweep only reads `item_photos` (one list query `id, drive_file_id, created_at` + one re-check), never writes. The migrator runs one transaction per file; past backfills ran before RLS. Data-changing migrations after T-019.4 would silently update 0 rows under FORCE — a trap.
5. **A BYPASSRLS role = a new Ming step:** deployment repo supports it via `postgres/sql/apps/<app>.sql` (superuser extras), but needs a role, a password secret, a sweep `DATABASE_URL`, backup/restore handling and a README change ("no grant/create role"). Adds little given finding 3.
6. **`saveItem` upsert under RLS:** for `insert … on conflict (id) do update … where items.user_id = excluded.user_id` on another user's row, PG raises 42501 ("new row violates row-level security policy") instead of skipping (existing row must pass UPDATE USING and SELECT; unique index still detects the conflict). `mapDbError` has no 42501 → 500 instead of 404; the isolation test "B PUT on A's item → 404" would break.
7. **Transactions needing care:** `items.js` `saveItem`, `removeItem`, `wearItem` (pool queries/connect); `photos.js` `putPhoto` (existence check → Drive IO → `withLockedItem`), `servePhoto` (lookup then stream); `ai/store.js` `get`/`getSecret` single pool queries. Pool `max:5`; a transaction must never span Drive IO or streaming.
8. **View:** `items_with_stats` owned by the table owner; without `security_invoker` it reads with owner rights — FORCE already filters the owner, but set `security_invoker=true` anyway (correct if roles split; T-019.2 security requirement). Lateral joins filtered the same way. `alter view … set (security_invoker = true)` needs PG ≥ 15 (already guarded).
9. **Other effects:** RI checks/cascades bypass RLS (keep working, FK already user-scoped). Backup `pg_dump -U postgres` unaffected; restore `--no-owner --role=app` works. Ming's psql counts as the app role return 0 rows after this → document checks as `postgres` or set the GUC. Indexes: `items(user_id, created_at, id)`, `locations(user_id, …)`, `ai_settings` PK lead with `user_id`; `item_photos`/`wear_logs` queries filter by `item_id`/PK → plain policy fine; sweep scans all of `item_photos` anyway.

## Recommendations
**R-1. No new role. Narrow GUC policy for the sweep; `no force` toggling for migrations.**
- Sweep: `create policy photo_sweep_read on item_photos for select using (current_setting('tudo.maintenance', true) = 'photo-sweep');` — SELECT-only, one table; permissive policies OR-ed (per-user policy unchanged); the sweep sets `set_config('tudo.maintenance','photo-sweep', true)` in a transaction.
- Safety: any session can set any GUC; matters only to an attacker running SQL on the app connection, who could already `set_config('app.user_id', <victim>)` or `alter table … no force`. Values parameterized; `scoping.test.ts` guards. Extra exposure: read of photo ids / `drive_file_id` across users (low).
- No general `tudo.migrating` bypass policy (the app connection could set it).
- Migrations: no policy hook; a migration that reads/writes rows of the five tables wraps the work in `alter table t no force row level security; …; alter table t force row level security;` (transactional). README documents it.
- Migrator post-migration check: if `items` has `relrowsecurity`, all five tables must have `relrowsecurity` and `relforcerowsecurity`, else throw and roll back (catches a forgotten re-force).
- Alternative (hard separation): BYPASSRLS `tudocuatui_maint` role — new Ming step; not recommended unless the sweep gains writes.

**R-2. Migration `20261115xxxxxx_rls.sql`** (new file; rollback text in header):
```sql
create function app_user_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
-- per table t in (locations, items, item_photos, wear_logs, ai_settings):
alter table t enable row level security;
alter table t force row level security;
create policy owner_only on t for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));
create policy photo_sweep_read on item_photos for select
  using (current_setting('tudo.maintenance', true) = 'photo-sweep');
alter view items_with_stats set (security_invoker = true);
```
- `(select …)` → initplan, evaluated once per query. Missing GUC → NULL → 0 rows / writes 42501 (closed); malformed GUC → 22P02 (closed).
- Rollback: `drop policy …; alter table … no force / disable row level security; alter view … reset (security_invoker); drop function app_user_id();`. Image-rollback-safe only while the image is withUser-aware (an older image sees 0 rows) → release code and migration together; README exception.
- No non-owner grants (README rule).

**R-3. `withUser(pool, userId, fn)` in `server/db.js`:** validate with `toUserId`; `connect` → `begin` → `select set_config('app.user_id', $1, true)` → `fn(client)` → `commit`; on error `rollback().catch`, `client.release(err)`; else `release()`. `{readOnly:true}` → `begin read only`. `withMaintenance(pool, 'photo-sweep', fn)` same shape with `tudo.maintenance`. No nesting (guard).

**R-4. Move each query** (keep `(pool, userId, …)` signatures; replace `pool.query`/`connect` internals):
- `items.js`: `listItems`, `listLocations` read-only `withUser`; `saveItem` one `withUser` (location upsert, item upsert, `getItem`) — catch 42501 from the item upsert → `null` (404); keep `where items.user_id = excluded.user_id` as defence in depth; don't rely on `mapDbError`. `removeItem` one `withUser`; `wearItem` one `withUser` incl. stats read; `getItem` takes a client inside or its own `withUser`.
- `photos.js`: `withLockedItem` = `withUser` + `for update` (drop commit/rollback boilerplate); `putPhoto` existence check its own short `withUser`; Drive upload outside any transaction; `servePhoto` short read-only lookup, released before 304/streaming.
- `ai/store.js`: `get`/`getSecret` read-only `withUser`; `save`/`clearKey` `withUser`. `ping` stays unscoped `select 1`.
- A forgotten `pool.query` fails closed (0 rows). Extend `scoping.test.ts` to forbid `pool.query(` with a table literal in `items.js`, `photos.js`, `ai/store.js` (sweep file is the only allow-listed place).

**R-5. Sweep:** both queries (list + per-delete re-check) in `withMaintenance(pool, 'photo-sweep', c => c.query(…))`. `runSweep` takes `{query}` (fake in some tests) → give the fake `connect()` or accept the real pool. Keep `scoping.test.ts` allow-list entries. Test that `tudo.maintenance` appears only in `db.js`, `photo-sweep.js` and the migration.

**R-6. Tests**
- New `server/rls.db.test.ts` (owner role + admin pool): no GUC → 0 rows on five tables and the view; other-user GUC → 0 rows; same on a connection that already used `withUser`; foreign `user_id` insert rejected (WITH CHECK); insert without GUC rejected; `update … set user_id = other` rejected; upsert onto another user's id raises 42501 and PUT returns 404; cascade/`set null` FKs work under RLS; view `reloptions` contains `security_invoker=true`; every public base table except `schema_migrations` has `relrowsecurity`, `relforcerowsecurity` and ≥ 1 policy.
- Sweep under RLS: two-user fixture keeps both users' rows; unreferenced file deleted; a run without maintenance sees nothing and trips the "no listed file is referenced" guard.
- Migrator: a data migration that forgets `force` fails the guard; one with `no force … force` passes; upgrade with existing rows still works and ends with FORCE on.
- T-019.2/.3 isolation tests: owner role + admin pool for assertions; the "every statement mentions user_id" recorder allows `set_config('app.user_id'…)` (control regex).
- Fake pools in `api.test.ts`, `app.test.ts`, `ai/*.test.ts` need `connect()` → client with `query`/`release`; shared helper in `server/test/`.

**R-7. Docs/process:** README (data-migration rule `no force`/`force`; new tables need RLS + FORCE + policy in the same migration, enforced by the catalog test; psql counts as `postgres`); decision: D32 completed, no BYPASSRLS role (D24 holds), sweep via SELECT-only maintenance policy; RLS before T-019.7 sign-up; migration + withUser code in the same release.

## Risks
- Migration without withUser code (or reverse): old image reads 0 rows / new image 42501 on writes → same PR and image.
- Tests as superuser would hide every RLS bug → catalog test + `rolsuper = false` guard on the test pool.
- Forgotten 42501 mapping → cross-user PUT becomes 500.
- A future data migration without `no force` silently affects 0 rows (guard only catches a forgotten re-force; README rule for reviewers).
- Maintenance GUC is a deliberate hole limited to SELECT on `item_photos`; document as accepted.
- Pool exhaustion if a transaction spans Drive IO or streaming (`max:5`).
- Extra round trips (begin + set_config + query + commit); negligible locally.

## Open questions
1. Confirm GUC + SELECT-only policy over a BYPASSRLS role.
2. Sweep stays a manual CLI run as the app role, or a scheduled job later?
3. Migrator post-migration RLS guard strict (throws) or warn only?
4. Update M-item psql verification commands to run as `postgres`?
