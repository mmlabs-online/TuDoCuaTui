Status: READY

# Plan — T-003: Close RLS gaps found by F-006 (only if confirmed)

> **High tier, `Gate: plan-approval`.** Ming approves this plan before any code is written. The section
> **Changes vs ticket scope** lists every place where the plan differs from the ticket text.

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

| # | Ticket text | This plan | Why |
|---|---|---|---|
| C1 | `storage_path like auth.uid() \|\| '/%'` | `(storage.foldername(storage_path))[1] = (select auth.uid())::text` | Consult open question 1. This is the **same expression the storage bucket policies use** (`init.sql:170-182`), so a DB row can claim a path exactly when the caller could upload a file there. It also rejects a path with no folder (`x.jpg`), because `foldername` returns an empty array, `[1]` is `null`, and a `null` check rejects the row. `like` would give the same result for real paths (a uuid has no `%`/`_`). It is rejected only for parity. `split_part(…,'/',1)` was also rejected: it accepts a bare `"<uid>"` with no slash. |
| C2 | "Regenerate types (F-002 script)" | **Dropped.** `src/types/database.ts` is not touched. | Consult open question 4. F-002 is `IN_PROGRESS`, not merged, so its script is not on this branch. The migration changes **policies only**. Generated types contain no policy information, so a regeneration would not change anything. D11's `--local` output would also differ in formatting from today's file for reasons unrelated to this ticket. |
| C3 | Test plan: "the F-006 pgTAP suite" (flip the probes) | `supabase/tests/rls_gaps.sql` is **renamed** to `rls_hardening.sql` and rewritten. The `todo()` wrappers, the `probe()` helper and the always-passing `GAP-n result` lines are gone. The file now holds real assertions only. | Consult "Tests"; security review finding 6. `pg_prove` does not fail on "TODO passed", so a regression would go unnoticed unless the wrappers are removed. |
| C4 | (not in ticket) | **Folded in:** update-path regression tests and positive controls (security review findings 3 and 4), plus edge tests for the new checks (squatting, no-folder path, existence oracle). | Consult open question 2. They cost about 15 lines of SQL. They guard exactly the policies this ticket rewrites: `for all` policies, so one `with check` serves both INSERT and UPDATE. Without them, a rewrite could break UPDATE isolation while the suite stays green. Test-only, no extra schema change. |
| C5 | Consult: `drop policy` + `create policy` in `begin/commit` | **`alter policy … with check (…)`** | Each `ALTER POLICY` is one atomic statement, so there is never a moment with no policy. It does not depend on how the Supabase CLI wraps a migration file in a transaction (an explicit `begin`/`commit` inside a file the CLI already runs in a transaction only produces warnings, but there is no reason to rely on that). The name, command (`for all`), role and `using` stay unchanged. The old text sits in a comment block at the end of the file, for manual rollback. |
| C6 | (not in ticket) | A **read-only precheck** (two `select`s) goes in the migration header as a comment. No data repair. | Consult open question 3. It matters only if the hosted project already has data when M-5 runs. Today M-1 (hosted project) is not done yet, so most likely both migrations run together on an empty DB. |
| C7 | (not in ticket) | `README.md` § "Running DB tests": replace the `rls_gaps.sql` bullet and command (lines 46 and 49), which the rename makes stale. § "Set up Supabase" line 24 ("paste `…_init.sql` into SQL Editor") becomes "paste each file in `supabase/migrations/` in filename order". | A direct consequence of the rename and of adding a second migration. Without it, the manual setup path would skip this hardening. |
| C8 | AC 1 "The F-006 gap probes pass." | Made testable: "passes" means `npx supabase test db` exits 0, **no `todo(` remains in `supabase/tests/`**, and each file's `plan(n)` equals its assertion count. | Security review finding 6 and recommendation 5. |
| C9 | AC 2 "Ming applies the migration" | Moved to **Ming verification after merge**. This is the existing item **M-5** in `work/ming-todo.md`. No new M-item. | Workspace rule: only Ming applies migrations to the hosted project (R2). |

