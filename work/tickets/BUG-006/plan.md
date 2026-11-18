Status: READY

# Plan — BUG-006: App UI tests time out intermittently on CI

## Scope summary
Bug ticket: the scope reference is the bug report in `work/tickets/BUG-006/ticket.md` (planner rule 9).

- Scope (ticket): "Give `src/App.test.tsx` a realistic per-file timeout (e.g. `vi.setConfig({ testTimeout: 20_000 })`
  or a `describe` option), or a project-level `testTimeout` if more files are close to the limit; no test is skipped,
  disabled or weakened." / "Optionally trim obvious waste in the slow tests … if it is a small change."
- Out of scope (ticket): "Rewriting the App tests or changing CI runners/concurrency."
- D42 (`work/decisions.md`): "Every bug fix ships with a regression test that fails before the fix … the reviewer gives
  REWORK without it." The ticket's AC adapts this: "a unit test cannot reproduce runner speed, D42 spirit", so the
  regression check is a one-off scripted command recorded in impl-log.

**Root cause — confirmed.** `vitest.config.ts:16-21` (`test: { … }`) sets no `testTimeout`, so vitest's default
5000 ms applies to every test. `src/App.test.tsx:61` `renderApp()` renders the whole App, waits for "Xem thêm",
pages through with `showAll()` (`src/App.test.tsx:53-58`) and waits for 16 cards; every UI test pays that cost before
its own clicks. CI log (run 44228132199) shows five such tests at 5.2–6.7 s under ~130 parallel files on a 4-vCPU
runner plus a Postgres service. Planner measurement on this machine (4 cores, 2026-11-18):
`pnpm vitest run --coverage --testTimeout=1000 src/App.test.tsx` → `Tests 39 failed | 5 passed (44)`, exit 1, ~76 s
wall — the file's tests are 1–2 s each in isolation, so a tight budget reproduces the failure deterministically.
The fix is the cause in this file only (no other file failed on CI).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Regression check shows the problem before the fix and passes after; method and numbers in impl-log. | impl-log has, for **before** (fix stashed / `git stash` or HEAD version of the file) and **after**: command `pnpm vitest run --coverage --testTimeout=1000 src/App.test.tsx` and its `Tests …` summary line. Before: many `Test timed out in 1000ms` (planner saw 39 failed / 5 passed of 44). After: `Tests 44 passed (44)`. Reviewer re-runs the after command and sees 44 passed, 0 timed out. |
| 2 | CI-like check (CPU contention + coverage, full suite) recorded. | impl-log has `taskset -c 0,1 pnpm test:coverage` after the fix: exit code, `Test Files` / `Tests` lines, and the slowest App test durations (from `--reporter=verbose` output or the per-test ms vitest prints). A before run is recorded too if it finishes within ~15 min; if not, say so. |
| 3 | No test skipped or removed; all assertions stay. | `git diff main -- src/App.test.tsx` shows only the added `vi.setConfig` line(s) + comment; no `.skip`, `.todo`, `.only`, no deleted `it`/`expect`. Test count in the file stays 44. |
| 4 | Timeout applies to every test in the file. | `vi.setConfig({ testTimeout: 20_000 })` sits at module top level **before the first `describe`** (`src/App.test.tsx:80`), i.e. before any test is collected. AC1 "after" result (all 44 pass under the 1000 ms CLI value) proves it covers all five top-level describes. |
| 5 | No global change. | `git diff main -- vitest.config.ts` is empty. |
| 6 | `pnpm test:coverage` passes locally. | impl-log shows exit 0 of a plain `pnpm test:coverage` run (with `TEST_DATABASE_URL` unset, DB tests skip as usual — note this). |
| 7 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0 (impl-log). |

## Ming verification after merge
- CI on the PR is green (ticket AC: "re-run once if needed and report both results"). The orchestrator records the
  PR's `ci` result(s) in the ticket Handoff; if it stays flaky in the same file, reopen as REWORK.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/App.test.tsx` | Add `vi.setConfig({ testTimeout: 20_000 })` at top level after the `vi.mock`/helpers and before line 80 `describe("App (UI)", …)`, with a one-line comment citing BUG-006 (full-app render + coverage + parallel workers exceeds 5 s on CI). `vi` is already imported. | The fix. | No |
