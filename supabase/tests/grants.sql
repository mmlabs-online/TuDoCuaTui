-- T-004 grants and naming tests.
-- Grants: authenticated gets exactly SELECT/INSERT/UPDATE/DELETE on the tudo_ tables and SELECT on the view,
-- anon gets nothing. These must hold with and without stoktok's default-privilege revoke
-- (see scripts/test-db-shared.sh).
-- Naming (N1-N6): LOCAL DB ONLY. They assume `public` holds only TuDo objects, which is false on the
-- shared stoktok project, so never run them there.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- G1-G4: authenticated has exactly the four DML privileges on each table
select table_privs_are('public', 'tudo_locations',   'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated privileges on tudo_locations');
select table_privs_are('public', 'tudo_items',       'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated privileges on tudo_items');
select table_privs_are('public', 'tudo_item_photos', 'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated privileges on tudo_item_photos');
select table_privs_are('public', 'tudo_wear_logs',   'authenticated', array['SELECT','INSERT','UPDATE','DELETE'], 'authenticated privileges on tudo_wear_logs');
-- G5: view is read-only
select table_privs_are('public', 'tudo_items_with_stats', 'authenticated', array['SELECT'], 'authenticated privileges on tudo_items_with_stats');
-- G6-G10: anon has nothing
select table_privs_are('public', 'tudo_locations',        'anon', array[]::text[], 'anon has no privileges on tudo_locations');
select table_privs_are('public', 'tudo_items',            'anon', array[]::text[], 'anon has no privileges on tudo_items');
select table_privs_are('public', 'tudo_item_photos',      'anon', array[]::text[], 'anon has no privileges on tudo_item_photos');
select table_privs_are('public', 'tudo_wear_logs',        'anon', array[]::text[], 'anon has no privileges on tudo_wear_logs');
select table_privs_are('public', 'tudo_items_with_stats', 'anon', array[]::text[], 'anon has no privileges on tudo_items_with_stats');
-- G11-G12: the trigger function is not callable by anon / authenticated
select function_privs_are('public', 'tudo_set_updated_at', array[]::text[], 'anon',          array[]::text[], 'anon cannot execute tudo_set_updated_at');
select function_privs_are('public', 'tudo_set_updated_at', array[]::text[], 'authenticated', array[]::text[], 'authenticated cannot execute tudo_set_updated_at');
-- G13: helper schema usable by authenticated
select schema_privs_are('tudo_private', 'authenticated', array['USAGE'], 'authenticated has usage on schema tudo_private');

-- U1: updated_at still bumps after the EXECUTE revoke (now() is constant in a transaction, so seed an old value)
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@test.local', 'authenticated', 'authenticated');
insert into public.tudo_items (id, user_id, name, updated_at) values
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'A item', '2000-01-01');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-00000000000a', true);
set local role authenticated;
update public.tudo_items set name = 'A item renamed' where id = 'aaaaaaaa-0000-4000-8000-0000000000a2';
reset role;
select ok((select updated_at from public.tudo_items where id = 'aaaaaaaa-0000-4000-8000-0000000000a2') > '2000-01-01', 'updated_at bumps on update');

-- N1: relations (tables, views, indexes, sequences ...) in public
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','v','m','i','S','p','f') and c.relname !~ '^tudo_'),
          0::bigint, 'N1: every relation in public starts with tudo_');
-- N2: enums
select is((select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typtype = 'e' and t.typname !~ '^tudo_'),
          0::bigint, 'N2: every enum in public starts with tudo_');
-- N3: functions
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'tudo_private') and p.proname !~ '^tudo_'),
          0::bigint, 'N3: every function in public and tudo_private starts with tudo_');
-- N4: triggers
select is((select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and not g.tgisinternal and g.tgname !~ '^tudo_'),
          0::bigint, 'N4: every trigger on public tables starts with tudo_');
-- N5: policies (storage policies live in schema storage and are excluded on purpose)
select is((select count(*) from pg_policies where schemaname = 'public' and policyname !~ '^tudo_'),
          0::bigint, 'N5: every policy on public tables starts with tudo_');
-- N6: schema
select has_schema('tudo_private', 'N6: schema tudo_private exists');
select hasnt_schema('private', 'N6: schema private does not exist');

select * from finish();
rollback;
