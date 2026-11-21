# Consult — frontend-developer — BUG-011 (2026-11-21)

Read-only; the worktree was inspected, nothing changed.

## Findings

**Consumers of `ageInDays`, `isStale`, `daysSince`**
- `src/lib/dates.ts:26`: `daysSince` returns null for empty or invalid input. Only `ageInDays` (`filters.ts:7`) turns null into 999. It also converts timestamps to the device-local calendar date (`toLocalDate`, `dates.ts:13`).
- `ageInDays` has four callers:
  - `filters.ts:10`, inside `isStale`.
  - `filters.ts:48`, the "Lâu chưa mặc" sort. It depends on 999 to put never-worn items first, and `filters.test.ts:169` pins that order.
  - `ItemGrid.tsx:58`, passed to `ItemCard` as `age`, then used at `ItemCard.tsx:15` and `:39`.
  - `Editor.tsx:324`, behind the `item.lastWorn ?` guard, so it never sees an empty value.
- `isStale` has five callers:
  - `StatsRow.tsx:33` and `Hero.tsx:28`, the counts.
  - `filters.ts:36`, the `special === "stale"` filter.
  - `suggest.ts:141`: `tier: isStale || wearCount === 0 ? 0 : 1`. A never-worn item stays tier 0 whatever `isStale` says, so ranking is unaffected.
  - `suggest.ts:171`: `wearCount > 0 && isStale`. Worn items always have a `lastWorn` (derived from `wear_logs`), so they are unaffected.
- `suggest.ts:189` (`wornGroup`) uses `wearCount` and `lastWorn` directly and does not touch these helpers.
- Conclusion: leave `ageInDays` and its 999 fallback unchanged, and change only `isStale` plus the card. That keeps the out-of-scope sort and outfit ranking intact. If the fix removes the 999 fallback, the sort breaks (`filters.ts:48`).

**`createdAt` presence and validity**
- The server always returns it: `server/items.js:25` sends `created_at.toISOString()`, and the column is `timestamptz not null default now()` (`db/migrations/20261110120000_init.sql:35`).
- The mapper does `createdAt: r.created_at ?? ""` (`src/data/mappers.ts:165`), so the type is `string` and `""` is possible. The column is not null, so this is a defensive branch in production.
- `blankItem()` sets `new Date().toISOString()` (`blankItem.ts:21`). Unsaved items are not in the lists, so this is irrelevant to the counts.
- CSV import sets `createdAt: now` (`csv/map.ts:243`). The server ignores the client value on create, and `created_at` stays unchanged on update (`api.db.test.ts:113`).
- Test fixtures and mocks use `createdAt: ""`: `mappers.test.ts:42`, `repo.http.test.ts:69`, `useWardrobe.test.tsx:42`. `src/test/fixtures.ts:253` uses `daysAgo(i * 3)`, so only the first rows are young and the rest are older.
- I did not find the duplicate handler for the "Nhân bản" button (`Editor.tsx:488`). It was not found via grep; the implementer should check that a duplicate gets a fresh `createdAt` and `lastWorn: ""`. The server creates it with `now()` anyway.

**Date boundary**
- `lastWorn` is date-only `YYYY-MM-DD` and passes through `toLocalDate` unchanged. `createdAt` is a UTC ISO timestamp and is converted to the device-local date.
- Both then go through `localDate(now)` and `utcDay` calendar-day arithmetic (`dates.ts:29`). So 90 means 90 local calendar days, not 90×24h, and the rule stays consistent with worn items.
- Existing tests already pin the TZ-sensitive cases at `+07:00` (`filters.test.ts:42`, `:66`; `dates.test.ts:33`). Reuse that style: a `createdAt` of `2026-08-09T20:00:00Z` is local 08-10 in UTC+7, so it is 89 days at 02:00 on 2026-11-07.

**Copy and truthfulness**
- The card text is hard-coded in `ItemCard.tsx:39`; there is no copy file for it.
- The "≥ 90 ngày chưa mặc" label (`StatsRow.tsx:32`) stays true under (b), because a never-worn item added at least 90 days ago has indeed gone 90 days unworn.
- The hero text "món lâu chưa mặc" (`Hero.tsx:28`) is also still true.
- "Chưa mặc lần nào" (`StatsRow.tsx:43`, `filters.ts:37`) is unchanged, so the two stat cards now legitimately differ.
- `docs/feature-list.md:44` says "or never worn" and is now wrong.

## Recommendations
1. `filters.ts`:
   - Change the type to `isStale(i: Pick<Item,"lastWorn"|"createdAt">, now)`.
   - If `i.lastWorn` is non-empty, return `ageInDays(i.lastWorn, now) >= STALE_DAYS`.
   - Otherwise, return `(daysSince(i.createdAt, now) ?? ?) >= STALE_DAYS`.
   - Decide the missing or invalid `createdAt` case explicitly (see Open question 1). Do not use `ageInDays` for `createdAt`.
   - Keep `ageInDays` as is.
2. `ItemCard.tsx:37-40`: add an `item.lastWorn === ""` branch before the `days` logic, rendering "chưa mặc" (so "👕 0× · chưa mặc"). Keep `age` as a prop. It is a single place, so for R6 either keep the literal inline like the neighbouring "hôm nay" and "hơn 1 năm", or move it to `src/features/items/copy.ts` (which already exists, with `duplicate` at line 4). I suggest inline, to match the neighbouring strings and keep the diff small.
3. `docs/feature-list.md:44`: update to "worn 90+ days ago, or never worn and added 90+ days ago". D51 is already recorded.
4. Tests:
   - `ItemCard.test.tsx`: "never-worn item shows chưa mặc". It fails today with "hơn 1 năm".
   - `filters.test.ts`:
     - Replace the `lastWorn: ""` expectation at line 72, which now depends on `createdAt`.
     - Add never-worn cases: created 89 days ago is false, 90 days ago is true, and today is false.
     - Add a UTC+7 boundary case.
     - Keep the `ageInDays("") === 999` tests (lines 37 and 50) and the sort test (line 169) as guards that nothing out of scope changed.
   - Add or keep a `suggest.test.ts` check that a brand-new never-worn item stays tier 0.
5. Update every other test that builds `Pick<Item,"lastWorn">` objects or relies on `createdAt: ""` combined with `lastWorn: ""`: `App.test.tsx:201`, and anywhere the stale count is asserted.

## Risks
- If a test or mock leaves `createdAt: ""`, `daysSince` returns null. Then `null >= 90` is false (treated as 0), and the item would silently fall out of "stale". Handle the null case on purpose.
- Existing tests that assert `isStale({lastWorn:""}) === true` (`filters.test.ts:72`) and fixture-based counts in `App.test.tsx` may change. Check them.
- The 90-day clock for never-worn items starts at the item's `created_at`. An item imported or restored from a backup carries its original `created_at`, so it may be stale from the first day. This follows from option (b).
- The server's `created_at` is not under client control, so clock skew between client and server is possible (small, only matters at the boundary).

## Open questions
1. If `createdAt` is `""` or invalid on a never-worn item, should `isStale` be true (legacy, spec-compatible) or false? Proposed default: true, to match the previous behaviour, since the API never produces it in practice.
2. Should the card also show how long ago a never-worn item was added? Proposed default: no, per the ticket's "chưa mặc".
3. Confirm the Nhân bản (duplicate) path sets `lastWorn ""` and a fresh `createdAt` (I did not locate the handler).
