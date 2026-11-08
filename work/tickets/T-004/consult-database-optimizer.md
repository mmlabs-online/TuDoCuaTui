# Consult — database-optimizer (T-004)

## Findings

Read-only review of both TuDo migrations, supabase/tests, config.toml, and all stoktok migrations.

### 1. Objects to rename
Init migration, `D:\mmlabs\spaceM\projects\tudocuatui\supabase\migrations\20261106000000_init.sql`:
- Enums (lines 11, 14, 17): item_category, item_status, season become tudo_item_category, tudo_item_status, tudo_season. Update every column that uses them (lines 45, 46, 54).
- Function (line 21): set_updated_at becomes tudo_set_updated_at. Trigger (line 65): items_updated_at becomes tudo_items_updated_at. The trigger's `execute function` call (line 67) must change too.
- Tables (lines 29, 41, 71, 86): tudo_locations, tudo_items, tudo_item_photos, tudo_wear_logs. Update every `references public.*` and every `from`/`join` in the view (lines 52, 74, 89, 106-116).
- View (line 98): tudo_items_with_stats. Keep `security_invoker = true`.
- Explicit indexes (lines 38, 60-63, 81, 83, 94):
  - tudo_locations_user_idx
  - tudo_items_user_idx
  - tudo_items_location_idx
  - tudo_items_colors_gin
  - tudo_items_tags_gin
  - tudo_item_photos_item_idx
  - tudo_item_photos_one_primary
  - tudo_wear_logs_item_idx
  - Index names share the relation namespace of schema public, so unprefixed names could collide with stoktok objects.
- Constraints: none are named explicitly. The auto-generated ones (`*_pkey`, `*_user_id_fkey`, `tudo_locations_user_id_name_key`, `tudo_item_photos_storage_path_key`, `tudo_items_name_check`, `tudo_items_price_check` and so on) follow the table name, so the table rename is enough. Longest name is about 45 characters, well under the 63-character limit.
- Table policies (lines 129, 134, 144, 152): rename to "tudo_locations: owner full access", "tudo_items: …", "tudo_item_photos: …", "tudo_wear_logs: …".
- Storage policies on storage.objects (lines 168, 172, 176, 180): rename to "tudo_wardrobe: read own files" and the other three. Policy names are per-table, so there is no real collision, but the prefix makes them identifiable on the shared project.
- Bucket 'wardrobe' (line 163) stays, as agreed. The storage policies are scoped to `bucket_id = 'wardrobe'`, so they cannot leak into other buckets.
- Line 8, `create extension if not exists pgcrypto`: it is a no-op on Supabase and nothing in TuDo needs it, because gen_random_uuid() is built in. Leave it in. Do not drop it in any rollback, since stoktok may rely on it.

Hardening migration, `D:\mmlabs\spaceM\projects\tudocuatui\supabase\migrations\20261107120000_rls_hardening.sql`:
- Lines 22-24: schema private becomes tudo_private.
- Lines 28, 45, 46, 51: function owns_location becomes tudo_private.tudo_owns_location. The prefix on the function itself is optional because the schema is already prefixed. Pick one convention and say so in the plan.
- Lines 48 and 54: `alter policy` names must match the renamed policies.
- Lines 49-60: table references become tudo_locations, tudo_items, tudo_item_photos.
- Comment blocks to update: the precheck queries (lines 17-20), the rollback block (lines 62-71), and the header text.

Other files to update in the same ticket:
- `D:\mmlabs\spaceM\projects\tudocuatui\supabase\tests\rls_hardening.sql` references `private.owns_location` at lines 39-45, 53 and 54 and `public.*` tables throughout.
- `rls_tables.sql` and `rls_storage.sql` need the same renames.
- `src/types/database.ts` and the Supabase repo code (`.from(...)`, enum values, view name) need the renames.
- UI labels and local mode do not change (R1, R6).

### 2. Grants TuDo needs
Neither migration issues any `grant` on tables today (the only grants are on schema private and the function, hardening lines 24, 45-46). TuDo currently relies entirely on Supabase's default privileges. After stoktok's revoke, that reliance breaks, so the grants must be explicit.

**Add to the init migration:**
```sql
revoke all on public.tudo_locations, public.tudo_items, public.tudo_item_photos,
              public.tudo_wear_logs, public.tudo_items_with_stats from anon;
grant select, insert, update, delete
  on public.tudo_locations, public.tudo_items, public.tudo_item_photos, public.tudo_wear_logs
  to authenticated;
grant select on public.tudo_items_with_stats to authenticated;
revoke all on function public.tudo_set_updated_at() from public, anon, authenticated;
```
The enum types need `grant usage on type … to authenticated` only if you want it explicit. Types default to PUBLIC usage, and stoktok's default-privilege revoke does not cover types (lines 17-19 cover tables, sequences and functions only).

