Status: READY

# Plan — T-003: Close RLS gaps found by F-006 (only if confirmed)

> **High tier, `Gate: plan-approval`.** Ming approves this plan before any code is written. The section
> **Changes vs ticket scope** lists every place where the plan differs from the ticket text.
> **Revision 2 needs a new "Plan approved".** The approval from revision 1 does not cover it.

## Revision 2 — 2026-11-07 (what changed and why)

**Why.** Implementation attempt 1 (commit `a02e3f0`, `impl-log.md` § Attempt 1) failed on the `locations`
policy from revision 1:
1. **Recursion.** The `with check` on `public.locations` contained `exists (select … from public.locations …)`.
   Postgres rejects any policy whose sub-query reads its own table: `42P17 infinite recursion detected in policy
   for relation "locations"`. This happened on **every** location INSERT/UPDATE, so the existing `rls_tables.sql`
   went red too. Revision 1 claimed there would be no recursion. That claim was wrong.
2. **Name capture.** Inside the sub-query, the unqualified `parent_id` bound to the inner alias. The stored
   expression was `p.id = p.parent_id`. Even without the recursion, the check would have been wrong.

The `item_photos` half was applied as intended (live expression in impl-log), but no test reached it.

**What changes (summary for Ming):**
| | Revision 1 | Revision 2 |
|---|---|---|
| Parent check on `locations` | inline `exists (select … from public.locations …)` | calls a small helper function, **`private.owns_location(uuid)`**: `plpgsql`, `stable`, **SECURITY INVOKER** (no extra privileges), `set search_path = ''` (C10, C11) |
| Where the helper lives | — | new schema **`private`**. It is not exposed through the REST API, and only `authenticated` can use it (C11) |
| Column references | unqualified | **all qualified** (`locations.parent_id`, `item_photos.storage_path`, `item_photos.item_id`, …) (C13) |
| Migration file | new | **the same file, edited in place** on this branch. It is unmerged and was never applied to the hosted project (C12) |
| Local DB | `migration up` | first a **manual rollback** of the defective version through `docker exec psql` (one transaction, including the history row), then `migration up`. No `db reset` (Approach step 5) |
| Tests | 23 | **33**: plus 7 checks on the helper's properties and privileges, 2 direct calls of the helper, and 1 control that inserts a child under an own location |
| `item_photos` check | foldername check | **Unchanged** apart from qualifying the columns |

The decision between a SECURITY DEFINER helper, a SECURITY INVOKER helper and a trigger is explained in
**Approach § Design choice**. A fallback to SECURITY DEFINER is spelled out and pre-approved together with
this plan (step 7). The implementer may use it only if the INVOKER version still raises `42P17` locally.

## Feature summary
Not in the feature list. Sources:

- `work/decisions.md` D9: "Accept … T-003 (RLS gaps, only if F-006 confirms them)."
- `docs/plan-M1.md` §4 row 7: "Two policy gaps: `locations.parent_id` can point at another user's location;
  `item_photos.storage_path` is not checked to start with your own user id (path squatting). No data can be read
  through them | Probes in F-006, fix in T-003".
- Ticket goal: "Users cannot link their rows to another user's rows, even without being able to read them."
- Ticket scope:
  > - `locations` with-check: `parent_id is null or exists (own location)`.
  > - `item_photos` with-check: `storage_path like auth.uid() || '/%'`. Without it, user A could claim a path
  >   in B's folder, and because `storage_path` is `unique`, B's upload for that path would then fail.
  > - Regenerate types (F-002 script).

**The condition "only if confirmed" is met.** F-006 confirmed both gaps (`work/tickets/F-006/impl-log.md`
§ "Gap probe results": `GAP-1: CONFIRMED`, `GAP-2: CONFIRMED`; the reviewer reproduced it in `F-006/review.md`).

## Changes vs ticket scope
Ming delegated reversible decisions to Annie (ticket notes, `work/decisions.md` header). Each change below is
reversible. The default is chosen and the reason given; Ming can overturn any of them when approving.
**C10–C13 are new in revision 2. C5 and C8 were adjusted.**

