# BUG-006 consult — software-architect (2026-11-18)

**Findings**
- `vitest.config.ts` sets no `testTimeout`, so the default 5000 ms applies. Vitest and coverage-v8 are both 5.1.0.
  Coverage `include` lists only pure modules, so v8 coverage adds little to the UI code. The slowdown comes mostly
  from CPU contention: `ubuntu-latest` has 4 vCPU, shared by about 130 files in parallel workers plus the Postgres
  service.
- `App.test.tsx` uses `fireEvent` only (no fake timers, no `user-event`). Every test calls `renderApp()`, which
  renders the whole App, waits for "Xem thêm", clicks it once (16 fixtures, page size 12) and waits for 16 cards.
  Most of each test's cost is this full render, not the clicks.
- Measured: only `App.test.tsx`, pinned to one core (`taskset -c 0`, no coverage), each test takes 0.6–1.9 s. The
  slowest were "unsaved-changes guard > Huỷ" (1944 ms) and "double-click save" (1751 ms), the same tests that failed
  on CI. The file alone is not near 5 s; running in parallel with everything else pushes it over.

**Recommendations**
1. **Timeout placement:** `vi.setConfig({ testTimeout: 20_000 })` at the top of `App.test.tsx`, before any
   `describe`/`it` (vitest reads the timeout when each test is collected). One call covers all four top-level
   describes. Worst case on CI was 6.7 s, so 20 s leaves about 3x headroom. No global `testTimeout`: no other file
   failed, and a global value would make real hangs in unit tests take longer to surface.
2. **Concurrency:** it is the cause, but changing it is out of scope; do not touch `maxWorkers`/`pool`. If more
   `.tsx` files approach the limit later, a separate ticket can consider `maxWorkers` for CI or a `testTimeout` for
   `**/*.test.tsx` only.
3. **Speed-ups:** only small gains available (`showAll` loops once or twice; `renderApp` could wait for the cards
   directly). Leave `findBy` timeouts alone; a shared-render refactor is out of scope. Advice: skip trimming, only
   add the timeout.
4. **Reproduce before the fix:** `pnpm vitest run --coverage --testTimeout=1000 src/App.test.tsx` is deterministic:
   tests take 1–2 s, so several fail with "timed out in 1000ms". After the fix the same command passes, because
   `vi.setConfig` in the file overrides the CLI value. This proves the file sets its own budget, not that CI is fixed.
   Optionally also run `taskset -c 0,1 pnpm test:coverage` (2 cores, full suite) before and after and record the
   slowest App test times (several minutes).

**Risks**
- If `vi.setConfig` is placed after a `describe`, those tests keep the 5 s timeout; the reviewer should check where
  it sits.
- Testing Library's `findBy`/`waitFor` give up after 1 s by default; under heavier contention, waits on toasts could
  become the next flake. Not seen yet; watch item only.

**Open questions**
- Should impl-log also include the CI-like `taskset` run in addition to the deterministic `--testTimeout=1000` check,
  given it takes several minutes?
