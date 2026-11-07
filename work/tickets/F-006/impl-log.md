## Attempt 1 — 2026-11-07

### Files touched
| File | Required because |
|---|---|
| `supabase/tests/rls_tables.sql` | New: 37 pgTAP assertions for locations, items, item_photos, wear_logs, items_with_stats |
| `supabase/tests/rls_storage.sql` | New: 10 pgTAP assertions for bucket `wardrobe` policies |
| `supabase/tests/rls_gaps.sql` | New: 4 assertions, two gap probes (todo) plus `GAP-n result` lines |
| `README.md` | New `## Running DB tests` section and a Code map row |
| `work/tickets/F-006/impl-log.md` | This log |

### Tests added / changed
- `rls_tables.sql` (37), `rls_storage.sql` (10), `rls_gaps.sql` (4), as in plan.md.

### DB test run
Environment: `docker info` exit 0; `npx supabase --version` printed `3.0.0`. `supabase_db_tudocuatui` was not running (only calechip containers), so I ran `npx supabase start` (about 38 s, migration applied OK).

`npx supabase test db`, exit 0:
```
Target: local stack (127.0.0.1:55322)
/mmlabs/spaceM/projects/tudocuatui/supabase/tests/rls_gaps.sql .....
# Failed (TODO) test 2: "GAP-1 (T-003): A cannot set locations.parent_id to B's location"
#       caught: no exception
#       wanted: 42501
# Failed (TODO) test 4: "GAP-2 (T-003): A cannot insert item_photos with storage_path under B/"
#       caught: no exception
#       wanted: 42501
ok
/mmlabs/spaceM/projects/tudocuatui/supabase/tests/rls_storage.sql .. ok
/mmlabs/spaceM/projects/tudocuatui/supabase/tests/rls_tables.sql ... ok
All tests successful.
Files=3, Tests=51,  1 wallclock secs
Result: PASS
```
A second run gave the same output (Files=3, Tests=51, Result: PASS). After the runs, `select count(*) from auth.users where id in (A,B)` returned 0.

Triggers on `storage.objects` in this image: `update_objects_updated_at`, `protect_objects_delete`. The `storage.allow_delete_query` setting worked: the control "A deletes own object" returned 1.

### Gap probe results
Raw TAP from `docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q < supabase/tests/rls_gaps.sql`:
```
 ok 1 - GAP-1 result: CONFIRMED (statement succeeded)
 not ok 2 - GAP-1 (T-003): A cannot set locations.parent_id to B's location # TODO T-003: locations.parent_id is not checked against ownership
 # Failed (TODO) test 2: "GAP-1 (T-003): A cannot set locations.parent_id to B's location"
 #       caught: no exception
 #       wanted: 42501
 ok 3 - GAP-2 result: CONFIRMED (statement succeeded)
 not ok 4 - GAP-2 (T-003): A cannot insert item_photos with storage_path under B/ # TODO T-003: item_photos.storage_path is not checked against the owner folder
 # Failed (TODO) test 4: "GAP-2 (T-003): A cannot insert item_photos with storage_path under B/"
 #       caught: no exception
 #       wanted: 42501
```
- GAP-1: CONFIRMED
- GAP-2: CONFIRMED (also enables storage-path squatting via the UNIQUE `storage_path`, already in T-003 scope)

No non-gap denial failed.

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean
- format:check: "All matched files use the correct format."
- test: 4 files, 54 tests passed
- build: built in 430ms

### Out-of-plan files
None. (A stray `D:\tmp_out.txt`, outside the repo, was created by a mistyped redirect; my cleanup was blocked by the safety check. Ming may delete it.)

### Follow-ups (noticed, not done)
- T-003: when it lands, remove the `todo` wrappers in `rls_gaps.sql` (a "TODO passed" line is the signal).
- Anon-role access to tables and storage is not tested (outside scope).

### Scope self-check
- Could the diff be smaller? No; the SQL is repetitive by design.
- Diff size: about +300 lines SQL, +22 README, 0 removed.
