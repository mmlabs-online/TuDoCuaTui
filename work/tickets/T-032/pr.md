<!-- PR title: T-032: AI outfits tidy-ups from F-704 -->
<!-- Branch: ticket/T-032 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- `AiSuggestInput.season` is typed `DbSeason` (and `seasonId` in `OutfitsModal.tsx`); a `@ts-expect-error` test rejects a label.
- `cleanReason`: U+2028/2029 now collapse to a space like other whitespace, and `.trimEnd()` runs after the 120-code-point cut.
- The AI toggle is hidden when the rule set is empty; in dark mode it uses `accent-color: var(--green-ink)` (was near-invisible `--green` on the dark modal).
- A "Mở cài đặt" button after the AI note for settings-fixable errors, wired from `App.tsx` like Editor and ImportModal.

## Acceptance criteria
- [x] `season` is `DbSeason`; passing a label fails typecheck — `@ts-expect-error` test, typecheck clean (review.md).
- [x] `cleanReason` cleanups covered by unit tests — 2 new tests (incl. a Vietnamese variant) fail on main and pass here; one existing test deliberately loses U+2028 from its input.
- [x] Empty rule set hides the toggle — new modal test.
- [x] Toggle readable in dark mode at 390 px — one-off Playwright (Edge, 390×844, dark/light): computed accent `rgb(191, 227, 197)` in dark, light unchanged, no horizontal overflow; reviewer checked the dark screenshot.
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 2002 passed, 7 failed, 288 skipped on the agent's Windows machine; the 7 are the known Windows-only failures also on `main`, none in areas this diff touches. Please confirm CI is green.

## Needs Ming's decision
- None. No High path touched. Copy: the link says "Mở cài đặt" (matching the existing Editor link) instead of the ticket's "Mở Cài đặt".

## Follow-ups
- `.check-row input` checkboxes have the same weak dark-mode accent and could get the same `--green-ink` fix.
- Optionally re-run the AI suggestion after a settings fix (today the error stays until shuffle/toggle, by F-704.5's "no automatic second call").
- Optionally left-align the settings link (it is centred under a left-aligned note).
- F-707.4 may remove the toggle; it should keep `ai.onOpenSettings`.

Links: [plan.md](work/tickets/T-032/plan.md) · [review.md](work/tickets/T-032/review.md) · [impl-log.md](work/tickets/T-032/impl-log.md) · [consult-frontend-developer.md](work/tickets/T-032/consult-frontend-developer.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
