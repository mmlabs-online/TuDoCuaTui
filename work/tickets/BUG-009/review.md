## Attempt 1 — 2026-11-19
Verdict: REWORK

### Checks (run by reviewer)
Run on `claude/magical-cori-2ssw8l` @ 9d3e95b.
- `pnpm typecheck` — clean (`tsc --noEmit && tsc -p tsconfig.server.json`).
- `pnpm format:check` — exit 0 ("Finished in 61ms on 336 files").
- `pnpm test` — 137 files passed / 11 skipped; 1928 tests passed / 222 skipped.
- `pnpm build` — built in 417ms.

### Acceptance criteria
- [x] Root cause identified and recorded — evidence: plan.md "Root cause", impl-log "Root cause (AC 1)": stale-result guard at `useAiFill.ts:79-80` reads `latest.current`, which is only refreshed in a passive effect (`useAiFill.ts:53-56`). Agreed after reading the code.
- [ ] The test passes 50 consecutive runs of the file — FAILED, see Issue 1. Plan AC #2(a) requires the 50-run file loop with **zero** `FAIL` lines. impl-log reports 2 FAILs in its 50-run loop (plus 3 in a 60-run loop). Reviewer reproduction on the fix (scratch copy of HEAD): `for i in $(seq 50); do vitest run src/features/items/Editor.test.tsx …` → **2/50 failed** (runs 39 and 41), both `AI fill › "Hoàn tác" restores the previous values`. CPU-throttled part: impl-log `taskset -c 0,1 pnpm test` green and perturbation shim 10/10 fail → 0/10 after; not re-run as a whole by the reviewer beyond the checks above.
- [x] Product race → regression test fails before the fix — evidence: reviewer ran the two new tests against `origin/main`'s `useAiFill.ts` + `Editor.tsx` (scratch copy `rv-bug009/unfixed`): `a result arriving right after the photo is replaced is ignored` fails with `expected [ 'photo', 'name', 'category', …(5) ] to deeply equal [ 'photo' ]`; `removing the photo while pending cancels the request` fails with `expected false to be true` (signal not aborted). Both pass on HEAD.
- [x] All checks pass — see Checks.
- [x] Existing test "a result for a replaced photo is ignored" unchanged — `git diff origin/main...HEAD -- src/features/items/Editor.test.tsx` adds only the `act` import and two new tests.

