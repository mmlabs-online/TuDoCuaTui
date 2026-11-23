T-032 consult report (read-only; I did not read src/features/settings or App wiring, so the Settings-link point below is unverified).

## Findings
- **season type**
  - `AiSuggestInput.season` is `string` at `src/data/aiOutfits.ts:11`. `DbSeason` is exported from `src/data/mappers.ts:4`.
  - `SEASON_TO_DB` is `Record<string, DbSeason>` (`mappers.ts:117`), but `OutfitsModal.tsx:112` annotates `const seasonId: string | undefined`. That annotation widens the type, so the narrowing would not take effect until it becomes `DbSeason | undefined`.
  - The tests pass the literal `"winter"` (`aiOutfits.test.ts:13` and `:55`), which is already a valid `DbSeason`.
  - The ticket's "passing a label fails typecheck" can be shown with a `// @ts-expect-error` line in a test. `pnpm typecheck` covers test files only if tsconfig includes them, so confirm that.
- **cleanReason** is at `suggest.ts:244-258`. Two nits from the F-704.4 review (`review.md` lines 38-39):
  1. U+2028 and U+2029 are deleted in the strip regex, while `\n` and `\t` collapse to a space. So "a\u2028b" becomes "ab" but "a\nb" becomes "a b". Fix: remove `\u2028\u2029` from the strip class. JS `\s` already matches them, so `\s+` turns them into a space.
  2. The 120-code-point cut happens after `trim()`, so a cut that lands on a space leaves a trailing space. Fix: add `.trimEnd()` after the `join`.
  - Existing tests are at `suggest.test.ts:489-503`. The test "removes bidi, zero-width, line/paragraph separators and controls" (about line 489) probably expects U+2028/2029 to be removed. It will need updating to expect a space, which is a deliberate behaviour change. New tests: U+2028 between words gives "a b"; a string cut at a space has no trailing space.
- **Toggle hiding**
  - The toggle renders at `OutfitsModal.tsx:209` under `{ready && ...}`.
  - The rule-empty state is `outfits.length === 0` (`:228`).
  - Change the condition to `ready && outfits.length > 0`. `status === "loading"` is not needed in the condition.
  - Side effect: `aiOn` stays true if the user toggled it earlier and the set later becomes empty. It is harmless, because `eligible` already requires `outfits.length > 0` (`:114`), but the AI note block is also inside the non-empty branch.
  - Possible flicker: while weather is loading, `outfits` is computed with `w` undefined. The toggle could appear, then vanish if the weather result empties the set. This is acceptable.
  - Test to add in `OutfitsModal.test.tsx`: AI ready plus an empty rule set means `queryByRole("switch")` is null. The existing `it.each` toggle-visibility cases are around the F-704.5 tests, so the new test fits near them.
- **Dark-mode checkbox**
  - CSS is at `index.css:3048-3052`: `accent-color: var(--green)`.
  - The F-704.5 review says it renders a light check on a dark fill and is readable, and matches `.check-row input`. This is cosmetic.
  - Options: leave `accent-color`, or set a theme-variable-based colour for `.dark`. For example, add `.dark .outfit-ai-toggle input { accent-color: <existing dark-safe var> }`, or use `color-scheme: dark`.
  - Check which vars `.dark` defines. R9 allows only existing theme variables.
  - Consider changing `.check-row input` as well, to keep consistency. Changing only the toggle would diverge from it.
  - Verify with the one-off Playwright run at 390 px in dark mode, per D42, as the ticket says.
- **Settings link**: the note is text-only today, and a link needs an `onOpenSettings` prop threaded from App to the modal, so check App wiring first. The F-704.5 review lists it as a follow-up, and the ticket says to leave it text-only if the wiring is not minimal.

## Hotspots with other tickets
- BUG-012 and BUG-013 are merged. Their tests (`OutfitsModal.test.tsx` around lines 583-660) already live in the same test file. Rebase and run the modal tests together.
- F-707.1 to F-707.4 (BACKLOG, P1) will touch the same files:
  - **F-707.1** adds the occasion enum and prefilter in `suggest.ts` (`candidatePool`, `eligibility`).
  - **F-707.2** changes the `aiOutfits.ts` request shape (the occasion is added to `AiSuggestInput`).
  - **F-707.4** reworks `OutfitsModal.tsx` so AI runs only on an explicit tap. That likely removes or reworks the AI toggle (`:209-225`) and the `aiOn`/`eligible` logic.
- Consequence: the toggle-hiding and dark-mode toggle items may be thrown away by F-707.4. Keep them minimal, or consider deferring them to F-707.4. The `season: DbSeason` narrowing and the `cleanReason` fixes are independent and low-conflict. T-032 has no dependency on F-707, so it should merge first, with F-707.x rebasing.
- Also note F-707.2 might add `occasion` to `AiSuggestInput`. Keep this ticket's `aiOutfits.ts` diff to one line.

## Recommendations
1. AC1 (season): in `aiOutfits.ts`, `import type { DbSeason } from "./mappers"` and set `season: DbSeason`. In the modal, annotate `seasonId` as `DbSeason | undefined`.
2. AC2 (cleanReason): make the two edits above and update the U+2028/2029 test.
3. AC3: change the toggle condition to `ready && outfits.length > 0` and add the modal test.
4. AC4: a small `.dark` override using existing theme vars, with Playwright evidence.
5. Settings link: skip unless App already passes an open-settings callback. Record the decision in impl-log.

## Risks
- Low overall; the change is UI and type only, with no server or High-path files.
- The U+2028/2029 behaviour change flips an existing test's expectation. Document it in impl-log as a deliberate change.
- Hiding the toggle mid-load may cause a visual flicker.
- Merge conflicts with F-707.4 (see above).

## Open questions
1. Is the toggle going to survive F-707.4? Given the occasion picker with AI on an explicit tap, should the toggle polish (items 3 and 4) be dropped or folded into F-707.4? The proposed default is to do them anyway, since they are small.
2. For dark mode, which existing variable do we use, or is `color-scheme` acceptable? The proposed default is a `.dark` accent override shared with `.check-row input`.
3. Does tsconfig include test files, so that a `@ts-expect-error` line makes typecheck enforce AC1? The proposed default is to add one in `aiOutfits.test.ts`.

Files: D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\aiOutfits.ts, D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\outfits\suggest.ts, D:\Projects\SAF\spaceM\projects\tudocuatui\src\features\outfits\OutfitsModal.tsx, D:\Projects\SAF\spaceM\projects\tudocuatui\src\index.css (3038-3056), D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\mappers.ts, D:\Projects\SAF\spaceM\projects\tudocuatui\work\tickets\F-704.4\review.md, D:\Projects\SAF\spaceM\projects\tudocuatui\work\tickets\F-704.5\review.md
