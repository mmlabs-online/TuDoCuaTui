Status: READY

# Plan — T-032: AI outfits tidy-ups from F-704

## Scope summary
- `docs/feature-list.md` F-704 (line 254): "Status: F-704.1 to F-704.5 are MERGED and T-032 is an open tidy-up. F-707
  extends this flow and does not re-spec it."
- Ticket scope (`work/tickets/T-032/ticket.md`):
  - "Narrow `AiSuggestInput.season` to `DbSeason` (type only)."
  - "The two small `cleanReason` cleanups from the F-704.4 review."
  - "Hide the AI toggle when the rule-based set is empty."
  - "Dark-mode checkbox colours for the toggle (theme variables)."
  - "Settings note: optional "Mở Cài đặt" link only if App wiring stays minimal; otherwise leave text-only."
  - Out of scope: "Server changes; saving outfits (F-801–F-803)."
- Sources of the items:
  - `work/tickets/F-704.4/review.md:38`: "U+2028/2029 are deleted while `\n`/`\t` collapse to a space … letting `\s+`
    handle them, since JS `\s` already matches them, would be more consistent."
  - `work/tickets/F-704.4/review.md:39`: "the 120-code-point cut happens after `trim()`, so a cut that lands on a space
    leaves one trailing space … a final `.trimEnd()` would tidy it."
  - `work/tickets/F-704.4/review.md:40`: "`AiSuggestInput.season` is typed `string` … a narrower type would catch the
    mistake at compile time."
  - `work/tickets/F-704.5/review.md:107`: "Dark-mode checkbox: `accent-color: var(--green)` renders as a light check on
    a dark fill."
  - `work/tickets/F-704.5/review.md:111`: "narrow `AiSuggestInput.season` to `DbSeason`, the `cleanReason` nits, a
    "Mở Cài đặt" shortcut, and hiding the toggle in the rule-empty state."
- D42 (`work/decisions.md`): CSS is invisible to jsdom, so use a one-off Playwright check recorded in impl-log.

