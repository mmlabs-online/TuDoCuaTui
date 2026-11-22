## Attempt 1 — 2026-11-21

### Files touched
| File | Required because |
|---|---|
| `src/features/items/filters.ts` | `isStale` applies D51; `Pick` widened to `lastWorn`, `wearCount`, `createdAt` |
| `src/features/items/ItemCard.tsx` | Pill shows the never-worn label when `lastWorn === ""` |
| `src/features/items/copy.ts` | `EDITOR_COPY.wear.neverWorn` (R6) |
| `docs/feature-list.md` | Line 44 matches D51 |
| `src/features/items/ItemCard.test.tsx` | Regression test, card |
| `src/features/items/filters.test.ts` | `isStale` args via `makeItem`; replaced the never-worn case; new D51 cases; filter case |
| `src/features/items/StatsRow.test.tsx` | Count test |
| `src/features/layout/Hero.test.tsx` | Hero test |
| `src/features/outfits/suggest.test.ts` | Ranking guard |
| `src/data/repo.http.test.ts` | Duplicate `created_at` guard |

### Tests added / changed
- `ItemCard.test.tsx` › never-worn item shows chưa mặc
- `filters.test.ts` › isStale: never-worn added today / 89 days / exactly 90 days / UTC+7 boundary / empty or invalid createdAt / future createdAt / worn item ignores createdAt / wearCount above 0 with empty lastWorn
- `filters.test.ts` › matchesFilters: special "stale" excludes a new never-worn item
- `StatsRow.test.tsx` › a new never-worn item counts as never worn but not as stale
- `Hero.test.tsx` › hero count follows D51 for never-worn items
- `suggest.test.ts` › a never-worn item added today still ranks with stale pieces
- `repo.http.test.ts` › a saved duplicate takes created_at from the server

**Failed before the fix** (run in the WSL copy on unmodified `filters.ts` and `ItemCard.tsx`): 9 failed, 234 passed
in the affected files. Failures:
- `ItemCard` never-worn: `expected '👕 0× · hơn 1 năm' to be '👕 0× · chưa mặc'`
- `StatsRow`: `expected [ '1', '1' ] to deeply equal [ '0', '1' ]`
- `isStale`: added today, 89 days, UTC+7 boundary, empty/invalid createdAt, future createdAt: `expected true to be false`
- `matchesFilters` special "stale" excludes a new never-worn item: `expected true to be false`
- `Hero` hero count follows D51: failed
The guard tests (exactly 90 days, worn ignores createdAt, wearCount>0 empty lastWorn, suggest guard, repo.http
duplicate) passed both before and after, as the plan predicted. All 9 pass after the fix.

### Checks (actual output summary)
Run in a native WSL copy (`pnpm install --frozen-lockfile`).
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean
- format:check: "All matched files use the correct format."
- test: Test Files 137 passed, 11 skipped (148); Tests 1950 passed, 222 skipped (2172); no failures (the known flaky
  `tagPhoto.test.ts` 413 test did not fail)
- build: built in 740ms

### Out-of-plan files
None

### Follow-ups (noticed, not done)
- Hero reads "Hôm nay có 0 món lâu chưa mặc — thử một món nhé?" until items reach 90 days; awkward copy.
- Clicking the "≥ 90 ngày chưa mặc" card at 0 shows the "Không tìm thấy món đồ" empty state, which is misleading.

### Scope self-check
- Could the diff be smaller? No
- Diff size: see `git diff --stat` of the commit
