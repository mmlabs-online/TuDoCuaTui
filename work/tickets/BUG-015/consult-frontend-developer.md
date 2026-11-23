**Findings**

- **Two separate label paths, no shared formatter.**
  - Card: `src/features/items/ItemCard.tsx:38-47`, in the `wear-pill`. It uses `EDITOR_COPY.wear.neverWorn` for an empty `lastWorn`. Otherwise it picks `days > 365` → `"hơn 1 năm"`, `days === 0` → `"hôm nay"`, else `` `${days} ngày` ``. The three literals are inline in JSX, which already violates R6.
  - Editor: `src/features/items/Editor.tsx:322-326`, in the `wear-bar` `<small>`. It uses `` `Lần cuối ${ageInDays(item.lastWorn)} ngày trước` `` when `lastWorn` is set, otherwise the literal `"Chưa có lịch sử"`. It has no 0-day or >365-day handling.
- **The date logic is already shared and correct.**
  - `ageInDays` in `src/features/items/filters.ts:7` calls `daysSince` in `src/lib/dates.ts:26`. That compares local calendar dates through `toLocalDate` and `localDate`, and it clamps at 0, so UTC vs UTC+7 is handled.
  - The bug is only in the wording. Nothing in the date maths needs to change.
  - The card receives `age` as a prop, injected from `ItemGrid.tsx:58` as `ageInDays`. The editor calls `ageInDays` directly.
- **Copy home.** `src/features/items/copy.ts` has `EDITOR_COPY.wear` with `neverWorn`, `worn`, `alreadyWorn` and `adjusted`. It is the natural place for the new strings. `src/features/outfits/copy.ts` also has a `neverWorn: "Chưa mặc lần nào"`, which is a different string for a different place.
- **Existing tests.**
  - `ItemCard.test.tsx` has a "wear pill" describe with a `renderAt(now, lastWorn)` helper. It uses `vi.useFakeTimers({toFake:["Date"]})` and a `+07:00` system time, and covers "hôm nay" and "1 ngày".
  - `filters.test.ts` covers `ageInDays` at the UTC+7 edges.
  - `Editor.test.tsx` has no wear-bar test on `main`. Its `props()` helper takes `isNew` (default `true`) and an `onWorn` mock, and `renderEditor(update, item, isNew)` exists. A wear-bar test needs `isNew=false`.
  - Editor tests don't pin time, so a "worn today" test must use a `lastWorn` of today. Use `vi.useFakeTimers({toFake:["Date"]})` plus an explicit `lastWorn` date string, as `ItemCard.test.tsx` does.

**Recommendations** (acceptance criteria 1 and 2, R6, R8)

1. **Add a formatter in `src/features/items/copy.ts`.**
   - Add `EDITOR_COPY.wear.today: "hôm nay"`, `overYear: "hơn 1 năm"` and `days: (n) => \`${n} ngày\``.
   - Export a pure helper, e.g. `lastWornLabel(lastWorn: string, days: number)` or `formatLastWorn`. It should return `neverWorn` for an empty value, `overYear` for more than 365 days, `today` for 0, and `N ngày` otherwise.
   - Pass the day count in as a parameter, because the card receives `age` by prop.
2. **Use it in the card.** Replace the nested ternary in `ItemCard.tsx` with a call to the helper.
3. **Use it in the editor.**
   - Show `Lần cuối ${label}`. For 0 days that gives "Lần cuối hôm nay".
   - For 1 or more days it gives "Lần cuối N ngày", which drops the word "trước" that the editor used. The ticket expects "the same N ngày rules", so that is the intended outcome. Decide whether to keep "ngày trước" in the editor (see open question 1).
   - Move "Chưa có lịch sử" into copy as well, or leave it as out of scope.
4. **Regression test (fails on `main`).** In `Editor.test.tsx`, add `describe("last worn label")`. Render with `isNew=false` and an item with `lastWorn` set to today's date, with fake `Date`. Assert that `getByText("Lần cuối hôm nay")` is present and that `/0 ngày/` is absent.
   - On `main` the editor renders "Lần cuối 0 ngày trước", so this fails.
   - Add small unit tests for the formatter itself: 0, 1, 365, 366 and empty.
   - Add a card-versus-editor parity test, ideally at 02:00 UTC+7.
5. **Merge order with BUG-014.**
   - BUG-014 edits `Editor.tsx` near line 330 (the "−1" button) and appends `describe("wear bar")` to `Editor.test.tsx`.
   - Put the BUG-015 test in a separately named describe, e.g. `"last worn label"`, placed away from the end of the file.
   - Keep the `Editor.tsx` change to lines 322-326 only. This avoids textual conflicts, because lines 322-326 sit just before the BUG-014 hunk at 330.
   - If BUG-014 merges first, rebase and reuse its helper for rendering the wear bar.

**Risks**

- The BUG-014 branch (`origin/ticket/BUG-014`) was not diffed here. The conflict analysis comes from the ticket description, so confirm on rebase.
- `Editor.tsx:324` and the `ItemCard` code may have moved on the BUG-014 or BUG-011 branches. BUG-011 is described as already merged, and `main` shows `neverWorn` used on the card only. Its card change is already in this file.
- The ticket's Root cause cites `Editor.tsx:322` and `ItemCard.tsx:39`. Current lines are 324 and 40-46, so the line numbers have drifted. The finding itself is unchanged.
- The `daysSince` result is unclamped for future dates and capped at 0. A "worn" date in the future therefore shows "hôm nay", which is acceptable.
- A `999` fallback from `ageInDays` for an invalid date would give "hơn 1 năm". The editor currently guards this with the `item.lastWorn` check, so keep that guard.
- The Playwright and `App.test.tsx` suites assert on "Mặc hôm nay" and `/hôm nay/` text. The new editor text "Lần cuối hôm nay" could add duplicate matches for `getByText(/hôm nay/)` in a combined render (grid plus editor). Check for this at `App.test.tsx:249`.

**Open questions**

1. In the editor, should the suffix stay "ngày trước" for N ≥ 1 ("Lần cuối 3 ngày trước") with only 0 changed to "hôm nay", or be fully unified with the card ("Lần cuối 3 ngày")? Proposed default: the formatter returns the card wording and the editor prefixes "Lần cuối". The ticket's "same N ngày rules" supports this.
2. Is the editor's "Chưa có lịch sử" for never-worn items in scope? BUG-011 owns the never-worn wording. Proposed default: leave it as is, but move the literal into `EDITOR_COPY` only if the helper is touched anyway.

Relevant files:
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\Editor.tsx`
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\ItemCard.tsx`
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\copy.ts`
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\filters.ts`
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\lib\dates.ts`
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\Editor.test.tsx`
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\items\ItemCard.test.tsx`
