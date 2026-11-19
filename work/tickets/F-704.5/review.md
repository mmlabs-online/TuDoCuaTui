Verdict: REWORK

## Attempt 1 — 2026-11-19
Verdict: REWORK

### Checks (run by reviewer)
- `pnpm typecheck`: app and server `tsc` both clean.
- `pnpm format:check`: "All matched files use the correct format."
- `pnpm test`: 137 files passed and 11 skipped; 1917 tests passed and 222 skipped. Same as impl-log.
- `pnpm build`: built with no errors.

### Mutation check (scratch copy, `rv-f7045/repo`, not committed)
I made 20 single-line mutations to `OutfitsModal.tsx` and ran `OutfitsModal.test.tsx` after each one. **All 20 were
caught.** The mutations:
- removed the abort cleanup;
- removed the late-answer guard;
- sent `season` as the label (`"Hạ"`);
- used `weatherKind(undefined)`;
- removed the `status !== "loading"` wait;
- removed `disabled={aiLoading}`;
- removed `aria-busy`;
- removed `clearTimeout` from the weather cleanup;
- removed `.finally(clearTimeout)`;
- started with `aiOn` true;
- showed the switch whenever `ai` is set;
- rendered the reason with `dangerouslySetInnerHTML`;
- sent `avoidIds = []` on shuffle;
- always sent rule ids as `avoidIds`;
- showed a note for an empty result;
- changed `pool.length >= 1`;
- removed `setAiOutcome(null)` on toggle;
- ignored the error code;
- removed the loading text;
- removed the AI chip.

The tests check the behaviour itself, not the implementation.

### Acceptance criteria (plan verification table)
- [x] 1. AI on shows the AI outfits with the chip and the reason, and no rule chips. Evidence: "AI on: shows AI outfits with chip and reason" passes, and the chip-removal mutation is caught.
- [x] 2. The request uses the pool ids, season DB id `"summer"` and the weather flags from the same snapshot. Evidence: "AI on: sends pool ids…" and "weather: waits for weather, then one call with its flags" pass. `OutfitsModal.tsx:97` computes one `w`, which feeds `suggestOutfits`, `candidatePool` and `weatherKind`.
- [x] 3. The toggle is hidden unless AI is ready. Evidence: the 5 `it.each` cases pass.
- [x] 4. The toggle is off on each open and nothing is called before a tap. Evidence: "toggle is off on open…" and "reopen…" pass. `useState(false)` is at `:107`.
- [x] 5. Each error code shows its own note from `OUTFITS_COPY.ai.note`, through `copy.ts` only (R6). Evidence: 8 `it.each` cases plus the plain-`Error` case. `copy.test.ts` covers every code in `AI_ERROR_STATUS` and `AI_CLIENT_ERROR_CODES` and checks the exact texts.
- [x] 6. An empty result shows no note. Evidence: 2 cases pass.
- [x] 7. Loading dims the cards, sets `aria-busy`, shows the status line and disables shuffle. Evidence: "loading: cards stay dimmed, shuffle disabled" passes. Playwright also shows `aria-busy=true`, "Đang nhờ AI gợi ý…" and a disabled shuffle button.
- [x] 8. Shuffle sends `avoidIds`: the AI piece ids, or the rule ids after an error. Evidence: both tests pass. Playwright shows that the second request has `avoidIds` and the first has none.
- [x] 9. Close, toggle-off and shuffle abort the call, and a late answer is ignored. Evidence: "close aborts", "toggle off aborts…" and "late answer…" pass.
- [ ] 10. **One call per tap and per shuffle.** FAILED, see Issue 1.
- [x] 10b. The reason is plain text. Evidence: "reason renders as plain text" passes and the `dangerouslySetInnerHTML` mutation is caught. `:258` renders a JSX text node (F-704.3 security note).
- [x] 11. With too few candidates there is no call and no note. Evidence: that test passes.
- [x] 12. The weather timer is cleared on close and once the weather settles. Evidence: both tests pass and both `clearTimeout` mutations are caught (`OutfitsModal.tsx:93`, `:97`).
- [x] 13. Works at 390 px and in dark mode. I ran my own Playwright check: 390×844 and 1280×800, light and dark, with `.dark` confirmed on `<html>`. 0 assertion failures, no horizontal scroll, toggle row 44 px. Contrast in light: reason 17.12, chip 11.96, label 17.12, note 5.28. Contrast in dark: reason 14.14, chip 10.67, label 14.14, note 7.69. I looked at the screenshots `light-390-1-ai.png`, `dark-390-1-ai.png`, `dark-390-2-note.png` and `light-390-0b-loading.png`. The long unbroken word wraps inside the card and the chip, reason and note are readable in both themes. The dev server is stopped.
- [x] 14. All checks pass and the existing tests are unchanged. The diff of `OutfitsModal.test.tsx` and `copy.test.ts` contains only added lines.

