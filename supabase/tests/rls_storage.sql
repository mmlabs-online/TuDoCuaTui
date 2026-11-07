-- Storage policy tests for bucket wardrobe (F-006).
-- User A = aaaaaaaa-0000-4000-8000-00000000000a, user B = bbbbbbbb-0000-4000-8000-00000000000b.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
insert into storage.objects (bucket_id, name) values
  ('wardrobe', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/a.jpg'),
  ('wardrobe', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg');

select is((select public from storage.buckets where id = 'wardrobe'), false, 'bucket wardrobe is private');

-- Switch to user A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
set local role authenticated;
-- neutralise storage.protect_delete if the image has it
select set_config('storage.allow_delete_query', 'true', true);

select is((select count(*) from storage.objects where bucket_id = 'wardrobe' and name like 'aaaaaaaa-0000-4000-8000-00000000000a/%'), 1::bigint, 'control: A selects own object');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('wardrobe', 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/new.jpg')$$, 'control: A uploads to A/...');
select is((select count(*) from storage.objects where bucket_id = 'wardrobe' and name like 'bbbbbbbb-0000-4000-8000-00000000000b/%'), 0::bigint, 'A cannot select B''s object');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('wardrobe', 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/evil.jpg')$$, '42501', null, 'A cannot upload to B/...');
select is(rls_test.affected($$update storage.objects set metadata = '{}'::jsonb where bucket_id = 'wardrobe' and name = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg'$$), 0, 'A cannot update B''s object');
select throws_ok($$update storage.objects set name = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/moved.jpg' where bucket_id = 'wardrobe' and name = 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/a.jpg'$$, '42501', null, 'A cannot rename own object into B/...');
select is(rls_test.affected($$delete from storage.objects where bucket_id = 'wardrobe' and name = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg'$$), 0, 'A cannot delete B''s object');
select is(rls_test.affected($$delete from storage.objects where bucket_id = 'wardrobe' and name = 'aaaaaaaa-0000-4000-8000-00000000000a/aaaaaaaa-0000-4000-8000-0000000000a2/new.jpg'$$), 1, 'control: A deletes own object');

reset role;
select is((select count(*) from storage.objects where bucket_id = 'wardrobe' and name = 'bbbbbbbb-0000-4000-8000-00000000000b/bbbbbbbb-0000-4000-8000-0000000000b2/b.jpg'), 1::bigint, 'after: B''s object still exists with original name');

select * from finish();
rollback;
