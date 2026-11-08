# Consult — database-optimizer — T-003

Consult: T-003 RLS hardening (db). Nothing was run; this is from reading the files.

## Findings

1. **Current policies.** The init migration uses one `for all to authenticated` policy per table, with the same `using` and `with check`.
   - `locations` (`supabase/migrations/20261106000000_init.sql:129-132`): only `user_id = auth.uid()`. Nothing checks `parent_id`. This is GAP-1.
   - `item_photos` (`init.sql:144-150`): the check covers `user_id` and item ownership. Nothing checks `storage_path`, and the column is `unique` (`init.sql:75`). This is GAP-2.
   - The `items` policy (`init.sql:134-142`) already uses the pattern to copy for `locations`: `col is null or exists(select 1 ... l.user_id = (select auth.uid()))`.
2. **USING vs WITH CHECK.** Both new checks go only in `WITH CHECK`.
   - A single `for all` policy applies its `with check` to both INSERT and UPDATE new-row images.
   - `USING` filters which existing rows are visible or targetable, and it stays `user_id = uid`. Adding the checks there would make a row with a bad parent invisible to its owner and so impossible to repair.
3. **Existing rows.**
   - An existing violating `locations.parent_id` row would not be touched by the policy change. Postgres only checks `with check` on rows being written.
   - A later UPDATE of such a row would be rejected, including a harmless rename.
   - Realistically no violating rows exist. The app has one user, `src/data/repo.ts` has no `parent_id` usage (grep found only `storage_path` at lines 137-171), and paths are built as `{uid}/...`.
   - The `item_photos` check only needs to run on write. Photo-row updates in the app (e.g. `is_primary`) leave `storage_path` unchanged, and the new check holds for such rows anyway.
4. **Existing tests stay green.** All seeded and inserted photo paths in `rls_tables.sql:30-34`, `:55`, `:78` and `:85` start with their own `user_id`. The one exception is deliberate: line 78 inserts a path under A's folder on B's item, and it is denied for the item check, not the path check.
5. **Probes (`rls_gaps.sql`).**
   - GAP-1 is at lines 41-43 and GAP-2 at lines 45-47. Each has a reporting `ok(true, 'GAP-n result: ...')` plus a `todo()`-wrapped `throws_ok` expecting `42501`.
   - `plan(4)` at line 7.
   - Security review finding 6 (`security-review.md:43-47`): `pg_prove` does not fail on an unexpected "TODO passed". That means a missing fix would not turn CI red until the `todo` wrappers are removed.
6. **Types.**
   - `src/types/database.ts` mentions `parent_id` twice.
   - The migration changes policies only, not columns, tables or views. Generated types contain no policy information, so a regeneration should be a byte-identical no-op.
   - D11 (`work/decisions.md:20`) says types come from `supabase gen types typescript --local`.
   - The ticket line "Regenerate types (F-002 script)" (`ticket.md:30`) cannot be done if F-002 is unmerged. Since F-002 is a dependency of nothing in T-003 (`Depends on` is F-006 only, `ticket.md:12`), drop the line.
7. **Security review notes (finding 9, `security-review.md:58-64`).**
   - The existence oracle is an FK error (23503) vs 42501 vs success, or 23505 on `storage_path`. It is low risk because ids are random UUIDs.
   - After the fix, `locations.parent_id` pointing at a foreign id gives 42501 either way. The `exists()` subquery is RLS-filtered for the caller, so the oracle on that column closes.
   - The path-prefix check closes the 23505 oracle for foreign folders, since a foreign path now gives 42501 before the unique check.
   - `on delete set null` writing across users cannot occur once nobody can set a foreign `parent_id`. It is the same for `items.location_id`, which is already guarded by `init.sql:139-141`. Nothing in the FK needs changing.

## Recommendations

**Policy SQL.** Use drop and recreate: `ALTER POLICY` can change the check expression, but the drop and recreate pair makes down-migration and review easier to read. Postgres allows `drop policy` and `create policy` in one transaction with no gap. Keep the names the same.

```sql
begin;

drop policy "locations: owner full access" on public.locations;
create policy "locations: owner full access" on public.locations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (parent_id is null or exists (
      select 1 from public.locations p
      where p.id = parent_id and p.user_id = (select auth.uid())))
  );

drop policy "item_photos: owner full access" on public.item_photos;
create policy "item_photos: owner full access" on public.item_photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and storage_path like (select auth.uid())::text || '/%'
    and exists (select 1 from public.items i
                where i.id = item_id and i.user_id = (select auth.uid()))
  );

commit;
```

The two policies should be named in a header comment as replacing `init.sql:129-132` and `:144-150`. The `like` on a uuid literal contains only hex and hyphens, so there are no wildcard characters in the prefix.

I recommend a tighter variant: use `(storage.foldername(storage_path))[1] = (select auth.uid())::text`, or `split_part(storage_path,'/',1) = uid::text`, to match the storage policies' semantics (`init.sql:170`) exactly. Reason: this avoids `like` semantics and cannot be confused by wildcard characters. The full path convention `{uid}/{item_id}/{uuid}.jpg` (R4) could also be enforced (`like uid||'/'||item_id||'/%'`), but this is optional. It is stricter than the ticket scope, so I would leave it out.

