## Attempt 1 — 2026-11-08
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: `tsc --noEmit` clean (exit 0).
- format:check: "All matched files use the correct format."
- test: vitest 5 files, 74 tests passed.
- build: vite built OK (`dist/assets/index-*.js` 453 kB).
- `npx supabase db reset && npx supabase test db` (local, default variant): Files=4, Tests=101, Result: PASS.
- `bash scripts/test-db-shared.sh` (local, stoktok revoke simulated): "stoktok default privileges simulated: OK",
  Files=4, Tests=101, Result: PASS, exit 0. Temp migration removed by the trap (`supabase/migrations/` holds only the
  two TuDo files afterwards). Local DB reset back to the default variant afterwards.
- These results match impl-log.md attempt 1.

### Acceptance criteria
- [x] No TuDo table/view/enum/function/trigger/schema without `tudo_` — evidence: `rg -nP "public\.(?!tudo_)[a-z_]+" supabase/migrations supabase/tests src` → 0 hits; `rg -nP "(?<!tudo_)private\." supabase src` → 0; `rg -nP '\.from\("(?!tudo_)' src` → 0; `grants.sql` N1–N6 pass after `db reset`.
- [x] Grants hold with stoktok's revoke applied first; `anon` has none — evidence: `supabase/migrations/20261106000000_init.sql:167-172` (revoke-then-grant); `grants.sql` G1–G13 pass in both variants; harness simulation-active check printed OK; `rls_tables.sql` positive `lives_ok` controls pass under the simulation.
- [x] `npx supabase test db` passes; all RLS/hardening assertions kept — evidence: 4 files OK; `plan(37)` / `plan(33)` unchanged; a rename-normalised diff of both files against `origin/main` differs only in a few description strings (see Nits), no assertion or expected value changed.
- [x] Checks green; `database.ts` regenerated and matches — evidence: checks above; `supabase gen types typescript --local` + oxfmt into scratch → byte-identical to `src/types/database.ts`; no non-`tudo_` table/view keys in it.
- [x] Local mode unchanged (R1) — evidence: `repo.ts` hunks are all inside `createSupabaseRepo` (lines 108–264), `createLocalRepo` untouched; `repo.local.test.ts` passes. (`pnpm dev` visual check not run by reviewer; covered by M-2.)
- [ ] README and M-1 / M-5 describe dashboard-only setup on the stoktok project; D17 recorded — D17 present (`work/decisions.md:26`), README and M-1/M-5 are dashboard-only and every `db push|--no-backup|--linked|link` hit is a "never" line. **But** M-1 / M-5 miss two checks that the shared-project setup needs: see Issues 1 and 2.

### Issues
#### Issue 1 — 🟡 should-fix — security / human-step correctness
- **Where**: `work/ming-todo.md:18` (M-1 step 4), `README.md` step 3 ("Sign-ups are disabled, …").
- **Expected**: M-1 verifies the assumption it relies on. TuDo's bundle now publishes the shared project's URL and anon key; if "Allow new users to sign up" or "Allow anonymous sign-ins" is on in the stoktok project, anyone can get an `authenticated` JWT, write rows and upload 10 MB files to `wardrobe/{their uid}/`, and also holds a stoktok Auth session.
- **Actual**: M-1 states "sign-ups are disabled" as a fact and never checks it; anonymous sign-ins are not mentioned.
- **Fix instruction**: add an M-1 step (before step 4): "Authentication → Sign In / Providers: confirm *Allow new users to sign up* is OFF and *Allow anonymous sign-ins* is OFF. If either is on, stop and tell Annie." Mirror one sentence in README "Set up Supabase" step 3. Doc-only.

#### Issue 2 — 🟡 should-fix — verification gap (AC2 on hosted)
- **Where**: `work/ming-todo.md:26-31` (M-5).
- **Expected**: the hosted check covers the same privileges the local `grants.sql` asserts, because the hosted default ACL may differ from local (M-1 step 1 records it for that reason).
- **Actual**: only `information_schema.role_table_grants` for anon/authenticated on tables; function and schema privileges (and PUBLIC-derived access) are not checked.
- **Fix instruction**: add to M-5 one read-only query, expected result all `false`:
  ```sql
  select has_table_privilege('anon','public.tudo_items','select'),
         has_table_privilege('anon','public.tudo_items_with_stats','select'),
         has_schema_privilege('anon','tudo_private','usage'),
         has_function_privilege('anon','tudo_private.tudo_owns_location(uuid)','execute'),
         has_function_privilege('anon','public.tudo_set_updated_at()','execute'),
         has_function_privilege('authenticated','public.tudo_set_updated_at()','execute');
  ```

#### Issue 3 — 🟡 should-fix — local data loss risk in the harness
- **Where**: `scripts/test-db-shared.sh:6-7, 16`.
- **Expected**: the script always operates on the TuDo repo, whatever the caller's cwd.
- **Actual**: paths are cwd-relative. Ming has the stoktok repo next to this one; running it from stoktok's root writes the temp migration into stoktok and runs `supabase db reset` on **stoktok's** local DB.
- **Fix instruction**: after `set -eu`, add `cd "$(dirname "$0")/.."`. Optionally make the trap explicit: `trap 'rm -f "$SIM"' EXIT` plus `trap 'exit 130' INT TERM`. Re-run the harness and paste its output in impl-log.

### Rules R1–R10 (CLAUDE.md)
No violations found. R2: the in-place edits of the two migrations are the exception Ming decided (ticket Notes, D17); RLS stays in the same migration; types regenerated. R3: no new client env vars or secrets. R4: storage untouched. R7: every changed file is in the plan's file list (ticket-folder files and the `ming-todo.md` approval ticks are workflow edits allowed by D16; the F-007 tick matches Ming's approval recorded in commit 5a04e61).

### Nits (do not block)
- `supabase/tests/rls_tables.sql:89-90, 93` and `rls_hardening.sql:66, 71`: some description strings still say `items_with_stats` / `locations.parent_id` / `item_photos` (plan Approach §3 said rename them too).
- `init.sql:22`: `tudo_set_updated_at` has no `set search_path = ''`; Supabase's linter flags `function_search_path_mutable`. Cheap to add since in-place edits are allowed here (security-review G1).
- `src/data/mappers.test.ts`: `as unknown as ItemRow` is acceptable, but see follow-up on view nullability.

### Follow-ups (out of scope)
- Generated `tudo_items_with_stats` Row types are non-null while the view can return nulls; align types with runtime (impl-log follow-up).
- Storage policy names `wardrobe: …` are unprefixed (C4, out of scope until the Google Drive ticket).
- A CI job for both DB variants (C7).

### Ming verification after merge (not verified by reviewer; carry into the PR)
- M-1 on the stoktok project (pre-checks, both migrations in SQL Editor in filename order, Redirect URL, user exists, `.env.local`).
- M-5 read-only verification queries.
- M-2 smoke test Run B in Supabase mode — no `42501` / 403 on any TuDo call.
- Confirm the stoktok app still works after the apply.
