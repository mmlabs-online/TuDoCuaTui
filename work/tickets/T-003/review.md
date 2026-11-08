# Review — T-003

(No review ran for attempt 1. It failed at implementation with `42P17` and was re-planned; see impl-log § Attempt 1.)

## Attempt 2 — 2026-11-08
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit`, exit 0, no errors
- format:check: `oxfmt --check`, exit 0, 32 files
- test: `Test Files 5 passed (5)`, `Tests 74 passed (74)`
- build: `✓ built in 304ms` (`dist/assets/index-*.js 227.97 kB`)
- DB suite (reviewer re-ran it on the local stack, Docker available): `npx supabase start` (`Starting database from backup...`). `npx supabase migration list --local` showed `20261107120000` already applied (`"local":"20261107120000","remote":"20261107120000"`), so I did not run `migration up`. `npx supabase test db`, exit 0:
  ```
  rls_hardening.sql .. ok
  rls_storage.sql .... ok
  rls_tables.sql ..... ok
  All tests successful.
  Files=3, Tests=80
  Result: PASS
  ```
  The output had no `TODO` line (grep count 0). I stopped with plain `npx supabase stop` (`"backup":true`). No `db reset`, no `--no-backup`, no `--linked`, and the hosted project was not touched.
- `git diff origin/main...HEAD -- src/types/database.ts`: empty. `grep -rn "todo(" supabase/tests`: no matches.

These results match impl-log § Attempt 2. No discrepancies.

### Acceptance criteria
- [x] AC1: one new migration closes GAP-1 and GAP-2 and adds only schema `private` and `private.owns_location(uuid)`. No applied migration is edited.
  - Evidence: `git diff --stat origin/main...HEAD -- supabase/migrations` shows only the added file `20261107120000_rls_hardening.sql`. `init.sql` is unchanged.
  - The file has `create schema private` + revoke/grant (lines 22-24), the function exactly as in plan step 2 (plpgsql, stable, `security invoker`, `set search_path = ''`, only schema-qualified names; lines 28-43), revoke/grant on the function (45-46), and two `alter policy … with check` statements (48-60).
  - Every column inside both checks is qualified (`locations.*`, `item_photos.*`, `i.*`).
- [x] AC2: the gap probes are real assertions, and all three suites are green. Evidence: the reviewer's DB run above (80 = 33 + 10 + 37). `rls_hardening.sql` declares `plan(33)` and has 33 assertions: 7 property checks, 2 direct calls, 7 controls, 3 GAP-1, 5 GAP-2, 6 regressions, 1 squat as B, 2 after-checks. `rls_tables.sql` and `rls_storage.sql` do not appear in the diff.
- [x] AC3: attempt 1 was rolled back locally, and the live objects match the file.
  - Rollback evidence (impl-log § Attempt 2): `private` absent (0 rows), then `migration list` with `"remote":""` for 20261107120000, then `migration up`, then listed.
  - The reviewer queried the live DB independently:
    - `locations` with-check: `… ((parent_id IS NULL) OR private.owns_location(parent_id))`, no `p.parent_id`.
    - `pg_proc`: `prosecdef f`, `provolatile s`, `proconfig {"search_path=\"\""}`, `proacl {postgres=X/postgres,authenticated=X/postgres}`. No anon, no PUBLIC.
    - `pg_namespace`: `private` ACL `{postgres=UC/postgres,authenticated=U/postgres}`.
    - The live `prosrc` md5 equals the body in the file (`body_matches = t`), so the volume runs the current file, not attempt 1.
  - Caveat: the rollback's `COMMIT` tag was suppressed by `-q`. Its effect is proven by the next two outputs (see Nits).
- [x] AC4: types are unchanged. `git diff … src/types/database.ts` is empty.
- [x] AC5: all checks are green (above).

Ming verification after merge (not verified here; the PR must carry these):
- **M-5**: `npx supabase db push`. If the hosted project has data, first run the two precheck `select`s in the migration header; both must return 0 rows. If a `private` schema already exists, the push fails as a whole: stop and file a ticket.
- Before pushing: `npx supabase migration list --linked` must not show `20261107120000` as remote. This confirms C12 (the file was edited in place).
- On the hosted dashboard, check that "Exposed schemas" does not include `private`.
- In Supabase mode, check that these still work: add a location and set another location's parent to it; add a photo to an item and change it.

### Scope
Changed files compared with the plan:
- `supabase/migrations/20261107120000_rls_hardening.sql`: planned (C10–C13).
- `supabase/tests/rls_gaps.sql` → `rls_hardening.sql`: planned (C3, plus the attempt-2 additions).
- `README.md`: planned (C7, done in attempt 1). It has 3 one-line edits.
- `work/ming-todo.md`: orchestrator edits on stops, allowed by D16. They are the plan-approval items and the M-5 precheck hint the plan asked for.
- `work/tickets/T-003/*`: ticket artefacts.

No unjustified out-of-plan change.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no app code changed.
- R2: RLS stays on, and the helper ships in the same migration as the policies. The in-place edit is approved as C12 in Revision 2 (ticket notes, 2026-11-08). It was never applied outside the local volume.
- R3: no secrets.
- R4: the photo-row check now matches the bucket's folder rule.
- R7: inside the plan.
- R8: pgTAP covers the new logic.
- R10: untouched.

Security auditor (`security-review.md`, attempt 2): no blockers, recommends PASS. Its two 🟡 items go beyond the approved plan, so they are listed under Follow-ups and are not reasons for rework:
- The plan's C6 deliberately keeps the precheck as a comment plus the M-5 step.
- The owner-repair tests are not in the planned 33.

### Nits (do not block)
- impl-log § Attempt 2: plan AC3(a) asked for rollback output "ending in `COMMIT`". `-q` suppressed the tag. Dropping `-q` would have shown it. The effect is proven anyway.
- The ticket table still says `Attempts | 1`. The orchestrator should bump it to 2.
- README line 24 / 41 still recommends `npx supabase stop --no-backup`. This is pre-existing and already a plan follow-up (4).

### Follow-ups (out of scope)
- Make the hosted-data precheck enforceable: a `DO $$ … raise exception … $$` block before the `alter policy` statements, in a later migration (auditor 🟡 1). As it stands, an old squat on the hosted project would survive without warning if M-5 skips the precheck.
- Owner-repair tests (auditor 🟡 2). Seed a bad location and photo row as postgres. As A, assert:
  - the rows are visible;
  - a rename without the fix gives 42501;
  - the fix updates 1 row;
  - delete works.
- `alter default privileges in schema private revoke execute on functions from public;` so that future helpers in `private` are not callable by `authenticated` by default.
- Prevent location self-parent and parent cycles. This is data integrity only.
- `docs/data-model.md`: document the RLS helpers, and warn that a `locations` SELECT policy calling `owns_location` would bring back `42P17`.
- The plan's existing follow-ups still apply: anon-role tests, a storage own-object UPDATE control, a README note "local stack only; never `--linked`", and the README `--no-backup` wording.
