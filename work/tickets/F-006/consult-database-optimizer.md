# Consult — database-optimizer — F-006

## Findings

Files read: ticket.md, supabase/migrations/20261106000000_init.sql, supabase/config.toml, work/decisions.md (D9 line 18 names T-003). I ran nothing; none of the pgTAP behaviour below was executed here.

**Current state**
- `supabase/tests/` does not exist. There is also no `supabase/seed.sql`, although config.toml:72 references it. Tests therefore must create their own users, and a missing seed file is harmless.
- config.toml has custom ports (db 55322, config.toml:34). `[db.seed] enabled = true` at config.toml:69 only matters for `db reset`. `supabase test db` neither resets nor seeds.
- The bucket `wardrobe` is created by the migration (init.sql:163-166), so it exists after `supabase start`.

**Policies under test**
- `locations`: the only check is `user_id = auth.uid()` (init.sql:129-132). There is no check on `parent_id`. FK validation runs as the table owner and bypasses RLS, so A can set `parent_id` to B's location. This gap is real by inspection. A foreign-key violation versus success also leaks whether B's id exists.
- `items`: WITH CHECK validates `location_id` ownership (init.sql:137-142). Test A setting `location_id` to B's location, on both INSERT and UPDATE.
- `item_photos` and `wear_logs`: WITH CHECK requires the parent item to be owned by the caller (init.sql:144-158). `item_photos` has no check that `storage_path` starts with `auth.uid()` (init.sql:146-150). That is gap probe 2. Because `storage_path` is UNIQUE (init.sql:75), A can also squat a path under B's folder, which adds a denial-of-service angle for T-003.
- Storage: four policies on `storage.objects` (init.sql:168-182) use `(storage.foldername(name))[1] = auth.uid()::text`. The UPDATE policy has no WITH CHECK, so Postgres applies USING to the new row too. Renaming an object into B's folder should therefore be blocked, and it is worth one assertion.
- `items_with_stats` is `security_invoker = true` (init.sql:98-99). RLS of the underlying tables applies to the caller, but only if the role has SELECT on the view.

**How RLS denials behave** (this drives the assertion style)
- SELECT, UPDATE and DELETE of invisible rows do not raise. They affect 0 rows. Assert with a count, not `throws_ok`.
- INSERT, or UPDATE that violates WITH CHECK, raises SQLSTATE 42501 (`new row violates row-level security policy`). Use `throws_ok(sql, '42501')`.

**Simulating users**
- Fixed UUIDs, for example `a0000000-...-0001` for A and `b0000000-...-0002` for B.
- As `postgres` (the default role), insert into `auth.users`. In current GoTrue schemas `(id, email)` is enough, with `aud` and `role` optional. No trigger on `auth.users` is defined in the migration.
- Seed B's rows as `postgres`, which bypasses RLS: location, item, photo, wear log, and a `storage.objects` row with `bucket_id='wardrobe', name='<B>/<item>/x.jpg'`.
- Switch to A with a helper that runs `set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true)`, plus `set_config('request.jwt.claim.sub', uid::text, true)` for older auth.uid() implementations, then `set local role authenticated`.
- Use `reset role` to return to postgres for verification, for example checking that B's rows are unchanged.
- Define helper functions in the test file itself, for example in a `tests` schema or `pg_temp`, created inside the transaction. Do not put helper `.sql` files in `supabase/tests/`, because `supabase test db` runs every `.sql` file there.

**pgTAP availability and transactions**
- The Supabase local Postgres image ships pgTAP. Use `create extension if not exists pgtap with schema extensions;` at the top of each file, inside the transaction. Keeping the call is harmless and makes the file self-contained.
- Each file should be `begin; select plan(N); ... select * from finish(); rollback;`. The rollback removes the users and rows, so a developer's local data is untouched.
- `set local role` only works inside the transaction, so keep everything in one.
- pgTAP grants its temp results tables to PUBLIC, so calling `ok()` after the role switch works. This is the common Supabase and basejump pattern.
- Do not count total rows. The dev DB may contain other data, so filter by `user_id` or by fixed ids.

**Storage test notes**
- Policies are on `storage.objects`, so SQL-level tests are enough. No HTTP Storage API is needed.
- Positive controls are essential. A can insert and select `A/...` in `wardrobe`. Without them the denial tests could pass vacuously, for example because of a missing grant.
- Cases:
  - A selects `B/...`: 0 rows.
  - A inserts `B/...` in `wardrobe`: 42501.
  - A updates B's object: 0 rows.
  - A renames own object to `B/...`: 42501.
  - A deletes B's object: 0 rows, and the row still exists when checked as postgres.
- Pitfall: newer storage schemas have a `storage.protect_delete` trigger that rejects direct `DELETE FROM storage.objects` unless `storage.allow_delete_query` is `'true'`. I did not verify the version in the local image. If the trigger is a statement-level BEFORE trigger, it raises even for zero rows, so the delete test errors for a reason unrelated to RLS. Plan for `set_config('storage.allow_delete_query','true',true)` before the delete, or wrap the delete in `lives_ok`. Check this when first running the suite. A's own delete is also blocked by the trigger unless that setting is applied.
- Optionally assert that `bucket public = false` for `wardrobe` (R4) and `file_size_limit`.

**items_with_stats**
- As A: `count(*) from items_with_stats where user_id = B` must be 0, and the view must return A's own item (positive control).
- Also seed B with a wear log and photo, then assert that A's row for A's own item shows its own `wear_count` (0) and no B data leaks through the lateral and left joins.
- Cheap structural assertion: `pg_class.reloptions` for the view contains `security_invoker=true`. This catches a regression where someone recreates the view without it.
- Optionally check `anon` sees 0 rows or gets permission denied.