**Settings link decision (resolved from code):** the wiring is minimal. `App.tsx` already has `setSettingsOpen`
(`App.tsx:87`) and already passes `onOpenSettings: () => setSettingsOpen(true)` to `Editor` (`:219`) and
`ImportModal` (`:283`). `Editor.tsx:105` and `ImportPhotosTab.tsx:55` render the link as
`<button type="button" className="ai-fill-link">`. For the outfits modal this is one prop line in `App.tsx` plus an
optional prop, so the link is **in scope**.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `season` is typed as `DbSeason`; passing a label fails typecheck. | `src/data/aiOutfits.ts` declares `season: DbSeason`. `aiOutfits.test.ts` › "season only accepts DB ids" has a `// @ts-expect-error` line that assigns `"Đông"`. `pnpm typecheck` is clean, and it fails with "Unused '@ts-expect-error' directive" if `season` is widened back to `string` (reviewer mutation). `tsconfig.json` `include: ["src", …]` covers test files, so typecheck enforces it. `OutfitsModal.tsx` `seasonId` is typed `DbSeason \| undefined`. |
| 2 | `cleanReason` cleanups covered by unit tests. | `suggest.test.ts` › "line/paragraph separators collapse to a space" and › "no trailing space when the cut lands on a space" pass, and fail on the current code (reviewer reverts `suggest.ts`). |
| 3 | With an empty rule set the toggle is not shown (modal test). | `OutfitsModal.test.tsx` › "toggle hidden when the rule set is empty" passes. It fails when the condition is reverted to `{ready && …}`. |
| 4 | Toggle readable in dark mode at 390 px (one-off Playwright, D42). | impl-log has a one-off Playwright run at 390×844 in dark mode (`.dark` confirmed on `<html>`), toggle unchecked and checked, with screenshot paths. It records the computed `accent-color` of `.outfit-ai-toggle input` as `--green-ink` in dark and `--green` in light. A light-mode run at 390 px confirms there is no regression. The reviewer looks at the screenshots or re-runs the script. |
| 5 | (Settings link, scope item 5) A settings-fixable AI error shows "Mở cài đặt", which opens AI settings. Other errors, or no callback, show text only. | `OutfitsModal.test.tsx` › "settings error: link calls onOpenSettings", › "non-settings error: no settings link" and › "no onOpenSettings: note stays text-only" pass. The existing `it.each` "AI error %s: rule cards plus note" passes unchanged, because the status `textContent` is still just the note. `App.tsx` diff is the one `onOpenSettings` line. |
| 6 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` are all green. |

## Ming verification after merge
None. Optional: in dark mode on a phone, the "✨ Gợi ý bằng AI" checkbox is clearly visible when checked.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/data/aiOutfits.ts` | `import type { DbSeason } from "./mappers";` and `season: DbSeason`. Keep the doc comment. No other change (F-707.2 hotspot). | AC 1 | No |
| `src/data/aiOutfits.test.ts` | Add test "season only accepts DB ids" with one `@ts-expect-error` line. | AC 1 | No |
| `src/features/outfits/suggest.ts` | `cleanReason`: remove `  ` from the strip class, update the comment, add `.trimEnd()` after `.join("")`, and update the doc comment to "one line". | AC 2 | No |
| `src/features/outfits/suggest.test.ts` | Adjust the existing separators test (deliberate behaviour change) and add 2 tests. | AC 2 | No |
| `src/features/outfits/OutfitsModal.tsx` | Type `seasonId` as `DbSeason \| undefined`. Change the toggle condition to `ready && outfits.length > 0`. Add optional `ai.onOpenSettings` and the settings link next to the note. | AC 1, 3, 5 | No |
| `src/features/outfits/OutfitsModal.test.tsx` | Add 4 tests: 1 for the toggle and 3 for the link. Widen the `renderAi` prop type to allow `onOpenSettings`. | AC 3, 5 | No |
| `src/features/outfits/copy.ts` | Add `ai.openSettings: "Mở cài đặt"`, the same text as `EDITOR_COPY.ai.openSettings`. | AC 5, R6 | No |
| `src/features/outfits/copy.test.ts` | Assert `ai.openSettings` text in the existing exact-copy test. | AC 5, R8 | No |
| `src/App.tsx` | Add `onOpenSettings: () => setSettingsOpen(true)` to the `OutfitsModal` `ai` prop (`:294`). One line only. | AC 5 | No |
| `src/index.css` | After `.outfit-ai-toggle input` (`:3048`), add `.dark .outfit-ai-toggle input { accent-color: var(--green-ink); }`. | AC 4, R9 | No |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/data/aiOutfits.test.ts` › "season only accepts DB ids" | AC 1. The test has `// @ts-expect-error a label is not a DbSeason` on the line above `const bad: AiSuggestInput["season"] = "Đông";` and a trivial runtime `expect(bad).toBe("Đông")`. Keep the statement on one line, so the directive still sits on the line directly above it after oxfmt. |
| `src/features/outfits/suggest.test.ts` › "removes bidi, zero-width and controls" (renamed existing test) | AC 2. Remove the U+2028/U+2029 characters from the `dirty` input so that it still expects `"abcdefghi"`. Inspect the literal by code point first: it contains invisible characters. |
| `src/features/outfits/suggest.test.ts` › "line/paragraph separators collapse to a space" | AC 2: `cleanReason("a b c")` gives `"a b c"`, and `cleanReason("a \nb")` gives `"a b"` (same as `\n`). |
| `src/features/outfits/suggest.test.ts` › "no trailing space when the cut lands on a space" | AC 2: `cleanReason("a".repeat(119) + " bc")` gives `"a".repeat(119)`, and the result does not end with `" "`. Also a Vietnamese variant: `"ạ".repeat(119) + " đ"` gives 119 code points and no trailing space (domain focus: diacritics). |
| `src/features/outfits/OutfitsModal.test.tsx` › "toggle hidden when the rule set is empty" | AC 3: `renderAi([mk("Áo")], aiProps())` with AI ready, then `settle()`. `queryByRole("switch")` is null and `OUTFITS_COPY.empty.title` is shown. Place it next to the `it.each` "toggle hidden unless AI is ready". |
| `src/features/outfits/OutfitsModal.test.tsx` › "settings error: link calls onOpenSettings" | AC 5: `suggest` rejects `AiSettingsError(409, "not_configured")`, then turn on. `getByRole("status").textContent` is the note. Clicking the button named `OUTFITS_COPY.ai.openSettings` calls `onOpenSettings` once. |
| `src/features/outfits/OutfitsModal.test.tsx` › "non-settings error: no settings link" | AC 5: with `rate_limited` and `onOpenSettings` given, there is no button named `OUTFITS_COPY.ai.openSettings`. |
| `src/features/outfits/OutfitsModal.test.tsx` › "no onOpenSettings: note stays text-only" | AC 5: with `not_configured` and no `onOpenSettings`, the note is shown and there is no link button. |
| `src/features/outfits/copy.test.ts` (existing exact-copy test) | Add `expect(ai.openSettings).toBe("Mở cài đặt")`. |

