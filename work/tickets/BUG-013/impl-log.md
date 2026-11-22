## Attempt 1 — 2026-11-22

### Regression tests first (unfixed code)
- T1 `suggest.test.ts` > weather > "cold weather with no Đông items flags the fallback":
  `AssertionError: expected undefined to be true` (suggest.test.ts:298)
- T2 `suggest.test.ts` > weather > "in cold weather fallback, items not tagged Hạ rank before summer items":
  `AssertionError: expected 'Váy hè' to be 'Váy thu'` (suggest.test.ts:308)
- Both failed on the unfixed code and pass cleanly after the fix.

### Files touched
| File | Required because |
|---|---|
| `src/features/outfits/suggest.ts` | Added `fallback: boolean` to `Suggestion` and `Eligibility`; `summerPenalty` in `rank` sorting non-summer before summer items when cold; prioritized non-summer items in `candidatePool` |
| `src/features/outfits/copy.ts` | Added `fallbackNote` for cold, hot, and calendar seasons (R6) |
| `src/features/outfits/OutfitsModal.tsx` | Destructured `fallback` and rendered `<p className="outfit-fallback-note">{COPY.fallbackNote(season, { cold, hot })}</p>` |
| `src/index.css` | Added styling for `.outfit-fallback-note` |
| `src/features/outfits/suggest.test.ts` | T1 (fallback flag), T2 (summer penalty in cold fallback) |
| `src/features/outfits/copy.test.ts` | Unit tests for `fallbackNote` |
| `src/features/outfits/OutfitsModal.test.tsx` | UI tests verifying `.outfit-fallback-note` presence when cold with no winter items and absence when winter items exist |

### Tests added / changed
- `suggest.test.ts`: "cold weather with no Đông items flags the fallback", "in cold weather fallback, items not tagged Hạ rank before summer items"
- `copy.test.ts`: "fallbackNote"
- `OutfitsModal.test.tsx`: "cold weather with no cold items shows fallback note", "cold weather with cold items does not show fallback note"

### Checks (actual output summary, native WSL copy)
- format:check: `oxfmt --check` — All matched files use the correct format (346 files checked).
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` — pass (exit 0).
- test: `vitest run src/features/outfits/` — 4 passed, 122 tests passed.
- build: `vite build` — built in 4.07s.

### Out-of-plan files
None

### Follow-ups
None

### Scope self-check
- Could the diff be smaller? No.
- Diff size: ~47 production lines added/changed across 4 files, 41 test lines.
