
## Attempt 1 — 2026-11-18 (slice 1: client and pure logic)

### Files touched
| File | Required because |
|---|---|
| `src/data/aiOutfits.ts` (new, 91) | AC 1-3: `createHttpAiOutfits` client in the `aiTagging.ts` pattern (R1) |
| `src/data/aiOutfits.test.ts` (new, 157) | R8: client tests |
| `src/features/outfits/suggest.ts` (+~121 / -16) | AC 4-8: private `eligibility()` / `ruleRole()` shared with `suggestOutfits`; `AI_CANDIDATE_CAP`, `candidatePool`, `AiOutfit`, `toAiOutfits`, `cleanReason` |
| `src/features/outfits/suggest.test.ts` (+164) | R8: new `describe` blocks; existing cases untouched |

### Tests added / changed
- aiOutfits.test.ts: all 12 plan cases (error codes via `it.each`, 5 rows).
- suggest.test.ts: `candidatePool` (8), `cleanReason` (3), `toAiOutfits` (6). Added `DEC` const and imports only.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: All matched files use the correct format.
- test: Test Files 131 passed | 11 skipped (142); Tests 1734 passed | 222 skipped (1956)
- build: built in 629ms

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `cleanReason` keeps tab/newline out of the strip class so they collapse to a space (other controls and U+2028/2029 are removed outright, as the plan says).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +533 / -16 lines (incl. 248 in new files).
