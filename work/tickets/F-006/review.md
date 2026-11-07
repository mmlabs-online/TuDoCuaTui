## Attempt 1 — 2026-11-07
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit` exit 0, no errors
- format:check: "All matched files use the correct format." (30 files)
- test: vitest, 4 files, 54 tests passed
- build: `vite build` ✓ built in 268ms
- DB (reviewer re-ran on the local stack): `npx supabase start` applied `20261106000000_init.sql` OK. `npx supabase test db` exit 0, `Files=3, Tests=51`, `Result: PASS`. The only failures were the two `Failed (TODO)` lines from `rls_gaps.sql`. A second run gave the same result (exit 0, Tests=51, PASS). Stack stopped with plain `npx supabase stop` (backup kept).

### Acceptance criteria
- [x] `supabase test db` passes locally for all non-gap cases. Evidence: reviewer run above. `rls_tables.sql ... ok` (plan 37), `rls_storage.sql .. ok` (plan 10), `rls_gaps.sql ..... ok` (plan 4, 2 TODO). Every case in the plan's test tables is present. Counts: 4+4+4+4+4+4+4+5+4 = 37 and 10.
- [x] 1a: the denials are not vacuous. Positive controls passed in the same run: own select ×4, own insert ×4 (`lives_ok`), view sees own item, storage select/upload/delete own (`control: A deletes own object` = 1, so the `protect_objects_delete` trigger was neutralised and the delete path is real).
- [x] 1b: no residue. Each file is `begin; … rollback;`. After the runs, as postgres: `auth.users` count for A/B = 0, `storage.objects` with test prefixes = 0, schema `rls_test` absent. The two runs gave identical results.
- [x] Gap probes reported, with the result. impl-log § "Gap probe results" has the verbatim raw TAP. The reviewer's own raw run (`docker exec … psql < supabase/tests/rls_gaps.sql`) matches it: `ok 1 - GAP-1 result: CONFIRMED (statement succeeded)`, `not ok 2 … # TODO T-003: locations.parent_id is not checked against ownership`, `ok 3 - GAP-2 result: CONFIRMED (statement succeeded)`, `not ok 4 … # TODO T-003: item_photos.storage_path is not checked against the owner folder`. Both gaps are CONFIRMED. The orchestrator copies these lines into the ticket Handoff at DONE.
- [x] README explains how to run the tests. `README.md` `## Running DB tests` (after "Set up Supabase", before "Code map") covers: Docker + `npx`, ports 55320-55329, start/test commands, rollback, the meaning of TODO / "TODO passed" (T-003), the raw-TAP `docker exec` command, and that CI does not run these yet. A Code map row was added for `supabase/tests/`. It contains no keys or passwords.
- [x] Checks green. See above.

Ming verification after merge: none (per plan).

### Issues
#### Issue 1 — 🟡 should-fix — docs / data loss
- **Where**: `README.md`, "Running DB tests" code block, line `npx supabase stop --no-backup   # when done`
- **Expected**: a stop command that does not delete the developer's local DB volume.
- **Actual**: `--no-backup` deletes the local database volume. A developer who follows the README after doing local work loses that data. The tests do not need it, because they roll back.
- **Fix instruction**: change the line to `npx supabase stop               # when done (keeps local data)`. This is one line, and it can ride along with the next README touch (F-002/F-007 also edit README). It does not block this ticket.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no app code touched.
- R2: no file under `supabase/migrations/**` changed, and `src/types/database.ts` is untouched.
- R3: grepping the diff for `eyJ|sb_secret_|sb_publishable_` finds only the plan's own instruction text. No key values.
- R4: storage policies are tested, including the private-bucket precondition and rename-into-B.
- R7: changed files are exactly the plan's list (the 3 SQL files, README, and the F-006 work files). No out-of-plan files.
- R8: checks are green, and the new tests actually run.
- R9 and R10: not applicable.

### Nits (do not block)
- 💭 The README raw-TAP command prints psql result tables (`set_config` rows, headers) around the TAP lines. Adding `-t -A` would make the output closer to plain TAP.
- 💭 `rls_storage.sql` and `rls_tables.sql` have lines of 310–320 characters (long UUID literals). This is fine for SQL tests, and `*.sql` is not formatted by oxfmt.
- 💭 impl-log mentions a stray `D:\tmp_out.txt` outside the repo. It is not in the diff; Ming may delete it.

### Follow-ups (out of scope)
- T-003: fix GAP-1 (`locations.parent_id` ownership in WITH CHECK) and GAP-2 (`item_photos.storage_path` must start with `auth.uid()`, which also covers storage-path squatting via UNIQUE). Then remove the `todo()` wrappers in `supabase/tests/rls_gaps.sql`.
- Anon-role denial tests for the tables and `storage.objects` (not in F-006 scope).
- Running `supabase test db` in CI (P2).