| # | Ticket text | This plan | Why |
|---|---|---|---|
| C1 | `storage_path like auth.uid() \|\| '/%'` | `(storage.foldername(item_photos.storage_path))[1] = (select auth.uid())::text` | Consult open question 1. This is the **same expression the storage bucket policies use** (`init.sql:170-182`), so a DB row can claim a path exactly when the caller could upload a file there. It also rejects a path with no folder (`x.jpg`): `foldername` returns an empty array, `[1]` is `null`, and a `null` check rejects the row. For real paths, `like` would give the same result (a uuid has no `%`/`_`); it is rejected only for parity. `split_part(…,'/',1)` was also rejected: it accepts a bare `"<uid>"` with no slash. |
| C2 | "Regenerate types (F-002 script)" | **Dropped.** `src/types/database.ts` is not touched. | Consult open question 4. F-002 is not merged, so its script is not on this branch. Generated types contain no policy information. The new helper is in schema `private`, which typegen does not read (it reads `public` only), so the types stay identical (C11). |
| C3 | Test plan: "the F-006 pgTAP suite" (flip the probes) | `supabase/tests/rls_gaps.sql` is **renamed** to `rls_hardening.sql` and holds real assertions only. No `todo()`, no `probe()`, no always-passing `GAP-n result` lines. | Consult "Tests"; security review finding 6. `pg_prove` does not fail on "TODO passed". (Done in `a02e3f0`; revision 2 extends the file.) |
| C4 | (not in ticket) | **Folded in:** update-path regression tests and positive controls (security review findings 3 and 4), plus edge tests for the new checks (squatting, no-folder path, existence oracle). | Consult open question 2. These are the `for all` policies this ticket rewrites, so one `with check` serves both INSERT and UPDATE. Test-only. |
| C5 | Consult: `drop policy` + `create policy` in `begin/commit` | **`alter policy … with check (…)`**. **Rev 2:** the migration also creates schema `private` and one function, **before** the two `alter policy` statements. Still no explicit `begin`/`commit`. | Each `ALTER POLICY` is atomic, so there is never a moment with no policy. The CLI runs each migration file in one transaction, so a failure in any statement rolls back the whole file. `using`, name, command and role stay unchanged. |
| C6 | (not in ticket) | A **read-only precheck** (two `select`s) goes in the migration header as a comment. No data repair. | Consult open question 3. It matters only if the hosted project already has data when M-5 runs. |
| C7 | (not in ticket) | `README.md`: the `rls_gaps.sql` → `rls_hardening.sql` rename, and "paste each file in `supabase/migrations/` in filename order". | Done in `a02e3f0`. **No further README change in revision 2.** |
| C8 | AC 1 "The F-006 gap probes pass." | Made testable: `npx supabase test db` exits 0, **all three files `ok`**, no `todo(` in `supabase/tests/`, and each file's `plan(n)` equals its assertion count (**`plan(33)`** for `rls_hardening.sql`). | Security review finding 6 and recommendation 5. Rev 2: count 23 → 33. "All three files" is stated explicitly because attempt 1 broke `rls_tables.sql`. |
| C9 | AC 2 "Ming applies the migration" | Moved to **Ming verification after merge** (existing item **M-5**). | Only Ming applies migrations to the hosted project (R2). |
| **C10** | `locations`: "`parent_id is null or exists (own location)`" | `locations.parent_id is null or private.owns_location(locations.parent_id)`. The `exists (own location)` moves into a helper function. | An inline `exists` on `locations` inside a `locations` policy is impossible in Postgres (`42P17`, attempt 1). The semantics are the same as the ticket's: the parent is null, or it is a location the caller owns. |
| **C11** | Ticket "Out of scope: any other schema change" | **Two extra objects**: schema `private`, and function `private.owns_location(uuid)`. Nothing else. | This is the minimum needed to make C10 work. `private` instead of `public` means the function is **not callable through PostgREST** (`supabase/config.toml:13` exposes only `public`, `graphql_public`), and the generated types do not change (C2). |
| **C12** | R2 "never edit an applied migration" | `20261107120000_rls_hardening.sql` is **edited in place** on this branch, not superseded by a new file. | The file is unmerged and was **never applied to the hosted project**. It was applied only to the disposable local volume, and the implementer rolls that back first (Approach step 5). A second migration would ship a known-broken policy to `main` and to M-5. |
| **C13** | (not in ticket) | Every column reference in both rewritten policies is **qualified with its table name** (`locations.user_id`, `locations.parent_id`, `item_photos.user_id`, `item_photos.storage_path`, `item_photos.item_id`). | Attempt 1, finding 2 (name capture). |

