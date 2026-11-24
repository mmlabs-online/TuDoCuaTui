## Attempt 1 — 2026-11-24

### Files touched
| File | Required because |
|---|---|
| `src/constants/occasions.ts` (new) | AC 1: enum, labels, `isOccasionId` (R6) |
| `src/features/outfits/occasion.ts` (new) | AC 2: pure `tagOccasions` / `fitsOccasion` rules |
| `src/features/outfits/occasion.test.ts` (new) | AC 1, 2: unit tests |
| `src/features/outfits/suggest.ts` | AC 2, 3: cap 40 → 20, occasion pool step in `eligibility`, occasion option, tagged-first sort in `candidatePool` |
| `src/features/outfits/suggest.test.ts` | AC 2–4: two cap assertions updated, occasion cases added |
| `work/tickets/F-707.1/impl-log.md` | this log |

### Tests added / changed
- `occasion.test.ts`: enum holds exactly the five OQ-7 occasions; each label is a keyword of its own occasion; per-occasion `it.each` (5); Áo dài category rule; diacritics/case/NFD/punctuation; whole words only; two-occasion item; unrelated/empty/blank tags.
- `suggest.test.ts`: "caps at 40" renamed "caps at 20"; round-robin uses `AI_CANDIDATE_CAP`; candidatePool "occasion" cases (drops other-occasion mains, tagged first, accompaniment fallback, main fallback, after season step, no occasion ignores tags, no mutation); suggestOutfits occasion cases (mains from the occasion, undefined unchanged).

### Checks (actual output summary)
- typecheck: PASS
- format:check: PASS (after fixing one line in `occasion.ts`)
- test: PASS, 163 files, 2338 tests
- build: PASS

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Server limit still 40 (`server/ai/outfitSuggest.js`): F-707.2.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +300 / -6 lines (about 150 of it tests).