**Ming verification after merge** (carry into the PR): with real Claude and Gemini keys, turn on "✨ Gợi ý bằng AI", check
that the 3 outfits make sense and the reasons read naturally, then press "Đổi gợi ý" and check that a different set
appears.

### Issues
#### Issue 1 — 🔴 blocker — a second, quota-spending AI call for an unchanged key
- **Where**: `src/features/outfits/OutfitsModal.tsx:134` (`if (!eligible || …) return;`) and `:156` (deps start with `eligible`).
- **Expected**: The AI call is keyed on `key`. A paid call (30 a day) happens only on a tap, a shuffle or a real input
  change. When a result for the current `key` is already shown (`aiOutcome.key === key`), nothing is called (plan §5:
  *"No retry, no automatic second call"*).
- **Actual**: Picking a weather place sets `status = "loading"`, so `eligible` becomes false. When the weather settles,
  `eligible` becomes true again and the effect runs again because its dep changed. If the key did not change, it still
  sends the same request again, without any loading UI (`aiLoading` is false), and silently swaps in the new answer.
  If that call fails (for example `rate_limited`), the AI cards it had shown are replaced by rule cards and a note,
  although the user did nothing AI-related. This is reproduced in two places:
  - Scratch unit tests (failing):
    - "weather place fails after AI result": AI result shown, then choose a place whose weather fails, which gives the
      same pool and flags. `suggest` is called 2 times; 1 is expected.
    - "switch between two places with the same flags": `suggest` is called 2 times; 1 is expected.
  - Playwright: with AI on, choosing a second place with the same weather sent another `/api/ai/suggest-outfits`
    request (calls 5 → 6).
  - Passing scratch tests, for contrast: a `settingsRev` bump, an items refresh with new identities and the same ids,
    and one call per shuffle.
- **Fix instruction**: guard and key the effect on `aiLoading` instead of `eligible`. At `:134`, use
  `if (!aiLoading || !suggester || !seasonId) return;` and at `:156` change the first dep from `eligible` to
  `aiLoading`. `aiLoading` is already `eligible && aiOutcome?.key !== key`. When the answer arrives, the cleanup
  aborts a request that has already finished, which is harmless. I applied exactly this in the scratch copy: all 103
  existing outfit tests and my 5 probe tests pass.

  Add a regression test to `OutfitsModal.test.tsx`: AI on with a weather client whose `today` rejects, no saved place,
  answer shown; then `fireEvent.change(combobox, "da-lat")` and settle twice. Expect `suggest` to have been called
  once and the AI chips to still show. Optionally add the "two places with the same flags" variant.

### Deviations (impl-log), judged
1. The "late answer" test aborts through toggle off and on instead of shuffle. **Accepted.** Shuffle is disabled while a call is in flight (AC 7), so a shuffle cannot abort one. The `seed` → `key` cleanup path is still covered by the shuffle tests, and the guard mutation is caught.
2. "Shuffle after an AI error" compares the ids as a set (`arrayContaining` plus length). **Accepted.** The order of the rule `main` ids is not the DOM order, and the server does not care about order.
3. The timer tests compare against a baseline render with no weather client, because `Modal` owns a timer. **Accepted.** The plan allows this, and both timer mutations are caught.

### Rules (CLAUDE.md)
- R1: no `fetch` in the component. The client is created in `App.tsx:53-56` with the same auth injection as the other AI clients.
- R6: all copy comes from `copy.ts` `OUTFITS_COPY.ai`. The emoji is `aria-hidden`.
- R7: the files match the plan's list. `App.tsx` adds only wiring: one import, one `useMemo` and one prop.
- R8: there are tests for the new pure `note()` and for the modal.
- R9: the CSS uses only `var(--text|--muted|--green|--green-ink)`, all defined for light and `.dark`. 390 px and dark mode are checked above.
- No High path changed.
- No rule violations found. Issue 1 is correctness against the plan.

### Blockers from review agents
None. No review-trigger path changed.

### Nits (do not block)
- 💭 `OutfitsModal.tsx:113-114`: `eligible` is only read through `aiLoading` once Issue 1 is fixed. It could be inlined, but keeping it as a named step is fine.
- 💭 Dark-mode checkbox: `accent-color: var(--green)` renders as a light check on a dark fill (`dark-390-1-ai.png`). It is readable and matches `.check-row input`.
- 💭 The "weather: waits for weather…" test asserts `toHaveBeenCalledTimes(1)` right after the resolve. One more `settle()` before the assertion would also guard against a delayed second call.

### Follow-ups (out of scope)
- Those already in plan.md: narrow `AiSuggestInput.season` to `DbSeason`, the `cleanReason` nits, a "Mở Cài đặt" shortcut, and hiding the toggle in the rule-empty state.