Not changed: `items`, `wear_logs` and storage policies are untouched; `init.sql` is untouched (R2); no data change.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | One new migration closes GAP-1 and GAP-2. It changes only the `with check` of the two policies and adds only schema `private` + `private.owns_location(uuid)`. No applied migration is edited. | `git diff --stat main -- supabase/migrations` shows exactly one **added** file `20261107120000_rls_hardening.sql`, and no change to `20261106000000_init.sql`. The file contains exactly: `create schema private`, one `create function private.owns_location(p_location_id uuid)` exactly as in Approach step 2 (plpgsql, stable, `security invoker`, `set search_path = ''`, only schema-qualified names), revoke/grant statements, and two `alter policy` statements, each with only a `with check (…)` clause. **No unqualified column name** appears inside either `with check`. |
| 2 | The gap probes pass as real assertions, and the existing suites are green again (C3, C8). | On the local stack (Approach steps 5–8): `npx supabase test db` exits 0 with `rls_hardening.sql … ok`, `rls_storage.sql … ok`, `rls_tables.sql … ok`, `All tests successful`, `Result: PASS`, and **no** `# TODO` / `Failed (TODO)` line. `Grep "todo\(" supabase/tests` returns nothing. `plan(33)` equals the 33 assertions under *Tests to write*. `rls_tables.sql` (`plan(37)`) and `rls_storage.sql` (`plan(10)`) are unchanged files. If the reviewer cannot run Docker, they use the verbatim output in `impl-log.md` § Attempt 2. |
| 3 | The defective attempt-1 version was rolled back locally, and the corrected file is applied. The live objects match the file. | `impl-log.md` § Attempt 2 shows verbatim: (a) the rollback transaction's output, ending in `COMMIT`; (b) `migration list --local` **without** `20261107120000` after the rollback, and **with** it after `migration up`; (c) the `pg_policy` query output. The `locations` row shows `private.owns_location(parent_id)` and **no** `p.parent_id`. (d) the `pg_proc` query output: `prosecdef = f`, `provolatile = s`, `proconfig = {"search_path=\"\""}`, and an ACL with `authenticated=X` and no `anon` and no bare `=X` (PUBLIC). |
| 4 | Types unchanged by design (C2, C11). | `git diff main -- src/types/database.ts` is empty. |
| 5 | Checks green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass (impl-log shows the actual output; the reviewer re-runs them). |

## Ming verification after merge
- **M-5** (already in `work/ming-todo.md`): `npx supabase db push`.
  - If the hosted project **already has data** at that time, first run the two precheck `select`s from the migration header in Dashboard → SQL Editor. Both should return 0 rows. If they do not, stop and file a `/ticket`; do not push.
  - If M-1 is done in the same session (empty project), the precheck can be skipped.
  - If the hosted project has **already** got a schema named `private` (not expected: nothing in this repo creates one), `db push` fails on `create schema private` and nothing is applied. Stop and file a `/ticket`.
- After the push, a quick app check in Supabase mode. Expected: all of these work as before:
  - add a location, then set another location's parent to it;
  - add a photo to an item, then change it.
  The app builds paths as `${uid}/${itemId}/…` (`src/data/repo.ts:148,166`).
- Orchestrator: please append the precheck hint to the M-5 text in `ming-todo.md` on `main` (D16; the implementer does not edit it).

## Files to create / modify
Work on top of `a02e3f0` (branch `ticket/T-003`). README and the test-file rename are already done there.

