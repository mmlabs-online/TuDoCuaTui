-- =============================================================
-- Wardrobe app — initial schema
-- Tables: locations, items, item_photos, wear_logs
-- View:   items_with_stats (wear_count, last_worn, primary photo)
-- Every row is owned by auth.uid() and protected by RLS.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.item_category as enum
  ('top','bottom','dress','outer','shoes','bag','accessory','sport','home','other');

create type public.item_status as enum
  ('active','stored','laundry','lent','out');

create type public.season as enum
  ('spring','summer','autumn','winter');

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- locations (tủ / ngăn / hộp) ----------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  parent_id   uuid references public.locations(id) on delete set null, -- e.g. "Ngăn 2" inside "Tủ phòng ngủ"
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index locations_user_idx on public.locations(user_id);

-- ---------- items ----------
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  category       public.item_category not null default 'other',
  status         public.item_status   not null default 'active',
  brand          text,
  size           text,
  material       text,
  price          numeric(14,0) check (price is null or price >= 0),   -- VND, no decimals
  purchase_date  date,
  location_id    uuid references public.locations(id) on delete set null,
  colors         text[]          not null default '{}',  -- ids: den, trang, xam, kem, be, nau, do, hong, cam, vang, xanhla, reu, xanhduong, navy, tim, hoatiet
  seasons        public.season[] not null default '{}',
  tags           text[]          not null default '{}',  -- free-form occasions: "đi làm", "dự tiệc"…
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index items_user_idx      on public.items(user_id);
create index items_location_idx  on public.items(location_id);
create index items_colors_gin    on public.items using gin (colors);
create index items_tags_gin      on public.items using gin (tags);

create trigger items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ---------- item_photos ----------
-- Storage path convention: {user_id}/{item_id}/{uuid}.jpg  (bucket: wardrobe)
create table public.item_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  storage_path  text not null unique,
  is_primary    boolean not null default false,
  width         int,
  height        int,
  created_at    timestamptz not null default now()
);
create index item_photos_item_idx on public.item_photos(item_id);
-- at most one primary photo per item
create unique index item_photos_one_primary on public.item_photos(item_id) where is_primary;

-- ---------- wear_logs (one row per item per day worn) ----------
create table public.wear_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  worn_on     date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (item_id, worn_on)
);
create index wear_logs_item_idx on public.wear_logs(item_id, worn_on desc);

-- ---------- View: items + computed stats ----------
-- security_invoker => RLS of the underlying tables applies to the caller.
create view public.items_with_stats
with (security_invoker = true) as
select
  i.*,
  coalesce(w.wear_count, 0)::int as wear_count,
  w.last_worn,
  l.name as location_name,
  p.storage_path as primary_photo_path
from public.items i
left join (
  select item_id, count(*) as wear_count, max(worn_on) as last_worn
  from public.wear_logs
  group by item_id
) w on w.item_id = i.id
left join public.locations l on l.id = i.location_id
left join lateral (
  select storage_path
  from public.item_photos ph
  where ph.item_id = i.id
  order by ph.is_primary desc, ph.created_at
  limit 1
) p on true;

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.locations   enable row level security;
alter table public.items       enable row level security;
alter table public.item_photos enable row level security;
alter table public.wear_logs   enable row level security;

create policy "locations: owner full access" on public.locations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "items: owner full access" on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (location_id is null or exists (
      select 1 from public.locations l
      where l.id = location_id and l.user_id = (select auth.uid())))
  );

create policy "item_photos: owner full access" on public.item_photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

create policy "wear_logs: owner full access" on public.wear_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- =============================================================
-- Storage: private bucket "wardrobe", each user only touches {uid}/...
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "wardrobe: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wardrobe: upload own files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wardrobe: update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wardrobe: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
