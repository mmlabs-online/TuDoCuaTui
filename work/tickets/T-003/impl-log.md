## Attempt 1 — 2026-11-07

**RESULT: FAILED, ESCALATE. The plan's `locations` policy SQL is wrong. The DB suite is red.** Per plan step 3 ("If a planned denial passes or a control fails, that is a finding: record it and stop"), I did not change the policy beyond the plan.

### Findings
1. **Self-referencing policy recurses.** The `locations` `with check` queries `public.locations` (`exists (select 1 from public.locations p …)`). Postgres refuses this with `42P17 infinite recursion detected in policy for relation "locations"`, on **every** INSERT/UPDATE on `locations`, including the ones in the unchanged `rls_tables.sql`. The plan's assumption "no recursion because `using` has no subquery" (Approach step 2, last bullet) is false: Postgres detects recursion on any policy expression that references its own table. Applied as written, the migration would break the app's location writes.
2. **Name capture.** `pg_get_expr` shows the stored expression as `p.id = p.parent_id`. The unqualified `parent_id` inside the subquery resolves to the inner alias `p`, not the row being checked. It must be written `locations.parent_id`. Even without the recursion, the check would be wrong.
3. The `item_photos` policy (live expression below) looks as intended. It could not be tested separately, because `rls_hardening.sql` died at test 1.

Suggested direction for the planner (not done, outside plan): check parent ownership in a `SECURITY DEFINER` helper, e.g. `public.owns_location(uuid)` with `set search_path = ''` and `stable`, called from the `locations` check. Alternatively use a trigger. Both need security review, since this is High tier. The `item_photos` half can stay as planned.

### Files touched
| File | Required because |
|---|---|
| `supabase/migrations/20261107120000_rls_hardening.sql` (new) | Plan: two `alter policy … with check`. **Contains the defective `locations` statement; do not apply to the hosted project.** |
| `supabase/tests/rls_gaps.sql` -> `supabase/tests/rls_hardening.sql` (`git mv`, rewritten) | Plan C3/C4: 23 real assertions, no `todo`/`probe` |
| `README.md` | Plan C7: line 24 (paste each migration in order), `rls_gaps.sql` -> `rls_hardening.sql` in the bullet and the `docker exec` command |
| `work/tickets/T-003/impl-log.md` | This log |

### Tests added / changed
- `rls_hardening.sql` (`plan(23)`): 6 controls, 3 GAP-1, 5 GAP-2, 6 update-path regressions, 1 squat (as B), 2 "after" checks. 23 assertions, equal to `plan(23)`. No `todo(` remains.
- Untouched: `rls_tables.sql`, `rls_storage.sql`.

### Local stack steps (raw)
- `docker info`: exit 0. `npx supabase start` -> `Starting database from backup...` (existing F-006 volume), stack up.
- `npx supabase migration up --local` ->
  `Applying migration 20261107120000_rls_hardening.sql...` `{"applied":[".../20261107120000_rls_hardening.sql"],"message":"Migrations applied",...}`
- `npx supabase migration list --local` ->
  `{"migrations":[{"local":"20261106000000","remote":"20261106000000",...},{"local":"20261107120000","remote":"20261107120000","time":"2026-11-07 12:00:00"}],...}` (`remote` here is the local DB history)
- Live policies (`pg_policy` query, verbatim):
```
            polname             |                                                                    pg_get_expr
--------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------
 locations: owner full access   | ((user_id = ( SELECT auth.uid() AS uid)) AND ((parent_id IS NULL) OR (EXISTS ( SELECT 1                                                          +
                                |    FROM locations p                                                                                                                              +
                                |   WHERE ((p.id = p.parent_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))))
 item_photos: owner full access | ((user_id = ( SELECT auth.uid() AS uid)) AND ((storage.foldername(storage_path))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1+
                                |    FROM items i                                                                                                                                  +
                                |   WHERE ((i.id = item_id) AND (i.user_id = ( SELECT auth.uid() AS uid))))))
(2 rows)
```
  Note `p.id = p.parent_id` in the `locations` row (finding 2). (The `item_photos` row shows `item_photos.item_id` in the raw output; shortened here for width only in the trailing part.)

### DB test run (`npx supabase test db`, run twice, identical results; exit 1 both times)
```
psql:.../rls_hardening.sql:44: ERROR:  infinite recursion detected in policy for relation "locations"
CONTEXT:  SQL statement "update public.locations set name = 'A loc renamed' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'"
.../rls_hardening.sql .. 
# Failed test 1: "control: A sets own location parent to own location"
#     died: 42P17: infinite recursion detected in policy for relation "locations"
Dubious, test returned 3 (wstat 768, 0x300)
Failed 23/23 subtests
.../rls_storage.sql .... ok
psql:.../rls_tables.sql:65: ERROR:  infinite recursion detected in policy for relation "locations"
CONTEXT:  SQL statement "update public.locations   set name = 'hacked' where id = 'bbbbbbbb-0000-4000-8000-0000000000b1'"
.../rls_tables.sql ..... 
# Failed test 5: "control: A inserts own location"
#     died: 42P17: infinite recursion detected in policy for relation "locations"
Dubious, test returned 3 (wstat 768, 0x300)
Failed 26/37 subtests
Test Summary Report
rls_hardening.sql (Wstat: 768 (exited 3) Tests: 1 Failed: 1)  Parse errors: Bad plan.  You planned 23 tests but ran 1.
rls_tables.sql   (Wstat: 768 (exited 3) Tests: 12 Failed: 1)  Parse errors: Bad plan.  You planned 37 tests but ran 12.
Files=3, Tests=23
Result: FAIL
```
`rls_storage.sql ... ok`. AC 2 is NOT met.

