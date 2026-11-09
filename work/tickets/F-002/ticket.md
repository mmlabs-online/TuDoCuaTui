# F-002: Generate DB types from the local schema

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db |
| Gate | none |
| Depends on | F-001 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/16 |

## Goal
DB types come from the real schema instead of a hand-written file, so schema drift shows up at compile time.

## Feature reference
`docs/feature-list.md` F-002. Decisions: `work/decisions.md`.

## Scope
- Add `"db:types": "supabase gen types typescript --local > src/types/database.ts"` to `package.json`
  (`--local` instead of the feature list's `--linked`, decision D11: the migrations are the source of truth,
  and no Supabase login or secret is needed). Requires `npx supabase start`.
- Regenerate `src/types/database.ts` and fix any type errors that appear in `src/data/**`.
- Exclude the generated file from `oxfmt --check`, or format it inside the script.
- Update the README (replace the "Optional: regenerate" step).

## Out of scope
- Schema changes.

## Acceptance criteria
- [ ] `tsc --noEmit` passes with the generated types.
- [ ] No `any` is introduced.
- [ ] `pnpm db:types` is documented in the README.

## Technical notes
- Files: `package.json`, `src/types/database.ts`, `src/data/mappers.ts`, `README.md`.
- `--local` reads the schema from the local stack started from `supabase/migrations/`, so it matches the hosted
  project as long as Ming has applied every migration (M-1 / later migration items).
- Generated view rows are all nullable. `rowToItem` already handles that.
- Expected tier: Medium.

## Test plan
- Unit: none (F-005 mapper tests cover the types indirectly).
- Manual: `pnpm db:types && npx tsc --noEmit && pnpm build`.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-09 — claude — DONE
- Done: took over the stale 2026-11-07 claim; re-consulted (database-optimizer) and re-planned after T-004; attempt 1 PASS. `db:types` script (pinned CLI 3.0.0, `--schema public`) + README sequence. PR #16.
- In progress / next: Ming merges PR #16, then runs M-8 (first real regeneration, needs Docker) and commits the expected `graphql_public` diff via /solo.
- Gotchas: CLI flags not verified here (no Docker, `--help` blocked); M-8 is the first real run. Plan says "M-7" = ming-todo M-8.
