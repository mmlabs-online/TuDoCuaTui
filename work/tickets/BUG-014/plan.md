Status: READY

# Plan — BUG-014: "−1" wear button is enabled at 0 wears and still sends a request

## Scope summary
This is a bug ticket, so the scope reference is the bug report in `work/tickets/BUG-014/ticket.md`:

- Expected: "\"−1\" is disabled when the wear count is 0, and no request is sent."
- Actual: "Enabled; a no-op request is sent."
- Scope: "Disable \"−1\" when `item.wearCount === 0`."
- Out of scope: "The server-side wear endpoint."

Related scope source, `docs/feature-list.md`:
- line 43: "**Wear log (lần mặc):** one row per item per day worn. `wear_count` and `last_worn` are derived from these rows, never stored." The fix reads `item.wearCount` and stores nothing (R5).
- line 72: the smoke-test flow "edit → wear today / undo". "−1" is the undo, and it must still work when the count is above 0.

**Root cause (confirmed, line number corrected):** `src/features/items/Editor.tsx:330` (the ticket says 328) renders
`<Btn onClick={() => onWorn(-1)}>−1</Btn>` with no `disabled` prop. The button is inside the `!isNew` wear bar
(`Editor.tsx:314-336`), and the count shown comes from `item.wearCount` (`Editor.tsx:321`). `Btn`
(`src/components/Btn.tsx:1-12`) spreads `...props` onto a native `<button>`, so a `disabled` prop works without changing `Btn`.
The click goes from `onWorn(-1)` to `App.tsx` (`wardrobe.wear(editor, -1)`) to `repo.http.ts` `POST /items/:id/wear`. The server
treats it as a no-op at 0, which explains "nothing changed".

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: it fails on `main` before the fix and passes after | `Editor.test.tsx` › `wear bar` › "−1 is disabled at 0 wears". The implementer records in impl-log that this test fails with the `Editor.tsx` change stashed or reverted and passes with it. The reviewer can repeat this with `git stash` on `Editor.tsx` only and `pnpm test -- Editor`. |
| 2 | "−1" is disabled when the wear count is 0, and no request is sent | The test from row 1 asserts `button.disabled === true` and that `onWorn` is not called after a click. `onWorn` is the only path to the request (consult: no other caller). Also covered by the companion tests "−1 is enabled above 0 wears and calls onWorn(-1)" and "Mặc hôm nay stays enabled at 0 wears". Reading the diff: one line changed in `Editor.tsx`, adding `disabled={item.wearCount <= 0}`. |
| 3 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` are all green, with output recorded in impl-log. |
| 4 | R9: the disabled state is visible at 390px and in dark mode | Code check, no CSS change needed. `src/index.css:42-45` (`@layer base`) already has `button:disabled { cursor: not-allowed; opacity: 0.6; }`. It applies to every `<button>`, including `.btn` in `.wear-bar` in both themes. No unlayered rule sets `opacity` or `cursor` on `.btn` or `.wear-bar .btn` (`index.css:121-137`, `1445-1456`, `2038-2045`, `2797-2803` set only border, colour and size). Optional: a one-off Playwright screenshot at 390px, light and dark, recorded in impl-log if the implementer has Playwright available. It is not required, because the dimming rule is shared with the existing disabled Save and AI buttons. |

## Ming verification after merge
- On the released build: open an item with "Đã mặc 0 lần". "−1" looks dimmed, and clicking it sends no `/api/items/:id/wear` request (DevTools Network). After one "Mặc hôm nay", "−1" is enabled and undoes the wear. This is the UAT-5 re-check from `work/uat/2026-11-20-uat-v0.3.1.md`.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/items/Editor.tsx` | Line 330: add `disabled={item.wearCount <= 0}` to the "−1" `Btn`. No other change. | The bug's root cause | No |
| `src/features/items/Editor.test.tsx` | Add a new `describe("wear bar")` block with 3 tests, appended at the end of the file | Regression test (D42) and guard against disabling too much | No |

