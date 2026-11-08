-- RLS tests for tudo_locations, tudo_items, tudo_item_photos, tudo_wear_logs and tudo_items_with_stats (F-006).
-- User A = aaaaaaaa-0000-4000-8000-00000000000a, user B = bbbbbbbb-0000-4000-8000-00000000000b.
-- Row ids: aaaaaaaa-...a1..a6 belong to A, bbbbbbbb-...b1..b4 to B, c3/c4 are B rows on A's item.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

create schema rls_test;
grant usage on schema rls_test to authenticated;
create function rls_test.affected(sql text) returns int language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function rls_test.affected(text) to authenticated;

-- Seed as postgres (bypasses RLS)
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.local', 'authenticated', 'authenticated');
insert into public.tudo_locations (id, user_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A loc'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B loc');
insert into public.tudo_items (id, user_id, name, location_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A item', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B item', 'bbbbbbbb-0000-4000-8000-0000000000b1');
insert into public.tudo_item_photos (id, user_id, item_id, storage_path, is_primary) values
  ('aaaaaaaa-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/a.jpg', false),
  ('bbbbbbbb-0000-4000-8000-0000000000b3', 'bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg', false),
  -- B-owned primary photo on A's item: must stay invisible to A in the view
  ('bbbbbbbb-0000-4000-8000-0000000000c3', 'bbbbbbbb-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-00000000000b/aaaaaaaa-0000-4000-8000-0000000000a2/b.jpg', true);
insert into public.tudo_wear_logs (id, user_id, item_id, worn_on) values
  ('aaaaaaaa-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-0000000000a2', current_date),
  ('bbbbbbbb-0000-4000-8000-0000000000b4', 'bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000b2', current_date),
  -- B-owned wear log on A's item
  ('bbbbbbbb-0000-4000-8000-0000000000c4', 'bbbbbbbb-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-0000000000a2', current_date - 1);

-- Switch to user A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
set local role authenticated;

