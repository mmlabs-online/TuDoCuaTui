# Consult — database-optimizer — T-019.1 (2026-11-14)

Read: ticket, umbrella plan, earlier T-019 consult, D32/D37, the four applied migrations + README, `migrator.js`, `migrate.js` and tests, `compose.yml`, `check-image.sh`, `ai/store.js`. Nothing changed, no SQL run; statements untested.

## Findings
1. **Fail when rows exist and no owner is safe.** Production rows are Ming's only. Rows the old image inserts between the T-019.1 and T-019.2 releases also have `user_id` null; T-019.2's straggler backfill therefore needs `TUDO_OWNER_SUB` again. "Empty DBs need nothing" (D37) holds for both; production needs the owner at both.
2. **The backfill `UPDATE` fires the `updated_at` triggers** (`items_updated_at`, `ai_settings_updated_at`, `before update` → `now()`). `session_replication_role = replica` needs a superuser (not usable; `migrator.db.test` runs NOSUPERUSER). `alter table … disable trigger <name>` / `enable trigger` works for the table owner.
3. **A malformed owner would be printed by Postgres** (`invalid input syntax for type uuid: "xyz"`, copied into `MigrationError`) if validation is left to the cast.
4. **Two existing tests will fail once the file lands:** `schema.db.test.ts` "migration applies over init data" (line 242) and "category v2 migration" (line 274) insert rows then `runMigrations` on `realDir` without owner. Test-only fix: pass `ownerSub`.
5. **Two schema assertions must change:** "no table has RLS or a user_id column" (line 218) and "items_with_stats columns … primary_photo_id last" (line 83, append `user_id`). The plan must say "existing db tests pass unchanged" does not hold for these.
6. **Other db tests unaffected** (`api`, `app`, `photo-sweep`, `ai/store` migrate empty DBs; nullable column fine).
7. **Old code still works on the view:** `select * from items_with_stats` + whitelisting `toItemRow`; appended last column invisible. `ai/store.js` keyed on `where id` / `on conflict (id)`.
8. **Deploy:** backup → migrate → swap app; a migrate failure stops before the swap (confirm `deploy-tudocuatui.yml` aborts on non-zero migrate).
9. **`check-image.sh` needs no change** (`TUDO_` prefix allowed; image bakes only `NODE_ENV=production`; CI migrates an empty DB).

## Recommendations

### 1. Migration `db/migrations/20261113120000_user_ownership_expand.sql`
1. Header: expand-only, owner GUC, no-op on an empty DB, manual rollback (drop view → restore item_photos_drive view → drop the two indexes and five columns).
2. `alter table locations|items|item_photos|wear_logs|ai_settings add column user_id uuid;` — no default, no NOT NULL, no FK, no check.
3. One `do $$` block: `raw := nullif(btrim(current_setting('tudo.owner_sub', true)), '')`; if any of the five tables has rows: `raw is null` → `raise exception 'rows exist but TUDO_OWNER_SUB is not set'`; `raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'` → `raise exception 'TUDO_OWNER_SUB is not a valid uuid'` (before any cast; message never contains the value); backfill with `disable trigger items_updated_at` / `ai_settings_updated_at`, `update <t> set user_id = raw::uuid where user_id is null` on all five, re-enable both. Empty DB: no-op even if the GUC is set.
4. `create index items_user_created_idx on items (user_id, created_at desc, id);` and `create index locations_user_sort_idx on locations (user_id, sort_order, name);`. No others now; `(user_id, id)` uniques, `(user_id, name)` unique and the `ai_settings` PK come in T-019.2/T-019.3.
5. `create or replace view items_with_stats` with the item_photos_drive body verbatim plus `, i.user_id` last. Do **not** add `and l.user_id = i.user_id` (null = null would drop `location_name` for old-image rows; belongs to T-019.2). No `security_invoker` (T-019.4).

Leave to T-019.2/3: NOT NULL, composite FKs, PG ≥ 15 guard, per-user uniques, `ai_settings` PK, clearing legacy ciphertext, the view's location-join clause, the straggler backfill (same DO-block pattern).

