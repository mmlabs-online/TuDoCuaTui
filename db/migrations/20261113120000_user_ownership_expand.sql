-- =============================================================
-- TuDo — user ownership, expand step (T-019.1; D32, D37). Expand-only: old code keeps working.
-- Adds a nullable user_id to the five data tables and gives every existing row an owner.
-- The owner comes from the transaction-local setting tudo.owner_sub, which server/migrate.js sets from
-- TUDO_OWNER_SUB. Rows exist and no owner -> the migration raises and rolls back. An empty database
-- needs no owner (nothing is backfilled). The owner value is never put in an error message.
-- NOT NULL, uniques, composite FKs and the view join come in T-019.2; RLS ENABLE + FORCE in T-019.4 (D32).
--
-- Manual rollback (never run automatically):
--   drop view items_with_stats;  -- then recreate it from 20261112120000_item_photos_drive.sql
--   drop index items_user_created_idx;
--   drop index locations_user_sort_idx;
--   alter table locations    drop column user_id;
--   alter table items        drop column user_id;
--   alter table item_photos  drop column user_id;
--   alter table wear_logs    drop column user_id;
--   alter table ai_settings  drop column user_id;
-- =============================================================

alter table locations   add column user_id uuid;
alter table items       add column user_id uuid;
alter table item_photos add column user_id uuid;
alter table wear_logs   add column user_id uuid;
alter table ai_settings add column user_id uuid;

do $$
declare
  raw text := nullif(btrim(current_setting('tudo.owner_sub', true)), '');
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

    -- The backfill must not bump updated_at.
    alter table items disable trigger items_updated_at;
    alter table ai_settings disable trigger ai_settings_updated_at;
    update locations   set user_id = raw::uuid where user_id is null;
    update items       set user_id = raw::uuid where user_id is null;
    update item_photos set user_id = raw::uuid where user_id is null;
    update wear_logs   set user_id = raw::uuid where user_id is null;
    update ai_settings set user_id = raw::uuid where user_id is null;
    alter table items enable trigger items_updated_at;
    alter table ai_settings enable trigger ai_settings_updated_at;
  end if;
end $$;

create index items_user_created_idx on items (user_id, created_at desc, id);
create index locations_user_sort_idx on locations (user_id, sort_order, name);

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
left join locations l on l.id = i.location_id
left join lateral (
  select id, storage_path
  from item_photos ph
  where ph.item_id = i.id
  order by ph.is_primary desc, ph.created_at, ph.id
  limit 1
) p on true;
