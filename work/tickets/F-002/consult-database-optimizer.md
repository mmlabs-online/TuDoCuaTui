# Consult — database-optimizer — F-002 (2026-11-09, after T-004)

## Findings

I only read files. I did not run `supabase gen types` or `supabase start`.

1. **`supabase gen types --local` still fits.**
   - The local stack only has TuDo's migrations, which suits us. It means the output has no stoktok tables, so we never have to filter anything out. T-004's consult (`work/tickets/T-004/consult-database-optimizer.md`, line 107) already made this point, and it is the reason D11's `--local` is right for the shared project. Do not move to `--linked` or `--project-id`: that would pull in stoktok's tables.
   - Generation introspects the running local DB, not the migration files. A stack that was started before the latest migration edit gives stale types. T-004 edited migrations in place (D17) and left the stack running. So the documented sequence needs `npx supabase db reset` (or a fresh `start`) before `pnpm db:types`. The current README step 5 already says "after `npx supabase db reset`". The existing plan, written before T-004, omits that.
   - T-004's impl-log (line 40) says `--local` prints a deprecation warning ("will be removed in CLI v4"). The plan's step 2 (check `--help`, drop `--local` if missing) already covers this. Keep `--local` for now because D11 names it.

2. **Which schemas to pass.**
   - `supabase/config.toml` sets `[api] schemas = ["public","graphql_public"]`. Without `--schema`, the CLI generates for those. That is why the committed file has an empty `graphql_public` block and a `graphql` function type.
   - `tudo_private` is not in `api.schemas`, so it is excluded by default. It holds only `tudo_owns_location(uuid)`, which is a security-definer helper, not API surface.
   - Pass `--schema public` explicitly. That gives:
     - `public` only, so `tudo_private` cannot leak in even if someone later adds it to the config;
     - no `graphql_public` noise;
     - output that does not depend on `config.toml`.
   - It also changes the committed file. `graphql_public` disappears from `Database` and from `Constants`. Nothing in `src/` references either one. I grepped the whole of `src`: only `public.Enums`, `public.Views.tudo_items_with_stats.Row` and `public.Tables.tudo_items.Insert` are used.
   - So the first `pnpm db:types` run will diff against T-004's file by roughly 20 lines. That is expected. The plan must not treat it as drift, and the reviewer should be told.
   - Do not add `--schema tudo_private`. Types for a private schema are unneeded and would invite client code to depend on it.

3. **The current `src/types/database.ts` is already generator output, not hand-written.**
   - T-004 regenerated it. Its review (`work/tickets/T-004/review.md`, line 19) confirms it is byte-identical to `gen types --local` plus oxfmt, with only `tudo_*` keys.
   - It contains the `tudo_items`, `tudo_item_photos`, `tudo_wear_logs` and `tudo_locations` tables, the `tudo_items_with_stats` view, and the enums `tudo_item_category`, `tudo_item_status` and `tudo_season`.
   - F-002's remaining value is therefore the script, the README, the formatting guarantee and the drift workflow. The "replace the hand-written file" part is done. AC 1 of the plan ("generated, not hand-written") is already true. "Fix type errors in `src/data/**`" is likely a no-op.

4. **The plan's and ticket's claim "generated view rows are all nullable" is stale.** The committed view Row has non-null columns (`name: string`, `category` and `status` as enums). Only these are nullable:
   - `last_worn`;
   - `location_id`;
   - `location_name`;
   - `primary_photo_path`;
   - `wear_count`.

   `src/data/mappers.test.ts` works around this with `nullRow as unknown as ItemRow`. That cast is a T-004 follow-up, not F-002 scope, and it is not an `any`. The plan's AC 4 grep only checks added lines, so it stays fine as long as the cast is left alone.

5. **How `src/data/**` uses the types.**
   - `src/lib/supabase.ts` and `src/data/repo.ts` (`type Client = SupabaseClient<Database>`) use `Database` generically.
   - `repo.ts` calls `.from("tudo_*")` with literal names. A rename or drop in a migration therefore fails `tsc` at the call site, which is the drift detection the ticket wants.
   - `mappers.ts` uses `Enums`, the view Row and the `tudo_items` Insert. The tests import the same view Row.
   - No other consumer exists. `Constants` is unused.

6. **Pinning.** The plan pins `npx --yes supabase@3.0.0`. The README and smoke-test use unpinned `npx supabase`, and T-004 generated with whatever was installed. Generator output differs across CLI versions. So the first pinned run may differ from the committed file even apart from item 2. The `Constants` and helper-type blocks are the likeliest to change.

## Recommendations

