Status: READY

# Plan — BUG-009: Editor test "a result for a replaced photo is ignored" fails intermittently

## Scope summary
Scope reference is the bug report in `work/tickets/BUG-009/ticket.md` (planner rule 9):
- Scope: "Make the test (or, if it is a real race, the code) deterministic; nothing else. Never skip or loosen the assertion."
- Out of scope: "Other flaky tests unless the same cause."
- Feature behaviour protected (`docs/feature-list.md`, F-702 "✨ Tự điền từ ảnh" in the editor): "Fills empty fields only and never overwrites what the user typed; adds an undo option." A suggestion computed for a photo the user has already replaced or removed must not fill the form.
- D42 (`work/decisions.md`): "Every bug fix ships with a regression test that fails before the fix."

### Root cause (confirmed: product race, not only test timing)
Confirmed by reading the code and by the consult's reproduction (`consult-software-architect.md`, Findings 1–4):
- `src/features/items/useAiFill.ts:53-56`: `latest.current = { item, categoryFillable, update }` is refreshed only in a passive `useEffect`, i.e. after the parent's re-render has committed and passive effects have flushed.
- `src/features/items/useAiFill.ts:79-80`: the stale-result guard `if (ctl.signal.aborted || now.item.photo !== photoAtStart) return;` reads that ref.
- `src/features/items/Editor.tsx:120`: `upload` calls `update("photo", url)` after `await preparePhoto(f)` (outside any act/event batch). Nothing aborts the in-flight AI request. Until React renders, commits and flushes passive effects, `latest.current.item.photo` still equals `photoAtStart`.
- If `tagger.tag` resolves in that window, the guard passes and the old photo's suggestion fills all empty fields (7 `update` calls) and `setApplied` records it.
- `src/features/items/Editor.tsx:300-304` ("Bỏ ảnh": `resetPhoto(); update("photo", "")`) is the same path: nothing aborts the request when the photo is removed.
- Why the test flakes (`Editor.test.tsx:632-646`): `waitFor(... spy toHaveBeenCalledWith("photo", blob:...))` at line 642 is satisfied the moment `update` runs (the spy is synchronous, before `setItem` renders). Under CPU contention RTL's `setTimeout(0)` drain can win over React Scheduler's `setImmediate`, so `d.resolve(SUG)` (line 643) lands before the effect flush and line 645 `expect(keysOf(spy)).toEqual(["photo"])` fails with the 7 extra keys.

The test is correct; the product is wrong. Fix the product; keep the test and its assertions unchanged.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The root cause is identified and recorded (test timing vs product race). | This plan's "Root cause" section and the impl-log entry state: product race in `useAiFill.ts:53-56/79-80` (stale ref read), exposed by test timing at `Editor.test.tsx:642-643`. |
| 2 | The test passes 50 consecutive runs of the file and under a CPU-throttled run (evidence in impl-log). | impl-log contains the output summary of: (a) `for i in $(seq 50); do pnpm exec vitest run src/features/items/Editor.test.tsx >/dev/null 2>&1 \|\| echo "FAIL $i"; done; echo done` with zero `FAIL` lines; (b) `taskset -c 0,1 pnpm test` green; (c) the perturbation run described in Approach step 5 (fails before the fix, passes after). Reviewer may rerun (a) with a smaller count (e.g. 10). |
| 3 | If it is a product race, a regression test fails before the fix. | New tests 1 and 2 (below) fail on the pre-fix code and pass after. impl-log records the failing output on the pre-fix code (e.g. `git stash` the two source files, run `pnpm exec vitest run src/features/items/Editor.test.tsx -t "photo is replaced\|photo is removed"`, record failures, `git stash pop`). Reviewer can repeat by reverting `useAiFill.ts` and `Editor.tsx` locally. |
| 4 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green. |
| — | Existing test "a result for a replaced photo is ignored" unchanged. | `git diff main -- src/features/items/Editor.test.tsx` shows only added tests; lines 632-646 untouched. |

