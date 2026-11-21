# BUG-009 consult: software-architect (2026-11-19)

**Verdict: this is a product race, not only test timing.** The test is correct. It fails when the AI result arrives in the short gap between the Editor calling `update("photo", …)` and React running its passive effects. The guard against stale results reads a ref that has not been updated yet at that point.

## Findings

1. **Where the guard goes wrong** (`src/features/items/useAiFill.ts`):
   - Line 53/55: `latest.current = { item, … }` is only refreshed inside a `useEffect`, which runs after the render has been committed.
   - Lines 79–80: the guard `if (ctl.signal.aborted || now.item.photo !== photoAtStart) return;` reads `latest.current.item.photo`.
   - Replacing a photo goes through `Editor.tsx:120` `update("photo", url)`. Nothing aborts the AI request at that moment. The parent's `setItem` then has to render, commit and flush passive effects before the ref changes.
   - If `tagger.tag` resolves in that window, `now.item.photo === photoAtStart` still holds. The stale suggestion is then applied: all 7 fields are filled and `setApplied` is recorded against the old photo.
   - Removing the photo (`Editor.tsx:301` `resetPhoto(); update("photo", "")`) has the same gap.

2. **Why the test flakes** (`src/features/items/Editor.test.tsx:632–646`):
   - Line 642 `await waitFor(() => expect(spy).toHaveBeenCalledWith("photo", …))` passes as soon as `update` is called. `spy` runs synchronously inside `update`, before `setItem` has rendered.
   - Before returning, RTL 16's `asyncWrapper` drains with `setTimeout(0)`. React's Scheduler (scheduler 0.27, React 19.2.4) runs the render and the passive-effect flush through `setImmediate`, and yields after its 5 ms frame.
   - Under CPU contention (a full parallel `pnpm test`), the 1 ms timer can fire before the Scheduler's immediate. The test then resumes and calls `d.resolve(SUG)` at line 643. The stale-result check runs in a microtask while the ref is still old.
   - It then fails at line 645 `expect(keysOf(spy)).toEqual(["photo"])`.

3. **Reproduction results** (repo files untouched; experiments in copies under `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/bug009/`):

   | Run | Result |
   |---|---|
   | Natural, isolated (`vitest run Editor.test.tsx -t "replaced photo"`) | 15/15 pass |
   | Natural, with 6 busy-loop CPU hogs | 12/12 pass |
   | Natural, full suite pinned to 2 cores (`taskset -c 0,1 vitest run`) | 3/3 pass (1926 tests) |
   | Timing perturbation: React Scheduler tasks delayed 3 ms, as an OS preemption would | 10/10 fail (`repoB/`) |
   | Deterministic product race ("variant A", scratch test) | Always fails (`repo/`) |

   - The natural failure is rare, as the ticket reports.
   - Under the perturbation (`globalThis.setImmediate = (fn,...a) => setTimeout(fn, 3, ...a)` in `vi.hoisted`), the failure is `AssertionError: expected [ 'photo', 'name', 'category', …(5) ] to deeply equal [ 'photo' ]`, i.e. the stale suggestion was applied.
   - Variant A is the same test with `spy.mockImplementation(k => k === "photo" && d.resolve(SUG))`, so the result lands right after `update("photo")`. It fails with `+ "name", "category", "colors", "seasons", "material", "brand", "tags"`. This is a ready-made regression test for the "fails before the fix" acceptance criterion.

4. **Prototype fix** (scratch copy only): I added `fill.cancel()` to `useAiFill` and called it in `Editor.upload` just before `update("photo", url)`.
   - Both the original test (with the perturbation) and variant A then pass 5/5.
   - All 126 tests in `src/features/items` pass with the perturbation on.

5. **Same root cause elsewhere, outside this ticket:**
   - Undo (`useAiFill.ts:108–109`) also reads `latest.current.item`.
   - With a heavier perturbation (Scheduler frame always used up), `"Hoàn tác" restores the previous values` failed 4/4 at `Editor.test.tsx:581` (`expected … to be called with [ 'name', '' ]`). Undo saw the item from before the fill.
   - It has never been seen to flake naturally.

## Recommendations

1. **Fix the product, not only the test.** This covers the acceptance criteria "root cause recorded" and "regression test fails before the fix", and rule R7.
   - Add `cancel()` to `useAiFill`. It aborts the current controller, clears `ctlRef`, resets `busyRef` and calls `setBusy(false)`.
   - Call it from `Editor.tsx` at the moment the photo changes: in `upload` right before `update("photo", url)` (line 120), and in the "Bỏ ảnh" handler next to `resetPhoto()` (line 301).
   - In the `finally` (around line 99–101), only reset `busyRef`/`busy` when `ctlRef.current === ctl`. Otherwise a cancelled run could clear a newer run's busy state.
   - Keep the `now.item.photo !== photoAtStart` check as a second safety net.
   - With this design, the abort happens synchronously before the photo changes, so render and effect timing no longer matter.
   - It also gives better behaviour: the "Đang phân tích ảnh" busy state ends as soon as the photo is replaced, and the user can run AI on the new photo right away. Today the button stays busy until the old request settles.

2. **Regression test:** add variant A next to the existing test (name it something like "a result arriving right after the photo is replaced is ignored"). Resolving the deferred from inside `spy` when the key is `photo` is deterministic: it fails before the fix and passes after. Keep the existing test and its assertions unchanged. Do not use fake timers here: they do not touch the Scheduler's `setImmediate` path and would only hide the race.

3. **Optional test hardening** (only together with the product fix, never instead of it):
   - Before `d.resolve`, also wait for the commit, for example `await waitFor(() => expect(aiBtn().getAttribute("aria-busy")).toBe("false"))`, which becomes true at once after the fix.
   - Without the product fix, such waits only make the window smaller.

4. **Evidence for impl-log** (acceptance criterion "50 runs + CPU-throttled run"):
   - 50 sequential runs: `for i in $(seq 50); do pnpm exec vitest run src/features/items/Editor.test.tsx || echo FAIL; done`
   - Plus `taskset -c 0,1 pnpm test` once.
   - Natural load does not reproduce the bug reliably, so also describe the scratch `setImmediate`-delay perturbation as the "throttled" proof: 10/10 fail before the fix, all pass after.

## Risks

- **Busy-state ordering:** if `cancel()` resets `busyRef` but the old run's `finally` still resets it unconditionally, a new run started on the new photo could have its `busy` cleared early. The `ctlRef.current === ctl` guard is needed; the reviewer should check it.
- **Notices and errors:** a cancelled run must not show an error. Today `catch` already returns when the signal is aborted. Make sure `cancel()` does not leave an old "filled"/"nothing" notice showing for a new photo, or decide on purpose that it may stay.
- **Undo after a replace:** `record` already compares `applied.photo === item.photo`, so this is unaffected.
- **Scope creep:** the undo ref lag (Finding 5) is the same pattern, but it is a different code path that has not flaked. Put it on the follow-ups list rather than in this diff (R7), unless Ming widens the scope.

## Open questions

1. Should "Bỏ ảnh" (photo removal) during an in-flight AI call be in scope? It is the same race through `update("photo", "")`, and the fix is a one-line `fill.cancel()` call. I recommend including it, with its own small test.
2. Should the undo ref lag (`useAiFill.ts:108`) get its own follow-up ticket? A possible fix there: undo reads `item` from render, or the `latest` ref is assigned during render or in a layout effect.
3. Should the planner record the "abort on photo replace" behaviour change in `work/decisions.md`? It changes visible UX slightly: the busy state ends right away instead of when the old request settles.
