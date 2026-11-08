# Security review — T-003

## Attempt 2 — security-ai-generated-code-auditor — 2026-11-08

(No security review ran for attempt 1: it failed at implementation, before review.)

## T-003 security review, attempt 2: no blockers. Recommend PASS (fold in the 🟡 items if a rework happens anyway).

Files: `D:/mmlabs/spaceM/projects/tudocuatui/supabase/migrations/20261107120000_rls_hardening.sql`, `D:/mmlabs/spaceM/projects/tudocuatui/supabase/tests/rls_hardening.sql`. I also checked them against `supabase/migrations/20261106000000_init.sql`, `supabase/config.toml`, `src/data/repo.ts` and impl-log attempt 2. I did not run anything.

### Findings

**Helper `private.owns_location(uuid)` (migration:22-46)**
- 🟢 The design is correct.
  - **No recursion:** it is plpgsql, so it is never inlined. Postgres checks for policy recursion when it rewrites a query, so it never looks inside function bodies. At runtime the function's SELECT on `public.locations` only applies the policy's USING clause (`user_id = auth.uid()`), which does not call the function again.
  - **Not a bypass:** it is SECURITY INVOKER, so it gets no extra privileges. The caller's RLS and the explicit `l.user_id = auth.uid()` both filter, so it can only ever confirm the caller's own rows.
  - **search_path:** set to `''`, and every name is schema-qualified (`public.locations`, `auth.uid()`). The `uuid =` operator comes from `pg_catalog`, which Postgres always searches.
