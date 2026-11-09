## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/lib/dates.ts` (new) | One helper for local calendar dates (plan) |
| `src/lib/dates.test.ts` (new) | R8 |
| `src/lib/supabase.ts` | `localToday` moved to `lib/dates.ts` |
| `src/features/items/filters.ts` | `ageInDays` delegates to `daysSince` |
| `src/features/items/filters.test.ts` | New behaviour tests (see below) |
| `src/features/items/ItemCard.test.tsx` (new) | AC 1 render test |
| `src/features/items/Editor.tsx` | "Lần cuối" uses `ageInDays` |
| `src/features/items/copy.ts` | `EDITOR_COPY.wear` (R6) |
| `src/data/repo.ts` | `WearOutcome`, local one-wear-per-day + undo, Supabase `.select("id")` |
| `src/data/repo.local.test.ts`, `src/data/repo.supabase.test.ts`, `src/data/useWardrobe.test.tsx` | R8, AC 3 |
| `src/data/useWardrobe.ts` | strip `already` before merging into items |
| `src/App.tsx` | toast by `already`; duplicate resets `lastWorn` |
| `src/App.test.tsx` | two new tests; existing tests unchanged |

### Tests added / changed
- Added all tests listed in plan "Tests to write" (dates, filters, ItemCard, repo.local, repo.supabase, useWardrobe, App).
- Changed existing: `filters.test.ts` › "parses YYYY-MM-DD as UTC midnight (records current behaviour)" replaced (per plan); `repo.local.test.ts` "sets lastWorn to now", "counts twice", "-1 keeps lastWorn" replaced (per plan); `repo.supabase.test.ts` wear tests updated for `.select("id")` and `already` (per plan).
- Deviation: `filters.test.ts` › "floors whole days for ISO timestamps" (not listed in plan) asserted 24h-elapsed flooring, which contradicts calendar-day math (the plan's intent). Replaced by "counts local calendar days for ISO timestamps". Other isStale/sort/filter tests unchanged.

### Checks (actual output summary)
- typecheck: clean
- format:check: Finished, no issues (82 files)
- test: 19 files, 310 tests passed
- test:coverage: 310 passed, thresholds met (All files 100% lines, 99.25% branches)
- build: built OK

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Move `toDateOnly` to `src/lib/dates.ts` and decide device-local vs fixed UTC+7 in one place (plan).
- `src/lib/dates.ts` is not in the vitest coverage `include` list (config not in plan); add it.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see git diff --stat of the commit.
