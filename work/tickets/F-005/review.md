## Attempt 1 — 2026-11-07
Verdict: PASS

### Checks (run by reviewer)
Run on Windows (Git Bash), branch `ticket/F-005`, `npx pnpm@10.34.3`, existing `node_modules` (no install needed).
- typecheck: `tsc --noEmit` exit 0, no output.
- format:check: "All matched files use the correct format." (26 files), exit 0.
- test: `vitest run` v5.1.0 — Test Files 4 passed (4), Tests 54 passed (54), exit 0.
- test:coverage: 54 passed, exit 0. Text table shows only non-full files: `repo.ts` 22.29 % stmts (uncovered 91–266 = `createSupabaseRepo`, F-005.2), `useWardrobe.ts` 0 % (F-005.2). HTML report: `mappers.ts` 100 % (23/23 stmts, 63/63 branches, 9/9 funcs, 20/20 lines); `filters.ts` 100 % (10/10, 29/29, 5/5, 10/10). Matches impl-log.
- Threshold spot check: `pnpm exec vitest run --coverage src/test/env.test.ts` → 8 `ERROR: Coverage for … does not meet "src/data/mappers.ts" / "src/features/items/filters.ts" threshold`, exit 1. Thresholds are enforced.
- build: `vite build` (vite v8.0.5), 66 modules, exit 0.
- `pnpm why vite`: "Found 1 version of vite" (8.0.5).

### Acceptance criteria
(Plan slice-1 table; AC2/#4 judged against the slice-1 criterion, full ticket AC2 belongs to F-005.2.)
- [x] 1 `pnpm test` green locally — evidence: 4 files / 54 tests passed; all four planned test files run.
- [x] 2 `pnpm test` in CI — evidence: `.github/workflows/ci.yml:28` `- run: pnpm test:coverage` right after `pnpm typecheck`, `# F-005 adds…` comment removed. The PR's `ci` check is to be confirmed green on the PR (not yet open).
- [x] 3 `test:coverage` exists and enforces a threshold — evidence: `package.json` scripts; `vitest.config.ts:9,28-31` per-file thresholds 80/80/80/75 on `mappers.ts` and `filters.ts`; spot check above fails as expected.
- [x] 4 Coverage of `src/data/**` (partial, as planned) — evidence: `mappers.ts` 100 %; `createLocalRepo` (`repo.ts:27-83`) fully covered (only 91–266 uncovered); split recorded in `ticket.md` Handoff and plan `## Split proposal`; F-005.2 exists on the board (`51c9f28` on main).
- [x] 5 Mapper round trip of every label — evidence: `mappers.test.ts` `roundTrip()` iterates `Object.keys(*_TO_DB)` and checks bijection size; item→row→item covers every category, colour, season and status.
- [x] 6 `createLocalRepo` tested — evidence: `repo.local.test.ts`, 15 tests, all plan cases (corrupt JSON, quota `setItem`, dedupe, wear ±1, `?? item` fallback).
- [x] 7 Helpers live in `src/features/items/filters.ts` and are tested incl. 89/90/91 boundary — evidence: `filters.test.ts` `isStale` 89/90/91/never; `grep "const age" src/App.tsx` → none.
- [x] 8 Zero behaviour change in `App.tsx` — evidence: line-by-line compare of `origin/main:src/App.tsx:488-523` vs `filters.ts`: same `age` formula (`Math.floor((now - new Date(date).getTime()) / 86400000)`, `999` for empty), same haystack/`toLowerCase`, same `"Tất cả"` check, same five field filters, `special` `"stale"` (`>= 90` via `STALE_DAYS`) and `"never"`, same comparator chain with `createdAt` default fallback. `sortItems` copies (`[...items]`) where the old code sorted a fresh `filter()` result — equivalent. Hero line (`App.tsx:624`) and stat card (`App.tsx:674`) use `items.filter((i) => isStale(i))` (lambda, so the index is not passed as `now`). `ItemCard age={ageInDays}` (`App.tsx:777`); `ItemCard` calls `age(item.lastWorn)` with one argument (`App.tsx:904`), signature `(s: string) => number` unchanged. `useMemo` deps unchanged. Only diff in App.tsx is the planned one. (`pnpm dev` manual click-through not performed by reviewer; diff equivalence is exact.)
- [x] 9 Fixed TZ and local mode — evidence: `vitest.config.ts:7` `process.env.TZ = "Asia/Ho_Chi_Minh"`, `:22` blanks `VITE_SUPABASE_*`; `src/test/env.test.ts` both pass (offset −420, `supabase === null`).
- [x] 10 Single Vite version — evidence: lockfile has one `vite@8.0.5` package entry; `pnpm why vite` → 1 version.
- [x] 11 All checks green — evidence: above.

Scope: changed files = plan's file list exactly (package.json, lockfile, vitest.config.ts, src/test/setup.ts, src/test/env.test.ts, tsconfig.json, .gitignore, .prettierignore, ci.yml, filters.ts(+test), App.tsx, mappers.test.ts, repo.local.test.ts, F-005 work files). `vite.config.ts`, `.figma/`, `AGENTS.md`, `src/lib/supabase.ts`, `work/backlog.md` untouched (D16 respected). Lockfile diff: additions only (no `-` lines); importers gain exactly `@vitest/coverage-v8` 5.1.0, `jsdom` 27.4.0, `vitest` 5.1.0. jsdom 27.4.0 engines `^20.19.0 || ^22.12.0 || >=24`, vitest `^22.12.0 || …` — compatible with CI `node-version: 22`. `coverage/` is in `.gitignore` and `.prettierignore`.

Tests are meaningful: assertions use hand-written expected values (e.g. `-1` for the T-002 date bug, `["never","old","recent"]`, `"Đen"`/`"Xuân"` mappings, `2000` rounding), not re-computations of the code under test — one exception, see nits. Every test that pins T-002 behaviour carries "(records current behaviour)": ageInDays YYYY-MM-DD, diacritic-sensitive query, wear +1 twice, wear −1 keeps lastWorn.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: local mode untouched, tests forced to local mode. R6: labels unchanged; sort keys remain the existing UI strings (moving them is F-004). R7: no behaviour change; the `now`-captured-once difference is documented in plan Assumptions and not observable. R8: `filters.ts` ships with tests. R10: standalone `vitest.config.ts`, no `mergeConfig`, `vite.config.ts` untouched.

### Nits (do not block)
- `filters.test.ts` › `"Tên A→Z" uses Vietnamese collation` computes `expected` with the same `localeCompare(…, "vi")` as the code, so it is close to tautological (it would still pass if `"vi"` were dropped, since root collation gives the same order for these names). Hardcode the expected order, e.g. `["Áo", "Bông", "Đầm", "Quần"]`, and add a pair where `vi` differs from the root locale if one is found.
- `ItemCard age={ageInDays}` passes a function with an optional second `now` parameter where `(s: string) => number` is expected. Safe today (single-argument call at `App.tsx:904`), but a future `.map(age)` would pass the index as `now`. Worth keeping in mind in F-004.
- Untracked `work/tickets/F-005/security-review.md` appeared in the working tree during this review; it is not part of this diff and was not written by the reviewer.

### Ming verification after merge
None (per plan).

### Follow-ups (out of scope)
- F-005.2: fake Supabase client, `useWardrobe` tests, Testing Library, global `src/data/**` ≥ 80 % gate (ticket AC2).
- Tests for `authMessages.ts` / `cooldown.ts` after F-101 merges.
- Diacritic-insensitive search (normalize like D8); T-002 updates the "(records current behaviour)" tests.