| File | Change | Required because |
|---|---|---|
| `supabase/migrations/20261107120000_rls_hardening.sql` | **Modify in place** (C12). Rewrite it to the exact SQL in Approach step 2. Update the header comment (adds: why the helper exists, the security notes) and the trailing "Rollback (manual)" comment (now also drops the function and the schema, in the right order). | C10, C11, C12, C13 |
| `supabase/tests/rls_hardening.sql` | **Modify**: `plan(23)` → `plan(33)`; add 7 property/privilege tests, 2 direct-call tests and 1 control (see *Tests to write*); keep the 23 existing assertions as they are. | AC 2, AC 3 |
| `work/tickets/T-003/impl-log.md` | **Append** `## Attempt 2 — <date>`. Keep Attempt 1 unchanged. | AC 2, AC 3 |

Not touched: `README.md` (done in `a02e3f0`), `supabase/migrations/20261106000000_init.sql` (R2), `supabase/tests/rls_tables.sql`, `supabase/tests/rls_storage.sql`, `supabase/config.toml`, `src/**` (incl. `src/types/database.ts`), `work/backlog.md`, `work/ming-todo.md`.

## Tests to write
All in `supabase/tests/rls_hardening.sql`. One transaction, `begin … rollback`, **`plan(33)`**. Seed, the users and the `rls_test.affected` helper stay as in `a02e3f0`. Use pgTAP's function assertions (`isnt_definer`, `volatility_is`, `function_lang_is`, `function_privs_are`, `schema_privs_are`; all in pgTAP ≥ 0.9x). If one of them is missing from the local pgTAP, replace it with an `is(…)` on the `pg_proc` / `has_*_privilege` query that checks the same thing, and record that.

| Test (file › name) | Covers |
|---|---|
| **NEW — helper properties (as `postgres`, right after the seed, before switching to A)** | |
| `rls_hardening.sql › owns_location is SECURITY INVOKER` (`isnt_definer('private','owns_location',array['uuid'], …)`) | No privilege elevation (design choice). **Flip to `is_definer` only under the step-7 fallback.** |
| `› owns_location is STABLE` (`volatility_is(…, 'stable', …)`) | Read-only, safe in a policy |
| `› owns_location is plpgsql` (`function_lang_is(…, 'plpgsql', …)`) | It is never inlined into the policy (this is what avoids `42P17`) |
| `› owns_location pins search_path to empty` (`is((select proconfig from pg_proc where oid = 'private.owns_location(uuid)'::regprocedure), array['search_path=""'], …)`) | No search_path hijack |
| `› anon cannot execute owns_location` (`function_privs_are('private','owns_location',array['uuid'],'anon', array[]::text[], …)`) | Revoke from PUBLIC/anon worked |
| `› authenticated can execute owns_location` (`function_privs_are(…, 'authenticated', array['EXECUTE'], …)`) | The grant the policy needs |
| `› anon has no usage on schema private` (`schema_privs_are('private','anon', array[]::text[], …)`) | The schema is closed to anon |
| **NEW — direct calls (as A, right after the switch)** | |
| `› owns_location: true for A's own location` (`is(private.owns_location(a1), true, …)`) | Positive path, sees the caller's own row |
| `› owns_location: false for B's location` (`is(private.owns_location(b1), false, …)`) | No cross-user true. The same `false` as for a nonexistent id (see below), so it is no oracle. |
| **Positive controls (as A)** — existing 6, plus 1 new | |
| `› control: A sets own location parent to own location` (existing) | UPDATE path of the new check, helper returns true |
| **NEW** `› control: A inserts a location under own location` (`lives_ok` insert (name `'A child'`, parent_id = a1)) | INSERT path of the new check |
| `› control: A updates own location` … `› control: A inserts own photo under A/` (5 existing) | As in revision 1 |
| **GAP-1** (3 existing): set parent to B's location; insert under B's location; nonexistent parent gives `42501`, not `23503` | Now reached for the first time |
| **GAP-2** (5 existing): insert under `B/`; move own path under `B/`; no-folder path; B's existing path gives `42501`, not `23505`; squat in B's folder | Now reached for the first time |
| **Update-path regressions** (6 existing) | As in revision 1 |
| **Squat step 2, as B** (1 existing) | As in revision 1 |
| **After, as postgres** (2 existing) | As in revision 1 |

Count: 7 + 2 + 7 + 3 + 5 + 6 + 1 + 2 = **33**.

