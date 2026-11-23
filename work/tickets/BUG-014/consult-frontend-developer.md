**Findings**
- The bug is confirmed at `src/features/items/Editor.tsx:330`. `<Btn onClick={() => onWorn(-1)}>−1</Btn>` has no `disabled` prop. The wear box is rendered only when `!isNew` (lines 314-336), and the count comes from `item.wearCount` (line 321).
- `Btn` (`src/components/Btn.tsx`) spreads `...props` onto a native `<button>`, so `disabled` works as is. No change to `Btn` is needed.
- Data path:
  - `Editor` calls the `onWorn(delta)` prop.
  - In `src/App.tsx:238-254` that calls `wardrobe.wear(editor, delta > 0 ? 1 : -1)`.
  - `wear` in `src/data/repo.http.ts:113-124` does `POST /items/:id/wear` with `{delta, today}`.
  - The response is mapped to `{wearCount, lastWorn, already}` and written back to the editor state.
  - There is no other caller. `grep` finds the wear UI only in `Editor.tsx`, so the item card has no "−1".
- The server (`server/items.js:169-191`, route in `server/api.js:58, 217`) deletes the latest `wear_logs` row only if one exists, then returns the stats. At 0 wears this is a harmless no-op, and the count never goes negative. That matches the report ("nothing changed").
- Test infrastructure: `src/features/items/Editor.test.tsx` already has `props()`/`renderEditor(update, item, isNew)` helpers and an `onWorn: vi.fn()` default. `blankItem()` comes from `./blankItem`, and `Item` has `wearCount`.

**Recommendations**
1. Fix (acceptance criterion 2): in `Editor.tsx:330` change the button to `<Btn disabled={item.wearCount <= 0} onClick={() => onWorn(-1)}>−1</Btn>`. Use `<= 0` so a bad value (a negative number or undefined coerced) can't enable it. Don't touch the "Mặc hôm nay" button.
2. Regression test (acceptance criterion 1), in `Editor.test.tsx`: add a `describe("wear bar")` (or a single test) named "−1 is disabled at 0 wears".
   - Render with `{ ...blankItem(), id: "i1", wearCount: 0 }`, `isNew=false`, and an `onWorn` mock. `renderEditor` doesn't expose `onWorn`, so render `<Editor {...props(item)} isNew={false} onWorn={onWorn} />` directly.
   - Get the button with `screen.getByRole("button", { name: "−1" })`. The character is U+2212, so copy it from `Editor.tsx`, or export it as a constant in `copy.ts` if the file prefers that (R6).
   - Assert `toBeDisabled()`, then `fireEvent.click` and assert `expect(onWorn).not.toHaveBeenCalled()`.
   - This fails before the fix, because the button is enabled and the click calls `onWorn(-1)`.
   - Add a companion test with `wearCount: 2`: the button is enabled and the click calls `onWorn(-1)`. This guards against over-disabling.
   - Also assert that "Mặc hôm nay" stays enabled at 0.
   - Note on `fireEvent.click` on a disabled button: React won't fire the handler, so the `not.toHaveBeenCalled` assertion is only meaningful together with `toBeDisabled`. Keep both.
3. A server guard is not needed for this ticket. The ticket's out-of-scope line says "The server-side wear endpoint", so the server stays as it is. The existing endpoint already tolerates `-1` at 0 with a no-op 200. If Ming wants a 409 or a "nothing to remove" response, make it a separate ticket. I'd keep the current no-op behaviour (idempotent, and safe against multi-tab races).
4. R9: the disabled state needs a dark-mode and 390px check. Check that `.btn:disabled` has a style in the CSS (grep `btn` in `src/**/*.css`). The other `disabled` buttons in the editor (lines 217, 508) probably already rely on it. If there is no `:disabled` style, the button would look enabled and only fail to respond. Verify this in the plan; adding a style would be a small in-scope CSS change.
5. Don't update local state optimistically; `App.tsx` stays untouched. The UI guard is enough.

**Risks**
- BUG-015 edits the same wear box (the last-worn label at `Editor.tsx:322-326`, plus the card). There is a likely merge conflict in `Editor.tsx` and `Editor.test.tsx` around lines 320-335. Keep this diff to the single line 330 plus the new tests, put the tests in their own `describe`, and run BUG-014 first (it is XS and earlier in the board). BUG-015 should rebase onto it.
- BUG-016 (modals' dialog semantics and focus handling) touches the Editor container, and possibly `getByRole("button")` queries if roles or labels change. Role-based queries by name `−1` are stable. Avoid `getByRole("dialog")` assumptions in the new test.
- Race: at wear count 1, a double-click on "−1" before the response returns sends two requests. The second is a harmless no-op server-side. Making the button disabled while a request is in flight would be a separate follow-up (R7), not part of this diff.
- `wearCount` is only refreshed from the server response, or from the list when the editor opens. A stale editor (two tabs) could show 0 although the server has a log, which would block "−1" until reopening. This is acceptable and out of scope.

**Open questions**
1. Does `.btn:disabled` have a visible style, including in dark mode? This decides whether a CSS tweak is needed for R9 (default: check in the plan; if missing, add a minimal `opacity` and `cursor` rule, in scope).
2. Should the `−1` literal move into `EDITOR_COPY`? Default: no, because the label is already an inline literal and extracting it would widen the diff.
3. A server response for `-1` at 0 (currently 200 no-op): keep it? Default: keep, and open no ticket unless Ming asks.

Files: `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\Editor.tsx`, `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\Editor.test.tsx`, `D:\Projects\SAF\spaceM\projects\tudocuatui\src\App.tsx`, `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\repo.http.ts`, `D:\Projects\SAF\spaceM\projects\tudocuatui\server\items.js`, `D:\Projects\SAF\spaceM\projects\tudocuatui\src\components\Btn.tsx`.