### 2. `server/migrator.js`
- `export function parseOwnerSub(raw)`: trim; empty/undefined → `undefined`; lowercase; uuid regex; reject nil UUID; malformed → `MigrationError("TUDO_OWNER_SUB is not a valid UUID", 2)` with no value.
- `runMigrations({ …, ownerSub })` validates before connecting (exit 2 beats connection errors).
- After `set local tudo.migrating = 'on'`: `if (owner) await client.query("select set_config('tudo.owner_sub', $1, true)", [owner])` — parameter, transaction-local, not recorded in `schema_migrations` or the checksum. Never log the owner (counts only if anything).

### 3. `server/migrate.js`
- Read `process.env.TUDO_OWNER_SUB`, `parseOwnerSub` before `connect`, pass through. Keep the `DATABASE_URL`-unset check where it is.

### 4. Deploy wiring (`deploy/deployment-repo/apps/tudocuatui/compose.yml`)
- `migrate` service only: `environment: TUDO_OWNER_SUB: ""` with a comment ("M-18: set Ming's sub in the release PR; empty is valid only while the DB has no rows; the app does not get it until T-019.2"). Empty = unset → fails safely on a populated DB. No `CHANGE_ME` placeholder (would exit 2 every release). Not in `tudocuatui.env` (shared with the app). Update the header comment. No `check-image.sh` change (optional malformed-owner exit-2 assertion).

### 5. `db/migrations/README.md`
- Replace the "No RLS while single-user" bullet with D32 (expand T-019.1, contract T-019.2/3, RLS T-019.4); document `tudo.owner_sub` via `TUDO_OWNER_SUB` (rows + no owner → fail; empty DB → no-op); add the T-019.1 manual rollback. Do not edit applied files' header comments (checksums).

### 6. Tests
- `migrator.test.ts`: `parseOwnerSub` (undefined/empty/whitespace → undefined; uppercase → lowercase; malformed and nil → exit 2; message never contains the value).
- `migrator.db.test.ts`: seed with migrations 1–4 (temp dir), rows in all five tables incl. `ai_settings`, record `updated_at`; run `realDir` with `ownerSub` → all rows owned, `updated_at` unchanged, triggers still enabled (`pg_trigger.tgenabled = 'O'`), later update bumps `updated_at`. Rows + no owner → rejects, `schema_migrations` keeps four versions, columns absent. Empty DB with/without owner passes. Garbage GUC → "not a valid uuid" without the value. Null `user_id` inserts still accepted after the migration.
- `migrate.cli.test.ts`: malformed owner + unreachable `DATABASE_URL` → exit 2 (not 1), no value in output; `DATABASE_URL` unset + malformed owner → no value in output; valid owner on empty DB → exit 0. `runCli` takes env overrides and deletes inherited `TUDO_OWNER_SUB`.
- `schema.db.test.ts`: pass `ownerSub` in lines 242/274 and assert the backfill; replace "no user_id" with "`user_id` exists, nullable, on exactly the five tables" (keep "no RLS"); append `user_id` last in the view column list; both new indexes exist; view still returns `location_name` for a null-`user_id` row.
- Re-run `api.db`, `app.db`, `photo-sweep.db`, `ai/store.db` unchanged (check `api.db` line 349 re-migration has no rows).
- `git diff --stat db/migrations`: one new file + README.

## Risks
- Wrong `TUDO_OWNER_SUB` silently hands the wardrobe to another account (no users table). Mitigate: backup, read-only `user_id is null` count after deploy, copy the value from the Identity login response; log counts only.
- Straggler rows from the old image stay ownerless until T-019.2 (needs the owner again at that release).
- Brief ACCESS EXCLUSIVE locks on `add column` while the old app runs; `lock_timeout` 10 s, tiny tables → worst case a retried release.
- Disabled triggers are safe only inside the migration transaction (migrator rejects files that end the transaction).
- Release with T-019.1 on a populated DB without owner fails by design (D37); empty compose value is the guard.
- Rollback to the previous image is safe after this migration (nullable column, appended view column).

## Open questions
1. Log a count of backfilled rows? (counts only; skip unless Ming wants an audit line)
2. Accept any UUID version, reject nil only? (recommended; Identity may issue v4 or v7)
3. Does `deploy-tudocuatui.yml` stop the deploy when migrate exits non-zero?
4. Ship compose with empty `TUDO_OWNER_SUB` edited in the release PR (D37), or a `release.env` entry written by the release workflow?
