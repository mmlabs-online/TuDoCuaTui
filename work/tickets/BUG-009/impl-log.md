## Attempt 1 — 2026-11-19

### Root cause (AC 1)
Product race, exposed by test timing. `useAiFill` refreshed `latest.current` only in a passive effect, and its stale-result guard (`now.item.photo !== photoAtStart`) read that ref. After `update("photo", url)` nothing aborted the in-flight request, so a result landing before React rendered and flushed effects passed the guard and filled 7 fields. The existing test's `waitFor` on the `update` spy is satisfied before the render, so `d.resolve(SUG)` could win the race. Fix: explicit synchronous `cancel()` (aborts the controller) at photo replace and at "Bỏ ảnh".

### Files touched
| File | Required because |
|---|---|
| `src/features/items/useAiFill.ts` | Added and returned `cancel()`; `finally` resets busy state only for the current controller. |
| `src/features/items/Editor.tsx` | `fill.cancel()` before `update("photo", url)` in `upload` and before `update("photo", "")` in "Bỏ ảnh". |
| `src/features/items/Editor.test.tsx` | Two regression tests (plus `act` added to the RTL import). Existing tests untouched. |

### Tests added / changed
- `Editor.test.tsx › AI fill › a result arriving right after the photo is replaced is ignored`
- `Editor.test.tsx › AI fill › removing the photo while pending cancels the request`

Fail before the fix (unfixed source, `vitest run -t "right after the photo|removing the photo while"`): 2 failed.
- test 1: `expect(keysOf(spy)).toEqual(["photo"])` received extra `"name","category","colors","seasons","material","brand","tags"`.
- test 2: `expect(signal!.aborted).toBe(true)` received false.
After the fix: both pass; file 51/51.

### Evidence (AC 2)
Perturbation shim (`setImmediate` -> `setTimeout(fn, 3)` via `vi.hoisted`, kept out of the commit; scripts in scratchpad `impl-bug009/`), `vitest run Editor.test.tsx -t "AI fill"` x10:
- before the fix: 10/10 runs failed (the existing "a result for a replaced photo is ignored" plus both new tests).
- after the fix: 0/10 failed.

50 sequential runs of `Editor.test.tsx` after the fix: 2 runs failed (5 and 16), a further 40-run loop 0 failed, a 60-run loop 3 failed (10, 12, 23). In every captured failure the failing test was `"Hoàn tác" restores the previous values` (`expected vi.fn() to be called with ['name','']`), the undo ref-lag problem listed as a follow-up in plan.md (undo reads `latest.current.item`, refreshed in a passive effect). The target test "a result for a replaced photo is ignored" did not fail in any of ~150 post-fix runs. Runs 5 and 16 of the first loop were not captured, so their test name is not confirmed (assumed the same).

`taskset -c 0,1 pnpm test`: Tests 1928 passed | 222 skipped, green.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: `taskset -c 0,1 pnpm test` 1928 passed, 222 skipped, 0 failed (full suite).
- build: built in 1.58s.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- (Undo flake follow-up dropped: fixed in attempt 2.)
- Consider cancelling a pending AI run on "Nhân bản" (duplicate).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +65 / -4 lines (3 files).

## Attempt 2 — 2026-11-19 (REWORK: review Issue 1)

### Root cause (updated)
Same stale `latest.current` cause, two readers. `useAiFill` refreshed `latest.current` in a passive effect, so (1) the stale-result guard in `run` and (2) `undo` could read an `item` older than the last commit. Reader 2 caused the `"Hoàn tác" restores the previous values` flake (click lands after the commit that shows the button, before the passive flush; `undoFill` sees the pre-fill item and restores nothing). Attempt 1 fixed reader 1 with `cancel()`; attempt 2 fixes the cause: the ref is refreshed in `useLayoutEffect`.

### Files touched
| File | Required because |
|---|---|
| `src/features/items/useAiFill.ts` | `latest.current` refreshed in `useLayoutEffect` (import added, one-line comment). |
| `src/features/items/Editor.test.tsx` | New deterministic undo regression test; one-line comment on `await act(async () => {})`. Existing tests unchanged. |

### Test added (D42)
`Editor.test.tsx › AI fill › "Hoàn tác" right after the fill renders restores the previous values`: a `MutationObserver` clicks "Hoàn tác" as soon as it is inserted.
- On 9d3e95b's `useAiFill.ts` (passive effect): fails 3/3, `expected "vi.fn()" to be called with arguments: [ 'name', '' ]`.
- After the change: passes 3/3.

### Evidence (AC 2)
- 50-run loop: `for i in $(seq 50); do pnpm exec vitest run src/features/items/Editor.test.tsx > a2-$i.log 2>&1 || echo FAIL; done` -> 0/50 failed, 0 `FAIL ` lines in the logs.
- Perturbation shim (`setImmediate` -> `setTimeout(fn, 3)`, `-t "AI fill"` x10, via `impl-bug009/perturb.sh`): 0/10 failed (attempt 1 before-fix: 10/10).
- `taskset -c 0,1 pnpm test`: Test Files 137 passed | 11 skipped; Tests 1929 passed | 222 skipped.

### Checks
typecheck clean; format:check clean; test (above) green; build green.

### Out-of-plan files
None (the `useAiFill.ts` ref change is the reviewer-mandated fix for the same root cause).

### Follow-ups
- Cancel a pending AI run on "Nhân bản" (duplicate).

### Scope self-check
Smaller? No: one-line fix plus the required test.
