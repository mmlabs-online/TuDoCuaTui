## Attempt 1 — 2026-11-21

### Regression tests first (unfixed code)
- T1 `suggest.test.ts` > weather > "hot weather in a winter month does not report Đông":
  `AssertionError: expected [ 'season', 'hot', 'rain' ] to not include 'season'` (suggest.test.ts:291)
- T2 `OutfitsModal.test.tsx` > "hot weather in November: heading is Trời nóng, not Mùa Đông":
  `AssertionError: expected 'Mùa Đông' to be 'Trời nóng'` (Received: "Mùa Đông")
- Both pass after the fix.

### Files touched
| File | Required because |
|---|---|
| src/features/outfits/suggest.ts | `seasons` (de-duplicated `wanted`) on Eligibility and Suggestion; "season" reason matches against it |
| src/features/outfits/copy.ts | `heading()`, `reasons.seasonFit`, shared COLD/HOT constants (R6) |
| src/features/outfits/OutfitsModal.tsx | heading uses `COPY.heading`; chip uses `seasonFit` on cold/hot days |
| src/features/outfits/suggest.test.ts | T1, T7, T8 |
| src/features/outfits/OutfitsModal.test.tsx | T2-T6, T9, T10; one existing count updated (see below) |
| src/features/outfits/copy.test.ts | T11 |

### Tests added / changed
- suggest.test.ts: T1, T7 "seasons reports the seasons actually used", T8 "season reason follows the seasons used"
- OutfitsModal.test.tsx: T2, T3, T4, T5, T6, T9, T10
- copy.test.ts: T11 "heading"
- Changed: existing "cold weather adds Khoác in July" counted "Trời lạnh" as 3; the heading now also reads
  "Trời lạnh" (the intended fix), so it expects 4 (3 chips + heading). Unavoidable consequence of 2b.

### Checks (actual output summary, native WSL copy)
- typecheck: pass (tsc app + server)
- format:check: All matched files use the correct format.
- test: 1960 passed, 222 skipped (DB suites), 1 failed: `ItemGrid.test.tsx > without IntersectionObserver ...`
  (BUG-002 test, untouched code). It fails under full-suite load but passes when run alone with the outfits
  tests (5 files, 123 passed). In the first full run it failed too, so it is a flaky timing test.
- build: pass

### Out-of-plan files
None

### Follow-ups (noticed, not done)
- ItemGrid.test.tsx "without IntersectionObserver" is flaky under full-suite load (unrelated to this ticket).
- A5: regional seasons for warm southern November days (ticket puts it out of scope) -> debt issue proposed.

### Scope self-check
- Could the diff be smaller? No
- Diff size: ~+18 / -5 production lines, rest tests