- 🟢 Grants are right. The live ACL in impl-log:122 is `{postgres=X, authenticated=X}`: no PUBLIC, no anon. `service_role` needs nothing because it bypasses RLS. Schema `private` is not in `[api].schemas` (`config.toml:13`), so PostgREST does not serve it as RPC. Even if it were exposed, it reveals nothing beyond the caller's own rows, so there is no oracle.
- 🟢 Future-proofing: Postgres gives EXECUTE to PUBLIC on any new function by default. Any later function added to `private` would be callable by `authenticated`, because they now have USAGE on the schema. Optional follow-up: `alter default privileges in schema private revoke execute on functions from public;`.
- 🟢 Hosted check (Ming's step): confirm the dashboard's "Exposed schemas" setting does not include `private`. The hosted setting is separate from `config.toml`.
- 🟢 `create schema private;` (line 22) has no `if not exists`. If the hosted project already has a `private` schema, the migration fails as a whole, in one transaction (fail-closed). That is acceptable; just know why it would fail.

**GAP-1: `locations` WITH CHECK (migration:48-52)**
- 🟢 Closed for both INSERT and UPDATE. The policy is `for all`, so WITH CHECK applies to the new row on both.
  - Another user's parent: the helper returns false, so the write fails with 42501.
  - A parent id that does not exist: also 42501. RLS WITH CHECK runs before the foreign-key trigger, so no 23503 error leaks that the id is unused (test:68).
  - Columns are qualified (`locations.parent_id`), and the live expression no longer shows the `p.parent_id` capture bug from attempt 1.
- 🟢 Not security: a location can still be made its own parent through UPDATE (`set parent_id = id`), and cycles are possible. On INSERT the new row is not visible to the STABLE function, so a self-parent is rejected there. This is data integrity only; follow-up if the UI walks the tree.
- 🟢 The app path stays compatible: `repo.ts:127` inserts `{ name }` with no parent, which takes the `parent_id is null` branch.

**GAP-2: `item_photos` WITH CHECK (migration:54-60)**
- 🟢 Closed for INSERT and UPDATE.
  - The check is the same `storage.foldername(...)[1] = auth.uid()::text` expression the bucket policies use (init:170-182).
  - A bare `x.jpg` gives `[1] = NULL`, which fails the check. A leading `/` gives an empty first segment, which also fails.
  - The INSERT WITH CHECK runs before the unique-index check, including on the ON CONFLICT path. So B's existing path returns 42501, not 23505 (test:74), and there is no existence oracle.
- 🟢 The app path stays compatible: `repo.ts:148` and `:166` build the path as `${user}/${itemId}/…` from the session user id, which is the lowercase canonical form. Uppercase-UUID paths would now be rejected; nothing writes them.
- 🟢 The second path segment is not tied to `item_id`, so A could store `A/<B-item-id>/x.jpg`. It stays inside A's folder, so there is no cross-user effect. The R4 path shape is still only a convention.
- 🟢 `A/../B/x.jpg` passes the folder check. That is harmless: it is a different unique string, and storage keys are literal, so a signed URL or storage RLS would look up a different object. The comment at test:3 is accurate.

**USING unchanged, owner repair (migration:6-7)**
- 🟢 The claim holds: a bad row stays visible and deletable by its owner, and an UPDATE that also fixes `parent_id` or `storage_path` passes. Caveat: every other UPDATE on such a row fails until it is fixed, because WITH CHECK applies to the whole new row. That is fine, but the header could say so.
- 🟡 The repair claim has no test (test file, no assertion). Suggested: seed as postgres one A location with `parent_id = b1` and one A photo under `B/`. Then as A assert:
  - the rows are visible;
  - renaming without fixing throws 42501;
  - `set parent_id = null` / `set storage_path = 'A/...'` affects 1 row;
  - delete works.

  This also shows that a squat left over from before the migration can be removed by its owner. Ties to AC1 and the header claim.

**Migration safety on the hosted DB (migration:16-20)**
- 🟡 The precheck only exists as a comment. `ALTER POLICY` does not check existing rows, so a squatted path from before the migration would survive silently and keep blocking B's upload. Low real risk with one user, but it depends on a human remembering to run it. Recommendation: replace the comment with an in-migration `do $$ begin if exists (<precheck 1>) or exists (<precheck 2>) then raise exception 'T-003 precheck failed'; end if; end $$;`, placed before the `alter policy`. It is read-only, transactional and fails closed, and it works for both `db push` and the SQL-editor paste (README:22-24). If the team prefers to leave it as is, M-5 must list both selects explicitly. Ties to AC2.
- 🟢 Both precheck queries are correct. The `is distinct from` in precheck 2 also catches paths with no folder.
- 🟢 The rollback order (policies first, then function, then schema) is correct.

**Editing an unmerged migration in place vs R2**
- 🟢 Acceptable. The file was only ever applied to the local DB, and attempt 2 rolled that back (the history row was deleted and `private` was absent before the re-apply, impl-log:104-106). It was never applied to the hosted project, and the branch is unmerged. Before Ming's `db push`, confirm `npx supabase migration list --linked` does not show `20261107120000` as remote. C12 still needs Ming's confirmation.

**Do the tests prove anything?**
- 🟢 Yes: the GAP assertions would fail without the fix.
  - Without the fix, test:66/67 and test:71-75 would succeed.
  - test:68 would raise 23503, and test:74 would raise 23505.
  - The positive controls (test:57-63) show that a 42501 comes from the policy, not from a missing grant.
  - The helper property checks (test:39-45) match the live `pg_proc` output.
  - The `after:` checks (test:95-96) confirm that no denied write got through.
- 🟢 `function_privs_are(... 'anon', [])` also covers PUBLIC, because privileges granted to PUBLIC count for anon.
- 🟢 The impl-log has no record of a run against the pre-fix schema. That is fine: the reasoning above covers it, and F-006 already confirmed the gaps.

### Recommendations
1. 🟡 Turn the header precheck into a `DO` block that raises an exception (AC2, R2 migration safety).
2. 🟡 Add the 4–5 owner-repair assertions (AC1, header claim). Bump `plan(33)`.
3. 🟢 Follow-ups for the debt list: default-privileges revoke on `private`; check "Exposed schemas" on the hosted project; prevent location parent cycles.

### Risks
- Applying the migration with bad rows already present leaves an old squat in place (covered by recommendation 1).
- Any future SELECT policy on `locations` that calls `owns_location` would bring back 42P17 recursion. The data-model note follow-up should say so.

### Open questions
- Is the `private` schema already present on the hosted project? If so, line 22 fails; switch to `if not exists` and keep the revoke/grant.
- Does Ming confirm C12 (editing the migration in place) after checking `migration list --linked`?
