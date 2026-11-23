## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check`: "All matched files use the correct format." (353 files)
- `pnpm typecheck`: clean, exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`)
- `pnpm test`: Test Files 5 failed | 139 passed | 14 skipped. Tests 7 failed | 2002 passed | 288 skipped. All 7 failures are the known Windows-only ones that also fail on main: `server/api.test.ts` (1), `server/ai/tagPhoto.test.ts` (3), `server/index.cli.test.ts` (1), `server/scoping.test.ts` (1), `src/features/auth/boundary.test.ts` (1). The diff touches none of these areas, and the counts match impl-log exactly.
- `pnpm build`: built OK

### Acceptance criteria
- [x] `season` is typed as `DbSeason`; passing a label fails typecheck. Evidence: `src/data/aiOutfits.ts:12` `season: DbSeason`; `src/data/aiOutfits.test.ts` › "season only accepts DB ids" uses `// @ts-expect-error` on `const bad: AiSuggestInput["season"] = "Đông";`. Typecheck is clean, so the directive is in use: the label is rejected, and widening the field back to `string` would cause an "Unused directive" error. `OutfitsModal.tsx:113` `seasonId: DbSeason | undefined`.
- [x] `cleanReason` cleanups covered by unit tests. Evidence: `suggest.ts:250` no longer lists U+2028/2029 in the strip class, and `:258` adds `.trimEnd()`. Tests `suggest.test.ts` › "line/paragraph separators collapse to a space" and › "no trailing space when the cut lands on a space" (ASCII plus a `ạ`/`đ` variant) pass, and both would fail on main's code (separators deleted to "abc"; trailing space kept). The existing test edit is deliberate: I checked by byte inspection that only the U+2028 between `d` and `e` was removed from `dirty`, and impl-log records the change.
- [x] With an empty rule set the toggle is not shown (modal test). Evidence: `OutfitsModal.tsx:211` `{ready && outfits.length > 0 && (`; `OutfitsModal.test.tsx` › "toggle hidden when the rule set is empty" passes, and it would fail under the old `{ready && (` condition.
- [x] Toggle readable in dark mode at 390 px (one-off Playwright, D42). Evidence: `index.css:3053-3055` `.dark .outfit-ai-toggle input { accent-color: var(--green-ink); }`. impl-log records computed accent `rgb(191, 227, 197)` in dark and `rgb(15, 61, 46)` in light at 390x844, with no horizontal overflow. I viewed `t032-dark-checked.png` in the scratchpad: the checked box is a light fill with a dark tick, clearly visible against the modal surface.
- [x] (Plan AC 5, settings link) Evidence: `OutfitsModal.tsx:133` `settingsLink` requires the callback, a note and `needsSettings(code)`. The button is a sibling after the `role="status"` `<p>`, so the status text stays unchanged. Three modal tests pass (settings error → link calls `onOpenSettings` once; `rate_limited` → no link; no callback → no link). `App.tsx` adds only `onOpenSettings: () => setSettingsOpen(true)`; oxfmt reflowed the object across lines.
- [x] All checks pass (with the 7 known Windows failures that also fail on main, as noted above).

Ming verification after merge: none required. Optional: on a phone in dark mode, the checked "✨ Gợi ý bằng AI" box is clearly visible.

### Issues
None.

### Rules (CLAUDE.md)
No violations found.
- R1: no fetch added; the link only calls a callback.
- R6: new copy `ai.openSettings` lives in `features/outfits/copy.ts` and has an exact-copy test.
- R7: every changed `src/` file is in the plan's file list. The `work/tickets/T-032/*` changes are loop bookkeeping. No High path is touched.
- R8: the `cleanReason` changes and the modal changes are unit-tested.
- R9: 390 px dark and light verified by the one-off Playwright check.

### Blockers from review agents
None (no review trigger applies).

### Nits (do not block)
- The link text "Mở cài đặt" differs from the ticket's "Mở Cài đặt". The plan made this choice on purpose so it matches `EDITOR_COPY.ai.openSettings`. Fine.
- The settings link renders centred under the left-aligned note (inherits `.ai-fill-link`). It looks slightly off in the screenshot but is acceptable.

### Follow-ups (out of scope)
- `.check-row input` (`index.css` ~837) has the same dark `--green` accent; consider the same `--green-ink` override.
- Optionally re-run AI after settings change when the shown note is a settings error (today it stays until shuffle/toggle).
- Optionally left-align the settings link under `.outfit-body .ai-fill-link`.
- Hotspot: F-707.4 may remove the toggle; it should keep `ai.onOpenSettings`.
