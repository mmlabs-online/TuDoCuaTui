-- F-706.1 (D53): AI credit ledger. Three new tables; the balance is computed from them, never stored (R5).
--   credit_settings  one row: the admin-adjustable welcome and monthly amounts.
--   credit_grants    welcome (one per user, pending until approved_at is set), monthly (one per user and
--                    UTC+7 month, 'YYYY-MM') and manual credits.
--   credit_ops       one row per reserve -> commit | refund; the unique (user_id, op_key) is the idempotency key.
-- Expand-only: an older image never reads these tables, so a rollback to an older image is safe.
-- The module that uses them (server/ai/credits.js) is not wired to any route yet (F-706.4).
-- Existing accounts (D53): every user id that has a row in locations, items, item_photos, wear_logs or
-- ai_settings at this moment, plus TUDO_OWNER_SUB, gets one approved welcome grant. Everyone else gets a pending
-- one the first time the ledger sees them. Credit tables are not part of backup and restore.
-- credit_settings is app-wide data without a user_id: ENABLE + FORCE and a SELECT-only policy; nobody can write it
-- through the app until the admin path of F-706.5 adds a narrow policy.
--
-- Manual rollback (never run automatically):
--   drop table credit_ops; drop table credit_grants; drop table credit_settings;
--   (the policies and indexes go with the tables)

create table credit_settings (
  id boolean primary key default true check (id),
  welcome_amount int not null default 300 check (welcome_amount between 1 and 100000),
  monthly_amount int not null default 60 check (monthly_amount between 1 and 100000),
  updated_at timestamptz not null default now()
);
insert into credit_settings default values;

create table credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bucket text not null check (bucket in ('welcome', 'monthly', 'manual')),
  period text check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount int not null check (amount between 1 and 100000),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((bucket = 'monthly') = (period is not null)),
  check (bucket = 'welcome' or approved_at is not null)
);
create unique index credit_grants_welcome_once on credit_grants (user_id) where bucket = 'welcome';
create unique index credit_grants_monthly_once on credit_grants (user_id, period) where bucket = 'monthly';

create table credit_ops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  op_key text not null check (length(op_key) between 1 and 128),
  kind text not null check (kind in ('photo_fill', 'suggest', 'sticker')),
  credits int not null check (credits between 1 and 1000),
  monthly_part int not null check (monthly_part >= 0),
  lasting_part int not null check (lasting_part >= 0),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  state text not null check (state in ('reserved', 'committed', 'refunded')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint credit_ops_parts_sum check (monthly_part + lasting_part = credits),
  constraint credit_ops_settled check ((state = 'reserved') = (settled_at is null)),
  constraint credit_ops_user_op_key unique (user_id, op_key)
);

-- Existing accounts get the welcome credits once (approved). The five tables are forced, so the owner role sees
-- no rows unless FORCE is lifted for the read (README "RLS rules").
alter table locations no force row level security;
alter table items no force row level security;
alter table item_photos no force row level security;
alter table wear_logs no force row level security;
alter table ai_settings no force row level security;

insert into credit_grants (user_id, bucket, amount, approved_at)
select u, 'welcome', (select welcome_amount from credit_settings), now()
  from (select user_id from locations
        union select user_id from items
        union select user_id from item_photos
        union select user_id from wear_logs
        union select user_id from ai_settings
        union select nullif(current_setting('tudo.owner_sub', true), '')::uuid) s(u)
 where u is not null;

alter table locations force row level security;
alter table items force row level security;
alter table item_photos force row level security;
alter table wear_logs force row level security;
alter table ai_settings force row level security;

alter table credit_settings enable row level security;
alter table credit_settings force row level security;
create policy credit_settings_read on credit_settings for select using (true);

alter table credit_grants enable row level security;
alter table credit_grants force row level security;
create policy owner_only on credit_grants for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

alter table credit_ops enable row level security;
alter table credit_ops force row level security;
create policy owner_only on credit_ops for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));
