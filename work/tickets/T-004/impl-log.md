# Impl log — T-004

## Attempt 1 — 2026-11-08

### Files touched
| File | Required because |
|---|---|
| `supabase/migrations/20261106000000_init.sql` | Rename to `tudo_*` (incl. indexes, trigger, policy names, C1); grants block (C3); header |
| `supabase/migrations/20261107120000_rls_hardening.sql` | `tudo_private.tudo_owns_location`, table renames, comments (C2) |
| `supabase/tests/rls_tables.sql`, `supabase/tests/rls_hardening.sql` | Identifier renames only; plans 37 / 33 unchanged |
| `supabase/tests/grants.sql` (new) | G1-G13, U1, N1-N6; `plan(21)` |
| `scripts/test-db-shared.sh` (new) | Local simulation of stoktok's default-privilege revoke (C7) |
| `.gitignore` | Ignore the temporary simulation migration |
| `src/data/repo.ts` | `.from("tudo_*")` in the Supabase repo only |
| `src/data/mappers.ts`, `src/data/mappers.test.ts` | Type keys (C12); test: `nullRow` cast to `ItemRow` (see below) |
| `src/types/database.ts` | Regenerated with `supabase gen types typescript --local`, formatted (C11) |
| `docs/data-model.md`, `docs/qa/smoke-test.md`, `docs/feature-list.md` (§1), `README.md` | Names, dashboard-only setup, `stop` without `--no-backup` |
| `work/ming-todo.md` | M-1 and M-5 rewritten (C10) |
| `work/decisions.md` | D17 |

### Tests added / changed
- `supabase/tests/grants.sql` (21 assertions): authenticated privilege sets, anon none, trigger function not executable, `tudo_private` usage, `updated_at` bump, naming N1-N6.
- `rls_tables.sql`, `rls_hardening.sql`: renames only.
- `src/data/mappers.test.ts`: the all-null view row now uses `as unknown as ItemRow`. The newly generated view types mark most columns non-null, but a view can return null at runtime, so the test keeps its null row. Same assertions.

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean.
- format:check: "All matched files use the correct format."
- test: 5 files, 74 tests passed.
- build: built OK (vite).
- `npx supabase db reset && npx supabase test db` (default variant): 4 files ok, Tests=101, Result: PASS.
- `bash scripts/test-db-shared.sh` (simulated stoktok): "stoktok default privileges simulated: OK", 4 files ok, Tests=101, Result: PASS. DB reset afterwards to the default variant; temp migration removed by the trap.
- AC1 greps (public.* without tudo_, private., .from without tudo_): 0 hits. `rg "db push|--no-backup|--linked|supabase link"` over README, docs/qa, ming-todo: only "never" lines.

### Out-of-plan files
None. (`mappers.test.ts` edit beyond type keys is the cast above; the plan listed the file.)

### Follow-ups (noticed, not done)
- Generated view column types are non-null for `tudo_items_with_stats`; `rowToItem` still handles nulls at runtime. Consider aligning the type with runtime in a later ticket.
- The default `npx supabase gen types --local` prints a warning that `--local` will be removed in CLI v4; README/D11 mention it.
- `supabase start` started the local stack (left running).

### Scope self-check
- Could the diff be smaller? No: the rename and the regenerated types are one atomic change.
- Diff size: see `git diff --stat` on the commit.
