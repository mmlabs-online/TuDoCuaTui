-- T-009 tests: tudo_ai_settings and tudo_ai_calls are service-role only.
-- anon and authenticated have zero privileges, so every access is a privilege error (42501), not a 0-row RLS result.
-- User A = aaaaaaaa-0000-4000-8000-00000000000a, user B = bbbbbbbb-0000-4000-8000-00000000000b, user C = cccccccc-0000-4000-8000-00000000000c.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@test.local', 'authenticated', 'authenticated'),
  ('cccccccc-0000-4000-8000-00000000000c', 'c@test.local', 'authenticated', 'authenticated');
insert into public.tudo_ai_settings (user_id, provider, model, key_ciphertext, key_hint, updated_at) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'claude', 'claude-haiku-5-5', 'v1:QUFBQQ==', 'aaaa', '2000-01-01'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'claude', 'claude-haiku-5-5', 'v1:QkJCQg==', 'bbbb', '2000-01-01');
insert into public.tudo_ai_calls (user_id, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'test'), ('bbbbbbbb-0000-4000-8000-00000000000b', 'test');

-- Privileges (1-6)
select table_privs_are('public', 'tudo_ai_settings', 'anon', array[]::text[], 'anon has no privileges on tudo_ai_settings');
select table_privs_are('public', 'tudo_ai_settings', 'authenticated', array[]::text[], 'authenticated has no privileges on tudo_ai_settings');
select table_privs_are('public', 'tudo_ai_calls', 'anon', array[]::text[], 'anon has no privileges on tudo_ai_calls');
select table_privs_are('public', 'tudo_ai_calls', 'authenticated', array[]::text[], 'authenticated has no privileges on tudo_ai_calls');
select ok(has_table_privilege('service_role', 'public.tudo_ai_settings', 'select') and has_table_privilege('service_role', 'public.tudo_ai_settings', 'insert') and has_table_privilege('service_role', 'public.tudo_ai_settings', 'update') and has_table_privilege('service_role', 'public.tudo_ai_settings', 'delete'), 'service_role has DML on tudo_ai_settings');
select ok(has_table_privilege('service_role', 'public.tudo_ai_calls', 'select') and has_table_privilege('service_role', 'public.tudo_ai_calls', 'insert') and has_table_privilege('service_role', 'public.tudo_ai_calls', 'update') and has_table_privilege('service_role', 'public.tudo_ai_calls', 'delete'), 'service_role has DML on tudo_ai_calls');

-- RLS on, no policies (7-10)
select is((select relrowsecurity from pg_class where oid = 'public.tudo_ai_settings'::regclass), true, 'RLS is enabled on tudo_ai_settings');
select is((select relrowsecurity from pg_class where oid = 'public.tudo_ai_calls'::regclass), true, 'RLS is enabled on tudo_ai_calls');
select policies_are('public', 'tudo_ai_settings', array[]::name[], 'tudo_ai_settings has no policies (deny-all)');
select policies_are('public', 'tudo_ai_calls', array[]::name[], 'tudo_ai_calls has no policies (deny-all)');

-- authenticated: privilege errors on both tables, own row and another user's row (10 tests)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
set local role authenticated;
select throws_ok($$select * from public.tudo_ai_settings$$, '42501', null, 'authenticated cannot select tudo_ai_settings');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'claude', 'claude-haiku-5-5')$$, '42501', null, 'authenticated cannot insert own row into tudo_ai_settings');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'claude', 'claude-haiku-5-5')$$, '42501', null, 'authenticated cannot insert other user row into tudo_ai_settings');
select throws_ok($$update public.tudo_ai_settings set user_id = user_id where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'authenticated cannot update tudo_ai_settings');
select throws_ok($$delete from public.tudo_ai_settings where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'authenticated cannot delete from tudo_ai_settings');
select throws_ok($$select * from public.tudo_ai_calls$$, '42501', null, 'authenticated cannot select tudo_ai_calls');
select throws_ok($$insert into public.tudo_ai_calls (user_id, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'test')$$, '42501', null, 'authenticated cannot insert own row into tudo_ai_calls');
select throws_ok($$insert into public.tudo_ai_calls (user_id, kind) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'test')$$, '42501', null, 'authenticated cannot insert other user row into tudo_ai_calls');
select throws_ok($$update public.tudo_ai_calls set user_id = user_id where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'authenticated cannot update tudo_ai_calls');
select throws_ok($$delete from public.tudo_ai_calls where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'authenticated cannot delete from tudo_ai_calls');
reset role;

