# Security review — T-004

## Attempt 1 — 2026-11-08 (security-ai-generated-code-auditor)

I found no 🔴 issues. The DB-side security changes are sound. Two 🟡 gaps are in Ming's hosted setup and verification steps.

Limitation: I had no shell, so I could not run `git diff`. I reviewed the current files on `ticket/T-004` (migrations, tests, script, `repo.ts`, README, `ming-todo.md`), plus stoktok's migrations as a read-only reference.

### Findings

**Verified OK (🟢)**
- **RLS on every table:** RLS is enabled on all 4 `tudo_` tables (`supabase/migrations/20261106000000_init.sql:125-128`). Each policy is `to authenticated` and scoped to `user_id = (select auth.uid())`. The view is `security_invoker = true` (`init.sql:99-100`).
- **Grants:** `init.sql:167-172` revokes everything first, then grants exactly S/I/U/D on the tables and SELECT on the view to `authenticated`.
  - Nothing goes to `anon`, and nothing is granted to PUBLIC.
  - TRUNCATE, REFERENCES and TRIGGER are not granted. This matters because TRUNCATE bypasses RLS.
  - There are no sequences (all keys are uuid). No `alter default privileges` appears in the TuDo migrations, so stoktok's default ACL is not changed.
- **Trigger function revoke:** `init.sql:172` revokes from `public, anon, authenticated`. That is correct: stoktok's default revoke does not remove Postgres's built-in PUBLIC EXECUTE. Test U1 (`supabase/tests/grants.sql:31-41`) proves the trigger still fires after the revoke.
- **`tudo_private` helper** (`supabase/migrations/20261107120000_rls_hardening.sql:22-46`):
  - It is SECURITY INVOKER, plpgsql, STABLE, with `search_path = ''` and fully qualified names.
  - `revoke all on schema ... from public` is in place, and only `authenticated` gets USAGE and EXECUTE.
  - It cannot be used to probe whether an id exists.
  - Tests cover each property and the `anon` denials (`supabase/tests/rls_hardening.sql:39-45`, `grants.sql:29`).
  - Even if the schema were exposed by mistake, the function only reports the caller's own ownership.
- **No effect on stoktok objects:**
  - stoktok has no functions, types, storage or `private` schema, so `create or replace function public.tudo_set_updated_at` cannot overwrite anything of theirs.
  - The `wardrobe` bucket insert is `on conflict do nothing`. Its storage policies are limited to `bucket_id = 'wardrobe'`, so they cannot open up other buckets.
  - `create extension if not exists pgcrypto` changes nothing on hosted.
- **App and secrets:** `src/data/repo.ts` only uses `.from("tudo_*")` and the bucket. There is no `.rpc` or `.schema("tudo_private")`. README and `ming-todo.md` contain names only, no secret values.
- **Simulation script** (`scripts/test-db-shared.sh`):
  - It only touches local targets: plain `db reset` / `test db` without `--linked`, and `docker exec` into the local container.
  - The cleanup trap is set before the temp file is written (`:7`), and the file is gitignored (`.gitignore:24`).
  - The check against the real default-ACL table (`:18-22`) fails if the simulation is not active.
- **Ming's SQL Editor steps** (`work/ming-todo.md:10-19, 26-31`):
  - The pre-checks are read-only, and the existing `wardrobe` bucket check guards against an already-public bucket being silently kept.
  - Each file is pasted and run as a whole. SQL Editor sends a multi-statement script as one implicit transaction, so a failure rolls back the whole file.
  - The steps say never to run `db push`, `link` or `--linked`.

**🟡 Y1 — M-1 assumes sign-ups are off but never checks, and ignores anonymous sign-ins** (`work/ming-todo.md:18`, README:25-26)
- TuDo's browser bundle will now publish the shared project's URL and anon key.
- If sign-ups or anonymous sign-ins are on, anyone can get an `authenticated` JWT. With it they can insert their own rows and upload 10 MB files into `wardrobe/{their uid}/` (storage and cost abuse). They also get a session on stoktok's Auth.
- RLS still protects Ming's data. stoktok grants `authenticated` nothing.
- **Fix:** add a step to M-1: "Authentication → Sign In / Providers: confirm 'Allow new users to sign up' is OFF and 'Allow anonymous sign-ins' is OFF." The local `config.toml:177` has `enable_signup = true`; that is fine locally but says nothing about hosted.

