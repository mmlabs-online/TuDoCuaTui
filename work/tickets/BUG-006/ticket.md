# BUG-006: App UI tests time out intermittently on CI

| Field | Value |
|---|---|
| Type | bug |
| State | DONE |
| Severity | S2 |
| Priority | P1 |
| Size | XS |
| Milestone | M1 |
| Epic | E0 — Tooling |
| Areas | architecture |
| Gate | none |
| Found in | CI on `main` and PR branches, 2026-11-18 (runs for board-only commits 547 and 550, PR #79, PR #82) |
| Introduced in | unknown — `src/App.test.tsx` grew heavier through BUG-002 (show-more clicks), F-602.2, F-603 and F-703 (2026-11-17) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-18 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/84 |

## Report
Ming, 2026-11-18: chose "Ghi BUG-006 và sửa" after CI went red on PR #82. The `ci` job's `pnpm test:coverage`
step fails intermittently, also on commits that change only `work/` files, so it is not caused by the code under test.

## Environment
- GitHub Actions `ubuntu-latest`, job `ci`, step `pnpm test:coverage` (coverage on, `TEST_DATABASE_URL` set, vitest workers in parallel).

## Steps to reproduce
1. Push any commit (even a board-only change) and let `ci` run.
2. Some runs fail; others with the same code pass.

## Expected
- `pnpm test:coverage` passes on every run when the code is correct.

## Actual
- Run 44228132199 (PR #82, job 134546268762): `src/App.test.tsx` failed 5 tests with `Error: Test timed out in 5000ms.`:
  "stale and never stat cards toggle a filter" (5818 ms), "duplicate resets wear count and last worn" (5235 ms),
  "delete asks for confirmation and removes the item" (6535 ms), "double-clicking save adds one item and shows
  'Đang lưu…'" (5580 ms), "unsaved-changes guard > Huỷ" (6741 ms). Test Files: 1 failed | 130 passed.
- Locally (`vitest run src/App.test.tsx` with coverage, single file) the same tests take 1–3 s.

## Root cause
**Confirmed** from the CI log: the App UI tests render the whole app and drive modals through several user events;
under coverage instrumentation and parallel workers on the CI runner they take 5–7 s, right at vitest's default
`testTimeout` of 5000 ms (`vitest.config.ts` sets none). Which tests cross the line varies run to run.

## Scope
- Give `src/App.test.tsx` a realistic per-file timeout (e.g. `vi.setConfig({ testTimeout: 20_000 })` or a `describe`
  option), or a project-level `testTimeout` if more files are close to the limit; no test is skipped, disabled or
  weakened.
- Optionally trim obvious waste in the slow tests (e.g. repeated "Xem thêm" clicks) if it is a small change.

## Out of scope
- Rewriting the App tests or changing CI runners/concurrency.

## Acceptance criteria
- [ ] A regression check shows the problem before the fix: the slow tests fail under an artificially tight budget
      matching CI conditions (e.g. coverage on plus CPU contention, or a reduced timeout), and pass with the new
      timeout; record the method and numbers in impl-log (a unit test cannot reproduce runner speed, D42 spirit).
- [ ] No test is skipped or removed; all existing assertions stay.
- [ ] `pnpm test:coverage` passes locally; CI on the PR is green (re-run once if needed and report both results).
- [ ] All checks pass.

## Technical notes
- Files: `src/App.test.tsx` and/or `vitest.config.ts`.
- Evidence: CI run 44228132199 job 134546268762; runs 44218037625 and 44215479782 (board-only commits) failed the same step.

## Notes / answers from Ming

## Handoff

### 2026-11-18 — claude — DONE
- Done: `vi.setConfig({ testTimeout: 20_000 })` at the top of `src/App.test.tsx` (consult: software-architect). Regression check `--testTimeout=1000`: 39/44 time out on origin/main, 44/44 pass after. Review PASS (attempt 1). PR https://github.com/mmlabs-online/TuDoCuaTui/pull/84.
- In progress / next: confirm the PR's `ci` run is green; reopen if App.test.tsx still times out on CI. Ming merges PR #84.
- Gotchas: a single-file `--coverage` run exits 1 because of coverage thresholds; read the `Tests` line.