1. **Script.** Use `"db:types": "npx --yes supabase@3.0.0 gen types typescript --local --schema public > src/types/database.ts && oxfmt src/types/database.ts"`.
   - Keep `--local` only if `--help` lists it, as the plan already says.
   - Never use `--linked` or `--project-id`, because stoktok's tables would appear (D11, D17).
   - Formatting inside the script keeps `format:check` meaningful (the ticket allows either approach).

2. **Update the plan's Approach step 4 and the README.** The sequence is `npx supabase start`, then `npx supabase db reset` (so the DB matches `supabase/migrations/**`), then `pnpm db:types`, then `npx supabase stop`.
   - On `stop`: the plan says `--no-backup`, but T-004 and the README deliberately dropped `--no-backup` (D17 / T-004 impl-log). The README also forbids `--no-backup` mentions except in "never" lines. Use plain `npx supabase stop` and fix the plan's AC 7 accordingly. The plan's AC 7 and its README text conflict with T-004's README on this point.
   - Add one README line that `db:types` must never be pointed at the shared project.

3. **Fix the stale statements.** Plan step 6 and the ticket technical note say view rows are "all nullable". Replace with: the view Row is mostly non-null, `rowToItem` still handles nulls at runtime, and the `nullRow` cast in `mappers.test.ts` stays.

4. **Handle the missing Docker.** Do not make Docker a precondition for the ticket's acceptance criteria.
   - Agents in this sandbox cannot run `supabase start`. `supabase db reset` and the `gen types` introspection also need a running DB. The T-004 implementer ran them locally.
   - Make the agent deliverables: add the script, update the README, and keep or normalise the checked-in `src/types/database.ts` so `typecheck`, `format:check`, `test` and `build` pass.
   - Do not hand-edit `src/types/database.ts` to look "regenerated". If the implementer cannot run the generator, it should leave the file as T-004 generated it, since it is already generator output and nothing in migrations has changed since.
   - Record the `graphql_public` and pin-version diff as a Ming step, or as an `M-n` item in `work/ming-todo.md` if that is the convention. The step is: run the start, reset and `pnpm db:types` sequence once, then commit the diff.
   - Mark this clearly in the ticket and impl-log. Reviewer's AC 1 and AC 2 can be verified by inspecting `package.json` and the README. "Regenerated output is clean" becomes "verified by Ming" or "verified by CI if added".
   - If Ming wants the file regenerated in the PR, the ticket should wait on that M-n item, or ship the script now and treat the one-time regeneration as a follow-up commit.

5. **Optional follow-up (not in this diff, per R7).** Add a CI job that runs `supabase start`, `db reset`, `db:types` and `git diff --exit-code src/types/database.ts`. GitHub-hosted runners have Docker. This is the only way to catch drift without Ming.

## Risks

- **Stale local DB gives stale types.** `db:types` introspects the running DB. If the stack was started before the migrations were edited in place (D17), the output is silently out of date. Mitigated by recommendation 2.
- **Fragile shared state.** The local stack uses `project_id = "tudocuatui"` on ports 553xx. A simulated-stoktok run (`scripts/test-db-shared.sh`) injects a temporary migration, then resets. Do not run `db:types` while that script is mid-run.
- **Expected diff against the committed file.** `graphql_public` disappears with `--schema public`, plus any pin-version differences (findings 2 and 6). If a reviewer reads this as a regression, REWORK churn follows. Flag it in the impl-log.
- **Misleading ticket text.** D11 and the ticket still describe a hand-written file and the feature list says `--linked`. Against the feature list's `--linked`, D11 wins (recorded in `work/decisions.md`). Do not touch `docs/feature-list.md`.
- **`--local` deprecation.** It is slated for removal in CLI v4. The pin to 3.0.0 protects until the pin is bumped. Note this in the README.
- **Windows or shell issues.** PowerShell `>` writes UTF-16, so keep Git Bash as the documented shell. Keep the plan's encoding checks (AC 6). The pnpm script shell is `cmd` on Windows, where `npx --yes ... > file` works.
- **Generator vs formatter.** The generator may emit code oxfmt reformats. T-004 shows the committed file is already formatted and byte-identical to generator plus oxfmt, so this is low risk.

## Open questions

1. Should F-002 block on a Ming M-n step (regenerate once with Docker), or ship the script and README and leave the existing generated file unchanged? I recommend the latter, with the one-time regeneration as a follow-up.
2. `npx --yes supabase@3.0.0` versus a devDependency. The plan (orchestrator preference) chose `npx`, to avoid adding a postinstall allowance. I agree. Confirm no earlier consult overrides it.
3. Should `supabase stop` keep its backup (no `--no-backup`) per T-004 and the README? I recommend yes. The plan says otherwise, so the plan needs a fix.
4. Should the `nullRow` cast and non-null view typing be aligned with runtime nulls in this ticket? I recommend no (R7): it is a T-004 follow-up and would need a migration or a mapper-level decision.
