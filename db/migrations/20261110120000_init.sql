-- =============================================================
-- TuDo — initial schema for the self-hosted Postgres (D23-D25).
-- Tables: locations, items, item_photos, wear_logs. View: items_with_stats.
-- No RLS, no user_id (D25): single user, access is restricted in front of the app.
-- When a second user or in-app auth arrives, every table gets a user_id plus
-- ENABLE and FORCE ROW LEVEL SECURITY in the same migration that adds it.
-- R5: wear_count and last_worn exist only in the view, derived from wear_logs.
--
-- Manual rollback (never run automatically):
--   drop view items_with_stats;
--   drop table wear_logs, item_photos, items, locations;
--   drop function set_updated_at();
--   drop type item_status, item_category;
-- =============================================================

create type item_category as enum
  ('top','bottom','dress','outer','shoes','bag','accessory','sport','home','other');

create type item_status as enum
  ('active','stored','laundry','lent','out');

create function set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- locations (tủ / ngăn / hộp) ----------
create table locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  parent_id   uuid references locations(id) on delete set null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (name),
  check (parent_id <> id)
);
create index locations_parent_idx on locations(parent_id);

-- ---------- items ----------
create table items (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  category       item_category not null default 'other',
  status         item_status   not null default 'active',
  brand          text,
  size           text,
  material       text,
  price          numeric(14,0) check (price is null or price >= 0),   -- VND, no decimals
  purchase_date  date,
  location_id    uuid references locations(id) on delete set null,
  colors         text[] not null default '{}',
  seasons        text[] not null default '{}'
                 check (seasons <@ array['spring','summer','autumn','winter']::text[]),
  tags           text[] not null default '{}',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index items_location_idx on items(location_id);
create index items_colors_gin   on items using gin (colors);
create index items_tags_gin     on items using gin (tags);

create trigger items_updated_at
  before update on items
  for each row execute function set_updated_at();

-- ---------- item_photos (opaque storage reference) ----------
create table item_photos (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  storage_path  text not null unique,
  is_primary    boolean not null default false,
  width         int check (width is null or width > 0),
  height        int check (height is null or height > 0),
  created_at    timestamptz not null default now()
);
create index item_photos_item_idx on item_photos(item_id);
create unique index item_photos_one_primary on item_photos(item_id) where is_primary;

-- ---------- wear_logs (one row per item per day worn; the caller owns "today") ----------
create table wear_logs (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  worn_on     date not null,
  created_at  timestamptz not null default now(),
  unique (item_id, worn_on)
);

-- ---------- View: items + derived stats ----------
create view items_with_stats as
select
  i.id, i.name, i.category, i.status, i.brand, i.size, i.material, i.price,
  i.purchase_date, i.location_id, i.colors, i.seasons, i.tags, i.notes,
  i.created_at, i.updated_at,
  coalesce(w.wear_count, 0)::int as wear_count,
  w.last_worn,
  l.name as location_name,
  p.storage_path as primary_photo_path
from items i
left join lateral (
  select count(*) as wear_count, max(worn_on) as last_worn
  from wear_logs wl
  where wl.item_id = i.id
) w on true
left join locations l on l.id = i.location_id
left join lateral (
  select storage_path
  from item_photos ph
  where ph.item_id = i.id
  order by ph.is_primary desc, ph.created_at
  limit 1
) p on true;
