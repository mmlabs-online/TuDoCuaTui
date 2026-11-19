## Attempt 1 — 2026-11-19

### Files touched
| File | Required because |
|---|---|
| `src/features/outfits/OutfitsModal.tsx` | `ai` prop, toggle, AI effect, overlay cards, note, loading state, shuffle change, weather timer fix, shared `PieceButton` |
| `src/features/outfits/copy.ts` | `OUTFITS_COPY.ai` block (R6) |
| `src/index.css` | toggle, list/loading, AI chip, reason, note styles (R9) |
| `src/App.tsx` | wiring only: `createHttpAiOutfits` memo + `ai={{…}}` prop |
| `src/features/outfits/OutfitsModal.test.tsx` | new tests (additions only) |
| `src/features/outfits/copy.test.ts` | new tests (additions only) plus one import line |

### Tests added / changed
- OutfitsModal.test.tsx: toggle hidden unless AI is ready (5 cases); toggle off on open, no call; sends pool ids, season DB id, weather flags; shows AI outfits with chip and reason; loading dim + shuffle disabled; AI error (8 codes) rule cards plus note; plain Error to internal; empty AI result (2 cases); shuffle with AI on; shuffle after an AI error; late answer ignored; toggle off aborts; close aborts; reopen; toggle off then on; reason plain text; too few candidates; weather waits then one call; weather timer cleared on close and after weather arrives.
- copy.test.ts: "ai.note covers every AI error code", "ai copy texts".
- No existing test changed (git diff on the test files shows additions only, plus the import lines).

### Checks (actual output summary)
- typecheck: tsc app + server, no errors
- format:check: All matched files use the correct format
- test: Test Files 137 passed | 11 skipped; Tests 1917 passed | 222 skipped
- build: built, no errors

### Playwright one-off (D42; script and screenshots in scratchpad `impl-f7045/`, not committed)
Mocks: /healthz, /api/items (9), /api/locations, /api/weather, /api/ai-settings, /api/ai/suggest-outfits (1st 200 with a 120-char reason and an unbroken long word, 2nd 200 different set, 3rd 429 rate_limited). Viewports 390x844 and 1280x800, light and dark: 0 failures.
- Switch visible, unchecked on open, row 44 px, no AI call before the tap.
- After tap: 3 cards, 3 "AI" chips, reasons shown; no horizontal scroll (page and inner), long word wraps inside the modal.
- Shuffle: 2nd request has `avoidIds`, 1st has none.
- Toggle off/on (3rd request 429): rule cards, zero AI chips, note "Hôm nay đã dùng hết lượt AI, đang dùng gợi ý thường."
- Contrast: light 390 reason 17.12, chip 11.96, label 17.12, note 5.28; dark reason 14.14, chip 10.67, label 14.14, note 7.69 (same at 1280).
- Dev server (port 5199) stopped.

### Out-of-plan files
None.

### Deviations
- "late answer of an aborted call is ignored": the plan aborts via shuffle, but the shuffle button is disabled while the call is in flight (AC 7), so the test aborts via toggle off then on instead. Still asserts the first signal is aborted and the late answer is not shown.
- "shuffle after an AI error": avoidIds compared as the same set of ids (arrayContaining plus length) because the rule `main` order is not the DOM order.
- Timer tests: `Modal` owns a timer of its own, so they compare against the count of the same render without a weather client (as the plan allows); baseline recorded via a helper.

### Follow-ups (noticed, not done)
- Those listed in plan.md; nothing new.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +635 / -54 lines (about 390 of them tests).