-- Positive controls: SELECT
select is((select count(*) from public.tudo_locations   where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), 1::bigint, 'control: A sees own location');
select is((select count(*) from public.tudo_items       where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'), 1::bigint, 'control: A sees own item');
select is((select count(*) from public.tudo_item_photos where id = 'aaaaaaaa-0000-4000-8000-0000000000a3'), 1::bigint, 'control: A sees own photo');
select is((select count(*) from public.tudo_wear_logs   where id = 'aaaaaaaa-0000-4000-8000-0000000000a4'), 1::bigint, 'control: A sees own wear log');

-- Positive controls: INSERT (own rows; the new item carries the new photo and wear log)
select lives_ok($$insert into public.tudo_locations (id, name) values ('aaaaaaaa-0000-4000-8000-0000000000a5', 'A loc 2')$$, 'control: A inserts own location');
select lives_ok($$insert into public.tudo_items (id, name, location_id) values ('aaaaaaaa-0000-4000-8000-0000000000a6', 'A item 2', 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'control: A inserts own item');
select lives_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a6', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a6/c.jpg')$$, 'control: A inserts own photo');
select lives_ok($$insert into public.tudo_wear_logs (item_id) values ('aaaaaaaa-0000-4000-8000-0000000000a6')$$, 'control: A inserts own wear log');

-- Cannot read
select is((select count(*) from public.tudo_locations   where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'), 0::bigint, 'A cannot select B''s location');
select is((select count(*) from public.tudo_items       where id = 'bbbbbbbb-0000-4000-8000-0000000000b2'), 0::bigint, 'A cannot select B''s item');
select is((select count(*) from public.tudo_item_photos where id = 'bbbbbbbb-0000-4000-8000-0000000000b3'), 0::bigint, 'A cannot select B''s photo');
select is((select count(*) from public.tudo_wear_logs   where id = 'bbbbbbbb-0000-4000-8000-0000000000b4'), 0::bigint, 'A cannot select B''s wear log');

-- Cannot update
select is(rls_test.affected($$update public.tudo_locations   set name = 'hacked' where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'$$), 0, 'A cannot update B''s location');
select is(rls_test.affected($$update public.tudo_items       set name = 'hacked' where id = 'bbbbbbbb-0000-4000-8000-0000000000b2'$$), 0, 'A cannot update B''s item');
select is(rls_test.affected($$update public.tudo_item_photos set width = 1 where id = 'bbbbbbbb-0000-4000-8000-0000000000b3'$$), 0, 'A cannot update B''s photo');
select is(rls_test.affected($$update public.tudo_wear_logs   set worn_on = current_date - 9 where id = 'bbbbbbbb-0000-4000-8000-0000000000b4'$$), 0, 'A cannot update B''s wear log');

-- Cannot delete
select is(rls_test.affected($$delete from public.tudo_locations   where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'$$), 0, 'A cannot delete B''s location');
select is(rls_test.affected($$delete from public.tudo_items       where id = 'bbbbbbbb-0000-4000-8000-0000000000b2'$$), 0, 'A cannot delete B''s item');
select is(rls_test.affected($$delete from public.tudo_item_photos where id = 'bbbbbbbb-0000-4000-8000-0000000000b3'$$), 0, 'A cannot delete B''s photo');
select is(rls_test.affected($$delete from public.tudo_wear_logs   where id = 'bbbbbbbb-0000-4000-8000-0000000000b4'$$), 0, 'A cannot delete B''s wear log');

-- Cannot attach to B's item / B's location
select throws_ok($$insert into public.tudo_wear_logs (item_id, worn_on) values ('bbbbbbbb-0000-4000-8000-0000000000b2', current_date - 5)$$, '42501', null, 'A cannot insert a wear log on B''s item');
select throws_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('bbbbbbbb-0000-4000-8000-0000000000b2', 'aaaaaaaa-0000-4000-8000-00000000000a/bbbbbbbb-0000-4000-8000-0000000000b2/x.jpg')$$, '42501', null, 'A cannot insert a photo on B''s item');
select throws_ok($$insert into public.tudo_items (name, location_id) values ('x', 'bbbbbbbb-0000-4000-8000-0000000000b1')$$, '42501', null, 'A cannot insert an item with B''s location');
select throws_ok($$update public.tudo_items set location_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$, '42501', null, 'A cannot move own item to B''s location');

-- Cannot create rows owned by B
select throws_ok($$insert into public.tudo_locations (user_id, name) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'x')$$, '42501', null, 'A cannot insert a location owned by B');
select throws_ok($$insert into public.tudo_items (user_id, name) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'x')$$, '42501', null, 'A cannot insert an item owned by B');
select throws_ok($$insert into public.tudo_item_photos (user_id, item_id, storage_path) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/z.jpg')$$, '42501', null, 'A cannot insert a photo owned by B');
select throws_ok($$insert into public.tudo_wear_logs (user_id, item_id, worn_on) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000b2', current_date - 7)$$, '42501', null, 'A cannot insert a wear log owned by B');

-- tudo_items_with_stats (security_invoker)
select is((select count(*) from public.tudo_items_with_stats where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint, 'view: A sees 0 of B''s rows in tudo_items_with_stats');
select is((select count(*) from public.tudo_items_with_stats where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'), 1::bigint, 'view: A sees own item in tudo_items_with_stats');
select is((select wear_count from public.tudo_items_with_stats where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'), 1, 'view: wear_count of A''s item ignores B''s wear log');
select is((select primary_photo_path from public.tudo_items_with_stats where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'), 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/a.jpg', 'view: primary_photo_path of A''s item ignores B''s photo');
select ok(exists (select 1 from pg_class where oid = 'public.tudo_items_with_stats'::regclass and reloptions @> array['security_invoker=true']), 'view: tudo_items_with_stats is security_invoker');

-- B's data unchanged (as postgres)
reset role;
select is((select name from public.tudo_locations where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'), 'B loc', 'after: B''s location unchanged');
select is((select name from public.tudo_items where id = 'bbbbbbbb-0000-4000-8000-0000000000b2'), 'B item', 'after: B''s item unchanged');
select is((select width from public.tudo_item_photos where id = 'bbbbbbbb-0000-4000-8000-0000000000b3'), null, 'after: B''s photo unchanged');
select is((select worn_on from public.tudo_wear_logs where id = 'bbbbbbbb-0000-4000-8000-0000000000b4'), current_date, 'after: B''s wear log unchanged');

select * from finish();
rollback;