No change to `Btn.tsx`, `App.tsx`, `repo.http.ts`, `index.css`, `copy.ts` or `server/**`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/items/Editor.test.tsx` › `wear bar` › "−1 is disabled at 0 wears" (**regression test, written first, fails before the fix**) | Render `<Editor {...props(item)} isNew={false} onWorn={onWorn} />` with `item = { ...blankItem(), id: "i1", wearCount: 0 }` and `onWorn = vi.fn()`. Get `screen.getByRole("button", { name: "−1" })`, using U+2212 copied from `Editor.tsx`. Assert `(btn as HTMLButtonElement).disabled` is `true`, then `fireEvent.click(btn)` and `expect(onWorn).not.toHaveBeenCalled()`. Before the fix the button is enabled and the click calls `onWorn(-1)`, so the test fails. |
| `Editor.test.tsx` › `wear bar` › "−1 is enabled above 0 wears and calls onWorn(-1)" | Same setup with `wearCount: 2`. Asserts `disabled === false`, and that a click calls `onWorn` once with `-1`. Guards against disabling too much. |
| `Editor.test.tsx` › `wear bar` › "Mặc hôm nay stays enabled at 0 wears" | With `wearCount: 0`, get the button with `getByRole("button", { name: /Mặc hôm nay/ })`. Asserts `disabled === false`, and that a click calls `onWorn(1)`. |

Note: `@testing-library/jest-dom` is not set up (`src/test/setup.ts` only clears localStorage). Use `.disabled` as the
existing tests do (e.g. `Editor.test.tsx:198, 505`), not `toBeDisabled()`.

## Approach
1. Add the `describe("wear bar")` block with the three tests to `Editor.test.tsx`. Run `pnpm test -- Editor` and record in
   impl-log that "−1 is disabled at 0 wears" fails while the other two pass.
2. In `Editor.tsx:330`, change the button to `<Btn disabled={item.wearCount <= 0} onClick={() => onWorn(-1)}>−1</Btn>`.
   `<= 0` matches the ticket's `=== 0` for every valid count and also covers an unexpected negative value.
3. Re-run the tests, all green. Run `pnpm format`, then all checks: `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
4. Rules:
   - R1: no data access changes.
   - R5: reads the derived `wearCount` and stores nothing.
   - R6: no new copy. The "−1" literal stays inline as it is today.
   - R7: diff limited to the two files above.
   - R8: regression test plus companion tests.
   - R9: the existing global `button:disabled` style covers light and dark at every width (row 4 above).

## Specialist input used
From `consult-frontend-developer.md`:
- Adopted recommendation 1: `disabled={item.wearCount <= 0}` on line 330 only, with "Mặc hôm nay" untouched.
- Adopted recommendation 2: the regression test, the `wearCount: 2` companion test and the "Mặc hôm nay" check, all in their own `describe`. Changed: `.disabled` instead of `toBeDisabled()`, because jest-dom is not installed.
- Adopted recommendation 3: no server guard, which is out of scope per the ticket. Open question 3 resolved: keep the 200 no-op response and open no ticket.
- Open question 1 (recommendation 4) resolved from the code: `src/index.css:42-45` already styles `button:disabled` with opacity 0.6 and `cursor: not-allowed` for both themes. No override exists for `.wear-bar .btn`, so no CSS change.
- Open question 2 resolved with its default: the "−1" literal is not moved into `EDITOR_COPY`.
- Adopted recommendation 5: no optimistic state, and `App.tsx` stays untouched.
- Adopted risk: keep the diff tight because of BUG-015 (see Assumptions).
- Rejected for this ticket: disabling the button while a request is in flight (the double-click race). It goes to follow-ups (R7).

## Assumptions
- **Hotspot:** BUG-015 (BACKLOG) edits the same wear bar in `Editor.tsx` (last-worn label, lines 322-326) and likely
  `Editor.test.tsx`. BUG-016 (BACKLOG) touches the Editor container. Neither is open (`IN_PROGRESS`/`REVIEW`/`DONE`)
  yet. BUG-014 runs first, and BUG-015/BUG-016 rebase onto it. The new tests use role and name queries only, with no `dialog` assumption.
- `.btn:hover` still draws its hover ring (`index.css:1453-1456`) on a disabled "−1" on desktop. This is existing behaviour shared
  by every disabled `.btn`, and it is not changed here. It becomes a follow-up only if Ming finds it confusing.
- A stale editor (two tabs) showing 0 while the server has a log would block "−1" until the editor is reopened. This is acceptable and out of scope (consult).
- Follow-up candidate, not in this diff: disable "−1" and "Mặc hôm nay" while a wear request is in flight, to stop the
  double-click race at count 1. Server-side it is a harmless no-op.

## Blocking questions
None

## Split proposal
None