Rules:
- The helper property tests run as `postgres`, before `set local role authenticated`.
- The direct calls go right after the switch to A. The new control goes right after the existing control 1.
- The name `'A child'` must not collide with `unique (user_id, name)`.
- Never weaken an existing assertion. If the count must change, `plan(n)` equals the real number, and the reason goes in impl-log.

Header comment of the file: add one line saying it also checks the helper's properties and privileges.

No Vitest changes: no TypeScript logic changes (R8 is met by the pgTAP suite).

## Approach

### Design choice: how to check "parent is my own location"
| Option | Verdict | Reason |
|---|---|---|
| Inline `exists` on `locations` (revision 1) | ✗ | `42P17`. The rewriter expands policy sub-queries and refuses any that reads the policy's own table. |
| **Helper, `plpgsql`, SECURITY INVOKER, in `private`** | **✓ chosen** | **Least privilege.** The body runs as the caller (`authenticated`), under the caller's own RLS, so the helper can never see more than the caller can. A function call is not a sub-link, so the rewriter does not expand it. A `plpgsql` body is never inlined, so it is planned as its own query at run time. That query's RLS on `locations` is the plain `using (user_id = auth.uid())`, which does not read `locations` again, so there is no recursion. |
| Helper, SECURITY DEFINER | fallback only | This is the usual Supabase pattern, and it is the expected route if INVOKER unexpectedly still recurses. But it runs as the owner (`postgres`, which bypasses RLS on these tables), so any future edit of the body could leak other users' rows. Here it would gain nothing: the body filters on `auth.uid()` anyway, so the result is the same. |
| Helper, `language sql`, INVOKER | ✗ | Whether the planner inlines a SQL function is decided by internal rules. Avoid depending on them. |
| `BEFORE INSERT OR UPDATE` trigger | ✗ | The check would live outside RLS, where policy reviews do not look. The trigger also fires for `service_role`/`postgres`, which RLS bypasses; there `auth.uid()` is null, so the trigger would need its own bypass logic. It needs a hand-written error code. It is more code, and it moves away from the ticket's "with-check". |

**Security notes (for the auditor):**
- **No oracle.** The helper returns `true` only for a location the caller owns. It returns `false` both for another user's location and for a nonexistent id. The caller could already learn its own rows through `select`.
- **No API surface.** Schema `private` is not in PostgREST `api.schemas` (`supabase/config.toml:13`), so the helper cannot be called as `/rpc/owns_location`.
- **Grants.**
  - `usage` on `private` goes to `authenticated` only.
  - `EXECUTE` on the function is revoked from `PUBLIC` (a Postgres default) and from `anon`, and granted to `authenticated` only. The policy is `to authenticated`.
  - `service_role` does not need it, because it bypasses RLS.
  - Nobody gets `create` on `private`.
- **Hardened body.**
  - `set search_path = ''`, and every name is schema-qualified (`public.locations`, `auth.uid()`).
  - It is `stable`: it reads, never writes.
  - The parameter name `p_location_id` cannot clash with a column name.
- **Snapshot.** The helper sees rows that existed when the statement started. So a parent and its child inserted **in the same statement** are rejected. The inline `exists` would behave the same. The app inserts one location per call (`src/data/repo.ts`).
- **Unchanged behaviour.** `on delete set null` on `parent_id` is unaffected (FK actions run as the table owner). Self-parent and cycles are possible today and stay possible (out of scope).