## Approach
1. **Season type (AC 1).**
   - In `aiOutfits.ts`, change `season: string` to `season: DbSeason` and add a type-only import from `./mappers`.
     `mappers.ts` does not import `aiOutfits`, so there is no import cycle.
   - In `OutfitsModal.tsx:112`, change `const seasonId: string | undefined` to `DbSeason | undefined`. Add `type DbSeason`
     to the existing `@/data/mappers` import. `SEASON_TO_DB` is `Record<string, DbSeason>` (`mappers.ts:117`), so no
     cast is needed.
   - Add the `@ts-expect-error` test. The existing `INPUT` (`season: "winter"`) and the modal test mock already typecheck.
2. **cleanReason (AC 2).**
   - In `suggest.ts:250`, remove `  ` from the character class. JS `\s` matches them, so the `\s+` collapse
     turns them into one space, the same as `\n`.
   - Update the comment at `:248` to say that tab, newline and U+2028/2029 stay for the collapse.
   - Add `.trimEnd()` after `.join("")` at `:257`.
   - Adjust the existing test and add the new tests. The behaviour change for U+2028/2029 (removed → space) is
     deliberate. Record it in impl-log as a change to an existing test expectation.
3. **Toggle hiding (AC 3).**
   - Change `OutfitsModal.tsx:209` from `{ready && (` to `{ready && outfits.length > 0 && (`.
   - Do not reset `aiOn` when the set becomes empty. `eligible` already requires `outfits.length > 0` (`:114`), and the
     AI note and cards are inside the non-empty branch, so a stale `aiOn` has no effect.
4. **Dark-mode checkbox (AC 4, R9).**
   - In dark mode the effective `--green` is `#0b2f24` (the second `.dark` block, `index.css:1383`, overrides
     `:23`). That is almost the modal surface `#1c2a24`, so a checked box barely stands out.
   - `--green-ink` is defined for both themes: `#0f3d2e` in light (`:1373`) and `#bfe3c5` in dark (`:1376`). It is
     already used for the toggle focus ring.
   - Add `.dark .outfit-ai-toggle input { accent-color: var(--green-ink); }`. Light mode is unchanged. The browser picks
     a contrasting (dark) check mark on the light fill.
   - Use only existing theme variables. Do not add `color-scheme`, which would also restyle the unchecked box and every
     other form control.
   - Leave `.check-row input` (`:837`) unchanged; it is outside the ticket ("for the toggle"). Record it as a follow-up.
   - Run the one-off Playwright check (D42) at 390×844, dark and light, unchecked and checked. Record the script outline,
     the computed `accent-color` and the screenshot paths in impl-log. Use a scratch dir and do not add Playwright to
     the repo.
5. **Settings link (AC 5, R1, R6).**
   - Add `onOpenSettings?: () => void` to the modal's `ai` prop type.
   - Compute `const settingsLink = !!ai?.onOpenSettings && !!aiNote && needsSettings(aiOutcome?.error ?? "")`. Import
     `needsSettings` from `@/features/items/aiFill`; `copy.ts` already imports it from there.
   - Render `<button type="button" className="ai-fill-link" onClick={ai.onOpenSettings}>{COPY.ai.openSettings}</button>`
     as a **sibling right after** the `<p className="outfit-ai-note" role="status">`. Do not put it inside the `<p>`,
     so that the status `textContent` stays the note text and the existing `it.each` assertions do not change.
   - `.ai-fill-link` already exists (`index.css:1990`, `color: inherit`). No new CSS is expected. If the button needs
     spacing, add it only under `.outfit-body .ai-fill-link`, using no colours.
   - In `App.tsx:294`, add `onOpenSettings: () => setSettingsOpen(true)` to the `ai` object. `AiSettingsModal` renders
     after `OutfitsModal` (`:328`), so it stacks on top, as it does for `ImportModal`. Its `onClose` already bumps
     `aiSettingsRev`, which the outfits modal passes to `useAiLoad`.
   - R1: no fetch is added, and the link only calls a callback.
   - Include the link in the Playwright pass if it is cheap to force a `not_configured` answer (for example, route
     `/api/ai/suggest-outfits` to a 409). Otherwise jsdom coverage is enough, because it is a plain button with
     existing styling.
