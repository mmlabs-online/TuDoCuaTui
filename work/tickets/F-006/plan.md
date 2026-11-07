Status: READY

# Plan — F-006: Add RLS and storage policy tests

## Feature summary
`docs/feature-list.md` F-006 says:
> `supabase test db` (pgTAP) covering:
>   - user A cannot read, update or delete user B's items, photos, wear logs or locations
>   - user A cannot attach a wear log or photo to B's item
>   - the storage policy blocks the path `{otherUser}/...`
> **AC:** the tests run locally with `supabase start` and are documented. Running them in CI is optional (P2).

The ticket adds these items to scope:
> A cannot set `items.location_id` to B's location.
> Storage: A cannot read, upload to or delete under `B/...` in bucket `wardrobe`.
> **Gap probes** (expected to fail today, see T-003): A sets `locations.parent_id` to B's location; A inserts an `item_photos` row whose `storage_path` starts with B's user id.
> README section "Running DB tests" (needs Docker).

It also has this technical note:
> `items_with_stats` is `security_invoker`: also assert that A sees zero of B's rows through the view.

`work/decisions.md` D9 says:
> T-003 (RLS gaps, only if F-006 confirms them)

That means the gap results are what T-003 starts from. D11 uses the local stack built from `supabase/migrations/` as the source of truth, and this plan tests against that same stack.