-- anon: privilege errors on both tables, own row and another user's row (10 tests)
set local role anon;
select throws_ok($$select * from public.tudo_ai_settings$$, '42501', null, 'anon cannot select tudo_ai_settings');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'claude', 'claude-haiku-5-5')$$, '42501', null, 'anon cannot insert own row into tudo_ai_settings');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'claude', 'claude-haiku-5-5')$$, '42501', null, 'anon cannot insert other user row into tudo_ai_settings');
select throws_ok($$update public.tudo_ai_settings set user_id = user_id where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'anon cannot update tudo_ai_settings');
select throws_ok($$delete from public.tudo_ai_settings where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'anon cannot delete from tudo_ai_settings');
select throws_ok($$select * from public.tudo_ai_calls$$, '42501', null, 'anon cannot select tudo_ai_calls');
select throws_ok($$insert into public.tudo_ai_calls (user_id, kind) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'test')$$, '42501', null, 'anon cannot insert own row into tudo_ai_calls');
select throws_ok($$insert into public.tudo_ai_calls (user_id, kind) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'test')$$, '42501', null, 'anon cannot insert other user row into tudo_ai_calls');
select throws_ok($$update public.tudo_ai_calls set user_id = user_id where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'anon cannot update tudo_ai_calls');
select throws_ok($$delete from public.tudo_ai_calls where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$$, '42501', null, 'anon cannot delete from tudo_ai_calls');
reset role;

-- service_role positive control (2) and CHECK constraints (6)
set local role service_role;
select is((select count(*) from public.tudo_ai_settings), 2::bigint, 'service_role reads both seeded settings rows');
select is((select count(*) from public.tudo_ai_calls), 2::bigint, 'service_role reads both seeded calls rows');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model) values ('cccccccc-0000-4000-8000-00000000000c', 'openai', 'gpt-x')$$, '23514', null, 'provider openai is rejected');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model, key_ciphertext, key_hint) values ('cccccccc-0000-4000-8000-00000000000c', 'claude', 'claude-haiku-5-5', 'v1:QUFBQQ==', 'abcde')$$, '23514', null, 'hint of 5 characters is rejected');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model, key_ciphertext) values ('cccccccc-0000-4000-8000-00000000000c', 'claude', 'claude-haiku-5-5', 'v1:QUFBQQ==')$$, '23514', null, 'ciphertext without hint is rejected');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model, key_ciphertext, key_hint) values ('cccccccc-0000-4000-8000-00000000000c', 'claude', 'claude-haiku-5-5', 'plain-text', 'abcd')$$, '23514', null, 'ciphertext without a version prefix is rejected');
select throws_ok($$insert into public.tudo_ai_settings (user_id, provider, model) values ('cccccccc-0000-4000-8000-00000000000c', 'claude', 'Bad Model')$$, '23514', null, 'model with spaces or capitals is rejected');
select lives_ok($$insert into public.tudo_ai_settings (user_id, provider, model, key_ciphertext, key_hint) values ('cccccccc-0000-4000-8000-00000000000c', 'claude', 'claude-haiku-5-5', 'v1:QUFBQQ==', 'abcd')$$, 'control: a valid row is accepted');

-- updated_at bumps (seeded 2000-01-01, because now() is constant inside a transaction)
update public.tudo_ai_settings set model = 'claude-sonnet-5-5' where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select ok((select updated_at from public.tudo_ai_settings where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a') > '2000-01-01', 'updated_at bumps on update');
reset role;

-- Deleting the auth user cascades to both tables
delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-00000000000b';
select is((select count(*) from public.tudo_ai_settings where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint, 'settings cascade on user delete');
select is((select count(*) from public.tudo_ai_calls where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint, 'calls cascade on user delete');

select * from finish();
rollback;
