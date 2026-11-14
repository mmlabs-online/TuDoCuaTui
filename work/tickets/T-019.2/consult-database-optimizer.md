# Consult — database-optimizer — T-019.2 (2026-11-14, read-only, nothing run)

I could not read D37 and did not open the T-019.1 plan/consult. Production PG version unknown (CI `postgres:17`).

## Findings
1. **State after T-019.1:** nullable `user_id uuid` on five tables, no FK/default; view has `user_id` last; `items_user_created_idx`, `locations_user_sort_idx` exist (no new index needed for list queries).
2. **Stragglers are real:** the T-019.1 image writes null-`user_id` rows until the T-019.2 release → contract needs its own backfill + owner assertion; the GUC reaches every pending file (`migrator.js:191`).
3. **Constraint names to drop** (generated): `locations_name_key`, `locations_parent_id_fkey`, `items_location_id_fkey`, `item_photos_item_id_fkey`, `wear_logs_item_id_fkey`. Kept: `locations_check`, `item_photos_one_primary`, `item_photos_drive_file_uq`, `wear_logs (item_id, worn_on)` unique, `storage_path` unique, `items_location_idx`, `locations_parent_idx`, `item_photos_item_idx`.
4. **PG-error exposure after NOT NULL:** `errors.js` `dbLogFields` logs `code`/`constraint`/`routine` only; `migrator.js:206` wraps `err.message` only — safe. `mapDbError`: 23503 → 404, 23502 → 400, so a cross-owner FK failure surfaces as 404.
5. **Two behaviours conflict with the ACs:** `handlePhoto` DELETE ignores `withLockedItem`'s result and answers 204 for a missing item (must be 404 for another user's item, changing the missing case too); `saveItem` has no "not mine" path (guarded upsert needs one).

## Recommendations

### A. Contract migration `db/migrations/20261114xxxxxx_user_ownership_contract.sql`
Header: **not expand-only** — the old image's inserts fail on NOT NULL; image rollback = restore the M-18 backup (README + PR). One transaction per file; no `begin`/`commit`; `end $$;`.

```sql
-- 0. PG guard (set null (col) needs 15). Constant message.
do $$ begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PostgreSQL 15 or newer is required';
  end if;
end $$;

-- 1. Lock in app order; lock_timeout is 10s.
lock table locations, items, item_photos, wear_logs in access exclusive mode;

-- 2. Straggler backfill + single-owner assertion (ai_settings read, not changed: T-019.3).
do $$
declare
  raw text := nullif(btrim(current_setting('tudo.owner_sub', true)), '');
  owners int;
  one uuid;
  stragglers boolean;
begin
  select count(distinct u), min(u::text)::uuid into owners, one from (
    select user_id u from locations   where user_id is not null union all
    select user_id from items         where user_id is not null union all
    select user_id from item_photos   where user_id is not null union all
    select user_id from wear_logs     where user_id is not null union all
    select user_id from ai_settings   where user_id is not null) o;
  if owners > 1 then
    raise exception 'rows belong to more than one owner';
  end if;
  stragglers := exists (select 1 from locations where user_id is null)
             or exists (select 1 from items where user_id is null)
             or exists (select 1 from item_photos where user_id is null)
             or exists (select 1 from wear_logs where user_id is null);
  if raw is not null then
    if raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or raw = '00000000-0000-0000-0000-000000000000' then
      raise exception 'TUDO_OWNER_SUB is not a valid uuid';
    end if;
    if owners = 1 and one <> raw::uuid then
      raise exception 'existing owner differs from TUDO_OWNER_SUB';
    end if;
  end if;
  if stragglers then
    if raw is null then raise exception 'rows without owner exist but TUDO_OWNER_SUB is not set'; end if;
    alter table items disable trigger items_updated_at;
    update locations   set user_id = raw::uuid where user_id is null;
    update items       set user_id = raw::uuid where user_id is null;
    update item_photos set user_id = raw::uuid where user_id is null;
    update wear_logs   set user_id = raw::uuid where user_id is null;
    alter table items enable trigger items_updated_at;
  end if;
end $$;
```
- `min(u::text)::uuid` only read when `owners = 1`. All messages constant. The owner check also covers a differing `ai_settings.user_id`. GUC unset + no nulls → passes on the data's own owner. Trigger disable inside the transaction (T-019.1 pattern).