### Issues
#### Issue 1 — 🔴 blocker — same root cause still flakes the file; AC "50 consecutive runs" not met
- **Where**: `src/features/items/useAiFill.ts:53-56` (ref refreshed in passive `useEffect`) read by `undo` at `useAiFill.ts:119-123` (`const now = latest.current; undoFill(now.item, record)`); flaky test `src/features/items/Editor.test.tsx:569-579`.
- **Judgement — same cause, so in scope**: the ticket's Out of scope reads "Other flaky tests unless the same cause". The root cause this ticket records is exactly "`latest.current` is refreshed in a passive effect, so a callback that runs after commit but before the passive flush reads the previous `item`". `undo` is a second reader of the same stale ref: `findByRole` resolves on the DOM mutation of the commit that shows "Hoàn tác", the click runs before the passive flush, `undoFill` sees the pre-fill item (`name: ""` ≠ filled name, `aiFill.ts:87`) and restores nothing, so `expect(spy).toHaveBeenCalledWith("name", "")` fails. The `cancel()` fix removed one reader's dependency on the stale ref but left the root cause in place. The plan's rationale for deferring it ("never seen to flake naturally") is disproved by the implementer's own and the reviewer's loops.
- **Pre-existing, not caused by this diff**: 80 runs of the `origin/main` file on `origin/main` source → 1/80 failed, `"Hoàn tác" restores the previous values` (run 53). On HEAD: 2/50. So the diff does not regress it, but the file still does not pass 50 consecutive runs.
- **Deterministic repro (reviewer, scratch only)**: a test that clicks "Hoàn tác" from a `MutationObserver` callback the moment the button is inserted (a microtask after the commit, before the Scheduler flushes passive effects) fails 3/3 on HEAD with `expected "vi.fn()" to be called with arguments: [ 'name', '' ]`, and passes 3/3 when line 54 is changed to `useLayoutEffect`. With that change the whole `src/features/items` folder passes (10 files, 128 tests) and the file loop was **0/50** failures.
- **Expected**: the file passes 50 consecutive runs with zero failures; no reader of `latest.current` can see an item older than the last commit.
- **Actual**: 2/50 failures on HEAD, all in the undo test, from the same stale-ref mechanism.
- **Fix instruction** (keep everything already in the diff; it is correct):
  1. `src/features/items/useAiFill.ts:1,54`: refresh the ref in a layout effect — `import { useEffect, useLayoutEffect, useRef, useState }` and `useLayoutEffect(() => { latest.current = { item, categoryFillable, update }; });`. (Alternative: in `undo` use the render-time `item`/`update` instead of `latest.current`; the layout effect is preferred because it also closes the window for `run`'s safety-net check at line 80 and for any later reader. Keep `cancel()` and the `finally` guard as they are.)
  2. Add a deterministic regression test in `Editor.test.tsx › AI fill`, e.g. `"Hoàn tác" right after the fill renders restores the previous values`: `setup()`, `await ready()`, install a `MutationObserver` on `document.body` (`childList`, `subtree`) that, the first time `screen.queryByRole("button", { name: EDITOR_COPY.ai.undo })` is non-null, calls `fireEvent.click` on it; click `aiBtn()`; `await waitFor(() => expect(clicked).toBe(true))`; `mo.disconnect()`; assert `spy` called with `("name", "")`, `("category", "Áo")`, `("colors", [])`, `("tags", [])`. Record in impl-log that it fails on 9d3e95b's `useAiFill.ts` and passes after the change (D42). Do not change the existing undo test at `Editor.test.tsx:569-579`.
  3. Re-collect AC 2 evidence in impl-log: the 50-run file loop from plan AC #2(a) with **zero** `FAIL` lines (record the command and the printed result), `taskset -c 0,1 pnpm test` green, and the perturbation summary (unchanged from attempt 1 is fine if re-run once).
  4. Update impl-log's root-cause note to say the undo reader is the same cause and was fixed here; drop the undo follow-up.

### Code review of the attempt-1 fix (no issues)
- `cancel()` (`useAiFill.ts:109-116`): no-op without a request; aborts, clears `ctlRef`, resets `busyRef` and `busy` synchronously. `cancel` only touches refs and setters, so the stale `fill` captured by the async `upload` closure (`Editor.tsx:109-121`) still cancels the current request.
- `finally` guard (`useAiFill.ts:99-105`): a cancelled run sees `ctlRef.current !== ctl` and leaves a newer run's `ctlRef`/`busyRef`/`busy` alone; unmount still aborts with `ctlRef.current === ctl`, so the unmount path is unchanged. No busy-state clobbering.
- No error/notice on cancel: after abort, a resolved `tag` returns at line 80 and a rejected one returns at line 93; `cancel()` does not set `notice`/`error`.
- Call sites: `Editor.tsx:120` only after the new photo is committed (not on a stale `seq` or a prep error); `Editor.tsx:303` in "Bỏ ảnh". Matches the plan.

### Rules (CLAUDE.md)
No violations found. R1 untouched (no data access change); R6 no new copy; R7 the three source files match the plan's file list; R8 changed hook logic is tested; R9 no layout change. No High path touched.

### Blockers from review agents
None (no review trigger applies: area `architecture`, no trigger paths changed).

### Nits (do not block)
- 💭 `Editor.test.tsx` new test 1: `await act(async () => {})` after the `aria-busy` wait is enough today; a one-line comment on why the flush is there would help the next reader.

### Follow-ups (out of scope)
- Cancel a pending AI run on "Nhân bản" (duplicate), `Editor.tsx:~490` (from plan).

### Ming verification after merge
None (plan: optional manual check of replacing the photo during "Đang phân tích ảnh").

## Attempt 2 — 2026-11-19
Verdict: PASS

### Checks (run by reviewer)
Run on `claude/magical-cori-2ssw8l` @ 8c64240 (working tree clean).
- `pnpm typecheck` — clean, exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`).
- `pnpm format:check` — exit 0 ("Finished in 39ms on 336 files").
- `pnpm test` — Test Files 137 passed / 11 skipped; Tests 1929 passed / 222 skipped (attempt 1: 1928, +1 new test).
- `pnpm build` — built in 404ms.
- `vitest run src/features/items` — 10 files, 128 tests passed; no React warnings in the output.

### Acceptance criteria
- [x] Root cause identified and recorded — evidence: impl-log Attempt 2 "Root cause (updated)": one cause (ref refreshed in a passive effect), two readers (`run`'s stale-result guard and `undo`). Fixed at the source: `src/features/items/useAiFill.ts:54-57` now uses `useLayoutEffect`.
- [x] 50 consecutive runs of the file — evidence: reviewer loop on a scratch copy of 8c64240 (`rv-bug009b/head`), `for i in $(seq 50); do pnpm exec vitest run src/features/items/Editor.test.tsx > run-$i.log …` → **0/50 failed**; all 50 logs show `Tests 52 passed (52)`, zero `FAIL ` lines. CPU-throttled part: implementer's `taskset -c 0,1 pnpm test` green and perturbation shim 0/10 (attempt 1 before-fix 10/10); reviewer's full `pnpm test` green.
- [x] Product race → regression test fails before the fix — evidence: new test `Editor.test.tsx:581-601` (`"Hoàn tác" right after the fill renders restores the previous values`) run against 9d3e95b's `useAiFill.ts` (scratch `rv-bug009b/old`, only that file swapped) → fails 3/3 with `expected "vi.fn()" to be called with arguments: [ 'name', '' ]`; on HEAD passes 3/3. Attempt-1 regression tests for the photo-replace and remove paths still pass (file 52/52).
- [x] All checks pass — see Checks.
- [x] No existing test changed — `git diff origin/main...HEAD -- src/features/items/Editor.test.tsx` has one removed line, the RTL import replaced by the same import plus `act`; the delta adds only the new test and a comment line at `Editor.test.tsx:690` in the attempt-1 test.

### Issues
None.

### Code review of the attempt-2 change
- `useLayoutEffect` (`useAiFill.ts:54-57`): runs synchronously after every commit, before the browser regains control, so any click/microtask after a commit (including `undo` at `useAiFill.ts:119-126` and `run`'s guard at line 81) sees the committed `item`/`update`. Effect body only assigns a ref: no layout read, no setState, so no extra render or paint cost.
- SSR / warnings: SPA rendered client-side only; no `react-dom/server`, `renderToString` or `hydrateRoot` in `src/` or `server/`, so the React SSR `useLayoutEffect` warning cannot occur. No warning in the items-folder run.
- Behaviour elsewhere: `useAiFill` is consumed only by `Editor.tsx:19` (`ImportModal.tsx` imports just the `EditorAi` type). The ref is now updated earlier than before, never later, so no reader can observe an older value than it did on main. `src/features/items` 128/128 green.
- `cancel()` and the `finally` guard from attempt 1 are unchanged (reviewed in Attempt 1, no issues).

### Rules (CLAUDE.md)
No violations found. R1 no data access change; R6 no new copy; R7 changed source files (`useAiFill.ts`, `Editor.tsx`, `Editor.test.tsx`) are in the plan's file list, and the layout-effect change is the review-mandated fix for the same root cause; R8 hook change covered by a regression test that fails before; R9 no UI change; D42 regression test present. No High path touched.

### Blockers from review agents
None (no review trigger applies).

### Nits (do not block)
- 💭 The new test's `MutationObserver` is disconnected only after the `waitFor` succeeds; if it ever times out, the observer stays attached until jsdom teardown. Harmless (`clicked` guard), a `try/finally` would be tidier.

### Follow-ups (out of scope)
- Cancel a pending AI run on "Nhân bản" (duplicate), `Editor.tsx:~490` (from plan).

### Ming verification after merge
None (plan: optional manual check of replacing the photo during "Đang phân tích ảnh").