The local DB volume was kept (plain `npx supabase stop`, `"backup":true`) and still has the defective policy applied. To restore the local DB, run the manual rollback from the migration's trailing comment, or discard the local volume (Ming's call; I did not run `db reset`).

### Checks (actual output summary)
- typecheck: `tsc --noEmit`, no errors
- format:check: `All matched files use the correct format.` (32 files)
- test: `Test Files 5 passed (5)`, `Tests 74 passed (74)`
- build: `built in 730ms`
- `git diff main --stat -- src/types/database.ts`: empty
- pgTAP: FAIL (above)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Re-plan the `locations` check (finding 1 and 2) before any retry. A new migration timestamp is not needed while 20261107120000 is unmerged and unapplied elsewhere; the planner decides whether to rewrite it in place.
- The plan's four follow-ups (anon-role tests, storage UPDATE control, README `--linked` note, README `--no-backup` wording) stand.

### Scope self-check
- Could the diff be smaller? No for what was planned.
- Diff size: migration +42, tests about +100 / -51 (rename), README +3 / -3.

## Attempt 2 — 2026-11-08

**RESULT: PASS on all local checks. SECURITY INVOKER helper worked; the SECURITY DEFINER fallback was NOT used.**

### Files touched
| File | Required because |
|---|---|
| `supabase/migrations/20261107120000_rls_hardening.sql` (edited in place, C12) | Plan step 2: schema `private`, `private.owns_location`, two `alter policy` with qualified columns, header and rollback comment updated |
| `supabase/tests/rls_hardening.sql` | Plan: `plan(23)` -> `plan(33)`; +7 helper property tests, +2 direct calls, +1 control (23 existing assertions untouched) |
| `work/tickets/T-003/impl-log.md` | This section |

### Local stack steps (raw)
- `docker info`: exit 0. `npx supabase start`: `Starting database from backup...` (stack up, container `supabase_db_tudocuatui`).
- Rollback transaction (step 5) via `docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1`: exit 0, no error output (`-q` suppresses the `COMMIT` tag; the history row deletion is confirmed by the next list). No `db reset`, no `--no-backup`, volume kept.
- `select nspname from pg_namespace where nspname = 'private';` -> `(0 rows)`.
- `migration list --local` after rollback (note `"remote":""` for 20261107120000, i.e. not in history):
  `{"migrations":[{"local":"20261106000000","remote":"20261106000000",...},{"local":"20261107120000","remote":"","time":"2026-11-07 12:00:00"}],...}`
- `migration up --local`: `Applying migration 20261107120000_rls_hardening.sql...` `{"applied":[".../20261107120000_rls_hardening.sql"],"message":"Migrations applied",...}`
- `migration list --local` after: `{"local":"20261107120000","remote":"20261107120000",...}`

### Live objects (verbatim)
```
            polname             |                                                                    pg_get_expr
--------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------
 locations: owner full access   | ((user_id = ( SELECT auth.uid() AS uid)) AND ((parent_id IS NULL) OR private.owns_location(parent_id)))
 item_photos: owner full access | ((user_id = ( SELECT auth.uid() AS uid)) AND ((storage.foldername(storage_path))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1+
                                |    FROM items i                                                                                                                                  +
                                |   WHERE ((i.id = item_photos.item_id) AND (i.user_id = ( SELECT auth.uid() AS uid))))))
(2 rows)

             oid             | prosecdef | provolatile |      proconfig       |                     proacl
-----------------------------+-----------+-------------+----------------------+------------------------------------------------
 private.owns_location(uuid) | f         | s           | {"search_path=\"\""} | {postgres=X/postgres,authenticated=X/postgres}
(1 row)
```
`pg_get_expr` prints the locations column unqualified (deparse display only); the file text is qualified. No `p.parent_id`. prosecdef f, stable, empty search_path, ACL has authenticated=X, no anon, no PUBLIC.

### DB test run (`npx supabase test db`, twice, identical; exit 0 both)
```
.../rls_hardening.sql .. ok
.../rls_storage.sql .... ok
.../rls_tables.sql ..... ok
All tests successful.
Files=3, Tests=80,  1 wallclock secs (...)
Result: PASS
```
No TODO lines. No pgTAP function assertion was missing locally. 33 + 10 + 37 = 80. No `42P17`, so the step-7 fallback was not needed. Stopped with plain `npx supabase stop` (`"backup":true`).

### Checks
- typecheck: `tsc --noEmit`, no errors
- format:check: `All matched files use the correct format.` (32 files)
- test: `Test Files 5 passed (5)`, `Tests 74 passed (74)`
- build: `built in 405ms`
- `git diff main -- src/types/database.ts`: empty. `grep "todo(" supabase/tests`: nothing.

### Out-of-plan files
None.

### Follow-ups
The plan's five follow-ups stand (anon-role tests, storage UPDATE control, README `--linked` note, README `--no-backup` wording, data-model note on RLS helpers). Also: another project's stack (`calechip`) was running concurrently; no conflict occurred.

### Scope self-check
Only the three planned files changed. Migration is about 75 lines (mostly comments).