### Steps
1. **Branch** `ticket/T-003` at `a02e3f0` or later. Do not create a new migration file (C12).
2. **Migration**: rewrite `supabase/migrations/20261107120000_rls_hardening.sql`. Keep the existing header (gaps, precheck). Add a short "why a helper" paragraph and the security notes above, in a few lines. The statements, exactly:
   ```sql
   create schema private;
   revoke all on schema private from public;
   grant usage on schema private to authenticated;

   -- True when the caller owns the location. SECURITY INVOKER: runs under the caller's RLS.
   -- plpgsql so it is never inlined into the policy (an inline self-reference raises 42P17).
   create function private.owns_location(p_location_id uuid)
   returns boolean
   language plpgsql
   stable
   security invoker
   set search_path = ''
   as $$
   begin
     return exists (
       select 1
       from public.locations l
       where l.id = p_location_id
         and l.user_id = (select auth.uid())
     );
   end;
   $$;

   revoke all on function private.owns_location(uuid) from public, anon;
   grant execute on function private.owns_location(uuid) to authenticated;

   alter policy "locations: owner full access" on public.locations
     with check (
       locations.user_id = (select auth.uid())
       and (locations.parent_id is null or private.owns_location(locations.parent_id))
     );

   alter policy "item_photos: owner full access" on public.item_photos
     with check (
       item_photos.user_id = (select auth.uid())
       and (storage.foldername(item_photos.storage_path))[1] = (select auth.uid())::text
       and exists (select 1 from public.items i
                   where i.id = item_photos.item_id and i.user_id = (select auth.uid()))
     );
   ```
   Trailing comment "Rollback (manual)", in this order (the policy depends on the function, so the policy goes first):
   1. `alter policy "locations: owner full access" on public.locations with check (user_id = (select auth.uid()));`
   2. the original `item_photos` `with check` (as it is now in the comment);
   3. `drop function private.owns_location(uuid);`
   4. `drop schema private;`
3. **Tests**: edit `supabase/tests/rls_hardening.sql` as in *Tests to write*. If a planned denial passes or a control fails, that is a finding: record it and stop. Do not change the policies beyond this plan.
4. **Local stack up**: `docker info` must exit 0. Start the stack with `npx supabase start` if `supabase_db_tudocuatui` is not running. The volume still has the **defective** attempt-1 version applied.
5. **Roll back attempt 1 locally (no `db reset`)**. Run one transaction as `postgres` in the container. It restores the two `init.sql` checks and removes the history row, so `migration up` sees the version as pending. PowerShell:
   ```powershell
   @'
   begin;
   alter policy "locations: owner full access" on public.locations
     with check (user_id = (select auth.uid()));
   alter policy "item_photos: owner full access" on public.item_photos
     with check (
       user_id = (select auth.uid())
       and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
     );
   delete from supabase_migrations.schema_migrations where version = '20261107120000';
   commit;
   '@ | docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1
   ```
   - Attempt 1 created no schema or function, so there is nothing else to drop. Check it: `select nspname from pg_namespace where nspname = 'private';` must return 0 rows. If it returns a row, stop and record it.
   - Then `npx supabase migration list --local` must **not** list `20261107120000`.
   - Paste the outputs into impl-log.
   - If any statement errors (e.g. permission denied on `supabase_migrations`), `ON_ERROR_STOP` leaves the DB unchanged. **Stop and record it.** Do not use `db reset` or `--no-backup`, and do not delete the volume.
6. **Apply the corrected version**: `npx supabase migration up --local`, then `npx supabase migration list --local` (now with `20261107120000`).
7. **Verify the live objects** (pipe into the same `docker exec … psql -U postgres -d postgres -X -q`):
   - `select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid in ('public.locations'::regclass, 'public.item_photos'::regclass);`
   - `select p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig, p.proacl from pg_proc p where p.oid = 'private.owns_location(uuid)'::regprocedure;`
   - Paste both outputs. Expected values are in AC 3.
   - **Fallback (pre-approved with this plan):** if, and only if, step 8 shows `42P17` for `locations`, make exactly these changes:
     - in the migration, change `security invoker` to `security definer`;
     - flip the first property test to `is_definer`;
     - roll back again as in step 5, plus `drop function private.owns_location(uuid); drop schema private;` inside the same transaction, **after** the two `alter policy` statements;
     - re-apply, and record the switch and the error in impl-log.

     Any other failure: stop and escalate.
8. **Run** `npx supabase test db` twice. Paste the verbatim output into impl-log § Attempt 2 "DB test run". All three files must be `ok`.
9. **Stop** with plain `npx supabase stop`. **Never `--no-backup`.**
10. **Checks**: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. Confirm that `git diff main -- src/types/database.ts` is empty.
11. **Hosted project: do not touch.** No `supabase link`, `db push`, `--linked` or `--db-url`. Applying is M-5 (Ming).
12. If Docker is unavailable, do not guess results. The orchestrator stops the ticket as `BLOCKED`, with an M-item for Ming to run steps 4–9.