```sql
-- 3. NOT NULL (four tables; ai_settings stays nullable until T-019.3)
alter table locations   alter column user_id set not null;
alter table items       alter column user_id set not null;
alter table item_photos alter column user_id set not null;
alter table wear_logs   alter column user_id set not null;

-- 4. FK targets
alter table locations add constraint locations_user_id_id_key unique (user_id, id);
alter table items     add constraint items_user_id_id_key     unique (user_id, id);

-- 5. Per-user location name
alter table locations drop constraint locations_name_key;
alter table locations add constraint locations_user_id_name_key unique (user_id, name);

-- 6. Swap the FKs (exact names; a wrong name fails the migration)
alter table locations   drop constraint locations_parent_id_fkey;
alter table items       drop constraint items_location_id_fkey;
alter table item_photos drop constraint item_photos_item_id_fkey;
alter table wear_logs   drop constraint wear_logs_item_id_fkey;

alter table locations add constraint locations_parent_fk
  foreign key (user_id, parent_id) references locations (user_id, id) on delete set null (parent_id);
alter table items add constraint items_location_fk
  foreign key (user_id, location_id) references locations (user_id, id) on delete set null (location_id);
alter table item_photos add constraint item_photos_item_fk
  foreign key (user_id, item_id) references items (user_id, id) on delete cascade;
alter table wear_logs add constraint wear_logs_item_fk
  foreign key (user_id, item_id) references items (user_id, id) on delete cascade;
```
- MATCH SIMPLE skips the check when `parent_id`/`location_id` is null. `item_id` NOT NULL → cascade FKs always checked. Explicit names for tests/rollback. No extra child-side index needed. Keep `locations_user_sort_idx`.

```sql
-- 7. View: same column list (user_id already last)
create or replace view items_with_stats as
select  ...unchanged select list...
from items i
left join lateral (select count(*) as wear_count, max(worn_on) as last_worn
                   from wear_logs wl where wl.item_id = i.id) w on true
left join locations l on l.id = i.location_id and l.user_id = i.user_id
left join lateral (select id, storage_path from item_photos ph where ph.item_id = i.id
                   order by ph.is_primary desc, ph.created_at, ph.id limit 1) p on true;
```
Only the location join gets the clause (composite FKs make the others redundant).

**Rollback note (manual):** drop the four `*_fk`, re-add single-column FKs (`parent_id`/`location_id` `on delete set null`, `item_id` `on delete cascade`); drop `locations_user_id_name_key`, `items_user_id_id_key`, `locations_user_id_id_key`; re-add `unique (name)` only if still unique across users; `drop not null` on four tables; plain location join in the view. Realistic rollback: restore the M-18 backup. README: Ownership bullet says T-019.2 is not expand-only.

### B. Scoped SQL (`userId` required; `forUser(pool, userId)` or first param; `::uuid`/`::date` casts in `insert … select`)
**`items.js`**
- `listItems`: `select * from items_with_stats where user_id = $1 order by created_at desc, id` (`toItemRow` whitelists).
- `listLocations`: `select name from locations where user_id = $1 order by sort_order, name`.
- `saveItem` location: `insert into locations (user_id, name) values ($1, $2) on conflict (user_id, name) do update set name = excluded.name returning id`.
- `saveItem` item (guarded upsert): `user_id` in the column list as `$2`, … `on conflict (id) do update set … where items.user_id = excluded.user_id returning id`. Never `user_id` in SET. `rowCount === 0` → rollback (also undoes the location get-or-create), release, return `null` → route 404 with the same body as missing. Conflicting row untouched. Else commit and `getItem(pool, userId, id)`.
- `getItem`: `… where id = $1 and user_id = $2`.
- `removeItem`: lock `select id from items where id = $1 and user_id = $2 for update`; photos `… where item_id = $1 and user_id = $2`; delete `… where id = $1 and user_id = $2`. Another user's id = "already gone" (returns `[]`); keep the route's missing-item status.
- `wearItem(pool, userId, id, delta, today)`: `+1` `insert into wear_logs (user_id, item_id, worn_on) select $1::uuid, i.id, $3::date from items i where i.id = $2 and i.user_id = $1 on conflict (item_id, worn_on) do nothing returning id`; `-1` `delete from wear_logs where user_id = $2 and id = (select id from wear_logs where item_id = $1 and user_id = $2 order by worn_on desc limit 1)`; final `select wear_count, last_worn from items_with_stats where id = $1 and user_id = $2` — empty → `null` (not yours / missing).