## Recommendations

1. **File layout.** Use `supabase/tests/rls_tables.sql` (locations, items, item_photos, wear_logs, view), `rls_storage.sql`, and `rls_gaps.sql`. Keeping the gap probes in their own file makes it easy to delete or flip them when T-003 lands. Meets the "all non-gap cases pass" criterion (ticket:41).
2. **Cases for `rls_tables.sql`.** For each of the four tables, as A against B's row:
   - select returns 0 rows
   - update affects 0 rows
   - delete affects 0 rows
   - B's row is verified unchanged after `reset role`
   - Use `with u as (update ... returning 1) select count(*) from u` to count the affected rows.
   - Also add:
     - A inserts a `wear_logs` row with B's `item_id`: 42501.
     - A inserts an `item_photos` row with B's `item_id`: 42501.
     - A inserts or updates an `items` row with B's `location_id`: 42501.
     - A inserts a row with `user_id` = B: 42501.
     - Positive controls: A can insert and select own rows in each table.
3. **Gap probes as TODO tests.**
   - Write each assertion as the secure behaviour it should have, for example `throws_ok('update locations set parent_id = <B loc> where id = <A loc>', '42501')`, and wrap it with `select todo(1, 'T-003 gap: ...')` or `todo_start()` / `todo_end()`.
   - A failing TODO test prints `not ok # TODO` but does not fail `pg_prove`. If T-003 later fixes the gap, the probe prints "TODO passed" as a visible reminder to remove the TODO.
   - The gap probe file should not use `skip`. The tests must actually run.
   - Add a third probe for the `storage_path` squatting scenario, or at least mention it in the Handoff. Keep the probes aligned with the ticket scope: `parent_id`, and a `storage_path` starting with B's id.
4. **Reporting the gap result** (acceptance criterion at ticket:42).
   - Plain `supabase test db` output is likely terse and may hide TODO lines. After the first run, capture the raw TAP by running the file directly with `psql -h 127.0.0.1 -p 55322 -U postgres -f supabase/tests/rls_gaps.sql`. That is the standard local-dev DB login for the local stack, not a project secret. Record the verbatim `not ok ... # TODO` lines in the Handoff.
   - Optionally add an always-passing `ok(true, 'GAP-1 result: ' || case when leaked then 'CONFIRMED' else 'not reproduced' end)` computed from a probe done inside a savepoint. That puts the outcome in the description even when TODO output is hidden.
5. **Transaction hygiene.** Every file should start with `begin;`, call `plan(N)` with exact counts, end with `select * from finish(); rollback;`, and be rerunnable. Use fixed UUIDs and never rely on a seed file.
6. **README "Running DB tests"** (ticket:34). Cover:
   - prerequisites: Docker Desktop running, Supabase CLI installed
   - `supabase start`, then `supabase test db`
   - what the TODO lines mean, and how to read raw TAP via psql
   - note that custom ports (55321 to 55329) are used, so they must be free
   - note that tests roll back and do not touch local data
   - note that this is not run in CI (P2)
7. **Constraints.**
   - `README.md` and `supabase/tests/**` are not under `migrations/**`, so the ticket stays Medium (ticket:47). Do not touch `supabase/migrations/**`.
   - `src/types/database.ts` is unaffected.

## Risks

- **Storage delete trigger.** `storage.protect_delete` may make the delete cases error rather than return 0 rows. I did not verify it. Mitigation is in Findings.
- **auth.users insert shape.** Minimal inserts depend on the GoTrue schema in the pinned local image. If a NOT NULL column appears, the seed fails for a reason unrelated to the policies. Run once and adjust.
- **Role-switch pitfalls.**
  - A forgotten `reset role` before seeding or verifying gives false confidence or spurious errors.
  - Wrong `plan()` counts show up as a failed `finish()`.
  - After a caught `throws_ok` the transaction stays usable, since pgTAP uses a subtransaction.
- **Silent gap results.** If the probes only appear as TODO, the result can be missed in default output. The psql capture in the Recommendations addresses that.
- **Windows and Docker.** The pg_prove image has to be pulled on the first run, Docker Desktop must be running, and ports 55320 to 55329 must be free. CRLF line endings in `.sql` files are fine for psql, but keep LF for consistency. The CLI mounts `supabase/tests` into the container. A path-with-spaces problem is unlikely because the repo path is `D:\mmlabs\spaceM\projects\tudocuatui`, but I did not check it.
- **Vacuous passes.** Without positive controls, a missing GRANT, a mistyped uuid or RLS misconfiguration could make the denial tests pass for the wrong reason.
- **`supabase test db` side effects.** It uses the running local stack and does not reset it, so stray data in the local DB must not affect counts. Filter by user id.
- **Unmentioned storage-path squatting gap.** A can claim `B/<item>/<uuid>.jpg` in `item_photos`, because `storage_path` is UNIQUE and unchecked. This is worth including in the T-003 follow-up.

## Open questions

1. Does the local image's storage schema include the `protect_delete` trigger? The first run will show it. If it fires, which workaround do we prefer: `set_config('storage.allow_delete_query','true',true)` or testing only that the delete does not remove B's object?
2. Should anon (unauthenticated) access be covered, with 0 rows or permission denied for all four tables and storage? It is a cheap addition but is outside the ticket scope (ticket:26-34). Default: add a minimal anon check unless Ming wants strict R7 scope.
3. Should the "TODO passed" flip in future runs be treated as a signal to delete the TODO when T-003 lands? Default: yes, and note it in T-003's ticket.
4. For the gap result in the Handoff, is pasting raw TAP lines enough, or should the test also write them somewhere persistent? Default: paste into the Handoff.