| `work/tickets/BUG-006/impl-log.md` | Regression and CI-like measurements, check results. | Workflow. | No |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| Regression check (one-off command, recorded in impl-log): `pnpm vitest run --coverage --testTimeout=1000 src/App.test.tsx`, before and after | Fails before the fix (tests time out at the CLI budget; planner saw 39/44 time out), passes after (44/44) because the file sets its own budget. Proves the per-file timeout is in effect for every test. |
| CI-like check (one-off, impl-log): `taskset -c 0,1 pnpm test:coverage` after (and before if ≤ ~15 min) | Full suite with coverage under CPU contention; records slowest App test times vs the new 20 s budget. |

No new unit test file: runner speed cannot be reproduced in a unit test (ticket AC1).

## Approach
1. Before the edit, run the regression command and save the `Tests …` line plus a count of `timed out in 1000ms`
   (e.g. `… 2>&1 | tee $SCRATCH/before.txt; grep -c "timed out in 1000ms"`). Judge by the `Tests` summary, not only the
   exit code: a single-file coverage run may also report threshold errors for files this test does not cover; if so,
   note it and do not treat it as part of the result.
2. Insert at module top level, immediately before `describe("App (UI)", …)` (or right after the imports/mocks block —
   anywhere before the first `describe`/`it`):
   ```ts
   // BUG-006: full-app renders under coverage and parallel workers take 5–7 s on CI; give this file headroom.
   vi.setConfig({ testTimeout: 20_000 });
   ```
3. Re-run the regression command; expect 44 passed.
4. Run `taskset -c 0,1 pnpm test:coverage --reporter=verbose` (after; before too if time allows) and record exit code,
   totals and the 3–5 slowest `App.test.tsx` tests with ms. Cap at ~15 min per run; if it does not finish, record that.
5. Run all checks (`pnpm format` first if needed). Do not touch `vitest.config.ts`, `findBy` timeouts, `showAll`,
   `renderApp`, CI workflow or worker settings.

Rules: R7 (stay in plan — no trimming, no global timeout), R8 (green checks; this is test-only so no new pure logic),
D42 (regression check before/after recorded).

## Specialist input used
From `consult-software-architect.md`:
- Adopted: per-file `vi.setConfig({ testTimeout: 20_000 })` before any `describe` (≈3x headroom over the 6.7 s CI
  worst case); no global `testTimeout` (would delay surfacing real hangs elsewhere).
- Adopted: do not touch concurrency (`maxWorkers`/`pool`) — out of scope per ticket.
- Adopted: skip the optional trimming (gains are small; the ticket makes it optional).
- Adopted: deterministic before/after check `--testTimeout=1000` (verified by the planner: 39/44 fail before).
- Open question decided: **include** the `taskset -c 0,1 pnpm test:coverage` run in impl-log (after required, before
  if ≤ ~15 min), since it is the only check resembling CI contention; the deterministic check alone proves only that
  the file sets its own budget.
- Watch item noted (not acted on): Testing Library `findBy`/`waitFor` 1 s default could become the next flake → follow-up only.

## Assumptions
- `vi.setConfig` placed before the first `describe` applies to every test collected in this file and is reset after
  the file (vitest behaviour, consult finding); AC1 "after" run confirms it empirically.
- No other open ticket edits `src/App.test.tsx` (board: BUG-006 is the only ticket not BACKLOG/MERGED), so no hotspot
  conflict. `src/App.test.tsx` is a known hotspot for future tickets.
- Follow-ups (not in diff): consider `maxWorkers` on CI or a `**/*.test.tsx` timeout if more UI files approach 5 s;
  watch Testing Library `asyncUtilTimeout` under contention.

## Blocking questions
None.

## Split proposal
None.