**Why the view needs those table grants:** the view is `security_invoker`, so the caller's privileges and RLS apply to the underlying tables. It needs SELECT on all four tables, and the grant above covers that. The view itself needs only SELECT.

**Per object:**
- Sequences: none. All primary keys are uuid with gen_random_uuid(), so no sequence grants are needed.
- Trigger function tudo_set_updated_at: no EXECUTE grant to anyone. Postgres checks EXECUTE only when the trigger is created, by the owner, and not when it fires. Revoking from PUBLIC also keeps it out of PostgREST RPC. The revoke is hygiene.
- Helper in the private schema (hardening lines 24, 45-46) stays as it is, with names changed:
  - `grant usage on schema tudo_private to authenticated`
  - `revoke all on function … from public, anon`
  - `grant execute on function … to authenticated`
- anon needs nothing, and nothing in the TuDo UI works while logged out. Keep the explicit `revoke … from anon`: on a fresh local DB the default ACL gives anon ALL on the new tables, and the revoke is what closes that.
- No TRUNCATE, REFERENCES, TRIGGER or column-level grants are needed.

### 3. Stoktok's default-privilege revoke (lines 17-19 of 20261023000200_v1_rls_grants.sql)
- `alter default privileges` without `FOR ROLE` applies to the role that runs it. That is `postgres`, the role the CLI uses for `db push`, so it edits postgres's default ACL entries.
- On Supabase, postgres (and supabase_admin) have default ACLs in public that grant anon, authenticated and service_role. Stoktok removed anon and authenticated from the postgres entry.
- The Dashboard SQL Editor also runs as postgres, so objects created there after stoktok's migration get no anon or authenticated grants. The revoke is effective for them. Objects created by supabase_admin (some extensions) are unaffected.
- On functions the revoke only strips anon and authenticated from the default ACL. PUBLIC keeps EXECUTE, so any function created later is still callable through PUBLIC. That is why the explicit `revoke … from public` matters.
- The revoke is not retroactive. Lines 9 and 14 only touch stoktok's own tables, plus all sequences in public (TuDo has none).

**If TuDo's migrations run BEFORE stoktok's** (a different order on the shared project, or a fresh scratch DB holding both):
- TuDo's tables keep the default grants, anon ALL included. RLS would still block anon because there are no anon policies, but the grants would be loose. The explicit `revoke … from anon` fixes this.
- Stoktok's later `revoke all on all sequences` (line 14) and default-ACL revokes do not remove TuDo's explicit grants, because TuDo's tables are not in the line 6 list.
- With explicit grants in the TuDo migrations, the end state is the same in either order. That is the main reason to add them.

**Check before applying to the hosted project** (read-only):
`select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;`
This confirms what the default ACL looks like and which role owns it.

### 4. Simulating the revoke in local pgTAP without touching TuDo's migrations
Supabase local migrations run as postgres, so the same `alter default privileges` applies to them. The simulation must run before TuDo's objects are created. A statement inside a pgTAP test is too late: revoking existing grants there would also strip TuDo's own explicit grants and prove nothing.

Recommended approach:
- Keep `supabase/tests/support/stoktok_default_privileges.sql` containing the three statements from stoktok lines 17-19.
- Add a script (for example `scripts/test-db-shared.sh`, or a CI step) that does this:
  1. Copy the file to `supabase/migrations/20200101000000_sim_stoktok_defaults.sql`.
  2. Run `supabase db reset`, then `supabase test db`.
  3. Delete the copy in a trap.
  4. Add that filename to `.gitignore`.
- The early timestamp makes it run first, which is the "stoktok already applied" case. Plain `supabase db reset` without the copy covers the "TuDo first" case. Run both variants in CI.
- Add pgTAP assertions that hold in both variants:
  - `table_privs_are('public','tudo_items','anon',array[]::text[])`
  - `table_privs_are('public','tudo_items','authenticated',array['SELECT','INSERT','UPDATE','DELETE'])`, and the same for the other three tables
  - `table_privs_are('public','tudo_items_with_stats','authenticated',array['SELECT'])`
  - `function_privs_are('public','tudo_set_updated_at',array[]::text[],'authenticated',array[]::text[])` and the same for anon
  - existing positive controls through `set local role authenticated`, such as the lives_ok calls at `rls_hardening.sql` lines 57-60
- An alternative that stays inside one test file is a transaction that drops the tudo_* objects, applies the revoke, and re-runs the migrations through `\i`. It is fragile and not recommended.

