# Review — T-002

## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit` exit 0, no errors.
- format:check: "All matched files use the correct format." (82 files)
- test: 310 passed (310), 0 failed.
- test:coverage: 310 passed; All files 100 % lines / 99.25 % branches / 100 % funcs; no threshold errors.
- build: `✓ built` (index JS 233.69 kB, gzip 74.31 kB).

Matches impl-log.md Attempt 1 (310 tests, 100 % / 99.25 %).

### Acceptance criteria
- [x] AC1: unit tests with a fixed clock at 02:00 UTC+7 show "hôm nay" for an item worn today. Evidence: `src/lib/dates.test.ts` › "daysSince is 0 at 02:00 UTC+7 for a YYYY-MM-DD worn today"; `src/features/items/filters.test.ts` › "ageInDays is 0 at 02:00 UTC+7 for today's date-only value"; `src/features/items/ItemCard.test.tsx` › "shows "hôm nay" at 02:00 UTC+7 for an item worn today" (also asserts no "-1 ngày"). TZ is pinned to `Asia/Ho_Chi_Minh` in `vitest.config.ts:7`. All green.
- [x] AC2 (plan): the 90-day stale boundary uses calendar days. Evidence: `filters.test.ts` › "isStale flips exactly at 90 calendar days for a YYYY-MM-DD value at 02:00 UTC+7" (89 → false, 90 → true). Green.
- [x] AC3: clicking "Mặc hôm nay" twice gives one wear in both modes, and the second click shows the "already" message.
  - Local: `repo.local.test.ts` › "wear +1 twice on the same day counts once and flags already" (stored data unchanged); `repo.ts:80-83`.
  - Supabase: `repo.supabase.test.ts` › "+1 returns already=true when today's log already exists" / "+1 … returns the stats and already=false" (call list includes `select("id")`); `repo.ts:259-269`.
  - Hook: `useWardrobe.test.tsx` › "wear passes the already flag through and does not store it on the item"; `useWardrobe.ts:75-77`.
  - End to end: `App.test.tsx` › "Mặc hôm nay twice counts once and shows "Đã ghi nhận hôm nay rồi""; toast choice is at `App.tsx:186-190`.
- [x] AC4 (plan): the editor's "Lần cuối … ngày trước" uses the shared helper. `Editor.tsx:148` calls `ageInDays(item.lastWorn)`. `grep 86400000 Editor.tsx` finds nothing.
- [x] AC5 (plan): duplicate resets `lastWorn`. `App.tsx:174` sets `lastWorn: ""`. `App.test.tsx` › "duplicate resets wear count and last worn" is green.
- [x] AC6: checks green (see above).

Ming verification after merge (carry into the PR):
- Hosted Supabase, on the phone: tap "Mặc hôm nay" twice. The count should go up once, and the second toast should be "Đã ghi nhận hôm nay rồi". This also confirms that PostgREST returns `[]` for `ON CONFLICT DO NOTHING` together with `.select("id")`.
- Between 00:00 and 07:00 local time: an item worn today should show "hôm nay", not "-1 ngày".

### Points the orchestrator asked about
- **Existing tests changed in the plan** ("records current behaviour" in filters/repo.local, the repo.supabase wear tests): the changes match the plan's file table and "Tests to write". Each old assertion recorded the bug, or the old +1-per-click rule, that this ticket fixes. Justified.
- **`filters.test.ts` "floors whole days for ISO timestamps" → "counts local calendar days for ISO timestamps" (not in the plan)**: justified. The old test asserted 24-hour elapsed flooring (`base + DAY - 60000 → 0`). The ticket requires "Compute ages from local calendar dates in one helper", so that assertion is now wrong by design and keeping it would contradict the AC. The replacement uses the same input and covers the same two-sided boundary at local midnight (23:59 → 0, 00:00 → 1). This is no loss of coverage. impl-log.md records it as a deviation. The other isStale tests (`ago(89/90/91)` at 12:00 local) still pass unchanged, so the sort and stale behaviour did not regress.
- **`src/lib/dates.ts` not in the coverage `include`**: not a blocker. R8 requires unit tests for new pure logic. `src/lib/dates.test.ts` has 9 tests covering every export and branch: passthrough, timestamp, empty, invalid, future clamp, and month/year boundaries. The plan does not list `vitest.config.ts`, so changing it would have been out of plan (R7). The helper is also exercised through `filters.ts` (`ageInDays`) and `src/data/**`, which are both thresholded. Added as a follow-up.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: all changes go through `WardrobeRepo`. Local and Supabase `wear` both return `WearOutcome` (`repo.ts:11,22`). Local mode is the test default and passes the App end-to-end tests.
- R2/R3/R4/R10: not touched. `.select("id")` on `tudo_wear_logs` relies on the existing owner policy.
- R5: nothing derived is stored in Supabase. Stats still come from `items_with_stats` (`repo.ts:283-290`).
- R6: the new toasts are in `features/items/copy.ts:12-16`.
- R7: every changed file is in the plan.
- R8: covered above.
- R9: no layout change.

### Nits (do not block)
- 💭 For an item worn today, `Editor.tsx:148` now reads "Lần cuối 0 ngày trước". This keeps the existing wording on purpose (planned, no new copy), but "hôm nay" would read better.
- 💭 `toLocalDate` accepts any `\d{4}-\d{2}-\d{2}` string, so an impossible date such as `2026-02-31` is normalised by `Date.UTC` instead of rejected. Harmless for DB/app-written values.
- 💭 The "returns 0 and an empty string when stats are null" test now also asserts `already: true` because of `{ data: null }`. That is correct, but it mixes two concerns in one test.

### Follow-ups (out of scope)
- Add `src/lib/dates.ts` to `coverage.include` and `thresholds` in `vitest.config.ts`.
- Move `toDateOnly` into `src/lib/dates.ts` and decide device-local vs fixed UTC+7 in one place (from the plan).
- Move the remaining inline strings near the changed code ("Đã tạo bản sao", "Lần cuối … ngày trước", "Chưa có lịch sử") into `EDITOR_COPY` (R6 cleanup; they existed before this ticket).
