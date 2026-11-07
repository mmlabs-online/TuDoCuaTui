# Security review — F-006

## Attempt 1 — security-ai-generated-code-auditor — 2026-11-07

**Verdict:** no blockers. The tests do prove cross-user isolation for the cases the ticket lists. Two gaps should be closed: some denials have no positive control, and update-based re-parenting is not tested. Nothing secret is in README or impl-log.

The run results come from impl-log; I did not run the tests myself (read-only).

### Findings

**1. JWT and role simulation is correct — 🟢**
- Files: `supabase/tests/rls_tables.sql:42-44`, `rls_storage.sql:30-32`, `rls_gaps.sql:37-39`.
- Both `request.jwt.claims` (the JSON form) and the legacy `request.jwt.claim.sub` are set, transaction-local, followed by `set local role authenticated`. `auth.uid()` resolves on either CLI version.

**2. The denial tests are not vacuous — 🟢**
- Every "A cannot …" test targets a specific B row that was seeded as postgres.
- That row is proven to still exist and be unchanged afterwards as postgres (`rls_tables.sql:96-100`, `rls_storage.sql:45-46`). A silent RLS bypass would therefore fail.
- `throws_ok` pins SQLSTATE `42501`, so an FK, unique or check error cannot pass in its place.
- The `items_with_stats` seed is a good design: B-owned rows c3/c4 hang off A's item (`rls_tables.sql:33-39`). Lines 91-92 prove that `security_invoker` filters the joined rows, not just the base rows.

**3. Some denials have no positive control, so a missing GRANT could pass them — 🟡**
- `42501` is also the error for "permission denied for table". These tests would still pass if the `authenticated` role lost its table privilege, even with no working RLS:
  - `rls_tables.sql:80` — move own item to B's location.
  - `rls_storage.sql:41` — rename own object into `B/`.
- Inserts are covered by `lives_ok` controls (`rls_tables.sql:53-56`, `rls_storage.sql:37`), but nothing shows that A can UPDATE its own rows.
- The `affected()`-based update/delete denials in `rls_tables.sql:65-74` also have no control showing `affected()` returns 1 on A's own row. Storage has one for delete (`rls_storage.sql:43`), tables have none.
- **Fix:** add, for example:
  - `is(rls_test.affected($$update public.items set name='A2' where id='…a2'$$), 1, 'control: A updates own item')`
  - one own-row delete control in tables, using `a6` children or `a5`
  - one own-object update control in storage, e.g. `set metadata` on `A/…/a.jpg` → 1

**4. Re-parenting by UPDATE is not tested — 🟡**
- The ticket only requires the insert cases, which are covered at `rls_tables.sql:77-79`. The same attack via UPDATE is not:
  - `update wear_logs set item_id = '<B item>' where id = '…a4'`
  - `update item_photos set item_id = '<B item>' where id = '…a3'`
  - `update items|locations|wear_logs|item_photos set user_id = '<B>' where id = <A row>` (handing a row over to B)
- The current WITH CHECK clauses block all of these. They are cheap regression guards for when T-003 rewrites the policies. Expect 42501.

**5. anon role is not tested — 🟡** (impl-log:69 already lists it as a follow-up; acceptable as a `debt` issue rather than rework)
- Every policy is `to authenticated`. Nothing would catch a later policy written `to public` or without a role, which would expose rows or objects to the anon key — the only key in the browser (R3).
- **Fix:** one block with `set local role anon` and empty claims: count 0 on the four tables, the view and `storage.objects` in `wardrobe`, plus one `throws_ok` on insert.

**6. Gap probes are sound — 🟢**
- `rls_test.probe` (`rls_gaps.sql:12-23`) undoes its effect with a sentinel exception in a subtransaction, so the reported result is not polluted by earlier statements.
- The `todo` `throws_ok` lines (43, 47) really do perform the write when the gap exists (GAP-1 updates `a1.parent_id`; GAP-2 inserts a row). This is harmless because the outer `rollback` undoes it.
- The `ok(true, 'GAP-n result: …')` lines always pass. They only report; the real signal is the `todo` line. That is fine, but readers should know.
- Note: `pg_prove` does not fail on an unexpected "TODO passed". When T-003 lands, the fixed gap will not turn the run red on its own; someone has to read the output. This belongs in T-003's acceptance criteria.

**7. No data or state leaks outside the transaction — 🟢**
- Each file is `begin … rollback`. Everything is created inside that transaction and rolled back: the `rls_test` schema, the `pgtap` extension, `auth.users` rows, `storage.objects` rows, and `set_config(..., true)` including `storage.allow_delete_query`.
- No sequences are used (all ids are UUIDs).
- impl-log:35 confirms that A and B are absent from `auth.users` after the run.

**8. README does not say "local only" — 🟢**
- `supabase test db` also accepts `--linked` / `--db-url`. Running it against the real project would insert fixed-UUID users into production `auth.users`. They would be rolled back, but it is still a write to production auth.
- **Fix:** add one line to README §"Running DB tests" (`README.md:32-51`): "local stack only; never `--linked`".

**9. Cross-user existence oracles exist but are low risk — 🟢 (input for T-003)**
- A can learn whether a given id or path exists for another user by comparing error codes:
  - An FK error (23503) versus 42501 or success on `items.location_id` / `locations.parent_id`.
  - A unique-violation error (23505) on `item_photos.storage_path`.
- The risk is low because the ids are random UUIDs.
- Related to GAP-1: `locations.parent_id ... on delete set null` means that when B deletes a location, A's row gets written via the FK cascade, which bypasses RLS.
- Related to GAP-2: storage RLS still blocks the read, so the impact is data integrity and path squatting, not disclosure (impl-log:54 already notes this).

**10. Storage tests check database policies only — 🟢**
- They exercise the `storage.objects` policies at the SQL level, not the Storage HTTP API or signed-URL creation. That is acceptable for this ticket.
- A key like `A/../B/x.jpg` passes the `foldername()[1]` check. Object keys are literal, not resolved paths, so this is not exploitable through the database, but it is worth one assertion in T-003 if path normalisation is added.

**11. Secrets: none found — 🟢**
- `README.md`: the hits are only the words "anon key" (designed to be public) and "no … password needed". No values.
- `impl-log.md`: no keys, tokens or JWTs.
- impl-log:65 mentions a stray `D:\tmp_out.txt` outside the repo that Ming has to delete. It is not in git, and its content is unknown (probably command output). Ming should delete it.

### Recommendations
1. 🟡 Add the UPDATE and DELETE positive controls from finding 3. This affects acceptance criterion 1 being meaningful: "passes" should mean "denied by RLS", not "denied by a missing grant".
2. 🟡 Add the update-based re-parenting and ownership-handover denials from finding 4, which serve the ticket goal "never … change another user's data".
3. 🟡 Open a `debt` issue (`project:tudocuatui`) for the anon-role tests (finding 5), unless the orchestrator prefers to fold them into the rework.
4. 🟢 Add the "local stack only" line to README (finding 8).
5. 🟢 Add to T-003: say that a "TODO passed" line does not fail CI, and list the existence oracles and `on delete set null` (findings 6 and 9).

### Risks
- Without findings 3 and 4, a T-003 policy rewrite could regress UPDATE-path isolation while this suite stays green.

### Open questions
- Should the anon-role coverage go into F-006 rework or into a `debt` follow-up? My default: debt follow-up, because the ticket scope names only users A and B.