Out of scope, per the ticket: CI, and fixing the gaps (T-003 is a migration and High tier). **Do not touch `supabase/migrations/**`.**

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `supabase test db` passes locally for all non-gap cases. | Run `npx supabase start` if the stack is not already up, then `npx supabase test db`. The command exits 0. All three files report `ok` with the planned count. Every `not ok` line must carry `# TODO` and come from `rls_gaps.sql`. If the reviewer cannot run Docker, they use the verbatim output in `impl-log.md` § "DB test run" instead (see Approach step 7). |
| 1a | The denials are not vacuous. | In `rls_tables.sql` and `rls_storage.sql` the positive-control assertions (A can read, insert and delete A's own rows and objects) pass in the same run. |
| 1b | Tests do not leave data behind. | Each file is `begin; … rollback;`. Running `npx supabase test db` twice gives the same output. After the run, `select count(*) from auth.users where id in (<A>,<B>)` returns 0 as postgres. |
| 2 | The gap probes are reported in the Handoff, with the result. | `impl-log.md` § "Gap probe results" contains the verbatim raw TAP lines from `rls_gaps.sql`, including the `GAP-1 result: …` / `GAP-2 result: …` lines and the `# TODO` lines. The orchestrator copies these lines into the ticket `## Handoff` at DONE. |
| 3 | The README explains how to run the tests. | `README.md` has a section `## Running DB tests` covering prerequisites (Docker running, Supabase CLI via `npx`), `npx supabase start` → `npx supabase test db`, the 553xx ports, the fact that tests roll back, what `# TODO` lines mean (T-003), how to get raw TAP for one file, and that CI does not run them yet. The section contains no key or password values. |
| 4 | Checks stay green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. No TS changes are expected, and `*.md` is in `.prettierignore`. |

## Ming verification after merge
None. Everything runs on the local stack. The hosted project is not touched.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `supabase/tests/rls_tables.sql` | New pgTAP file: locations, items, item_photos, wear_logs, and the `items_with_stats` view | Scope bullets 1–3 and the view technical note |
| `supabase/tests/rls_storage.sql` | New pgTAP file: `storage.objects` policies for bucket `wardrobe` | Scope bullet "Storage" |
| `supabase/tests/rls_gaps.sql` | New pgTAP file: the two gap probes as TODO tests, plus result lines | Scope bullet "Gap probes" and AC2. Kept in a separate file so T-003 can flip it. |
| `README.md` | New `## Running DB tests` section after "Set up Supabase", and one row in the Code map for `supabase/tests/` | AC3 |
| `work/tickets/F-006/impl-log.md` | Implementer log, including "DB test run" and "Gap probe results" | AC1 evidence and AC2 |

Do not put any other `.sql` file in `supabase/tests/`, because `supabase test db` runs every one of them. Helpers live inside each test file. No `supabase/seed.sql`.

## Tests to write
Fixed ids: user A `aaaaaaaa-0000-4000-8000-00000000000a`, user B `bbbbbbbb-0000-4000-8000-00000000000b`. Use similar fixed UUIDs for rows, for example `…a1` = A's location, `…b2` = B's item. Assertions filter by these ids only and never count whole tables, because the dev DB may hold other data.

**`supabase/tests/rls_tables.sql`**

Seed as postgres:
- A: location L_A, item I_A (location L_A), photo P_A (`<A>/<I_A>/a.jpg`, `is_primary=false`), wear log W_A (today).
- B: location L_B, item I_B (location L_B), photo P_B, wear log W_B.
- Cross-owner rows that RLS must hide from A in the view:
  - a B-owned wear log on I_A, dated yesterday
  - a B-owned photo on I_A with `is_primary=true`, path `<B>/<I_A>/b.jpg`

| Test (description prefix) | Covers |
|---|---|
| `control: A sees own {location,item,photo,wear log}` (4) | Positive controls for SELECT |
| `control: A inserts own {location,item,photo,wear log}` (4, `lives_ok`) | Positive controls for INSERT and WITH CHECK |
| `A cannot select B's {location,item,photo,wear log}` (4, count = 0) | F-006 "cannot read" |
| `A cannot update B's {…}` (4, affected rows = 0) | F-006 "cannot update" |
| `A cannot delete B's {…}` (4, affected rows = 0) | F-006 "cannot delete" |
| `A cannot insert a wear log on B's item` (`throws_ok … '42501'`) | "cannot attach a wear log" |
| `A cannot insert a photo on B's item` (`throws_ok … '42501'`, path under A) | "cannot attach a photo" |
| `A cannot insert an item with B's location` (`42501`) | "cannot set `items.location_id` to B's location" |
| `A cannot move own item to B's location` (UPDATE, `42501`) | Same, on UPDATE |
| `A cannot insert a {location,item,photo,wear log} owned by B` (4, `user_id = B`, `42501`) | "cannot change B's data", by creating rows in B's account |
| `view: A sees 0 of B's rows in items_with_stats` | Technical note |
| `view: A sees own item in items_with_stats` | Positive control for the view |
| `view: wear_count of A's item ignores B's wear log` (= 1) | `security_invoker` applies to the aggregate join |
| `view: primary_photo_path of A's item ignores B's photo` (= A's path) | `security_invoker` applies to the lateral join |
| `view: items_with_stats is security_invoker` (`pg_class.reloptions` contains `security_invoker=true`) | Catches the view being recreated without it |
| `after: B's {location,item,photo,wear log} unchanged` (4, as postgres) | Proves the UPDATE and DELETE attempts had no effect |

**`supabase/tests/rls_storage.sql`**

Seed as postgres: object `wardrobe/<A>/<x>/a.jpg` and object `wardrobe/<B>/<y>/b.jpg`.

| Test | Covers |
|---|---|
| `bucket wardrobe is private` (`public = false`) | Precondition: a public bucket would bypass the SELECT policy (R4) |
| `control: A selects own object` (1 row) | Positive control |
| `control: A uploads to A/...` (`lives_ok`) | Positive control |
| `A cannot select B's object` (0 rows) | "cannot read" |
| `A cannot upload to B/...` (`42501`) | "cannot upload" |
| `A cannot update B's object` (affected rows = 0) | Policy completeness |
| `A cannot rename own object into B/...` (`42501`) | UPDATE without WITH CHECK reuses USING on the new row |
| `A cannot delete B's object` (affected rows = 0) | "cannot delete" |
| `control: A deletes own object` (affected rows = 1) | Shows the delete path works, so the 0 above is not vacuous |
| `after: B's object still exists with original name` (as postgres) | Delete and rename had no effect |

**`supabase/tests/rls_gaps.sql`**

Seed as postgres: L_A, L_B, I_A. All probes run as A.

| Test | Covers |
|---|---|
| `GAP-1 result: <CONFIRMED (statement succeeded) \| blocked (SQLSTATE x)>` (always `ok(true, …)`) | AC2: the visible outcome |
| `GAP-1 (T-003): A cannot set locations.parent_id to B's location` (`throws_ok 'update locations set parent_id=<L_B> where id=<L_A>', '42501'`, inside `todo`) | Gap probe 1 |
| `GAP-2 result: …` (always `ok(true, …)`) | AC2 |
| `GAP-2 (T-003): A cannot insert item_photos with storage_path under B/` (`throws_ok 'insert … (item_id=<I_A>, storage_path=''<B>/<I_A>/x.jpg'')', '42501'`, inside `todo`) | Gap probe 2 |

## Approach
1. **Check the environment first, and record the output in impl-log § "DB test run".**
   - `docker info` must exit 0.
   - `npx supabase --version` must print a version.
   - F-001's impl-log shows both worked on this machine on 2026-11-07, but verify again.
   - `npx supabase start` brings up the `*_tudocuatui` containers on ports 553xx. If they are already running, reuse them.
   - `docker ps` must list `supabase_db_tudocuatui`.
   - Other projects' stacks (for example `calechip` on the default ports) can run side by side. Do not stop them.
2. **File skeleton.** Use this skeleton in each file, with LF line endings:
   ```sql
   begin;
   create extension if not exists pgtap with schema extensions;
   select plan(N);
   -- helpers, seed, tests
   select * from finish();
   rollback;
   ```
   - `N` is the exact assertion count.
   - Helpers go in a schema created inside the transaction, for example `create schema rls_test; grant usage on schema rls_test to authenticated;`. The rollback removes it.
   - Helper `rls_test.affected(sql text) returns int` is plpgsql and not `security definer`. It runs `execute sql; get diagnostics n = row_count; return n;`. Use it for "affected rows = 0". Call it as `select is(rls_test.affected($$update …$$), 0, '…')`. A data-modifying CTE cannot sit inside `is(...)`, and `results_eq` opens a cursor, which rejects DML.
   - Helper `rls_test.probe(sql text) returns text`, used only in the gaps file. It does `execute sql`, then raises a sentinel exception so the probe's own change is rolled back. It returns `'CONFIRMED (statement succeeded)'` when it catches the sentinel, otherwise `'blocked (SQLSTATE ' || sqlstate || ')'`.
3. **Seeding as postgres.**
   - `insert into auth.users (id, email, aud, role)` with the two fixed ids and `a@test.local` / `b@test.local`. If the local GoTrue schema needs more NOT NULL columns, add them. Do not change any assertion to work around it.
   - Insert the domain rows with explicit `user_id`. This bypasses RLS because the role is postgres.
   - In the storage file, insert `storage.objects (bucket_id, name, owner_id?)` with only the columns the local schema requires.
4. **Switching to user A.** Use these statements directly in the file:
   ```sql
   select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
   select set_config('request.jwt.claim.sub', '<A>', true);
   set local role authenticated;
   ```
   - Use `reset role;` before each "after:" verification block.
   - Never seed while the role is `authenticated`.
5. **Assertion style** (from the consult):
   - SELECT, UPDATE and DELETE of invisible rows: assert count = 0 or affected rows = 0. Do not use `throws_ok`.
   - INSERT, or UPDATE that violates WITH CHECK: use `throws_ok(sql, '42501')`.
   - Never weaken a denial assertion to make the suite pass. If a non-gap denial fails, that is a finding. Record it in impl-log § Follow-ups and report it. Do not change the policy, because migrations are out of scope.
6. **Storage delete trigger.** This resolves consult open question 1, and is reversible.
   - Before the two delete statements in `rls_storage.sql`, run `select set_config('storage.allow_delete_query', 'true', true);`.
   - This neutralises the `storage.protect_delete` trigger if the local storage image has it. If the image lacks the trigger, the setting is a harmless custom GUC.
   - The positive control "A deletes own object = 1" proves that the delete path is real.
   - Record in impl-log whether the trigger exists: `select tgname from pg_trigger where tgrelid='storage.objects'::regclass`.
7. **Run, and record real output.**
   - `npx supabase test db`: paste the full output into impl-log § "DB test run" as a fenced block, with the exit code.
   - Raw TAP for the gaps file: run it through the db container, so no host `psql` or password is needed. In PowerShell:
     ```powershell
     Get-Content supabase/tests/rls_gaps.sql -Raw | docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q
     ```
     In bash:
     ```bash
     docker exec -i supabase_db_tudocuatui psql -U postgres -d postgres -X -q < supabase/tests/rls_gaps.sql
     ```
   - Paste the verbatim lines into impl-log § "Gap probe results", and add one line per gap: "GAP-n: CONFIRMED / not reproduced". If a gap turns out to be blocked, say so plainly. Under D9, T-003 then shrinks or is dropped.
   - Run `npx supabase test db` a second time and confirm the output is identical (AC1b).
   - Stop the stack with `npx supabase stop --no-backup` only if you started it in step 1.
8. **If Docker or the Supabase CLI cannot run** (step 1 fails, `supabase start` errors, or the pg_prove image cannot be pulled):
   - Still write the three SQL files and the README section.
   - Record the exact failing command and its error output in impl-log § "DB test run".
   - Mark AC1 and AC2 as **NOT VERIFIED**. Do **not** write expected output, a hand-simulated TAP stream or a "should pass" claim.
   - Run the four normal checks.
   - The reviewer cannot PASS AC1 or AC2 without real output. The orchestrator then stops the ticket as `BLOCKED` with an `M-n` item for Ming, without spending a rework attempt. The item says to start Docker Desktop, run `npx supabase start && npx supabase test db`, and paste the output plus the raw TAP of `rls_gaps.sql` (command from step 7).
9. **README.** Add `## Running DB tests` after "Set up Supabase" and before "Code map", in English, about 15–25 lines. Cover:
   - prerequisites: Docker Desktop running, and Node for `npx supabase`
   - the commands
   - that ports 55320–55329 must be free
   - that each file runs in a transaction that rolls back
   - that `not ok … # TODO` lines in `rls_gaps.sql` are known gaps tracked in T-003, and that "TODO passed" means T-003 fixed one and the `todo` wrapper should be removed
   - the raw-TAP command from step 7
   - that CI does not run these yet (P2)

   Add a Code map row: `supabase/tests/` | pgTAP RLS and storage policy tests.
10. **Run the checks:** typecheck, format:check, test, build.

Rules:
- **R1**: unaffected. There is no app code.
- **R2**: there is no schema change, and `src/types/database.ts` stays untouched.
- **R3**: no secrets. The README and impl-log must not contain the local anon or service keys, or the DB password. The `docker exec` path avoids passwords entirely. Before committing, grep for `eyJ` and `sb_secret_` in changed files.
- **R4**: tested here.
- **R7**: the scope is the files listed above.
- **R8**: the checks must be green, and this ticket's tests must actually run.
- **R9** and **R10**: do not apply.

## Specialist input used
From `consult-database-optimizer.md`:
- **Adopted:**
  - the three-file layout (Rec 1)
  - assertion style: count = 0 versus `42501`
  - fixed UUIDs, seeding as postgres, the two `set_config` calls plus `set local role`, and `reset role` for verification
  - `begin … rollback` with exact `plan(N)`
  - helpers inside the file, not as separate `.sql` files
  - positive controls (Storage notes, Risks)
  - all five storage cases plus the rename case
  - the `items_with_stats` cases, plus the `reloptions` structural check
  - gap probes written as secure behaviour wrapped in `todo`, with no `skip`, plus always-passing `GAP-n result:` lines (Rec 3, Rec 4)
  - README contents (Rec 6)
  - not touching migrations or types (Rec 7)
- **Adapted:**
  - "affected rows" uses a plpgsql `row_count` helper instead of `with u as (update … returning 1)` inside an assertion. A data-modifying CTE is not allowed in a subquery, and `results_eq` uses a cursor.
  - Raw TAP comes through `docker exec … psql` instead of host `psql -h 127.0.0.1 -p 55322`. `psql` may not be installed on this Windows host, and this route needs no password.
  - The view test seeds cross-owner rows on A's item, so the join and aggregate leak checks are meaningful.
  - Added `bucket wardrobe is private` as a precondition.
- **Open questions, resolved by Annie under the 2026-11-07 delegation (all reversible):**
  1. Storage delete trigger: pre-set `storage.allow_delete_query`, and record whether the trigger exists (Approach step 6).
  2. Anon access: **not added.** It is outside the ticket scope (R7, Planner rule 1). Listed as a possible follow-up in impl-log.
  3. A "TODO passed" result is the signal to remove the `todo` wrapper when T-003 lands. This is documented in the README, and the implementer adds it to the T-003 follow-up note in impl-log. This ticket does not edit T-003's ticket.md.
  4. Raw TAP lines in impl-log and copied into the Handoff are enough. No persistent artifact.
- **Noted, not tested:** the storage-path squatting angle (UNIQUE `storage_path`). GAP-2 covers its mechanism. Mention it in the gap-results note for T-003, which already lists it in its scope.

## Assumptions
- The Supabase local Postgres image ships pgTAP. `supabase test db` runs every `*.sql` in `supabase/tests/` through pg_prove and exits 0 when the only failures are TODO tests.
- The local `auth.uid()` reads `request.jwt.claims` or `request.jwt.claim.sub`. Both are set.
- The `authenticated` role has the standard Supabase grants on `public` tables, the view and `storage.objects`. If a positive control fails because of a grant or a newer storage trigger (for example `storage.prefixes`), investigate and record it. Do not drop the control.
- **Hotspot:** `README.md` is also edited by F-002 (`IN_PROGRESS`, replaces the "Optional: regenerate" step) and F-007 (`BLOCKED`, adds "Deploy"). Insert the new section between "Set up Supabase" and "Code map". Expect a small rebase. `src/App.tsx` is not touched.
- Tier: Medium. The paths are `supabase/tests/**` and `README.md`; neither is High in `.github/risk-tiers.yml`.
- Expected diff is about 300–400 lines of SQL (repetitive) plus about 25 README lines. That fits one cycle.

## Blocking questions
None.

## Split proposal
None.
