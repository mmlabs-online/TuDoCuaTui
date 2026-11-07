## Attempt 1 — 2026-11-07

### Files touched
| File | Required because |
|---|---|
| `src/lib/text.ts` | Created `normalize` (ticket scope, D8) |
| `src/lib/text.test.ts` | Created; unit tests for `normalize` (AC 1) |
| `src/features/items/filters.ts` | Haystack now covers seven fields, compared via `normalize` (AC 2-4) |
| `src/features/items/filters.test.ts` | Replaced diacritic-sensitive test; added field-coverage and blank-query tests |
| `src/App.tsx` | Search placeholder only (one line) |
| `vitest.config.ts` | Added `src/lib/text.ts` to coverage include and thresholds |

### Tests added / changed
- text.test.ts › normalize › strips every tone from every vowel / handles uppercase vowels with tones (table-driven) / maps đ and Đ to d / composed and decomposed input give the same result / lowercases mixed case / collapses and trims whitespace / leaves ASCII, digits and punctuation unchanged apart from case
- filters.test.ts › matchesFilters › query is diacritic- and case-insensitive; query matches every searchable field; blank or whitespace query matches everything
- filters.test.ts › removed "query is diacritic-sensitive (records current behaviour)"

### Checks (actual output summary)
- typecheck: pass (tsc --noEmit, exit 0)
- format:check: pass ("All matched files use the correct format")
- test: pass, 5 files, 85 tests
- test:coverage: exit 0 (thresholds met, including text.ts and filters.ts)
- build: pass (vite build, 70 modules)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- The item form labels tags "Dịp / tag"; the placeholder uses the plan's wording "thẻ".

### Scope self-check
- Could the diff be smaller? no
- Diff size: see `git diff --stat origin/main..HEAD`