**🟡 Y2 — M-5's hosted check is weaker than the local tests** (`work/ming-todo.md:26-31`)
- `information_schema.role_table_grants` filtered to `anon`/`authenticated` misses grants made to PUBLIC. It also does not check function or schema privileges.
- The pgTAP tests only prove the local default ACL, and the hosted default ACL may differ (this is why M-1 step 1 records it).
- **Fix:** add one read-only query that must return all `false`:
  ```sql
  select has_table_privilege('anon','public.tudo_items','select'),
         has_table_privilege('anon','public.tudo_items_with_stats','select'),
         has_schema_privilege('anon','tudo_private','usage'),
         has_function_privilege('anon','tudo_private.tudo_owns_location(uuid)','execute'),
         has_function_privilege('anon','public.tudo_set_updated_at()','execute'),
         has_function_privilege('authenticated','public.tudo_set_updated_at()','execute');
  ```
- Optionally add `select policyname from pg_policies where schemaname='storage' and tablename='objects';` and expect exactly the 4 `wardrobe:` policies.

**🟢 G1 — `tudo_set_updated_at` has no `set search_path`** (`init.sql:22-27`). It is not SECURITY DEFINER and only calls `now()`, so the risk is low. Supabase's linter will still flag it (`function_search_path_mutable`). Since in-place edits are allowed, add `set search_path = ''`.

**🟢 G2 — Script robustness** (`scripts/test-db-shared.sh:6-7, 16`)
- The paths are relative to the current directory. If the script is run from another Supabase repo's root (for example stoktok's), it would write the temp migration into that repo and reset that repo's local DB.
- **Fix:** add `cd "$(dirname "$0")/.."`.
- The INT/TERM trap does not exit. This works today because `set -e` catches the failed child, but `trap '...; exit 130' INT TERM` would be explicit.

**🟢 G3 — Storage policy names** (`init.sql:182-196`) are `wardrobe: …` rather than `tudo_`-prefixed. A future stoktok policy with the same name would make the migration fail as a whole, not half-apply. Rename only if cheap; storage is out of scope.

### Recommendations
- Y1 → AC6 (README and M-1/M-5 describe dashboard-only setup) and R3: add the sign-up / anonymous sign-in check to M-1.
- Y2 → AC2 (`authenticated` gets the grants it needs, `anon` gets none) and R2: hosted privileges get the same check as the local tests.
- G1 → R2; G2 → the script-safety check asked for in the review.

### Risks (accepted by Ming, for the record)
- stoktok's server `service_role` key bypasses RLS on all TuDo tables and photos. Any future TuDo Edge Function secrets would also live in stoktok's project.
- Shared Auth means a TuDo session is a valid stoktok session. Deleting Ming's user for stoktok reasons would also wipe all TuDo data (`on delete cascade`).
- Redirect URLs should be exact (`http://localhost:8443`, the production URL) and never wildcards.

### Open questions
1. Does stoktok have any user-facing login? If yes, the shared-session point above matters more. Default: no, server uses `service_role` only.
2. Should Y1 and Y2 be fixed in this ticket (doc-only edits to `ming-todo.md`/README) or go on the follow-ups list? Default: in this ticket, because AC6 covers these steps.

## Attempt 2 — 2026-11-08 (security-ai-generated-code-auditor)

**Verdict: no 🔴 findings.** Y1, Y2, G1 and G2 are all fixed correctly, and the attempt-2 changes add nothing unsafe. I left G3 (storage policy names) as it was in attempt 1: optional and out of scope.

Limits: I worked read-only and ran nothing. I reviewed the current files on `ticket/T-004`, not a `git diff`.

### Findings

