-- Gap probes (F-006, input for T-003). These are expected to FAIL today and are wrapped in todo().
-- When a probe reports "TODO passed", T-003 fixed it: remove its todo wrapper.
-- User A = aaaaaaaa-0000-4000-8000-00000000000a, user B = bbbbbbbb-0000-4000-8000-00000000000b.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create schema rls_test;
grant usage on schema rls_test to authenticated;
-- Runs the statement, then rolls back its effect with a sentinel exception.
create function rls_test.probe(sql text) returns text language plpgsql as $$
begin
  begin
    execute sql;
    raise exception 'probe-ok' using errcode = 'P0001';
  exception when others then
    if sqlerrm = 'probe-ok' then
      return 'CONFIRMED (statement succeeded)';
    end if;
    return 'blocked (SQLSTATE ' || sqlstate || ')';
  end;
end $$;
grant execute on function rls_test.probe(text) to authenticated;

-- Seed as postgres
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.local', 'authenticated', 'authenticated');
insert into public.locations (id, user_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A loc'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B loc');
insert into public.items (id, user_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A item');

-- Switch to user A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
set local role authenticated;

select ok(true, 'GAP-1 result: ' || rls_test.probe($$update public.locations set parent_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$));
select todo('T-003: locations.parent_id is not checked against ownership', 1);
select throws_ok($$update public.locations set parent_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'GAP-1 (T-003): A cannot set locations.parent_id to B''s location');

select ok(true, 'GAP-2 result: ' || rls_test.probe($$insert into public.item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-00000000000b/aaaaaaaa-0000-4000-8000-0000000000a2/x.jpg')$$));
select todo('T-003: item_photos.storage_path is not checked against the owner folder', 1);
select throws_ok($$insert into public.item_photos (item_id, storage_path) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-00000000000b/aaaaaaaa-0000-4000-8000-0000000000a2/x.jpg')$$, '42501', null, 'GAP-2 (T-003): A cannot insert item_photos with storage_path under B/');

reset role;
select * from finish();
rollback;
