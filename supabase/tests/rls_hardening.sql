-- T-003 hardening: tudo_locations.parent_id and tudo_item_photos.storage_path ownership, plus update-path guards.
-- User A = aaaaaaaa-0000-4000-8000-00000000000a, user B = bbbbbbbb-0000-4000-8000-00000000000b.
-- Note: 'A/../B/x.jpg' passes the folder check by design, because object keys are literal. No assertion.
-- Also checks the properties and privileges of tudo_private.tudo_owns_location.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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

-- Seed as postgres
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.local', 'authenticated', 'authenticated');
insert into public.tudo_locations (id, user_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A loc'),
  ('aaaaaaaa-0000-4000-8000-0000000000a5', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A loc 2'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B loc');
insert into public.tudo_items (id, user_id, name, location_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A item', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B item', null);
insert into public.tudo_item_photos (id, user_id, item_id, storage_path, is_primary) values
  ('aaaaaaaa-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/a.jpg', false),
  ('bbbbbbbb-0000-4000-8000-0000000000b3', 'bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg', false);
insert into public.tudo_wear_logs (id, user_id, item_id, worn_on) values
  ('aaaaaaaa-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-0000000000a2', current_date);

-- Helper properties (as postgres)
select isnt_definer('tudo_private', 'tudo_owns_location', array['uuid'], 'tudo_owns_location is SECURITY INVOKER');
select volatility_is('tudo_private', 'tudo_owns_location', array['uuid'], 'stable', 'tudo_owns_location is STABLE');
select function_lang_is('tudo_private', 'tudo_owns_location', array['uuid'], 'plpgsql', 'tudo_owns_location is plpgsql');
select is((select proconfig from pg_proc where oid = 'tudo_private.tudo_owns_location(uuid)'::regprocedure), array['search_path=""'], 'tudo_owns_location pins search_path to empty');
select function_privs_are('tudo_private', 'tudo_owns_location', array['uuid'], 'anon', array[]::text[], 'anon cannot execute tudo_owns_location');
select function_privs_are('tudo_private', 'tudo_owns_location', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated can execute tudo_owns_location');
select schema_privs_are('tudo_private', 'anon', array[]::text[], 'anon has no usage on schema tudo_private');

-- Switch to user A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
set local role authenticated;

-- Direct calls of the helper
select is(tudo_private.tudo_owns_location('aaaaaaaa-0000-4000-8000-0000000000a1'), true, 'tudo_owns_location: true for A''s own location');
select is(tudo_private.tudo_owns_location('bbbbbbbb-0000-4000-8000-0000000000b1'), false, 'tudo_owns_location: false for B''s location');

-- Positive controls: a 42501 below cannot come from a missing grant
select lives_ok($$update public.tudo_locations set parent_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' where id = 'aaaaaaaa-0000-4000-8000-0000000000a5'$$, 'control: A sets own location parent to own location');
select lives_ok($$insert into public.tudo_locations (name, parent_id) values ('A child', 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'control: A inserts a location under own location');
select is(rls_test.affected($$update public.tudo_locations set name = 'A loc renamed' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$), 1, 'control: A updates own location');
select is(rls_test.affected($$update public.tudo_items set name = 'A item renamed' where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$), 1, 'control: A updates own item');
select is(rls_test.affected($$update public.tudo_item_photos set is_primary = true where id = 'aaaaaaaa-0000-4000-8000-0000000000a3'$$), 1, 'control: A updates own photo without changing its path');
select is(rls_test.affected($$update public.tudo_wear_logs set worn_on = current_date - 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000a4'$$), 1, 'control: A updates own wear log');
select lives_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/c.jpg')$$, 'control: A inserts own photo under A/');

-- GAP-1: tudo_locations.parent_id
select throws_ok($$update public.tudo_locations set parent_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'GAP-1: A cannot set tudo_locations.parent_id to B''s location');
select throws_ok($$insert into public.tudo_locations (name, parent_id) values ('x', 'bbbbbbbb-0000-4000-8000-0000000000b1')$$, '42501', null, 'A cannot insert a location under B''s location');
select throws_ok($$update public.tudo_locations set parent_id = 'cccccccc-0000-4000-8000-0000000000ff' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'A gets 42501, not 23503, for a parent id that does not exist');

-- GAP-2: tudo_item_photos.storage_path
select throws_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-00000000000b/aaaaaaaa-0000-4000-8000-0000000000a2/x.jpg')$$, '42501', null, 'GAP-2: A cannot insert tudo_item_photos with storage_path under B/');
select throws_ok($$update public.tudo_item_photos set storage_path = 'bbbbbbbb-0000-4000-8000-00000000000b/aaaaaaaa-0000-4000-8000-0000000000a2/x.jpg' where id = 'aaaaaaaa-0000-4000-8000-0000000000a3'$$, '42501', null, 'A cannot move own photo''s storage_path under B/');
select throws_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'x.jpg')$$, '42501', null, 'A cannot insert a photo path without a folder');
select throws_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg')$$, '42501', null, 'A gets 42501, not 23505, for B''s existing path');
select throws_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/squat.jpg')$$, '42501', null, 'squat: A cannot claim a path in B''s folder');

-- Update-path regressions
select throws_ok($$update public.tudo_locations set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'A cannot hand own location to B');
select throws_ok($$update public.tudo_items set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$, '42501', null, 'A cannot hand own item to B');
select throws_ok($$update public.tudo_item_photos set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'aaaaaaaa-0000-4000-8000-0000000000a3'$$, '42501', null, 'A cannot hand own photo to B');
select throws_ok($$update public.tudo_wear_logs set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'aaaaaaaa-0000-4000-8000-0000000000a4'$$, '42501', null, 'A cannot hand own wear log to B');
select throws_ok($$update public.tudo_item_photos set item_id = 'bbbbbbbb-0000-4000-8000-0000000000b2' where id = 'aaaaaaaa-0000-4000-8000-0000000000a3'$$, '42501', null, 'A cannot move own photo to B''s item');
select throws_ok($$update public.tudo_wear_logs set item_id = 'bbbbbbbb-0000-4000-8000-0000000000b2' where id = 'aaaaaaaa-0000-4000-8000-0000000000a4'$$, '42501', null, 'A cannot move own wear log to B''s item');

-- Squatting, step 2: switch to user B
reset role;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-00000000000b', true);
set local role authenticated;

select lives_ok($$insert into public.tudo_item_photos (item_id, storage_path) values ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/squat.jpg')$$, 'squat: B can still insert its own photo at B/b2/squat.jpg');

-- After (as postgres): no denied write leaked through
reset role;
select is((select count(*) from public.tudo_item_photos where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and (storage.foldername(storage_path))[1] is distinct from 'aaaaaaaa-0000-4000-8000-00000000000a'), 0::bigint, 'after: no A-owned photo row outside A''s folder');
select is((select parent_id from public.tudo_locations where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), null::uuid, 'after: A''s location has no foreign parent');

select * from finish();
rollback;