**🟢 Y1 fixed: sign-up and anonymous sign-in check**
- `work/ming-todo.md:18-19`: M-1 step 4 now has Ming confirm that *Allow new users to sign up* and *Allow anonymous sign-ins* are both OFF, and stop if either is on.
- The check comes after the migrations (step 2) but before the anon key goes into `.env.local` (step 6). Since the anon key only reaches a browser in step 6, that order works.
- `README.md:26-28` repeats the check and notes that the login email must already exist.
- Local `supabase/config.toml:179` has `enable_anonymous_sign_ins = false`. `enable_signup = true` at `:177` applies to the local stack only, which is fine.

**🟢 Y2 fixed: stronger hosted privilege check**
- `work/ming-todo.md:34` adds the `has_*_privilege` query with "expect all false".
- These functions also count privileges inherited through PUBLIC, so this closes the gap left by the `role_table_grants` query.
- The function signature `tudo_private.tudo_owns_location(uuid)` matches `supabase/migrations/20261107120000_rls_hardening.sql:28`.
- Expecting `false` for `authenticated` EXECUTE on `tudo_set_updated_at()` is correct: triggers fire without the caller needing EXECUTE, and test U1 proves the trigger still works.
- `:33` adds a check that `tudo_private` is not listed under Exposed schemas. This is a good addition.

**🟢 G1 fixed: `search_path` on the trigger function**
- `supabase/migrations/20261106000000_init.sql:23` now has `set search_path = ''`.
- The function body only calls `now()`. That lives in `pg_catalog`, which is always searched, so the empty path cannot break it.
- Editing this migration in place is acceptable: M-1 is unticked, so it has not been applied to the hosted project.

**🟢 G2 fixed: script robustness**
- `scripts/test-db-shared.sh:5` does `cd "$(dirname "$0")/.."`, so the script can no longer write into or reset another repo's DB when run from elsewhere.
- `:8-9`: the EXIT trap removes the temp file, and the INT/TERM trap exits with 130, which then runs the EXIT cleanup.
- Everything stays local: `db reset` and `test db` run without `--linked`.
- The container name `supabase_db_tudocuatui` matches `config.toml:5` `project_id`.

**🟢 Nothing new is unsafe**
- RLS, grants, the view's `security_invoker`, and the bucket and storage policies are unchanged since attempt 1.
- No secret values appear in README or `ming-todo.md`, only variable names.

**🟢 N1 (optional): README order differs from M-1**
- `README.md:21-22` lists "copy URL and anon key into `.env.local`" before running the migrations. It also has no pre-checks and puts the sign-up check inside step 3.
- M-1 at `work/ming-todo.md:11-21` has the safer order: pre-checks → migrations → redirect URLs → sign-up check → users → env.
- Since the README points to M-1 (`README.md:19`), M-1 is the one that counts.
- Fix if cheap: make the README steps a short pointer to M-1, or reorder them to match.

**🟢 N2 (optional): no test pins the new `search_path`**
- No pgTAP test checks the `search_path` on `tudo_set_updated_at`, while `rls_hardening.sql:42` does this for `tudo_owns_location`.
- Fix: add a one-line `proconfig` assertion in `supabase/tests/grants.sql`. It would only guard against a regression.

### Recommendations
- Treat Y1 and Y2 as closed for AC6 and AC2 (R2, R3), and G1 and G2 as closed.
- N1 and N2 are not blocking. Put them on the follow-ups list (R7) unless they can be done in the same commit.

### Risks
The accepted risks from attempt 1 still apply:
- stoktok's `service_role` key bypasses RLS on all TuDo tables and photos.
- Auth is shared with stoktok: a TuDo session is a valid stoktok session, and deleting Ming's user deletes all TuDo data.
- Redirect URLs must be exact URLs, never wildcards.

### Open questions
None new. Attempt 1's Q1 is still open: does stoktok have any user-facing login? The default assumption remains no.

### Files
- D:\mmlabs\spaceM\projects\tudocuatui\work\ming-todo.md
- D:\mmlabs\spaceM\projects\tudocuatui\README.md
- D:\mmlabs\spaceM\projects\tudocuatui\scripts\test-db-shared.sh
- D:\mmlabs\spaceM\projects\tudocuatui\supabase\migrations\20261106000000_init.sql
- D:\mmlabs\spaceM\projects\tudocuatui\supabase\tests\grants.sql