**Reversible down.** Put the old policy text in a comment block at the bottom of the file, or in `docs/`, since Supabase migrations have no down step. It would contain the original policies from `init.sql:129-132` and `:144-150`. Do not edit `init.sql` (R2).

**Existing data.**
- Add no data-fix statements. They would exceed "minimal" (ticket scope: no other schema change).
- If wanted for safety, add a read-only precheck as a comment for Ming to run before `db push`:
  - `select id from locations c join locations p on p.id=c.parent_id where p.user_id<>c.user_id;`
  - `select id from item_photos where storage_path not like user_id||'/%';`
- Both are expected to return zero rows.
- Do not add a `NOT VALID` constraint or a trigger.

**Tests.**
- In `rls_gaps.sql`, remove both `todo()` lines (42, 46).
- Keep the `throws_ok` lines. Drop the `probe` function, the `ok(true,'GAP-n result')` lines and the `rls_test` schema.
- Update the header comment (lines 1-3), and `plan(4)` becomes `plan(2)` as written. Better still, rename or merge into `rls_tables.sql`. If they stay in a separate file, rename it from "gaps" to something like `rls_hardening.sql`.
- Add positive controls so a denial cannot come from a missing grant (`security-review.md:21-31`):
  - A updates its own location to set `parent_id` to its own other location (`lives_ok`).
  - A inserts a photo with its own path (already covered at `rls_tables.sql:55`).
- Add regression tests for the update paths (`security-review.md` finding 4, `:32-37`).
  - These guard the policy rewrite directly and should be in scope. They are cheap `throws_ok 42501` cases:
    - `update public.item_photos set storage_path = 'bbbb.../x.jpg' where id = <A photo>`
    - `update public.locations set user_id = <B> where id = <A loc>`
    - `update public.item_photos set item_id = <B item>`
    - `update public.wear_logs set item_id = <B item>`
    - `update public.items set user_id = <B>`
  - Note the own-row `update` of a photo needs a `lives_ok` control (finding 3).
- Edge test for the squatting scenario: A inserts a path in B's folder (`throws_ok`), then B inserts its own photo with that path (`lives_ok`).
- The ticket's acceptance criterion 1 should state that "passes" means no TODO wrappers remain and the file has `plan(n)` matching, so a missing fix fails rather than reports.

**Types.** Drop "Regenerate types" from the scope (policy-only change). Optionally leave a note: "types unchanged by design". If the F-002 script is available at implementation time, run it to prove the diff is empty. Do not hand-edit `database.ts`.

**Out of scope, with reasons.**
- The `on delete set null` and oracle notes: recorded above as resolved by the two checks. State this in the plan as a consequence; no extra SQL.
- Anon-role tests (finding 5): separate `debt` issue.
- `A/../B` path assertion (finding 10): only relevant to the path check. One assertion is cheap and can go in: a path `bbbb.../x` with prefix `aaaa/../` still starts with A's folder and is allowed, which is harmless because object keys are literal. I would skip it; mention it in a comment.
- Self-referential parent loops or depth limits: out of scope.

**Process.**
- Tier is High; plan approval gate stays.
- Filename: `supabase/migrations/20261107HHMMSS_rls_hardening.sql`, with a timestamp later than `20261106000000`.
- Applying the migration is Ming's step (R2). Leave an `M-n` item in `work/ming-todo.md`, or confirm one exists.

## Risks

- A bad migration exposes data or locks users out. Mitigation: run it only through the local stack and the pgTAP suite first. Drop and create in one transaction means no window with no policy.
- `locations` with-check does a lookup on every write. It is a PK lookup, which is cheap. The `exists` subquery on the same table is evaluated under RLS, so it is filtered by `user_id = uid`. No recursion problem arises because the subquery reads `locations` through its own `using` clause, which has no subquery. No infinite recursion.
- A realistic future conflict: `locations unique (user_id, name)` is unaffected.
- Old photo rows with non-`{uid}/` paths would become un-updatable (see Findings 3). Low probability.
- Dropping the `todo` wrappers could hide a regression only if someone leaves `plan(n)` wrong. The `finish()` call plus plan count catches it.

## Open questions

1. Use `like uid || '/%'` (ticket text) or `foldername(storage_path)[1] = uid::text` (matches storage policies)? Default: the `foldername` form, since it mirrors `init.sql:170`.
2. Should the update-path regression tests and positive controls (security-review findings 3 and 4) fold into T-003, or stay as separate debt? Default: fold in. They cost a few lines and protect this exact rewrite.
3. Run the optional precheck queries on the real project before `db push`? Default: put them in the migration header and `ming-todo.md`; no automatic data repair.
4. Drop "Regenerate types" from the ticket scope? Default: yes, with a note that the diff of `src/types/database.ts` is expected to be empty.

Files referenced:
- D:/mmlabs/spaceM/projects/tudocuatui/work/tickets/T-003/ticket.md
- D:/mmlabs/spaceM/projects/tudocuatui/supabase/migrations/20261106000000_init.sql
- D:/mmlabs/spaceM/projects/tudocuatui/supabase/tests/rls_gaps.sql
- D:/mmlabs/spaceM/projects/tudocuatui/supabase/tests/rls_tables.sql
- D:/mmlabs/spaceM/projects/tudocuatui/work/tickets/F-006/security-review.md
- D:/mmlabs/spaceM/projects/tudocuatui/work/decisions.md
