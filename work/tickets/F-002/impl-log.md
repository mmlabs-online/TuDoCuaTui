# Implementation log — F-002

## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `package.json` | Added `db:types` script (ticket scope). No dependency changes; lockfile untouched. |
| `README.md` | Replaced "Set up Supabase" step 5 with the regenerate block; added a code-map row for `src/types/database.ts`. |
| `work/tickets/F-002/impl-log.md` | This log. |

Script: `npx --yes supabase@3.0.0 gen types typescript --local --schema public > src/types/database.ts && oxfmt src/types/database.ts`

### CLI pin
`npm view supabase@3 version` returned `3.0.0` (registry reachable), so the pin is `3.0.0`. The `--help` check
(`npx --yes supabase@3.0.0 gen types typescript --help`) was NOT run: the sandbox permission classifier denied running
a freshly downloaded package via npx. Per plan step 2, `--local --schema public` is kept as written; flag spelling is
unverified until the first real run (Ming's regeneration step, M-8).

### Tests added / changed
- None (plan: no new pure logic).

### Checks (actual output summary)
- typecheck: exit 0
- format:check: "Finished ... on 51 files", no issues
- test: 11 files, 209 tests passed
- test:coverage: 11 files, 209 tests passed, thresholds met (no failure)
- build: built OK
- Greps: no added `any`/`@ts-ignore`/`@ts-expect-error`; no `any` in `src/types/database.ts`; no `gen types` or `no-backup` in README; no `eyJ...` strings; `pnpm-lock.yaml` and `.prettierignore` unchanged.

### Regeneration deferred
Docker was unavailable in this environment, so `supabase start` / `db reset` / `gen types` were not run and
`src/types/database.ts` was left exactly as T-004 generated it (not hand-edited). Expected diff of the first real run
(M-8 in `work/ming-todo.md`): the `graphql_public` blocks disappear from `Database` and `Constants` (the script passes
`--schema public`), plus possibly small helper-type changes from the pinned CLI. Anything touching a `tudo_*`
table/column/enum means the committed types had drifted.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- CI drift job: `supabase start` + `db reset` + `pnpm db:types` + `git diff --exit-code src/types/database.ts`.
- Align `tudo_items_with_stats` Row nullability and drop the `nullRow as unknown as ItemRow` cast in `mappers.test.ts`.
- Pin the CLI version in `docs/qa/smoke-test.md` / README test commands for consistency.
- Ticket technical note "Generated view rows are all nullable" is stale.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: package.json +2/-1, README.md +13/-3, plus impl-log.
