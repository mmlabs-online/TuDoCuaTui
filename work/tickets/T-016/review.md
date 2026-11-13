## Attempt 1 — 2026-11-13
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (tsc + tsc -p tsconfig.server.json) clean, no errors.
- format:check: "All matched files use the correct format." (163 files)
- test: `Tests 633 passed | 101 skipped (734)`. The skipped tests are the Postgres-backed DB tests; no DB is available here. The counts match impl-log.
- build: OK, `dist/assets/index-*.js 249.26 kB (gzip 79.90)`, CSS 45.42 kB (gzip 10.19). This matches the "after" sizes in impl-log.
- test:coverage: exit 0, all thresholds met (`src/data` 99.59/97.61/98.52/99.52).
- `scripts/check-image.sh`: not run, because there is no Docker daemon. `bash -n` was clean per impl-log. The plan (Approach 8) accepts the CI `image` job as the proof, so it is carried to the PR below.

### Acceptance criteria
- [x] AC 1 "`grep -ri supabase src` only intentional references". Evidence:
  - `grep -rli supabase src` lists only `src/lib/legacySession.ts` (the comment on lines 1–2) and `src/shared/ai/boundary.test.ts` (the `FORBIDDEN` entries). The plan expected `legacySession.test.ts` too, but that file never contains the word, so getting 2 files instead of 3 is harmless.
  - `grep -rln "VITE_SUPABASE\|@supabase/" src package.json vitest.config.ts tsconfig.json Dockerfile .github scripts` lists only `boundary.test.ts`.
  - `pnpm-lock.yaml` has 0 supabase hits.
  - All six `test ! -e` paths are absent.
  - `grep -rli supabase dist` after the build has no hit.
- [x] AC 2 "All checks pass". See above. The CI `ci` and `image` jobs are pending on the PR.
- [x] AC 3 local mode. Evidence:
  - `mode.test.ts` covers "dev never calls fetch" → local, the no-false-positive cases, and "falls back to local after two network errors".
  - In `App.test.tsx`, the existing local suites pass, and the new "local mode: demo items, no sign-out" test passes.
  - Browser check: served the built `dist/` statically and opened it in Chromium at 390x844, light and dark. Results: demo items load, the hero says "16 món", there is no "Đăng xuất" and no email/password input, and `scrollWidth` is 390 (no horizontal overflow). Local-mode rendering is unchanged from `main`, because the sign-out button was never shown in local mode.
- [x] AC 4 API mode. Evidence:
  - `mode.test.ts`: `/healthz` ok → api, and opaqueredirect → api.
  - New `App.test.tsx` test "api mode: items load from /api, no login field, no sign-out".
  - New `useWardrobe.test.tsx` api tests: a `db_unavailable` load error, and `importMany` with an `invalid_input` row in the middle.
  - "App (API mode photos)" and `repo.http.test.ts` pass unchanged.
  - The CI `image` DB smoke is pending on the PR.
- [x] AC 5 legacy session cleanup. Evidence:
  - `legacySession.test.ts` has 4 passing tests.
  - `src/main.tsx:10` calls `clearLegacyAuthKeys()` under `import.meta.env.PROD`, before `detectMode()`.
  - Browser check: a seeded `sb-abc-auth-token` was removed, and `tu-do-theme` was kept.
- [x] AC 6 release and image pipeline. Evidence:
  - The `release.yml` diff touches only these parts: the header comment, the guard env, the guard call and the `mode` output, the build args, the verify env and argument, and the PR body text. Triggers, version guards, tag reservation, digest pinning and the `release.env`-only guard are unchanged.
  - `git diff --name-only` lists nothing under `deploy/`, `server/` or `db/`, and none of `vite.config.ts`, `AGENTS.md`, `.figma/` or `CLAUDE.md`.
  - `check-image.sh` requires exactly 1 argument (`-ne 1`), and the new `== bundle` section is at lines 76–79. No other section changed.
- [x] AC 7 docs and risk tiers. Evidence:
  - `grep -ni supabase README.md` returns only line 15, the D23 history sentence.
  - `.github/risk-tiers.yml` lists `db/migrations/**` and `server/**`, with no `supabase/` path.
  - The CLAUDE.md proposal is in the plan appendix, and impl-log points to it. The `CLAUDE.md` diff is empty.

### Ming verification after merge (carried to the PR, not verified here)
1. The live `v0.2.0` release is independent of T-016.
2. On the next release after T-016:
   - The `release` run is green.
   - The deployment PR body says "Node server, API mode".
   - On the phone: no login and no "Đăng xuất"; data and photos come from the server.
   - In DevTools: no `sb-…-auth-token` key, and `tu-do-theme` and `tu-do-items` are kept.
3. A6 items:
   - Delete the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` repo secrets.
   - Sign out all sessions of your user in the stoktok Supabase project.
4. The CI `image` job (both builds, plus `check-image.sh` with the new `== bundle` check and the DB smoke) must be green on the PR. This is the only proof of the Docker part.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: data access stays behind `WardrobeRepo`. The local repo is the default (`useWardrobe.ts:21`), and no component calls fetch or Supabase.
- R2: the Supabase migrations were deleted, not edited, and were never applied (A7). `db/migrations/` is untouched.
- R3: the only `VITE_*` variable left is `VITE_APP_VERSION`. `boundary.test.ts` gains the Supabase names and keeps `AI_KEK` and `ai_settings`. `.env.example` contains no "ai".
- R4: the Storage code is removed; photo privacy is unchanged (Drive, behind the server).
- R5, R6: no change.
- R8: `legacySession.ts` has unit tests and is added to the coverage thresholds. The changed mode logic is tested.
- R9: one header button was removed and there is no CSS change; checked at 390px in light and dark.
- R10: no Figma Make files were touched.

### Nits (do not block)
- `src/data/mappers.ts:30`: `ItemRow.seasons` is `DbSeason[] | null`, where the plan sketched `string[] | null`. The impl-log justifies this, and it is a type-only change. A server value outside the enum would still go through `SEASON_FROM_DB`, so it does not cause a runtime issue.
- The orchestrator's planning commit ticks the T-016 plan-approval line in `work/ming-todo.md` on this branch, although D16 says that file is edited on `main`. It is a workflow-state edit and does not come from the implementer.
- The `.env.example` comment is a single 150-character line. Consider wrapping it.

### Follow-ups (out of scope)
- As listed in plan.md: repo.http hardening, a local-mode banner when the probe fails on a non-local host, an Access sign-out link, the `.claude/agents/*` and `run.md:94` Supabase wording, the ERD redraw, dropping `primary_photo_path`, and removing `legacySession.ts` after a few releases.
- In the dark-mode screenshot, the header theme-toggle icon and the inactive "Tất cả" chip label have low contrast. This is not caused by this diff (no CSS change) and needs a check against `main`.
