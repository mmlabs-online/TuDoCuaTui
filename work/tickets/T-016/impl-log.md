# Implementation log — T-016

## Attempt 1 — 2026-11-13

Supabase code archive: `5dca68be88c58dafca1d3836f11b1093995139ef` (origin/main before the first T-016 code commit; the deleted
Supabase repo, migrations, Edge Functions and tests are there).

Bundle sizes (`pnpm build`): before JS 249.81 kB (gzip 79.99), CSS 46.14 kB (gzip 10.33); after JS 249.26 kB (gzip 79.90),
CSS 45.42 kB (gzip 10.19).

### Files touched
| File | Required because |
|---|---|
| `src/lib/supabase.ts`, `src/types/database.ts`, `src/features/auth/*`, `src/Root.tsx`, `src/Root.test.tsx`, `src/data/aiSettings.ts` (+test), `src/data/repo.supabase.test.ts`, `src/test/fakeSupabase.ts`, `src/shared/ai/mirror.test.ts` | deleted per plan (AC 1) |
| `src/data/repo.ts` | Supabase section and imports removed; `mode: "local" \| "api"` |
| `src/data/mappers.ts` | hand-written `ItemRow`/`ItemInsert`/`DbStatus`/`DbSeason`; cast removed. `ItemRow.seasons` is `DbSeason[] \| null` (not `string[]`): `SEASON_FROM_DB` is inverted from `Record<string, DbSeason>` and `string[]` failed typecheck |
| `src/data/mode.ts`, `src/data/useWardrobe.ts` | two modes; `signOut` and `23505`/`42501` removed |
| `src/lib/legacySession.ts` (+test) | new: clears old `sb-*` auth keys |
| `src/main.tsx`, `src/App.tsx`, `src/features/layout/Header.tsx` | render `App` directly; clear legacy keys in PROD; sign-out button removed |
| `src/types/item.ts`, `src/shared/ai/{catalog,errors,validate,mask}.ts` | comments only |
| tests: `mode.test.ts`, `useWardrobe.test.tsx`, `mappers.test.ts`, `repo.local.test.ts`, `App.test.tsx`, `env.test.ts`, `boundary.test.ts`, `serialize.test.ts` | as in the plan |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `.dockerignore` | dependency, config and ignore cleanup |
| `Dockerfile`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `scripts/check-image.sh` | no Supabase build args; one-argument check; new `== bundle` check |
| `scripts/check-public-supabase-env.sh`, `.test.sh`, `scripts/test-db-shared.sh`, `supabase/` | deleted |
| `README.md`, `docs/data-model.md`, `docs/feature-list.md`, `docs/plan-M1.md`, `docs/qa/smoke-test.md` (deleted), `.github/risk-tiers.yml`, `.claude/commands/run.md`, `.claude/commands/solo.md` | docs and workflow config per plan |

### Tests added / changed
- `src/lib/legacySession.test.ts`: removes both key kinds; keeps other keys; several keys + count; throwing storage returns 0
- `src/data/mode.test.ts`: two-mode matrix (`pickMode`, dev, local fallback after two network errors)
- `src/data/useWardrobe.test.tsx`: api load error (`db_unavailable`), api importMany continues after a failed row, no `signOut`, `message` test updated
- `src/App.test.tsx`: api mode (no login field, no "Đăng xuất"), local mode (no "Đăng xuất")
- `src/shared/ai/boundary.test.ts`: `@supabase/` and `VITE_SUPABASE` added to `FORBIDDEN`; `database.ts` exclusion removed

### Checks (actual output summary)
- typecheck: `pnpm typecheck` OK (tsc + tsc -p tsconfig.server.json, no errors)
- format:check: "All matched files use the correct format."
- test: `Test Files 57 passed | 6 skipped (63)`, `Tests 633 passed | 101 skipped (734)` (skipped = DB tests that need Postgres, not available here)
- test:coverage: exit 0, all thresholds met
- build: OK (`built in 282ms`)
- `grep -rli supabase src dist` -> only `src/shared/ai/boundary.test.ts` and `src/lib/legacySession.ts` (comment); `dist` has no hit
- `grep -rln "VITE_SUPABASE\|@supabase/" src package.json vitest.config.ts tsconfig.json Dockerfile .github scripts` -> only `src/shared/ai/boundary.test.ts`; `pnpm-lock.yaml` has no supabase entry
- Docker image check (`check-image.sh`): NOT run, the Docker daemon is not available here. The CI `image` job is the proof. `bash -n scripts/check-image.sh` passes.

### Out-of-plan files
None. (`src/lib/legacySession.ts` carries the word "Supabase" in its comment; this was the plan's wording, so `grep -rli supabase src` lists it.)

### Follow-ups (noticed, not done)
- As listed in plan.md "Follow-ups" (repo.http hardening, local-mode banner, Access sign-out link, `.claude/agents/*` wording, ERD redraw, remove `legacySession.ts` later).

### For Ming
CLAUDE.md wording proposal: see the Appendix at the end of `work/tickets/T-016/plan.md` (verbatim). CLAUDE.md is not changed.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +281 / -5354 lines (82 files, incl. lockfile and deletions)
