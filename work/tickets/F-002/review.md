## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit`) exit 0.
- format:check: exit 0, "All matched files use the correct format. Finished … on 51 files".
- test: exit 0, 11 files, 209 tests passed.
- test:coverage: exit 0, 11 files, 209 tests passed, thresholds met.
- build: exit 0, `✓ built` (dist/assets/index-*.js 227.94 kB).
- These match the impl-log claims.

### Acceptance criteria
- [x] 1. `db:types` script: local only, pinned, formats its output. Evidence: `package.json:15` is
  `npx --yes supabase@3.0.0 gen types typescript --local --schema public > src/types/database.ts && oxfmt src/types/database.ts`.
  The pin is exact. There is no `--linked`, `--project-id`, `--db-url` or `--remote`. `grep '"supabase"' package.json`
  finds nothing, so no dependency was added. The diff of `pnpm-lock.yaml` against origin/main is empty. The `--help` check
  could not run because the permission system blocked it. Per plan step 2 the flags were kept and this is recorded in
  `impl-log.md`. `gen types typescript --local` and `--schema` are the same flags T-004 used for the committed file
  (T-004 impl-log, `--local` deprecation warning).
- [x] 2. `tsc --noEmit` passes with the generated types. Evidence: typecheck exit 0. The diff of
  `src/types/database.ts` against origin/main is empty, so the file is still T-004's generator output and was not
  hand-edited.
- [x] 3. No `any` was introduced. Evidence: grepping the added lines in `src` and `package.json` for `any`, `@ts-ignore`
  and `@ts-expect-error` finds nothing. `grep -nw any src/types/database.ts` also finds nothing.
- [x] 4. The generated file stays under format:check. Evidence: format:check exit 0. The script runs `oxfmt` on its
  output. The diff of `.prettierignore` is empty.
- [x] 5. `pnpm db:types` is documented in the README. Evidence: `README.md:30-42` covers these points:
  - Docker is needed (line 30).
  - The steps run in order: `npx supabase start` → `npx supabase db reset` → `pnpm db:types` → `npx supabase stop` (lines 31-36).
  - The output is local and `public` only, and comes from `supabase/migrations/` (D11).
  - The "Never point it at the shared project (`--linked`, `--project-id`)" line (lines 38-39).
  - Run `db reset` first and not during `test-db-shared.sh`.
  - The `3.0.0` pin and the v4 deprecation (line 42).
  - The PowerShell UTF-16 warning (line 30).

  `README.md:113` adds the code-map row. `grep -n 'gen types' README.md` and `grep -n 'no-backup' README.md` both find
  nothing.
- [x] 6. Nothing else regresses. Evidence: test, test:coverage and build all exit 0 (see above).
- [x] 7. No secrets or local-stack state. Evidence: `git diff origin/main...HEAD | grep -E 'eyJ[A-Za-z0-9_-]{10,}'`
  finds nothing. Files changed: `README.md`, `package.json`, `work/ming-todo.md` and `work/tickets/F-002/*`. No
  `supabase/.temp`, `supabase/snippets` or `.env*` files were added.
- [x] 8. The deferred regeneration is recorded. Evidence: `impl-log.md` has a "Regeneration deferred" section. It says
  Docker was unavailable, the file was left as T-004 generated it, and gives the expected `graphql_public` diff with a
  pointer to M-8.

### Ming verification after merge (carry into the PR)
- M-8 in `work/ming-todo.md`: regenerate once with `npx supabase start` → `db reset` → `pnpm db:types` → `stop`, then run
  the checks. The expected diff is that `graphql_public` disappears from `Database`/`Constants`, possibly with
  helper-type changes from the pinned CLI. This is also the first real run of the script, so the `--local` and
  `--schema` spelling for CLI 3.0.0 is confirmed there.

### Scope
- `package.json` and `README.md` are in the plan's file table.
- `work/ming-todo.md` (M-8) was added by the orchestrator, as the plan instructs. It is numbered M-8 because T-005.1
  already uses M-7, and the entry says so.
- `ticket.md`, `plan.md`, `impl-log.md` and the consult files are workflow files.
- No unjustified changes.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found:
- R1: no runtime code changed.
- R2: no migration touched, and the types file was not hand-edited.
- R3: no keys, and the CLI uses `--local` only.
- R7: the diff stays inside the plan.
- R8: checks are green and there is no new pure logic.
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.
- R4, R5, R6 and R9 do not apply.

### Nits (do not block)
- If generation fails partway, the `>` redirect leaves `src/types/database.ts` truncated. The plan accepts this, and
  `git checkout -- src/types/database.ts` recovers the file.
- `docs/feature-list.md` F-002 still says `--linked`. D11 and D17 supersede it, and the plan flags this as a known
  conflict.

### Follow-ups (out of scope)
- CI drift job: `supabase start` + `db reset` + `pnpm db:types` + `git diff --exit-code src/types/database.ts`.
- Align the `tudo_items_with_stats` Row nullability with runtime nulls, then drop the `nullRow as unknown as ItemRow`
  cast in `mappers.test.ts`.
- Pin the CLI version in the `docs/qa/smoke-test.md` and README test commands.
- The ticket's technical note "Generated view rows are all nullable" is stale.
