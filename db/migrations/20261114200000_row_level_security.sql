-- T-019.4 (D32): row level security as the second ownership layer. ENABLE + FORCE on every TuDo table; the policy
-- compares user_id with the per-transaction setting app.user_id, which the server sets in withUser (server/db.js).
-- Ship with the withUser code: an older image on this schema reads no rows and its writes fail (42501).
-- No role, grant or bypass is created (D24, one owner role). The photo sweep reads item_photos through the
-- SELECT-only policy photo_sweep_read, reached only through withMaintenance (tudo.maintenance = 'photo-sweep').
--
-- Manual rollback (never run automatically):
--   drop policy owner_only on locations; drop policy owner_only on items; drop policy owner_only on item_photos;
--   drop policy owner_only on wear_logs; drop policy owner_only on ai_settings;
--   drop policy photo_sweep_read on item_photos;
--   alter table <t> no force row level security; alter table <t> disable row level security;  (each of the 5 tables)
--   alter view items_with_stats reset (security_invoker);
--   drop function app_user_id();

create function app_user_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

alter table locations enable row level security;
alter table locations force row level security;
create policy owner_only on locations for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

alter table items enable row level security;
alter table items force row level security;
create policy owner_only on items for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

alter table item_photos enable row level security;
alter table item_photos force row level security;
create policy owner_only on item_photos for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

alter table wear_logs enable row level security;
alter table wear_logs force row level security;
create policy owner_only on wear_logs for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

alter table ai_settings enable row level security;
alter table ai_settings force row level security;
create policy owner_only on ai_settings for all
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

create policy photo_sweep_read on item_photos for select
  using (current_setting('tudo.maintenance', true) = 'photo-sweep');

alter view items_with_stats set (security_invoker = true);
