## Attempt 1 — 2026-11-21
Verdict: PASS

### Checks (run by reviewer)
Run on a fresh native WSL copy of `069316a`, `pnpm install --frozen-lockfile`, with `.env.example` as the only `.env*` file.
- `pnpm format:check` — exit 0, "All matched files use the correct format." (336 files)
- `pnpm typecheck` — exit 0, client and server clean
- `pnpm test` — exit 0, Test Files 137 passed, 11 skipped (148); Tests 1950 passed, 222 skipped (2172)
- `pnpm build` — exit 0
- Skipped tests are the DB suites: no `TEST_DATABASE_URL` was available. The diff changes no `server/` or `db/` file.
- Known flaky `server/ai/tagPhoto.test.ts` 413 (debt #57) did not fail.

### Acceptance criteria
- [x] 1. Regression tests fail before the fix and pass after — evidence: full suite with `origin/main`'s `filters.ts`, `ItemCard.tsx` and `copy.ts`: exactly 9 failed, 1941 passed, 222 skipped. The 9 are the tests the plan marks **Fails**. With the fix: the 6 changed test files pass, 137/137.
- [x] 2. Never-worn card says "chưa mặc" — evidence: `ItemCard.test.tsx` "never-worn item shows chưa mặc"; `ItemCard.tsx:40-46`. Reviewer check of the pill: never worn (new and old `createdAt`) "👕 0× · chưa mặc"; worn today "hôm nay"; 5 days "5 ngày"; 365 days "365 ngày"; 366 days "hơn 1 năm".
- [x] 3. Item added today is not in "≥ 90 ngày chưa mặc" but is in "Chưa mặc lần nào" — evidence: `StatsRow.test.tsx` "a new never-worn item counts as never worn but not as stale".
- [x] 4. Hero does not count an item added today — evidence: `Hero.test.tsx` "hero count follows D51 for never-worn items".
- [x] 5. Never-worn is stale from 90 local calendar days after `createdAt` — evidence: `filters.test.ts` never-worn cases. Reviewer check at 00:00, 02:00, 06:59:59, 07:00 and 23:59:59 UTC+7: 89 days false, 90 days true, for worn and never-worn items; a `createdAt` at local 08-10 00:00 flips at local midnight (11-07 23:59:59 false, 11-08 00:00:00 true).
- [x] 6. Worn items keep the current rule — evidence: `filters.test.ts` 89/90/91-day cases and "a worn item ignores createdAt". Reviewer differential on 5000 generated items: old and new `isStale` differ only for `wearCount 0`, empty `lastWorn`, added under 90 days.
- [x] 7. Empty or invalid `createdAt` is not stale — evidence: `filters.test.ts` "a never-worn item with an empty or invalid createdAt is not stale".
- [x] 8. Stat filter shows the same set as its count — evidence: both use `isStale` (`StatsRow.tsx:33`, `filters.ts:43`); `filters.test.ts` 'special "stale" excludes a new never-worn item'; `App.test.tsx` passes unmodified.
- [x] 9. "Lâu chưa mặc" sort unchanged — evidence: the diff does not touch `ageInDays` or `sortItems`. Reviewer differential, 200 generated lists of 40 items: `ageInDays` and all 5 sort options give identical results on old and new code.
- [x] 10. Outfit ranking unchanged — evidence: `suggest.ts` not in the diff; `suggest.test.ts` guard passes. Reviewer differential, 400 generated wardrobes: `suggestOutfits` output deep-equals the output using the old `isStale`.
- [x] 11. Spec matches D51 — evidence: `docs/feature-list.md:44` is the exact text in plan step 4 and agrees with D51.
- [x] 12. All checks pass — evidence: Checks above.

Consumers reviewed: `isStale` in `StatsRow.tsx:33`, `Hero.tsx:28`, `filters.ts:43`, `suggest.ts:141`, `suggest.ts:171`; `ageInDays` in `Editor.tsx:324` (only when `lastWorn` is set), `ItemGrid.tsx:58` to `ItemCard`, `filters.ts:55`. Duplicate and CSV import saves take `created_at` from the server insert (`server/items.js:94-96`), so a copied draft's old `createdAt` does not reach the stale count.

Scope: every changed file is in the plan's file list. No High path changed.

### Ming verification after merge
After the next production release, on the real wardrobe:
1. Never-worn cards show "👕 0× · chưa mặc".
2. "≥ 90 ngày chưa mặc" and the hero count drop to about 0, while "Chưa mặc lần nào" stays about 70 (accepted by D51).
3. Adding an item raises "Chưa mặc lần nào" by 1 and leaves "≥ 90 ngày chưa mặc" unchanged.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R5: staleness is computed at read time. R6: the new string is in `copy.ts:47`. R7: diff matches the plan. R8: new logic has unit tests. R9: not run in a browser; the pill keeps its element and CSS and the new text is shorter than the text it replaces.

### Blockers from review agents
None. No review trigger matches the changed paths or areas.

### Nits (do not block)
- `impl-log.md:26` reports "9 failed, 234 passed in the affected files" without naming the files. The same 9 failures reproduce, but the reviewer could not reproduce the 234: the 6 changed test files give 128 passed, and `vitest related` on `filters.ts` and `ItemCard.tsx` gives 233.
- `ItemCard.tsx:40` tests only `lastWorn === ""`, so `wearCount > 0` with an empty `lastWorn` would read "2× · chưa mặc". The `items_with_stats` view derives both from the same `wear_logs` rows, so the API cannot produce this state.

### Follow-ups (out of scope)
- Hero reads "Hôm nay có 0 món lâu chưa mặc — thử một món nhé?" until items reach 90 days; awkward copy.
- Clicking the "≥ 90 ngày chưa mặc" card at 0 shows "Không tìm thấy món đồ / Thử một từ khoá khác hoặc xoá bớt bộ lọc", which is misleading for a stat filter.
- Plan gate (plan Assumption 5): workspace `CLAUDE.md` §8 requires PLAN approval for P1 tickets, while this project's `loop.config.md` uses `Policy: high-paths`. This ticket is P1 with `Gate: none`; the orchestrator should confirm which applies.
