Status: READY

# Plan — T-004: Move TuDoCuaTui onto the shared stoktok Supabase project

Tier: **High** (`supabase/migrations/**`). Gate: `plan-approval`. Ming approves this plan before IMPLEMENT.

## Feature summary
No `F-xxx` covers this. Source is the ticket (Ming, 2026-11-08, in chat):

> - Share the stoktok Supabase DB.
> - Use the table prefix `tudo_`.
> - Share Auth with stoktok. Both apps are single-user (Ming only), and Ming accepts the shared blast radius.
> - Edit the existing migration files in place.
> - Rename schema `private` to `tudo_private`.
> - Run this before the in-progress data-layer tickets.

> Out of scope: Storage bucket `wardrobe` and its policies stay as they are. Photos move to Google Drive in a later ticket.

Related decisions: D11 ("`supabase gen types typescript --local` … instead of `--linked`"), D12 (human steps are `M-n`
items). D17 does not exist yet; this ticket writes it.

Orchestrator notes (2026-11-08): the hosted stoktok project has never had TuDo objects (M-1 was never done). Ming applies
SQL **only** through Dashboard → SQL Editor, never the CLI against the hosted project. Local DB commands never use
`supabase stop --no-backup`.

## Changes vs ticket scope (for Ming's approval)
| # | Change | Why |
|---|---|---|
| C1 | **Indexes are renamed too**: `tudo_locations_user_idx`, `tudo_items_user_idx`, `tudo_items_location_idx`, `tudo_items_colors_gin`, `tudo_items_tags_gin`, `tudo_item_photos_item_idx`, `tudo_item_photos_one_primary`, `tudo_wear_logs_item_idx`. The trigger becomes `tudo_items_updated_at`. | The ticket does not list indexes, but they share the relation namespace of `public` with stoktok's tables (consult §1). |
| C2 | The helper becomes **`tudo_private.tudo_owns_location(uuid)`**, prefixed even though its schema is already prefixed. | AC1 says no TuDo *function* lacks the prefix. One rule ("every object name starts with `tudo_`") is easy to grep. The consult's default was the opposite (no prefix); this plan does not follow it. |
| C3 | The grants are `revoke all … from anon, authenticated`, then `grant select, insert, update, delete` (tables) / `grant select` (view) **to authenticated**. The trigger function gets `revoke all … from public, anon, authenticated`. | The consult revoked only from `anon`. On a fresh DB the default ACL gives `authenticated` ALL (TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN on PG17). Revoking from `authenticated` too gives the same exact privilege set whether stoktok's revoke ran first or not, so one pgTAP assertion holds in both cases. |
| C4 | The **storage policies are not renamed** (they stay `"wardrobe: …"`). | The ticket's Out of scope wins over the consult, which recommended `"tudo_wardrobe: …"`. |
| C5 | **No sequence grants**. | TuDo has no sequences, because every PK is a uuid (consult §2). |
| C6 | `supabase/tests/rls_storage.sql` is **unchanged**. | It references only `storage.objects` and bucket `wardrobe`, with no TuDo table names. |
| C7 | The default-privilege simulation is **one local script**, `scripts/test-db-shared.sh`, plus one `.gitignore` line. It is **not a CI step**. | CI runs no DB tests today (README: "CI does not run these tests yet"). Adding a DB job to CI would be a separate ticket. This is the smallest harness that still proves the grants work (see Approach §4). |
| C8 | The new pgTAP file also asserts **naming** (a catalog check for AC1) and that `updated_at` still bumps after the trigger-function revoke. | Makes AC1 machine-checkable. It covers the consult's risk ("verify with a test that an update bumps `updated_at`"). |
| C9 | `npx supabase stop --no-backup` is replaced by `npx supabase stop` in `README.md` and `docs/qa/smoke-test.md`. | Orchestrator rule. Both files are already in this ticket. |
| C10 | **M-1** becomes the full dashboard setup on the stoktok project: pre-checks, paste both migrations in filename order, Auth redirect URL, user check, `.env.local`. **M-5** becomes the read-only post-apply verification. M-1 gains one step: make sure Ming's email already exists in Authentication → Users, because sign-ups are disabled and `signInWithOtp` cannot create the user. | The ticket asks to rewrite M-1/M-5 as dashboard steps. The user step is a gap the ticket did not mention (`AuthGate.tsx:44` uses `signInWithOtp` with no `shouldCreateUser`). |
| C11 | `src/types/database.ts` is regenerated with `npx supabase gen types typescript --local` and then formatted. This takes over the "regenerate" part of F-002. F-002 keeps the `db:types` script, the oxfmt exclusion and its README step. | The ticket says "regenerate". D11 fixes the source as `--local`. |
| C12 | `src/data/mappers.ts` and `src/data/mappers.test.ts` are edited (type keys only). | They index `Database["public"]["Views"]["items_with_stats"]` and `Enums["item_category" / "item_status" / "season"]`, so typecheck fails without the change. The ticket's file list missed them. |
| C13 | `docs/feature-list.md`: only §1 is edited. F-001's "migration applied (`supabase db push`)" and F-002's `--linked` are **not** rewritten; D17 records that it supersedes them. | Stays inside the ticket ("Feature-list §1 names") without rewriting closed features. |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | No TuDoCuaTui table, view, enum, function, trigger or schema in `supabase/migrations/` lacks the `tudo_` prefix (grep and catalog query after `npx supabase db reset`). | (a) `rg -nP "public\.(?!tudo_)[a-z_]+" supabase/migrations supabase/tests src` → 0 hits. (b) `rg -nP "(?<!tudo_)private\." supabase src` → 0 hits. (c) `rg -nP "\.from\(\"(?!tudo_)" src` → 0 hits. (d) `npx supabase db reset && npx supabase test db`: `grants.sql` › the naming assertions (N1–N6) pass. |
| 2 | With stoktok's default-privilege revoke applied first, the TuDo migrations still give `authenticated` the grants it needs. A pgTAP test asserts the grants, and `anon` has none. | `bash scripts/test-db-shared.sh` exits 0. Its output shows that the simulation-active check passed (`stoktok default privileges simulated: OK`) and that all 4 test files passed. The privilege assertions G1–G13 in `supabase/tests/grants.sql` also pass in the default run (#3). |
| 3 | `npx supabase test db` passes with the renamed objects. All RLS and hardening assertions are kept. | `npx supabase db reset && npx supabase test db` → 4 files OK. `select plan(37)` in `rls_tables.sql` and `select plan(33)` in `rls_hardening.sql` are unchanged. `git diff` of those two files shows only identifier renames: no assertion is removed and no expected value changes. |
| 4 | Checks are green (typecheck, format:check, test, build). `src/types/database.ts` is regenerated and matches the new names. | `pnpm typecheck && pnpm format:check && pnpm test && pnpm build`. Then `npx supabase gen types typescript --local > %TEMP%/db.ts`, format it with oxfmt, and diff it against `src/types/database.ts` → identical. `rg -n "items_with_stats\"|\"item_photos\"|\"wear_logs\"" src/types/database.ts` → only `tudo_*` keys. |
| 5 | Local mode (no env vars) still works unchanged (R1). | `src/data/repo.local.test.ts` passes. `git diff src/data/repo.ts` touches only `createSupabaseRepo` (table/view names). `pnpm dev` with no `.env.local` shows the 16 demo items and no login. |
| 6 | README and M-1 / M-5 describe dashboard-only setup on the stoktok project. D17 is recorded. | Read `README.md` → "Set up Supabase", `work/ming-todo.md` M-1/M-5 and `work/decisions.md` D17. `rg -n "db push|--no-backup|--linked|supabase link" README.md docs/qa work/ming-todo.md` → only lines that say "never" or "do not". |

