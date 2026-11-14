-- =============================================================
-- TuDo — user ownership, contract step (T-019.2; D32, D37). NOT expand-only, NOT image-rollback-safe:
-- once applied, an older app image can still read but cannot write (on conflict (name) -> 42P10,
-- inserts without user_id -> 23502). Rollback = fix forward, or restore the pre-release pg_dump (M-18).
--
-- Needs PostgreSQL 15 or newer (composite FK with a column list in ON DELETE SET NULL).
-- Owner contract: whenever any row exists, tudo.owner_sub (from TUDO_OWNER_SUB, set by server/migrate.js)
-- must be set, and every non-null user_id in the five tables must be one value equal to it. Stragglers
-- (null user_id) are then backfilled. Empty database: no owner needed. Messages are constant: no owner
-- value and no row data ever appears in an error. ai_settings.user_id stays nullable (T-019.3).
-- RLS ENABLE + FORCE comes in its own migration (T-019.4, D32).
--
-- Manual rollback (never run automatically):
--   alter table locations   drop constraint locations_parent_fk;
--   alter table items       drop constraint items_location_fk;
--   alter table item_photos drop constraint item_photos_item_fk;
--   alter table wear_logs   drop constraint wear_logs_item_fk;
--   alter table locations add constraint locations_parent_id_fkey foreign key (parent_id) references locations(id) on delete set null;
--   alter table items add constraint items_location_id_fkey foreign key (location_id) references locations(id) on delete set null;
--   alter table item_photos add constraint item_photos_item_id_fkey foreign key (item_id) references items(id) on delete cascade;
--   alter table wear_logs add constraint wear_logs_item_id_fkey foreign key (item_id) references items(id) on delete cascade;
--   alter table locations drop constraint locations_user_id_name_key;
--   alter table locations drop constraint locations_user_id_id_key;
--   alter table items     drop constraint items_user_id_id_key;
--   alter table locations add constraint locations_name_key unique (name);  -- only if names are still unique
--   alter table locations   alter column user_id drop not null;  -- likewise items, item_photos, wear_logs
--   create or replace view items_with_stats ... without "and l.user_id = i.user_id".
-- =============================================================

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PostgreSQL 15 or newer is required';
  end if;
end $$;

lock table locations, items, item_photos, wear_logs in access exclusive mode;

do $$
declare
  raw text := nullif(btrim(current_setting('tudo.owner_sub', true)), '');
  owners int;
  only_owner uuid;
begin
  if exists (select 1 from locations)
     or exists (select 1 from items)
     or exists (select 1 from item_photos)
     or exists (select 1 from wear_logs)
     or exists (select 1 from ai_settings) then
    if raw is null then
      raise exception 'rows exist but TUDO_OWNER_SUB is not set';
    end if;
    -- Check the format before any uuid cast so the value cannot appear in a cast error.
    if raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or raw = '00000000-0000-0000-0000-000000000000' then
      raise exception 'TUDO_OWNER_SUB is not a valid uuid';
    end if;

    select count(distinct u), min(u::text)::uuid into owners, only_owner from (
      select user_id as u from locations
      union all select user_id from items
      union all select user_id from item_photos
      union all select user_id from wear_logs
      union all select user_id from ai_settings
    ) s where u is not null;
    if owners > 1 then
      raise exception 'rows belong to more than one owner';
    end if;
    if owners = 1 and only_owner <> raw::uuid then
      raise exception 'existing owner differs from TUDO_OWNER_SUB';
    end if;

    -- The backfill must not bump updated_at.
    alter table items disable trigger items_updated_at;
    update locations   set user_id = raw::uuid where user_id is null;
    update items       set user_id = raw::uuid where user_id is null;
    update item_photos set user_id = raw::uuid where user_id is null;
    update wear_logs   set user_id = raw::uuid where user_id is null;
    alter table items enable trigger items_updated_at;
  end if;
end $$;

alter table locations   alter column user_id set not null;
alter table items       alter column user_id set not null;
alter table item_photos alter column user_id set not null;
alter table wear_logs   alter column user_id set not null;

alter table items     add constraint items_user_id_id_key unique (user_id, id);
alter table locations add constraint locations_user_id_id_key unique (user_id, id);
alter table locations drop constraint locations_name_key;
alter table locations add constraint locations_user_id_name_key unique (user_id, name);

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

create or replace view items_with_stats as
select
  i.id, i.name, i.category, i.status, i.brand, i.size, i.material, i.price,
  i.purchase_date, i.location_id, i.colors, i.seasons, i.tags, i.notes,
  i.created_at, i.updated_at,
  coalesce(w.wear_count, 0)::int as wear_count,
  w.last_worn,
  l.name as location_name,
  p.storage_path as primary_photo_path,
  p.id as primary_photo_id,
  i.user_id
from items i
left join lateral (
  select count(*) as wear_count, max(worn_on) as last_worn
  from wear_logs wl
  where wl.item_id = i.id
) w on true
left join locations l on l.id = i.location_id and l.user_id = i.user_id
left join lateral (
  select id, storage_path
  from item_photos ph
  where ph.item_id = i.id
  order by ph.is_primary desc, ph.created_at, ph.id
  limit 1
) p on true;