Not changed: no other schema change; `items`, `wear_logs` and storage policies untouched; `init.sql` untouched (R2).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A new migration closes GAP-1 and GAP-2 by changing only the `with check` of the two policies; no applied migration is edited. | `git diff --stat main -- supabase/migrations` shows exactly one **added** file `supabase/migrations/20261107120000_rls_hardening.sql` and no change to `20261106000000_init.sql`. The file contains exactly two `alter policy` statements (`"locations: owner full access"`, `"item_photos: owner full access"`), each with only a `with check (…)` clause (no `using`, no other DDL), plus comments. |
| 2 | The F-006 gap probes pass, as real assertions (C3, C8). | On the local stack (Approach steps 5–7): `npx supabase test db` exits 0 with `rls_hardening.sql … ok`, `rls_storage.sql … ok`, `rls_tables.sql … ok`, `All tests successful`, `Result: PASS`, and **no** `# TODO` / `Failed (TODO)` line. `Grep "todo\(" supabase/tests` returns nothing. `plan(23)` in `rls_hardening.sql` equals the 23 assertions listed under Tests to write. `rls_tables.sql` stays `plan(37)` and `rls_storage.sql` stays `plan(10)`, both unchanged files. If the reviewer cannot run Docker, they use the verbatim output in `impl-log.md` § "DB test run". |
| 3 | The migration is applied on the local stack, and the live policies match the file. | `impl-log.md` shows `npx supabase migration list --local` with `20261107120000` applied, and the output of the `pg_policy` query from Approach step 6, which shows both new `with check` expressions. |
| 4 | Types unchanged by design (C2). | `git diff main -- src/types/database.ts` is empty. |
| 5 | Checks green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass (impl-log shows actual output; reviewer re-runs). |

## Ming verification after merge
- **M-5** (already in `work/ming-todo.md`): `npx supabase db push`.
  - If the hosted project **already has data** at that time, first run the two precheck `select`s from the migration header in Dashboard → SQL Editor. Both should return 0 rows. If they do not, stop and file a `/ticket`; do not push.
  - If M-1 is done in the same session (empty project), the precheck can be skipped.
- After the push, a quick app check in Supabase mode: add a photo to an item, then change it. Expected: works as before, because the app builds paths as `${uid}/${itemId}/…` (`src/data/repo.ts:148,166`).
- Orchestrator: please append the precheck hint to the M-5 text in `ming-todo.md` on `main` (D16; the implementer does not edit it).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `supabase/migrations/20261107120000_rls_hardening.sql` | **New.** Two `alter policy … with check` statements; header comment (purpose, gaps closed, which `init.sql` lines it supersedes, precheck queries); trailing comment with the original `with check` text for manual rollback. | Ticket scope (GAP-1, GAP-2); C1, C5, C6 |
| `supabase/tests/rls_gaps.sql` → `supabase/tests/rls_hardening.sql` | **Rename** (`git mv`) and rewrite: 23 real assertions, no `todo`, no `probe()` | AC 2; C3, C4, C8 |
| `README.md` | § "Running DB tests": replace lines 46 and 49 (`rls_gaps.sql` → `rls_hardening.sql`, new one-line description). § "Set up Supabase" line 24: paste every migration in filename order. | C7 |
| `work/tickets/T-003/impl-log.md` | Implementer log with verbatim DB test output | AC 2, AC 3 |

Not touched: `supabase/migrations/20261106000000_init.sql` (R2, applied), `supabase/tests/rls_tables.sql`, `supabase/tests/rls_storage.sql`, `src/**` (incl. `src/types/database.ts`), `work/backlog.md`, `work/ming-todo.md`.

## Tests to write
All in `supabase/tests/rls_hardening.sql`. One transaction, `begin … rollback`, `plan(23)`.

Seed as `postgres`: users A and B (the same fixed UUIDs as the other files). Then:
- locations `…a1` (A, "A loc"), `…a5` (A, "A loc 2"), `…b1` (B, "B loc");
- items `…a2` (A, location a1), `…b2` (B);
- photos `…a3` (A, item a2, `A/a2/a.jpg`, not primary) and `…b3` (B, item b2, `B/b2/b.jpg`);
- wear log `…a4` (A, item a2, `current_date`).

