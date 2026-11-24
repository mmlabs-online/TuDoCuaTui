## Attempt 1 — 2026-11-24
Verdict: PASS

### Checks (run by reviewer)
Run in WSL (rsync copy of the clean `ticket/F-707.1` working tree at `4c4c566`), logs in WSL `/tmp/tudo-<check>.log`.
- `pnpm format:check` — PASS ("All matched files use the correct format", 361 files)
- `pnpm typecheck` — PASS (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- `pnpm test` — PASS, 163 files, 2338 tests (matches impl-log)
- `pnpm build` — PASS (vite build, 130 modules)

### Acceptance criteria
- [x] The occasion enum holds exactly the five values from OQ-7, with labels only through the mapper/constants layer — evidence: `src/constants/occasions.ts:2-12`; `occasion.test.ts` › "enum holds exactly the five OQ-7 occasions" (ids, labels word for word from OQ-7, `isOccasionId` true/false cases) passes. Grep of `src/` and `server/` (non-test) for "Đi làm|Đi chơi|Hẹn hò|Dự tiệc|Du lịch" hits only `src/constants/occasions.ts:7-11`.
- [x] The prefilter is a pure function that maps occasions from category and tags only, with unit tests per occasion — evidence: `src/features/outfits/occasion.ts:32-49` (`tagOccasions`, `fitsOccasion`) read only `item.tags` and `item.category`; no I/O, no `Date`, no randomness. `occasion.test.ts` › `it.each` over all 5 occasions, plus Áo dài category rule, diacritics/`đ`/NFD/punctuation, whole-word, two-occasion and empty/blank tag tests; `suggest.test.ts` › `candidatePool` "occasion" block (7 cases) and `suggestOutfits occasion` (2 cases), including no-mutation. All pass.
- [x] The candidate pool returns at most 20 items — evidence: `suggest.ts:223` `AI_CANDIDATE_CAP = 20`; `suggest.test.ts` › "caps at 20" (60 eligible → 20, asserts the constant is 20) and "round-robin keeps every role under the cap" pass.
- [x] Existing `suggest.test.ts` cases (including BUG-012/BUG-013 behaviour) still pass — evidence: the diff of `suggest.test.ts` changes only the two cap assertions (name "caps at 40" → "caps at 20", `40` → `20`/`AI_CANDIDATE_CAP`), as AC 3 requires; every other existing case is untouched and passes. The occasion step runs after the season pools are built and does not touch `fallback` (`suggest.ts:126-142`), and "occasion: runs after the season step" confirms the order.
- [x] All checks pass (format, typecheck, test, build) — evidence: Checks above.

Ming verification after merge: none (no caller passes an occasion until F-707.4; the only live change is the 40 → 20 client cap).

### Issues
None.

### Rules (CLAUDE.md)
No violations found.
- R1 n/a (no data access). R5 n/a. R6: Vietnamese labels only in `src/constants/occasions.ts`; `OCCASION_TAG_KEYWORDS` is normalised ASCII match data, not UI copy. R7: every changed file is in the plan's file list (plus the ticket's own work files); no High path touched. R8: new pure logic has unit tests. R9 n/a (no UI).
- Scope: the mapping tables (`occasion.ts:7-25`) are the planner's proposal; they use only category and tags, as OQ-7 requires, and the five ids/labels match OQ-7 exactly.

### Blockers from review agents
None (no review-trigger path changed).

### Nits (do not block)
- `suggest.ts:130-132`: `canBuild` is true as soon as one one-piece fits, so with e.g. a single "đi làm" Đầm and tops/bottoms tagged for other occasions, `suggestOutfits` returns 1 outfit where it would have returned 3 without an occasion. Fine for this slice (no caller yet); worth deciding in F-707.4 whether "can build" should mean "can build `count` outfits".
- `suggest.ts:243`: `tagged()` re-runs `tagOccasions` inside the sort comparator. Pools are small, so this is harmless; precomputing per item would be cleaner.
- Keyword table: "cafe" does not match the Vietnamese spelling "cà phê" (normalised "ca phe"); "dam cuoi" also matches a tag "đầm cưới" (wedding dress) — arguably still `du_tiec`. Both are tuning choices for Ming in the PR.
- The rule path (`suggestOutfits`) filters by occasion but does not rank occasion-tagged items first, while `candidatePool` does. Consistent with the plan; mention if F-707.4 wants the same preference in the offline rules.

### Follow-ups (out of scope)
- Server candidate limit still 40 (`server/ai/outfitSuggest.js`): F-707.2 (already planned).
- Possible `occasionFallback` flag for the UI when no item fits the occasion: F-707.4 (noted in plan assumptions).
