-- =============================================================
-- TuDo — item photos in Google Drive (D27, T-005.2). Expand-only: old rows keep working.
-- item_photos gains drive_file_id; storage_path becomes optional (at least one reference is required).
-- items_with_stats gains primary_photo_id as its LAST column (create or replace view keeps the others).
-- No RLS, no user_id (D25).
--
-- Manual rollback (never run automatically):
--   drop view items_with_stats;  -- then recreate it with the definition from the init migration
--   drop index item_photos_drive_file_uq;
--   alter table item_photos drop constraint item_photos_ref_chk;
--   delete from item_photos where storage_path is null;
--   alter table item_photos alter column storage_path set not null;
--   alter table item_photos drop column drive_file_id;
-- =============================================================

alter table item_photos
  add column drive_file_id text check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$');
alter table item_photos alter column storage_path drop not null;
alter table item_photos
  add constraint item_photos_ref_chk check (num_nonnulls(storage_path, drive_file_id) >= 1);
create unique index item_photos_drive_file_uq on item_photos(drive_file_id)
  where drive_file_id is not null;

create or replace view items_with_stats as
select
  i.id, i.name, i.category, i.status, i.brand, i.size, i.material, i.price,
  i.purchase_date, i.location_id, i.colors, i.seasons, i.tags, i.notes,
  i.created_at, i.updated_at,
  coalesce(w.wear_count, 0)::int as wear_count,
  w.last_worn,
  l.name as location_name,
  p.storage_path as primary_photo_path,
  p.id as primary_photo_id
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