### 5. Shared-project collision risks
- **Stoktok objects:** its migrations (all of them, checked by grep) define no functions, triggers, policies, views, types or extensions, and nothing touches auth.users or storage. Its tables (transactions, corporate_actions, assets, watchlist, settings, prices_daily, data_gaps, plus symbols, financials, signals, prices_intraday, lottery_draws, lottery_tickets) do not clash with TuDo names, even unprefixed. There is no collision on functions, extensions or storage policies today.
- **Migration history (largest operational risk):** the hosted project's `supabase_migrations.schema_migrations` already lists stoktok's versions. `supabase db push` from the TuDo repo will refuse ("remote migration versions not found in local migrations directory"), and `migration repair` would be wrong here. TuDo timestamps (20261106000000 and 20261107120000) also interleave with stoktok's (for example 20261106000100). Apply the TuDo SQL through the Dashboard SQL Editor (Ming's step per R2) in order: init, then hardening. Do not run `db reset --linked`, `db pull` or `db diff --linked` from the TuDo repo.
- **Type generation:** `supabase gen types --linked` will include stoktok tables. Generate from the local DB instead (`--local`), or filter the output by hand. This is a R2/database.ts point.
- **Shared auth:**
  - auth.users is one pool, so TuDo users and any stoktok users are the same accounts. TuDo's `on delete cascade` FKs mean deleting a user removes their TuDo data.
  - Auth settings are project-wide: site URL, redirect URLs, signup and email-confirmation toggles, providers. TuDo's origin must be added to the redirect allow-list without removing stoktok's. This is a Ming step, so list it in ming-todo.
  - There are no auth.users triggers or auth hooks in either app today. Do not add any in T-004.
- **API exposure:** local config exposes public and graphql_public only (`config.toml` line 13). On the hosted project, confirm `tudo_private` is not in Settings > API > Exposed schemas.
- **Stoktok policy gap:** stoktok's tables have RLS and no policies, and no anon or authenticated grants. TuDo users are therefore blocked from them by grants and RLS. That is good and needs no TuDo action.

## Recommendations
1. Rename everything per section 1. Do not leave any unprefixed object, including indexes, policies and storage policies.
2. Add the explicit grants and revokes from section 2 to the init migration, and the schema and function grants to the hardening migration. This satisfies R2 and R4 and makes the end state independent of stoktok's default ACL.
3. Add the simulation harness and the grant assertions from section 4, with the early-timestamp copy not committed.
4. Update tests, `src/types/database.ts` (generated from local) and the Supabase repo code in the same ticket. Local mode is untouched (R1).
5. Because the migrations are edited in place, the apply is a human step. Write exact Dashboard SQL Editor instructions: apply init, then hardening. Include the pre-check queries from hardening lines 17-20 against the OLD names, if the old objects exist on any project. They should not exist on the shared project, but confirm.
6. Add a post-apply verification to ming-todo, all read-only:
   - `select grantee, privilege_type from information_schema.role_table_grants where table_name like 'tudo_%'`
   - `select relname, relrowsecurity from pg_class where relname like 'tudo_%' and relkind = 'r'`
   - Expect no anon rows and RLS true on all four tables.
7. Risk tier: High (migrations, and the grants and RLS surface). Gate is plan-approval.

## Risks
- If any grant is missed, the app returns 403 / 42501 on the hosted project only, because local defaults mask it. The simulation harness exists to catch this.
- An accidental `supabase db push` against the shared project would fail on history mismatch. The dangerous variants are repair or a forced push.
- Editing applied migrations in place is safe only if the old public.* objects never reached the shared project. Confirm that the old TuDo schema lives on a different project, or drop it by hand first. Never touch stoktok's objects.
- Unprefixed bucket id 'wardrobe' could clash if stoktok later adds the same bucket id. Low likelihood; flag it.
- Revoking `public` EXECUTE on tudo_set_updated_at is safe for triggers, but verify with a test that an update bumps `updated_at` as authenticated.

## Open questions
1. Does the hosted shared project hold any old TuDo objects (public.items and so on) from an earlier apply? Default if unknown: assume not, and have Ming check before applying.
2. Should the function inside the private schema also carry the prefix (`tudo_private.tudo_owns_location`)? Default: no, keep `tudo_private.owns_location`, because the schema is already prefixed.
3. Should enums get explicit `grant usage … to authenticated`? Default: skip, since PUBLIC usage applies. Add it only if you want the grants listing to be self-documenting.
4. Is the CI simulation (copy-in migration script) acceptable, or should it be local-only? Default: both, as a documented script.