## Ming verification after merge
None. (Optional, not required: in the app, start "Tự điền từ ảnh", then pick another photo before it finishes; the button leaves "Đang phân tích ảnh" at once and no field is filled from the old photo.)

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/items/useAiFill.ts` | Add and return `cancel()`; make the `finally` reset busy state only for the current controller. | Root cause: the stale-result guard depends on effect timing; an explicit synchronous abort removes the timing dependency. | No |
| `src/features/items/Editor.tsx` | Call `fill.cancel()` in `upload` immediately before `update("photo", url)` (line 120) and in the "Bỏ ảnh" handler before `update("photo", "")` (line 301-302). | Both are the moments the photo changes (same bug path). | No |
| `src/features/items/Editor.test.tsx` | Add two regression tests in `describe("AI fill")`. No existing test changes. | D42 regression test. | No |

No other files. `work/tickets/BUG-009/impl-log.md` is the implementer's own output as usual.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| 1. `src/features/items/Editor.test.tsx` › `AI fill` › `a result arriving right after the photo is replaced is ignored` | **Regression test, fails before the fix (deterministic).** Consult "variant A": same setup as the existing replaced-photo test, but capture the signal (`mkAi(undefined, (_b, s) => { signal = s; return d.promise; })`) and make the spy resolve the deferred synchronously when the photo changes: `spy.mockImplementation((k) => { if (k === "photo") d.resolve(SUG); })`. Click the AI button, wait for `tag` to be called, change the gallery input with a new file, then `await waitFor(() => expect(aiBtn().getAttribute("aria-busy")).toBe("false"))`, flush once more (`await act(async () => {})` or `await d.promise`), and assert `expect(keysOf(spy)).toEqual(["photo"])`, `expect(signal!.aborted).toBe(true)`, and no undo button (`screen.queryByRole("button", { name: EDITOR_COPY.ai.undo })` is null). Before the fix: fails with `+ "name", "category", "colors", "seasons", "material", "brand", "tags"` (reproduced by the consult). No fake timers (they do not cover the Scheduler's `setImmediate` path and would hide the race). |
| 2. `src/features/items/Editor.test.tsx` › `AI fill` › `removing the photo while pending cancels the request` | "Bỏ ảnh" path. Pending `tag` (`new Promise(() => {})` or a deferred) with the signal captured; click AI, wait for `tag`, click "Bỏ ảnh". Assert synchronously after the click: `signal!.aborted === true` and `aiBtn().getAttribute("aria-busy") === "false"`. Then resolve the deferred with `SUG`, flush, and assert `keysOf(spy)` contains no AI field (only `photo`, `removedPhotoId`, `photoPath`). Before the fix it fails deterministically on `signal.aborted` (nothing aborts on removal) and on `aria-busy` ("true" until the old request settles). |

Existing tests that change: **none**. In particular "a result for a replaced photo is ignored" (lines 632-646) keeps its code and assertions. The consult's optional hardening (extra `aria-busy` wait before `d.resolve`) is **not** added: after the fix the test is deterministic without it, and editing it is not needed.

## Approach
1. **`useAiFill.ts`**
   - Add:
     ```ts
     const cancel = () => {
       const c = ctlRef.current;
       if (!c) return;
       ctlRef.current = null;
       c.abort();
       busyRef.current = false;
       setBusy(false);
     };
     ```
     No-op when no request is in flight. It does not touch `notice`/`error`: `run` already clears both when it starts, so an in-flight run has none showing; a completed run's notice keeps today's behaviour (its undo hides itself via `applied.photo === item.photo`, line 105).
   - Change the `finally` (lines 99-102) so a cancelled run cannot clear a newer run's busy state:
     ```ts
     } finally {
       if (ctlRef.current === ctl) {
         ctlRef.current = null;
         busyRef.current = false;
         if (!ctl.signal.aborted) setBusy(false);
       }
     }
     ```
     (Unmount abort keeps `ctlRef.current === ctl`, so the unmount path behaves as today; `ctlRef.current?.abort()` in the unmount effect tolerates `null`.)
   - Keep the `now.item.photo !== photoAtStart` check at line 80 as a second safety net; the `ctl.signal.aborted` check there and in `catch` (line 93) already make a cancelled run return silently with no error shown.
   - Return `cancel` from the hook.
2. **`Editor.tsx`**
   - In `upload`, call `fill.cancel()` on the line before `update("photo", url)` (line 120), i.e. only once the new photo is actually committed (not on a stale `seq` or on a prep error, so a failed pick leaves the running request alone).
   - In the "Bỏ ảnh" `onClick`, call `fill.cancel()` before `update("photo", "")`.
   - `fill` is declared at line 95, before `upload` (line 109) and the JSX, so no reordering is needed.
3. Add tests 1 and 2. First run them against the unfixed source to record the failure (AC 3), then apply steps 1-2 and rerun.
4. Run checks (`pnpm format`, then format:check, typecheck, test, build).
5. **Evidence (AC 2), recorded in impl-log:**
   - 50 sequential runs of the file (command in AC table), count of failures (must be 0).
   - `taskset -c 0,1 pnpm test` once (full suite on 2 cores), result.
   - Perturbation run (stands in for "CPU-throttled", because natural load rarely reproduces it; consult Finding 3): temporarily add at the top of `Editor.test.tsx`
     `vi.hoisted(() => { const si = globalThis.setImmediate; globalThis.setImmediate = ((fn: (...a: unknown[]) => void, ...a: unknown[]) => setTimeout(fn, 3, ...a)) as typeof si; });`
     and run `pnpm exec vitest run src/features/items/Editor.test.tsx -t "AI fill"` 10 times on the pre-fix source (expect "a result for a replaced photo is ignored" to fail) and 10 times after the fix (expect all to pass). **Remove the shim before committing**; the final diff must not contain it. If the shim also makes unrelated tests in the file fail, record that and limit the run to `-t "photo is replaced|replaced photo|photo is removed"`.
6. Rules: R1 untouched (no data access change). R6: no new UI copy. R7: only the three files above. R8: changed hook logic is covered by tests 1-2 plus the existing AI fill tests (busy, unmount abort, second tap). R9: no layout change.

## Specialist input used
From `consult-software-architect.md`:
- **Adopted** — Verdict "product race": confirmed against `useAiFill.ts:53-56,79-80` and `Editor.tsx:120,301`.
- **Adopted** — Recommendation 1 (`cancel()` in the hook, called at photo replace and at "Bỏ ảnh"; `ctlRef.current === ctl` guard in `finally`; keep the photo check as a safety net). Refined: `cancel()` is a no-op without an in-flight request, and the `finally` also clears `ctlRef`.
- **Adopted** — Recommendation 2 (variant A regression test, no fake timers), as test 1, plus a signal-aborted assertion.
- **Rejected** — Recommendation 3 (extra wait in the existing test): unnecessary after the fix and it would change an existing test; the ticket says not to loosen it, and keeping it untouched is the cleaner proof.
- **Adopted** — Recommendation 4 (evidence: 50 runs, `taskset`, perturbation shim), as Approach step 5.
- **Risks adopted**: busy-state ordering (guard in `finally`, reviewer checks it); cancelled run shows no error (existing `aborted` checks); notices — decided on purpose: `cancel()` does not clear an old notice (none exists for an in-flight run).
- **Open question 1 (Bỏ ảnh)**: in scope — same bug path, one call, own test (test 2).
- **Open question 2 (undo ref lag, `useAiFill.ts:108`)**: not the same fix (different code path, never seen to flake naturally) → follow-up (R7).
- **Open question 3 (record UX change in decisions.md)**: not needed as a decision; recorded below as an assumption. The orchestrator may mention it in the PR body.

## Assumptions
- **Visible UX change (intended):** replacing or removing the photo while "Đang phân tích ảnh" is showing now ends the busy state at once and aborts the old request; the user can run AI on the new photo right away. Today the button stays busy until the old request settles and its result is then discarded. This is a bug-fix consequence within F-702, not new scope.
- The aborted request still costs one provider call if it already reached the server; cancelling only stops the client from waiting/applying it. Same as unmount today.
- A photo pick that fails preparation or is superseded (`seq` mismatch) does not cancel the running request, because the photo did not change.
- Hotspots: no ticket is in `IN_PROGRESS`, `REVIEW` or `DONE` on `work/backlog.md`. `Editor.tsx` is listed by other backlog plans (e.g. F-202.1), so a rebase may be needed later.
- The "Duplicate" action (`Editor.tsx:487-490`, `resetPhoto(); onDuplicate()`) is not touched; whether a pending AI run should cancel on duplicate is a follow-up question.

## Follow-ups (not in this diff, R7)
- Undo reads `latest.current.item` (`useAiFill.ts:108-109`), refreshed in a passive effect; under heavy perturbation `"Hoàn tác" restores the previous values` failed 4/4 (consult Finding 5). Possible fix: read `item` from render in `undo`, or assign the ref during render / in a layout effect. Suggest a `BUG-xxx` ticket.
- Consider cancelling a pending AI run on "Nhân bản" (duplicate), `Editor.tsx:489`.

## Blocking questions
None.

## Split proposal
None (expected diff well under 100 lines).