Use the `rls_test.affected(sql)` helper copied from `rls_tables.sql` (rows affected). Then switch to A, using the same three lines as the other files.

| Test (file › name) | Covers |
|---|---|
| **Positive controls (as A)** — so that a 42501 below cannot come from a missing grant (finding 3) | |
| `rls_hardening.sql › control: A sets own location parent to own location` (`lives_ok` update a5 set parent_id = a1) | New locations check accepts own parent |
| `› control: A updates own location` (`is(affected(update locations set name … where id=a1), 1)`) | Own-row UPDATE allowed |
| `› control: A updates own item` (affected = 1 on a2) | Finding 3 |
| `› control: A updates own photo without changing its path` (affected = 1, `set is_primary = true` on a3) | New photos check accepts own path on UPDATE (the app's real update shape) |
| `› control: A updates own wear log` (affected = 1, `set worn_on = current_date - 1` on a4) | Finding 3 |
| `› control: A inserts own photo under A/` (`lives_ok`, item a2, `A/a2/c.jpg`) | New photos check accepts own path on INSERT; `storage.foldername` is executable by `authenticated` |
| **GAP-1** | |
| `› GAP-1: A cannot set locations.parent_id to B's location` (`throws_ok` update a1 set parent_id = b1, `42501`) | The F-006 probe, now real |
| `› A cannot insert a location under B's location` (`throws_ok` insert (name, parent_id = b1), `42501`) | INSERT path of GAP-1 |
| `› A gets 42501, not 23503, for a parent id that does not exist` (`throws_ok` update a1 set parent_id = `'cccccccc-0000-4000-8000-0000000000ff'`, `42501`) | Existence oracle closed (finding 9). RLS `with check` runs before the FK trigger. |
| **GAP-2** | |
| `› GAP-2: A cannot insert item_photos with storage_path under B/` (`throws_ok`, item a2, `B/a2/x.jpg`, `42501`) | The F-006 probe, now real |
| `› A cannot move own photo's storage_path under B/` (`throws_ok` update a3 set storage_path = `B/a2/x.jpg`, `42501`) | UPDATE path of GAP-2 |
| `› A cannot insert a photo path without a folder` (`throws_ok`, item a2, `x.jpg`, `42501`) | Edge: `foldername` gives an empty array, so `[1]` is null and the row is rejected |
| `› A gets 42501, not 23505, for B's existing path` (`throws_ok`, item a2, storage_path = b3's path, `42501`) | Unique-violation oracle closed (finding 9) |
| `› squat: A cannot claim a path in B's folder` (`throws_ok`, item a2, `B/b2/squat.jpg`, `42501`) | Squatting scenario, step 1 |
| **Update-path regressions** (finding 4) — all `throws_ok … '42501'` | |
| `› A cannot hand own location to B` (update a1 set user_id = B) | Rewritten locations policy |
| `› A cannot hand own item to B` (update a2 set user_id = B) | items policy (unchanged, regression guard) |
| `› A cannot hand own photo to B` (update a3 set user_id = B) | Rewritten photos policy |
| `› A cannot hand own wear log to B` (update a4 set user_id = B) | wear_logs policy (regression guard) |
| `› A cannot move own photo to B's item` (update a3 set item_id = b2) | Rewritten photos policy |
| `› A cannot move own wear log to B's item` (update a4 set item_id = b2) | Regression guard |
| **Squatting, step 2 (switch to B)**: `reset role`, set B's claims (both forms), `set local role authenticated` | |
| `› squat: B can still insert its own photo at B/b2/squat.jpg` (`lives_ok`, item b2) | The harm the ticket names ("B's upload for that path would then fail") does not happen |
| **After (as postgres, `reset role`)** | |
| `› after: no A-owned photo row outside A's folder` (`is(count(*) … where user_id = A and (storage.foldername(storage_path))[1] is distinct from A::text), 0)`) | No denied write leaked through |
| `› after: A's location has no foreign parent` (`is((select parent_id from locations where id = a1), null::uuid)`) | GAP-1 write did not happen |

Count: 6 + 3 + 5 + 6 + 1 + 2 = **23**. If the implementer must change the count, `plan(n)` must equal the
real number, and the reason is recorded in impl-log.

Header comment of the file: what it covers (T-003 hardening plus the update-path guards), user ids, "everything
rolls back". Add one line noting that `A/../B/x.jpg` passes the folder check by design, because object keys are
literal (security review finding 10). There is no assertion for this.

No Vitest changes: no TypeScript logic changes (R8 is met by the pgTAP suite).

## Approach
1. **Branch** `ticket/T-003` (already checked out from latest `main`). Confirm that `supabase/migrations/` contains only `20261106000000_init.sql`. If a newer migration exists, choose a timestamp later than it and record that.
2. **Migration** `supabase/migrations/20261107120000_rls_hardening.sql`. No `begin`/`commit`. Do not touch `using`. Do not add a `NOT VALID` constraint, a trigger or a data fix.
   ```sql
   alter policy "locations: owner full access" on public.locations
     with check (
       user_id = (select auth.uid())
       and (parent_id is null or exists (
         select 1 from public.locations p
         where p.id = parent_id and p.user_id = (select auth.uid())))
     );

   alter policy "item_photos: owner full access" on public.item_photos
     with check (
       user_id = (select auth.uid())
       and (storage.foldername(storage_path))[1] = (select auth.uid())::text
       and exists (select 1 from public.items i
                   where i.id = item_id and i.user_id = (select auth.uid()))
     );
   ```
   - **Header comment:**
     - which gaps it closes, and that it supersedes the `with check` of `init.sql:129-132` and `:144-150`;
     - `using` is unchanged on purpose. A row that violates the check stays visible to its owner, so the owner can repair it.
     - precheck for Ming, read-only, expected 0 rows each:
       - `select c.id from public.locations c join public.locations p on p.id = c.parent_id where p.user_id <> c.user_id;`
       - `select id from public.item_photos where (storage.foldername(storage_path))[1] is distinct from user_id::text;`
   - **Trailing comment "Rollback (manual)":** the two original `with check` expressions as `alter policy` statements.
   - The `exists` on `locations` inside the `locations` policy is evaluated under the caller's RLS (`using` has no subquery), so there is no recursion (consult, Risks).
3. **Tests**: `git mv supabase/tests/rls_gaps.sql supabase/tests/rls_hardening.sql`, then rewrite it as in *Tests to write*. Never weaken an assertion to get green. If a planned denial passes or a control fails, that is a finding: record it and stop (escalate). Do not change the policy beyond this plan.
4. **README** edits (C7) only: lines 24, 46 and 49. Keep the wording short.
5. **Local stack**:
   - `docker info` must exit 0. Then `npx supabase start` if `supabase_db_tudocuatui` is not running.
   - If the DB volume already exists from F-006, `start` does **not** apply new migrations. Run `npx supabase migration up --local`, then `npx supabase migration list --local` and check that `20261107120000` shows as applied.
   - **Do not run `npx supabase db reset`.** If the migration cannot be applied without a reset, stop and record why.
6. **Verify the live policies** (no host `psql` or password needed):
   - PowerShell: `"select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid in ('public.locations'::regclass, 'public.item_photos'::regclass);" | docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q`
   - Paste the output into impl-log.
7. **Run** `npx supabase test db` twice. Paste the verbatim output into impl-log § "DB test run". Optionally also capture the raw TAP of `rls_hardening.sql`, with the `docker exec … psql` command from README (PowerShell: `Get-Content supabase/tests/rls_hardening.sql -Raw | docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q`).
8. **Stop** the stack with plain `npx supabase stop`. **Never `--no-backup`**, even though README line 41 shows it.
9. **Checks**: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. Confirm `git diff main -- src/types/database.ts` is empty.
10. **Hosted project: do not touch.** No `supabase link`, `db push`, `--linked` or `--db-url`. Applying is M-5 (Ming).
11. If Docker is unavailable, do not guess results. The orchestrator stops the ticket as `BLOCKED` with an M-item for Ming to run steps 5–8, as in F-006.

Rules:
- **R1:** no app code change; local mode unaffected.
- **R2:** new migration file only. `init.sql` is untouched, and the policies are altered in the same migration that defines the intent. Types: C2.
- **R3:** no secrets; the local stack uses the CLI's default local credentials only.
- **R4:** the photo-row path check now matches the storage policy.
- **R5:** n/a.
- **R6:** n/a.
- **R7:** the file list above; follow-ups listed below.
- **R8:** the pgTAP suite and the checks.
- **R9:** no UI.
- **R10:** untouched.

## Specialist input used
`consult-database-optimizer.md`:
- **Adopted:**
  - checks in `with check` only, with `using` unchanged (Finding 2);
  - the `locations` expression, copied from the `items` pattern;
  - the `foldername` variant (open question 1);
  - drop "Regenerate types" (OQ 4);
  - fold in the update-path tests and controls (OQ 2);
  - precheck as a comment, no data repair, no `NOT VALID` or trigger (OQ 3);
  - rename the test file to `rls_hardening.sql` and remove `todo`/`probe`/`GAP-n result`;
  - squatting edge test;
  - the old policy text as a rollback comment;
  - timestamp after `20261106000000`;
  - the existence oracle and `on delete set null` are closed as a consequence (no extra SQL; the oracle part is asserted by two tests).
- **Changed:** `drop`+`create` in `begin/commit` → `alter policy` (C5), for atomicity per statement and no reliance on CLI transaction handling.
- **Rejected:**
  - enforcing the full `{uid}/{item_id}/…` path: stricter than the ticket scope (consult agrees);
  - an `A/../B` assertion: comment only (consult agrees);
  - merging the tests into `rls_tables.sql`: a separate file keeps `rls_tables.sql` and its `plan(37)` untouched and keeps the diff small.

From `F-006/security-review.md`:
- **Adopted:** findings 3 and 4 (table part), finding 6 (no TODO), finding 9 (oracle tests).
- **Not adopted:** finding 3 storage part, finding 5 (anon role) and finding 8. See follow-ups.

## Assumptions
- **Supabase CLI behaviour.** `npx supabase migration up --local` applies pending migrations to a running local stack without wiping data (CLI 3.0.0, as in F-006). If it does not, the implementer stops instead of using `db reset`.
- **`storage.foldername(text)` exists** in both the local image and the hosted project, and `authenticated` can execute it. The storage policies in `init.sql` already depend on both. The control "A inserts own photo under A/" proves it locally.
- **WITH CHECK runs before FK and unique checks.** Postgres evaluates RLS `with check` before constraint checks: FKs are deferred-to-statement-end triggers, and unique checks happen at index insert. So the oracle tests expect `42501`. If the local run shows `23503` or `23505`, record it as a finding; do not loosen the test.
- **No hosted data yet** (M-1 unticked), so the precheck is most likely moot.
- **Hotspot.** `README.md` is also likely edited by **F-002** (`IN_PROGRESS`, types section near line 29 `--linked`). That is close to this plan's line-24 edit, so expect a small rebase conflict. No `src/App.tsx` edit. No other open ticket touches `supabase/**`.
- **Follow-ups** (not in this diff; the orchestrator files `debt` issues, `project:tudocuatui`, after checking whether F-006 already filed them):
  1. anon-role tests (security finding 5);
  2. storage own-object UPDATE control (finding 3, storage part);
  3. README "local stack only; never `--linked`" line (finding 8);
  4. README line 41 recommends `npx supabase stop --no-backup`, which conflicts with the agent rule of plain `stop`. Ming to decide the README wording.

## Blocking questions
None. All open questions are resolved with stated defaults (C1–C9), which Ming confirms or overturns when approving the plan.

## Split proposal
None. About 60 lines of migration (mostly comments), about 110 lines of test SQL replacing 51, and about 5 README lines.