## Ming verification after merge
- **M-1** on the stoktok project, as rewritten here: pre-checks, apply both migrations in SQL Editor, add the Redirect URL, check the user exists, fill `.env.local`.
- **M-5**: run the read-only verification queries. Expected: `authenticated` has SELECT/INSERT/UPDATE/DELETE on the 4 tables and SELECT on the view, there are no `anon` rows, RLS is true on all 4 `tudo_*` tables, and `tudo_private` is not in Settings → API → Exposed schemas.
- **M-2**: smoke test Run B in Supabase mode against the stoktok project. Expect no `42501` / 403 on any TuDo call.
- stoktok still works after the apply (the TuDo SQL never touches stoktok objects, but Ming confirms the stoktok app once).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `supabase/migrations/20261106000000_init.sql` | Edit in place. Rename the enums, the function, the tables, the FK references, the trigger, the indexes (C1), the view and the 4 table policy names (`"tudo_locations: owner full access"` etc.). Add the grants block (C3). Update the header comment. The storage bucket and storage policies are unchanged (C4). `create extension if not exists pgcrypto` stays. | Ticket scope: rename and grants |
| `supabase/migrations/20261107120000_rls_hardening.sql` | Edit in place. Rename `private` → `tudo_private`, `owns_location` → `tudo_owns_location` (C2), the `alter policy` names, and the table and column-qualifier references (`tudo_locations.user_id`, `tudo_item_photos.storage_path` …). Update the header, the precheck comment and the rollback comment to the new names. Keep the existing schema and function grants. | Ticket scope |
| `supabase/tests/rls_tables.sql` | Identifier renames only. `plan(37)` unchanged. | AC3 |
| `supabase/tests/rls_hardening.sql` | Identifier renames only (tables, `tudo_private.tudo_owns_location`, `schema_privs_are('tudo_private', …)`, the description strings). `plan(33)` unchanged. | AC3 |
| `supabase/tests/grants.sql` | **New.** Privilege assertions, naming assertions and the `updated_at` check (see Tests). | AC1, AC2, C8 |
| `scripts/test-db-shared.sh` | **New.** POSIX bash (3.2), local-only harness for the "stoktok revoke ran first" case (Approach §4). | AC2, C7 |
| `.gitignore` | Add `/supabase/migrations/20200101000000_sim_stoktok_default_privileges.sql`. | A crashed harness must not let the temp migration be committed |
| `src/data/repo.ts` | `.from("items_with_stats" / "locations" / "items" / "item_photos" / "wear_logs")` → `tudo_*` (Supabase repo only). | Ticket scope |
| `src/data/mappers.ts` | Type keys `Views["tudo_items_with_stats"]`, `Tables["tudo_items"]`, `Enums["tudo_item_category" / "tudo_item_status" / "tudo_season"]`. No runtime change. | C12 (typecheck) |
| `src/data/mappers.test.ts` | Type key `Views["tudo_items_with_stats"]`. | C12 (typecheck) |
| `src/types/database.ts` | Regenerate with `--local` and format (C11). | Ticket scope, AC4 |
| `docs/data-model.md` | ERD and text use the `tudo_*` names. One line: "Runs on the shared stoktok project (D17); every object is prefixed `tudo_`." | Ticket scope |
| `docs/qa/smoke-test.md` | SQL checks use the `tudo_*` names. Run B prerequisites point to M-1 (SQL Editor on the stoktok project, no `db push`). `stop --no-backup` → `stop` (C9). | Ticket scope, C9 |
| `docs/feature-list.md` | §1 only: Backend row (shared stoktok project, D17) and the Current state schema names. | Ticket scope, C13 |
| `README.md` | Rewrite "Set up Supabase" as dashboard-only on the stoktok project, in filename order, with the Redirect URL warning (Site URL stays stoktok's) and type generation via `--local`. "Running DB tests": `stop` without `--no-backup`, add `bash scripts/test-db-shared.sh`, list `grants.sql`, and add the warning "never run `db push` / `link` / `db reset --linked` / `db pull` / `db diff --linked` against the shared project". | Ticket scope, C9 |
| `work/ming-todo.md` | Rewrite M-1 and M-5 (C10). | Ticket scope |
| `work/decisions.md` | Add D17 (text in Approach §6). | Ticket scope |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `grants.sql` › G1–G4 `table_privs_are('public','tudo_<t>','authenticated',array['SELECT','INSERT','UPDATE','DELETE'])` for `tudo_locations`, `tudo_items`, `tudo_item_photos`, `tudo_wear_logs` | AC2: exact grant set |
| `grants.sql` › G5 `table_privs_are('public','tudo_items_with_stats','authenticated',array['SELECT'])` | AC2: view |
| `grants.sql` › G6–G10 `table_privs_are(…,'anon',array[]::text[])` on the 4 tables and the view | AC2: anon has none |
| `grants.sql` › G11–G12 `function_privs_are('public','tudo_set_updated_at',array[]::text[],'anon' / 'authenticated',array[]::text[])` | C3: the trigger function is not callable (also not through PUBLIC) |
| `grants.sql` › G13 `schema_privs_are('tudo_private','authenticated',array['USAGE'])` | The helper schema is usable by authenticated |
| `grants.sql` › U1 Seed user A and one `tudo_items` row with `updated_at = '2000-01-01'` as postgres. Switch to A (`set local role authenticated` plus the claims, same pattern as `rls_tables.sql`). Update the name, then `ok(updated_at > '2000-01-01')` read back as postgres. | The trigger still fires after the EXECUTE revoke (`now()` is constant inside the transaction, so it cannot compare against an insert time). |
| `grants.sql` › N1 count of `pg_class` in `public` (relkind `r,v,m,i,S,p,f`) with `relname !~ '^tudo_'` = 0 | AC1: tables, views, indexes |
| `grants.sql` › N2 count of enum types (`typtype = 'e'`) in `public` with no prefix = 0 | AC1: enums |
| `grants.sql` › N3 count of functions in `public` and `tudo_private` with no prefix = 0 | AC1: functions (C2) |
| `grants.sql` › N4 count of non-internal triggers on `public` tables with no prefix = 0 | AC1: triggers |
| `grants.sql` › N5 count of `pg_policies` with `schemaname = 'public'` and `policyname !~ '^tudo_'` = 0 | Ticket "Policy names" (storage policies are excluded, C4) |
| `grants.sql` › N6 `has_schema('tudo_private')` and `hasnt_schema('private')` | AC1: schema |
| `rls_tables.sql`, `rls_hardening.sql` (renamed, same plans) | AC3. When the harness runs them, their positive controls (`lives_ok` inserts and updates as authenticated) also prove the grants end to end. |
| Unit: the existing `mappers.test.ts` and `repo.local.test.ts` | AC4, AC5. There is no new pure logic, so no new unit tests (R8). |

The naming assertions run against the local DB only, where `public` holds only TuDo objects. The file header says so;
on the shared project they would fail because of stoktok's tables, and they are never run there.
`grants.sql` runs inside `begin … rollback`, like the other files. The implementer sets `plan(n)` to the real count.

## Approach
1. **Init migration (R2, R5).** Mechanical rename per consult §1 plus C1. Keep `security_invoker = true` and every
   USING / WITH CHECK expression unchanged except for the identifiers. After the RLS block, add:
   ```sql
   revoke all on public.tudo_locations, public.tudo_items, public.tudo_item_photos,
                 public.tudo_wear_logs, public.tudo_items_with_stats from anon, authenticated;
   grant select, insert, update, delete
     on public.tudo_locations, public.tudo_items, public.tudo_item_photos, public.tudo_wear_logs to authenticated;
   grant select on public.tudo_items_with_stats to authenticated;
   revoke all on function public.tudo_set_updated_at() from public, anon, authenticated;
   ```
   Add a comment explaining why: stoktok's `alter default privileges … revoke … from anon, authenticated`, and the end
   state is the same in either apply order. Nothing for `service_role` (not needed, and stoktok keeps its defaults).
   Do not grant usage on the enums: types default to PUBLIC usage, and stoktok's revoke does not cover types.
2. **Hardening migration.** Rename per consult §1 and C2. The existing `revoke all on schema … from public`,
   `grant usage … to authenticated`, `revoke all on function … from public, anon` and
   `grant execute … to authenticated` stay. They already do not depend on default ACLs (the schema is not `public`).
3. **Tests.** Rename the identifiers in `rls_tables.sql` and `rls_hardening.sql`, also inside the description strings
   (keep the wording). Write `grants.sql`.
4. **Simulation harness, smallest variant (`scripts/test-db-shared.sh`).** It runs from the repo root and holds the
   three statements from stoktok `20261023000200_v1_rls_grants.sql` lines 17–19 **verbatim in a heredoc**, with a
   comment that cites their source. There is no separate support SQL file: anything under `supabase/tests/` would be
   picked up by `supabase test db` and run outside a transaction. Steps:
   1. `set -eu`. Write the heredoc to `supabase/migrations/20200101000000_sim_stoktok_default_privileges.sql`.
      `trap 'rm -f "$SIM"' EXIT INT TERM`.
   2. `npx supabase db reset`. The early timestamp means it runs before TuDo's migrations, as postgres.
   3. Check that the simulation is active:
      `docker exec supabase_db_tudocuatui psql -U postgres -d postgres -tAX -c "select count(*) from pg_default_acl d, aclexplode(d.defaclacl) a where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and a.grantee in ('anon'::regrole, 'authenticated'::regrole)"`
      must print `0`. Otherwise exit 1 with "simulation not active". This stops the harness from passing vacuously.
      Print `stoktok default privileges simulated: OK`.
   4. `npx supabase test db`.
   5. On exit, the trap deletes the file. Print the reminder "run `npx supabase db reset` to return to the default
      variant". The script does not reset again itself (that keeps it short).

   The script never calls `supabase stop`, `--no-backup`, `link`, or any `--linked` command. Invoke it as
   `bash scripts/test-db-shared.sh`, so no executable bit is needed on Windows. The **default variant** ("TuDo first"
   / plain local DB) is the normal `npx supabase db reset && npx supabase test db`. The same assertions must pass in
   both variants.
5. **Code (R1, R6).** `repo.ts`: rename only the identifiers in `createSupabaseRepo`. `createLocalRepo` is untouched.
   `PHOTO_BUCKET` stays `wardrobe`. Start the local stack and run `npx supabase db reset`, then
   `npx supabase gen types typescript --local > src/types/database.ts`, then `pnpm format`. Fix `mappers.ts` and
   `mappers.test.ts` type keys. Introduce no `any`. Run all checks (R8).
6. **Docs and human steps.**
   - **D17** row in `work/decisions.md`:
     - Topic: "Shared Supabase project". Date: 2026-11-08.
     - Decision: TuDoCuaTui runs on the existing stoktok Supabase project (shared Postgres and Auth). Every TuDo DB
       object is prefixed `tudo_`, schema `tudo_private`. Bucket `wardrobe` and its storage policies keep their names
       until photos move to Google Drive (T-005.x).
     - Grants: every migration grants `authenticated` explicitly and `anon` nothing, because stoktok revoked the
       default privileges in `public`.
     - Applying: Ming applies migrations only in Dashboard → SQL Editor, in filename order. Agents never run
       `db push`, `link`, `db reset --linked`, `db pull` or `db diff --linked` against it, because the history table
       holds stoktok's versions.
     - The two existing migrations were edited in place: an allowed exception to R2, since they were only ever
       applied locally.
     - Auth: Site URL stays stoktok's, sign-ups stay disabled, the TuDo origin is added to Redirect URLs.
     - Supersedes `supabase db push` in F-001 and `--linked` in F-002 (already D11).
     - Why: Ming 2026-11-08: both apps are single-user, and he accepts the shared blast radius.
     - Tickets: T-004, F-001, F-002, F-007, every future db ticket.
   - **M-1** (stoktok project):
     1. Read-only pre-checks in SQL Editor: `select to_regclass('public.tudo_items'), to_regnamespace('tudo_private');`
        → both null. `select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;` → record the result.
        Confirm that no bucket `wardrobe` exists yet, or note it if one does.
     2. Paste `20261106000000_init.sql` and run it, then `20261107120000_rls_hardening.sql` and run it, in that order.
        If either fails, stop and report the error. Do not re-run part of a file.
     3. Auth → URL Configuration: **add** `http://localhost:8443` to Redirect URLs. Do not change the Site URL or
        stoktok's entries.
     4. Authentication → Users: make sure Ming's login email exists (sign-ups are disabled). If not, use "Add user".
     5. `.env.local`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the stoktok project (names only).
   - **M-5** (after M-1): read-only verification.
     - `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name like 'tudo\_%' and grantee in ('anon','authenticated') order by 1,2,3;`
       → authenticated: 4 privileges × 4 tables plus SELECT on the view. No anon rows.
     - `select relname, relrowsecurity from pg_class where relname like 'tudo\_%' and relkind = 'r';` → all true.
     - Settings → API → Exposed schemas does not list `tudo_private`.
   - README, smoke-test, data-model and feature-list §1 as listed in Files.

R2: covered by the migrations with RLS in the same files, the regenerated types, and Ming applying. R3: no new
client env vars, anon key only. R4: storage untouched. R7: only the files above. R10: not touched.

## Specialist input used
`consult-database-optimizer.md`:
- **Adopted.** §1 rename list, including indexes (C1). §2 grants block, extended with C3. Keep `pgcrypto` and do not
  drop it. §3 reasoning on default ACLs and apply order. §4 idea of an early-timestamp migration copy that is not
  committed, plus a `.gitignore` entry. The assertion set in §4, plus the `updated_at` check from Risks. §5 SQL Editor
  only, no `db push` / `--linked`, types from `--local`, the auth redirect allow-list as a Ming step, confirming
  `tudo_private` is not exposed. Recommendation 6, the post-apply queries, goes into M-5.
- **Changed.** The revoke covers `authenticated` too, then grants exactly the four privileges (C3). The helper gets the
  `tudo_` prefix (C2, consult open question 2 answered the other way). The support SQL is a heredoc inside the script,
  not a file in `supabase/tests/support/`: `supabase test db` would run it as a test.
- **Rejected.** Renaming the storage policies (ticket Out of scope, C4). A CI job for both variants (CI has no DB
  tests; C7). Explicit enum `grant usage` (consult default: skip). The in-file `\i` re-run alternative (fragile, as the
  consult itself says).
- Consult open question 1 (old TuDo objects on the hosted project): answered by the orchestrator, there are none.
  M-1 step 1 still checks.

## Assumptions
- The hosted stoktok project has no TuDo objects and no bucket `wardrobe` (orchestrator note). M-1 step 1 checks this.
- Local Supabase runs migrations as `postgres`, and `postgres` has default ACL entries in `public` that grant
  anon/authenticated. The harness check (Approach §4.3) fails loudly if that is not true.
- pgTAP `table_privs_are` compares the exact set it knows about. Because of C3, MAINTAIN (PG17) is revoked either way,
  so the assertion is stable whatever the pgTAP version.
- Generating the types needs the local stack running (Docker). The container name is `supabase_db_tudocuatui`
  (README). `pnpm format` reformats the generated file so that `format:check` passes, until F-002 excludes it.
- The size is above the ~400-line guide (about 250 lines of regenerated types plus mechanical renames), but it is one
  atomic change: a half-renamed DB or code is broken. So no split.
- **Hotspots and rebases.**
  - F-002 (IN_PROGRESS): `src/types/database.ts`, `src/data/mappers.ts`, `README.md`. It conflicts and must rebase;
    its "regenerate" step is already done (C11).
  - F-005.2 (IN_PROGRESS): its fake-client tests for `repo.ts` need the `tudo_*` names.
  - F-007 (BLOCKED): `README.md`, `work/ming-todo.md`.
  - F-004.1 and F-601.1: no overlap expected.
  - `work/ming-todo.md` is also edited by `/run` on stops (plan-approval line), so expect a small merge there.
  - `src/App.tsx` is not touched.
- Ming's existing M-4 text ("add the production URL to the Supabase Redirect URLs") already reads correctly under D17
  and is not edited.

## Blocking questions
None.

## Split proposal
None.
