## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `src/App.test.tsx` | Added `vi.setConfig({ testTimeout: 20_000 })` (+ BUG-006 comment) at top level, before the first `describe`. The fix. |
| `work/tickets/BUG-006/impl-log.md` | Workflow. |

### Regression check (D42 spirit; runner speed cannot be unit-tested)
Command: `pnpm vitest run --coverage --testTimeout=1000 src/App.test.tsx` (4-core machine).
- Before the fix: `Tests  37 failed | 7 passed (44)`, 34 lines `timed out in 1000ms`, exit 1.
- After the fix: `Tests  44 passed (44)`, 0 timeouts. Exit is still 1 in both runs only because a single-file coverage run
  misses the `src/data/**` threshold ("Coverage for lines (36.42%) does not meet threshold (80%)"); not part of the result.
- Test count unchanged: 44 in the file (41 `it(` lines plus parametrised cases); no skip/todo/only, nothing removed.

### CI-like check: `taskset -c 0,1 pnpm test:coverage --reporter=verbose`
- Before (App.test.tsx stashed): exit 0, `Test Files 121 passed | 11 skipped (132)`, `Tests 1586 passed | 221 skipped (1807)`, 170.55 s. 0 timeouts. Slowest App tests: 3365 ms (stale and never stat cards), 2927 ms (Mở cài đặt), 2877 ms (unsaved-changes guard > Huỷ).
- After: exit 0, same totals, 174.59 s. 0 timeouts. Slowest App tests: 3396 ms (unsaved-changes guard > Huỷ), 3148 ms (double-clicking save), 3125 ms (delete asks for confirmation), 3097 ms (stale and never stat cards), 2800 ms (Mở cài đặt).
- Note: this sandbox does not reproduce CI's 5-7 s (all runs pass before the fix too); the deterministic 1000 ms check above is the proof. Slowest times here are ~3.4 s, i.e. ~0.7 of the old 5 s limit, vs 20 s now.
- Plain `pnpm test:coverage` (TEST_DATABASE_URL unset, DB tests skip): exit 0, `Tests 1586 passed | 221 skipped (1807)`.

### Checks (actual output summary)
- typecheck: exit 0
- format:check: exit 0 ("All matched files use the correct format.")
- test: exit 0 (`Tests 1586 passed | 221 skipped (1807)`)
- build: exit 0 (`✓ built in 415ms`)

### Out-of-plan files
None. `vitest.config.ts` untouched.

### Follow-ups (noticed, not done)
- Testing Library `findBy`/`waitFor` 1 s default could become the next flake under contention.
- Consider `maxWorkers` on CI or a wider timeout if more UI files approach 5 s.