How R1–R10 apply:
- **R1:** no app code change; local mode unaffected.
- **R2:**
  - RLS stays on every table.
  - The policy change and its helper are in one migration.
  - The file is edited in place only because it was never applied outside the local volume (C12).
  - `init.sql` is untouched.
  - Types: C2/C11.
- **R3:** no secrets; local CLI default credentials only.
- **R4:** the photo-row path check now matches the storage policy.
- **R5, R6, R9, R10:** n/a or untouched.
- **R7:** the file list above.
- **R8:** pgTAP suite plus checks.

## Specialist input used
`consult-database-optimizer.md`:
- **Adopted:**
  - checks in `with check` only, with `using` unchanged (Finding 2);
  - the foldername variant (OQ 1);
  - drop "Regenerate types" (OQ 4);
  - update-path tests and controls (OQ 2);
  - precheck as a comment, with no data repair, no `NOT VALID` and no trigger (OQ 3);
  - rename the test file and remove `todo`/`probe`;
  - the squatting test;
  - the rollback comment;
  - the existence oracle.
- **Changed:**
  - `drop`+`create` → `alter policy` (C5).
  - **Rev 2:** the consult's inline `exists` on `locations`, copied from the `items` pattern, does not carry over to a self-reference. Its "Risks: no recursion" note was wrong (attempt 1). It is replaced by the INVOKER helper (C10).
- **Rejected:**
  - enforcing the full `{uid}/{item_id}/…` path;
  - an `A/../B` assertion (comment only);
  - merging the tests into `rls_tables.sql`.

`impl-log.md` Attempt 1:
- **Adopted:** qualify the columns (finding 2); use a helper function.
- **Changed:** the suggested SECURITY DEFINER helper becomes a SECURITY INVOKER one, with DEFINER kept as the pre-approved fallback (Design choice). The suggested trigger is rejected.

From `F-006/security-review.md`:
- **Adopted:** findings 3 and 4 (table part), 6 and 9.
- **Not adopted:** finding 3 (storage part), 5 and 8 (follow-ups).

The security auditor (`security-ai-generated-code-auditor`) should review the migration diff, because it now adds a function and a schema.

## Assumptions
- **Recursion analysis (rev 2).** The rewriter checks for policy recursion only while it expands sub-links in policy expressions. It does not look inside function bodies. A `plpgsql` body is planned as a separate query, and its RLS on `locations` (`using (user_id = (select auth.uid()))`) has no sub-query on `locations`. The pgTAP controls prove this locally. The step-7 fallback covers the case where this is wrong.
- **Supabase CLI**:
  - runs each migration file in one transaction;
  - `migration up --local` applies versions missing from `supabase_migrations.schema_migrations` without wiping data (CLI 3.0.0, as in attempt 1);
  - `postgres` can delete that history row locally.

  If any of these is false, stop. Do not use `db reset`.
- **`storage.foldername(text)` exists**, and `authenticated` can execute it, both locally and on the hosted project. The storage policies already depend on it.
- **WITH CHECK runs before FK and unique checks**, so the oracle tests expect `42501`. If the run shows `23503`/`23505`, record it as a finding; do not loosen the test.
- **No hosted data yet** (M-1 unticked), and no `private` schema exists there.
- **Hotspot.** `README.md` was edited in `a02e3f0` and is likely also edited by **F-002** (`IN_PROGRESS`), so expect a small rebase conflict. No `src/App.tsx` edit. No other open ticket touches `supabase/**`.
- **Follow-ups** (not in this diff; the orchestrator files `debt` issues, `project:tudocuatui`, if F-006 did not already):
  1. anon-role tests (finding 5);
  2. a storage own-object UPDATE control (finding 3, storage part);
  3. a README line "local stack only; never `--linked`" (finding 8);
  4. README line 41 recommends `stop --no-backup`, which conflicts with the agent rule (Ming decides the wording);
  5. **new:** `docs/data-model.md` does not describe the RLS helpers. Add a line once more helpers exist.

## Blocking questions
None. All choices have stated defaults (C1–C13), which Ming confirms or overturns when re-approving.

## Split proposal
None. The migration grows to about 75 lines (mostly comments). The tests gain about 15 lines. No README change.