6. Run all checks. Record the deliberate test-expectation change and the follow-ups in impl-log.

Rules:
- R6: new copy only in `features/outfits/copy.ts`.
- R7: only the files listed.
- R8: unit tests for the changed pure logic (`cleanReason`) and for the modal.
- R9: 390 px and dark mode checked with Playwright.
- No High path is touched, so the gate is none.

## Specialist input used
`consult-frontend-developer.md`:
- Rec. 1 (season type plus the `seasonId` annotation): **adopted**.
- Open Q3 (tsconfig): resolved. `tsconfig.json` includes `src`, so test files are typechecked and `@ts-expect-error`
  enforces AC 1.
- Rec. 2 (strip-class edit, `.trimEnd()`, update the existing test): **adopted**. I narrowed the existing-test edit to
  removing the U+2028/2029 characters from its input, plus a dedicated new test.
- Rec. 3 (`ready && outfits.length > 0`, modal test): **adopted**. The flicker while weather loads is accepted, as
  the consult says.
- Rec. 4 and Open Q2 (dark override): **adopted with a concrete variable**, `--green-ink`, which is defined in both
  themes and already used by the toggle focus ring. `color-scheme` is rejected because it restyles all controls.
- Sharing the override with `.check-row input` is **rejected for this ticket**. The ticket scopes the change to the
  toggle, so it goes to a follow-up.
- Rec. 5 (settings link only if App already passes a callback): resolved from code. App already wires
  `onOpenSettings` for `Editor` and `ImportModal`, so the link is **included** with a one-line App change.
- Open Q1 (whether the toggle survives F-707.4): taken as the default, do it anyway. See Assumptions.
- Hotspot notes: **adopted** (see Assumptions).

## Assumptions
- **Hotspots with F-707.x (all BACKLOG, P1).** T-032 has no dependency on them, so it should merge first and F-707.x
  rebases.
  - **F-707.1** edits `suggest.ts` (`candidatePool`, `eligibility`). T-032 touches only `cleanReason`
    (`:243-258`), so a conflict is unlikely.
  - **F-707.2** adds `occasion` to `AiSuggestInput` in `aiOutfits.ts`. T-032 changes one field line and one import line.
  - **F-707.4** reworks `OutfitsModal.tsx` (AI only on an explicit tap) and probably removes or replaces the toggle
    (`:209-225`) and the `aiOn`/`eligible` logic. The toggle-hiding and dark-mode toggle CSS may be discarded there. This
    is accepted because they are small (open Q1 default). The settings link sits next to the AI note and is likely to
    survive. F-707.4 should keep `ai.onOpenSettings`.
  - **F-706.4** (depends on F-707.4) will likely touch the AI wiring in `App.tsx`. T-032 adds one line there.
  - Merged BUG-012 and BUG-013 tests sit in `OutfitsModal.test.tsx` (about `:592-660`). New tests go near the F-704.5
    AI block (`:189-560`).
- After the user fixes settings and closes `AiSettingsModal`, the existing error outcome for the same `key` stays on
  screen until the user shuffles or toggles. There is no automatic retry. This keeps the F-704.5 rule of "no automatic
  second call" (`F-704.5/review.md:62-64`). It is not changed here.
- The link text reuses the existing casing "Mở cài đặt" (`items/copy.ts:29`) instead of the ticket's "Mở Cài đặt",
  so both AI flows read the same.
- Follow-ups for impl-log and the debt list:
  - `.check-row input` uses the same dark `--green` accent (`index.css:837`). Consider the same `--green-ink` override.
  - Optionally re-run AI after settings change when the shown note is a settings error.

## Blocking questions
None.

## Split proposal
None. The ticket is about 80 changed lines, most of them tests.