**`photos.js`**
- `withLockedItem(pool, userId, itemId, fn)`: `… where id = $1 and user_id = $2 for update` (lock order items → item_photos).
- DELETE: `delete from item_photos where item_id = $1 and id = $2 and user_id = $3 returning id, drive_file_id`; handler uses `withLockedItem`'s boolean → 404 when false (existing 204-for-missing tests change).
- PUT: pre-check `select 1 from items where id = $1 and user_id = $2` → 404; replace `delete … where item_id = $1 and user_id = $2 returning …`; insert with `user_id`; final `getItem(pool, userId, itemId)`.
- `servePhoto`: `select drive_file_id from item_photos where id = $1 and user_id = $2` (304 branch already after it → foreign id 404, never 304).
- In-flight: `Map<userId, number>`, per-user 3, delete entry at 0, global ceiling (e.g. 12); `try/finally`.
- Optional: `userId` in Drive `appProperties` (audit only; `app=tudo` unchanged).

**`photo-sweep.js`** stays unscoped; allowlist each statement with a one-line reason; fail on stale entries.

### C. Tests
1. **`schema.db.test`**: update conflicting cases (null-`user_id` view case impossible; nullable-on-five → NOT NULL on four + nullable `ai_settings`; duplicate location name per user; fixtures need `user_id` — shared `OWNER` helper). New: insert without `user_id` → 23502; same name two users OK, twice one user → 23505; cross-owner item→location, photo/wear→item, location parent → 23503; deleting a location nulls only `location_id`/`parent_id`, rows stay owned; item delete cascades same-user photos/wear; view `location_name` null for another user's location (or assert the definition contains `l.user_id = i.user_id`); constraint names exist / old names gone; view columns unchanged, `user_id` last.
2. **`migrator.db.test`** (T-019.1 state, seed, apply contract): nulls + GUC → owned, `updated_at` unchanged, trigger `tgenabled='O'`; stragglers without GUC → fail; two owners → fail; one owner ≠ GUC → fail; existing owner, no stragglers, no GUC → pass; empty DB → pass; `ai_settings.user_id` untouched and nullable; on every failure `err.message` lacks the uuid and nothing partial applied. PG guard: static check (file contains `150000` + constant message) or a patched test copy.
3. **Two-user isolation** (new `*.db.test`, real routes, identities A/B): B's lists exclude A's; B's PUT on A's id → 404, A's item unchanged, A's locations not duplicated/renamed; body `user_id` ignored; B's new id owned by B; B's "Tủ 1" no collision; B's DELETE / wear ±1 on A's item no-op (wear 404); photo PUT/DELETE/GET on A's ids → 404, A's row and fake Drive file untouched; per-user in-flight (A 3 open → 4th 503, B first succeeds); `photo-sweep.db.test` keeps both users' files, unreferenced still a candidate.
4. **Guard test:** static — SQL strings in `server/*.js` (excluding tests, `migrator.js`, allowlisted sweep) referencing `items`, `items_with_stats`, `locations`, `item_photos`, `wear_logs` require `user_id = $n` per table reference (insert: `user_id` in column list; its `select from items` needs `user_id = $1`); negative fixture; allowlist `ai/store.js` until T-019.3. Runtime — wrap `pool.query`/`client.query` in the two-user test; every non-`begin`/`commit`/`rollback` statement contains `user_id`.

## Risks
- Not rollback-safe after the contract (restore M-18 backup; PR must say so).
- Production PG version unknown; < 15 fails cleanly at step 0 → Ming check `select version()` before the release; fallback single-column FKs + enforcement test.
- Straggler window backfilled to `TUDO_OWNER_SUB` (correct while only Ming's data exists; single-owner assertion catches splits).
- ACCESS EXCLUSIVE on four tables; `lock_timeout` 10 s → failed, rolled-back migration, deploy stops before app swap.
- Guarded upsert is the account-takeover primitive if the `where` is missing — test first.
- Photo DELETE on a missing item changes 204 → 404 (update test, mention in PR).
- No RLS until T-019.4; composite FKs prevent cross-owner references, not reads.

## Open questions
1. Production PG major? (CI 17)
2. Confirm "straggler backfill uses this release's `TUDO_OWNER_SUB`" matches D37.
3. DELETE item route status for a missing item? If 204, another user's id returns the same (ticket requires 404 only for PUT and photos).
4. `appProperties.userId` in this slice? (recommend yes; otherwise follow-up)
5. Global in-flight ceiling wanted?
