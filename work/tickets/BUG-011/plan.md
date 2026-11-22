Status: READY

# Plan — BUG-011: Never-worn items show "hơn 1 năm" and a brand-new item counts as "≥ 90 ngày chưa mặc"

## Scope summary

`work/decisions.md` D51 (amends the feature-list glossary):

> An item is stale when it was last worn 90 or more days ago, or when it has never been worn **and** was added 90 or
> more days ago (`createdAt`). A never-worn card says "chưa mặc", not a day count. Applies to the "≥ 90 ngày chưa mặc"
> stat and the hero count. Nothing derived is stored (R5).

`work/tickets/BUG-011/ticket.md`:

> ## Scope
> - Card wear pill: show "chưa mặc" when `lastWorn` is empty.
> - Stale count, stat card label and hero line: apply the rule Ming picks (Notes).
>
> ## Out of scope
> - Sort "Lâu chưa mặc" order (never-worn first is fine).
> - Outfit suggestion ranking (it uses its own reasons).

`docs/feature-list.md:44`, the line this ticket replaces because D51 amends it:

> - **Stale (lâu chưa mặc):** not worn for 90 days or more, or never worn.

**Root cause, confirmed against the code.** `src/features/items/filters.ts:7` is
`daysSince(date, now) ?? 999`. An empty `lastWorn` becomes 999, so:
- `src/features/items/ItemCard.tsx:39` prints "hơn 1 năm" (`days > 365`);
- `isStale` (`filters.ts:9-10`) returns true, which feeds `StatsRow.tsx:33`, `Hero.tsx:28` and the `special === "stale"`
  filter (`filters.ts:36`).

The fix changes `isStale` and the card label. It does **not** change `ageInDays` or its 999 fallback, because the
out-of-scope sort depends on them (`filters.ts:48`, pinned by `filters.test.ts:169`).

## Acceptance criteria → verification

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: it fails on `main` before the fix and passes after | `ItemCard.test.tsx` › "never-worn item shows chưa mặc" and the tests marked **fails before** below. `impl-log.md` records their failing output from before the fix and their passing output after |
| 2 | A never-worn card says "chưa mặc", not a day count (D51) | `ItemCard.test.tsx` › "never-worn item shows chưa mặc": the pill text is exactly `👕 0× · chưa mặc` |
| 3 | An item added today is not counted by "≥ 90 ngày chưa mặc" but is counted by "Chưa mặc lần nào" | `StatsRow.test.tsx` › "a new never-worn item counts as never worn but not as stale" |
| 4 | The hero line does not count an item added today | `Hero.test.tsx` › "hero count follows D51 for never-worn items" |
| 5 | A never-worn item is stale only from 90 local calendar days after `createdAt` | `filters.test.ts` › `isStale` never-worn cases (today, 89, 90, UTC+7 boundary) |
| 6 | Worn items keep the current rule | `filters.test.ts` › existing 89/90/91-day cases and "a worn item ignores createdAt" |
| 7 | Empty or invalid `createdAt` on a never-worn item is not stale (planner decision, see Assumptions) | `filters.test.ts` › "a never-worn item with an empty or invalid createdAt is not stale" |
| 8 | The stat card filter shows the same set as its count | `filters.test.ts` › 'special "stale" excludes a new never-worn item'; existing `App.test.tsx` › "stale and never stat cards toggle a filter" |
| 9 | "Lâu chưa mặc" sort is unchanged | Existing `filters.test.ts:169` passes **unmodified**; `ageInDays` tests at `:36` and `:50` pass unmodified; the diff does not touch `ageInDays` or `sortItems` |
| 10 | Outfit ranking is unchanged | New guard `suggest.test.ts` › "a never-worn item added today still ranks with stale pieces"; existing ranking and reason tests pass unmodified; the diff does not touch `suggest.ts` |
| 11 | The spec matches D51 | `docs/feature-list.md:44` reads as in Approach step 4 |
| 12 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, run in the native WSL copy (see Tests to write) |

## Ming verification after merge

After the next production release, on the real wardrobe:
1. Never-worn cards show "👕 0× · chưa mặc".
2. "≥ 90 ngày chưa mặc" and the hero count drop to about 0, because no item is 90 days old yet, while "Chưa mặc lần nào"
   stays about 70. D51 accepts this.
3. Adding an item raises "Chưa mặc lần nào" by 1 and leaves "≥ 90 ngày chưa mặc" unchanged.

## Files to create / modify

| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/items/filters.ts` | Apply the D51 rule in `isStale`; widen its `Pick` to `lastWorn`, `wearCount`, `createdAt` | The stale rule lives here | No |
| `src/features/items/ItemCard.tsx` | Show the never-worn label when `item.lastWorn === ""` | Card must not show a day count (D51) | No |
| `src/features/items/copy.ts` | Add `EDITOR_COPY.wear.neverWorn: "chưa mặc"` | R6, and BUG-015 is told to reuse this wording | No |
| `docs/feature-list.md` | Replace line 44 | The spec must match D51 | No |
| `src/features/items/ItemCard.test.tsx` | Add the first regression test | AC 1, 2 | No |
| `src/features/items/filters.test.ts` | Move `isStale` calls to `makeItem` (new `Pick`); replace the test at `:71-73`; add cases | AC 1, 5-8 | No |
| `src/features/items/StatsRow.test.tsx` | Add the count test | AC 3 | No |
| `src/features/layout/Hero.test.tsx` | Add the hero test | AC 4 | No |
| `src/features/outfits/suggest.test.ts` | Add the ranking guard | AC 10: the existing never-worn fixture has `createdAt: "2026-01-01"`, 195 days before `JULY`, so it never reaches the new "young item" branch | No |
| `src/data/repo.http.test.ts` | Add the duplicate `createdAt` guard | Pins the path the consult could not locate (see Assumptions) | No |

Not changed, on purpose: `StatsRow.tsx` and `Hero.tsx` (they already call `isStale`, and their copy stays true under
D51), `suggest.ts`, `App.tsx`, `App.test.tsx`, `Editor.tsx`, `src/test/memoryRepo.ts`, `work/decisions.md` (D51 is
already recorded).

## Tests to write

**Where checks run.** pnpm works only under WSL. Run every check in a **native WSL copy of this worktree**, not on the
Windows path: sync the changed files there, run `pnpm install --frozen-lockfile`, then `pnpm format:check`,
`pnpm typecheck`, `pnpm test` and `pnpm build`. To prove the regression, run the new tests in that copy **before**
applying the fix and record the failures in `impl-log.md`. Vitest pins `TZ=Asia/Ho_Chi_Minh` (`vitest.config.ts:7`), so
the UTC+7 cases are deterministic.

Write test 1 first. "Fails before" means it fails on the current `filters.ts` and `ItemCard.tsx`. Guards pass both
before and after.

| # | Test (file › name) | Covers | Before fix |
|---|---|---|---|
| 1 | `ItemCard.test.tsx` › "never-worn item shows chưa mặc" (`wearCount: 0`, `lastWorn: ""`; `.wear-pill` text is exactly `👕 0× · chưa mặc`; assert the literal, not the copy constant) | **Regression**, card | **Fails** ("hơn 1 năm") |
| 2 | `filters.test.ts` › `isStale` › "a never-worn item added today is not stale" | **Regression**, D51 | **Fails** |
| 3 | `filters.test.ts` › `isStale` › "a never-worn item added 89 days ago is not stale" | D51 boundary | **Fails** |
| 4 | `filters.test.ts` › `isStale` › "a never-worn item added exactly 90 days ago is stale" (replaces `:71-73`) | D51 boundary | Guard |
| 5 | `filters.test.ts` › `isStale` › "never-worn boundary uses the UTC+7 calendar day": at `2026-11-07T02:00:00+07:00`, `createdAt: "2026-08-09T17:00:00Z"` (local 08-10 00:00, 89 days) is false and `"2026-08-09T16:59:59Z"` (local 08-09 23:59:59, 90 days) is true | UTC vs UTC+7 (Domain focus) | **Fails** (false case) |
| 6 | `filters.test.ts` › `isStale` › "a never-worn item with an empty or invalid createdAt is not stale" (`""`, `"garbage"`) | Empty/invalid field | **Fails** |
| 7 | `filters.test.ts` › `isStale` › "a never-worn item with a future createdAt is not stale" | Clock skew | **Fails** |
| 8 | `filters.test.ts` › `isStale` › "a worn item ignores createdAt" (`lastWorn: ago(5)`, `createdAt: ago(200)` is false; `lastWorn: ago(90)`, `createdAt: ago(0)` is true) | Worn rule unchanged | Guard |
| 9 | `filters.test.ts` › `isStale` › "wearCount above 0 with an empty lastWorn stays stale" (`createdAt: ago(0)`) | Keeps outfit ranking identical even for this API-unreachable state | Guard |
| 10 | `filters.test.ts` › `matchesFilters` › 'special "stale" excludes a new never-worn item' (it still matches `special: "never"`) | Filter matches the count | **Fails** |
| 11 | `StatsRow.test.tsx` › "a new never-worn item counts as never worn but not as stale" (a 100-day-old never-worn item counts in both) | Stat cards | **Fails** |
| 12 | `Hero.test.tsx` › "hero count follows D51 for never-worn items" (new item: 0; 100-day-old item: 1) | Hero line | **Fails** |
| 13 | `suggest.test.ts` › "a never-worn item added today still ranks with stale pieces" (the `:213` scenario with `createdAt: iso(JULY, 0)`, seeds 1-20; its reasons stay `["neverWorn"]`) | Ranking unchanged | Guard |
| 14 | `repo.http.test.ts` › "a saved duplicate takes created_at from the server" (`id: ""`, old `createdAt`; the PUT body has no `created_at`; the result has the server's value) | Duplicate path | Guard |

Existing tests that must stay **unmodified**: `filters.test.ts:36`, `:50`, `:169`; `suggest.test.ts:213`, `:247`;
`App.test.tsx:199`, `:238`. Existing `isStale` cases at `filters.test.ts:57-70` change only in how they build the
argument: `isStale(makeItem({ wearCount: 1, lastWorn: ... }), now)`, with the same dates and expectations.

## Approach

1. **Write tests 1-14**, then run them in the WSL copy and record which fail before the fix.
2. **`filters.ts`.** Keep `ageInDays` as is. Replace `isStale` with:

   ```ts
   export const isStale = (
     i: Pick<Item, "lastWorn" | "wearCount" | "createdAt">,
     now = Date.now(),
   ) => {
     if (i.wearCount > 0 || i.lastWorn !== "") return ageInDays(i.lastWorn, now) >= STALE_DAYS;
     // D51: a never-worn item needs a known added date; an unknown age is not evidence of 90 days.
     const added = daysSince(i.createdAt, now);
     return added !== null && added >= STALE_DAYS;
   };
   ```

   Only the state `wearCount === 0 && lastWorn === ""` changes behaviour. All five callers already pass a full `Item`.
3. **`copy.ts` and `ItemCard.tsx`.** Add `neverWorn: "chưa mặc"` under `EDITOR_COPY.wear`. In the pill, check
   `item.lastWorn === ""` first and render `EDITOR_COPY.wear.neverWorn`; leave the existing day logic for other values.
   Keep the `age` prop.
4. **`docs/feature-list.md:44`** becomes exactly:

   ```md
   - **Stale (lâu chưa mặc):** last worn 90 or more days ago, or never worn and added 90 or more days ago (D51).
   ```

5. **Run all checks** in the WSL copy.

Why ranking is provably unchanged: `suggest.ts:141` is `isStale(item, now) || item.wearCount === 0`, and the only state
whose `isStale` result changes has `wearCount === 0`, so the tier stays 0. `suggest.ts:171` requires `wearCount > 0`,
which never enters the new branch. `candidatePool` (`suggest.ts:189-194`) does not call `isStale`.

Rules:
- **R1:** no data access changes.
- **R5:** staleness is computed at read time and nothing is stored.
- **R6:** the new string is in `copy.ts`.
- **R7:** only the files listed above change.
- **R8:** pure logic has unit tests.
- **R9:** "chưa mặc" (8 characters) is shorter than the "hơn 1 năm" (9) it replaces and uses the same pill, so no CSS
  change is needed at 390px or in dark mode.
- R2, R3, R4: not touched.

## Specialist input used

From `consult-frontend-developer.md`:

| Consult item | Decision | Reason |
|---|---|---|
| Keep `ageInDays` and change only `isStale` plus the card | **Adopted** | Verified: `filters.ts:48` needs the 999 fallback |
| Use `daysSince` for `createdAt`, local calendar days | **Adopted** | Verified at `dates.ts:13-30`; consistent with worn items |
| `createdAt` always comes from the API | **Adopted, verified** | `server/items.js:25`; `not null default now()` at `init.sql:35`; `rowToItem` at `mappers.ts:165` |
| Treat never-worn as `lastWorn` empty in `isStale` | **Changed** | The branch also requires `wearCount === 0`, so ranking stays identical without relying on the "worn items always have `lastWorn`" invariant |
| Open question 1: empty/invalid `createdAt` defaults to stale | **Rejected** | See Assumptions 1 |
| Open question 2: do not show the added age on the card | **Adopted** | Ticket and D51 say "chưa mặc" |
| Open question 3: locate the duplicate path | **Resolved** | `src/App.tsx:224-237`, see Assumptions 2. `Editor.tsx:492` only calls the `onDuplicate` prop; the handler is in `App.tsx` |
| Keep the label inline in `ItemCard.tsx` | **Rejected** | R6 keeps copy in one place per feature, and BUG-015 reuses this wording |
| Update `App.test.tsx:201` | **Rejected** | It reads the count from the card and compares it with the filtered list, so it stays valid. Fixture items all have a non-empty `lastWorn` |
| Tests for 89/90/today, UTC+7, sort and ageInDays guards, suggest guard | **Adopted**, with corrected data | The consult's UTC+7 example (`2026-08-09T20:00:00Z`) gives 89 days in both UTC and UTC+7, so it cannot detect a timezone error. Test 5 uses a pair on the UTC+7 midnight |

## Assumptions

1. **Planner decision: a never-worn item with an empty or invalid `createdAt` is NOT stale.** Reasons:
   - D51 requires positive evidence: the item "was added 90 or more days ago". An unknown date is not that evidence.
   - Returning true would recreate this bug's cause, which is inventing an age from a missing value.
   - The safer failure: the item still appears in "Chưa mặc lần nào", whereas a false "stale" misleads the user.
   - The case is defensive only: the column is `not null`, the server always sends it, and restore rejects an invalid
     timestamp (`server/validate.js:330`).
2. **Duplicate path verified; no code change needed.** `App.tsx:224-234` spreads `...editor`, so the **draft keeps the
   source item's `createdAt`** and resets `id`, `wearCount` and `lastWorn`. This does not reach the stale count:
   `itemToRow` omits `created_at` (`mappers.ts:184-202`), the server's insert omits it so it takes `now()`
   (`server/items.js:94-96`), and `repo.save` returns the server row (`repo.http.ts:108`), which `upsertLocal` stores.
   `createMemoryRepo.save` does **not** mimic this (`memoryRepo.ts:20`), so test 14 uses the HTTP repo.
3. **Restored items keep their original `created_at`** (D49), so a restored never-worn item can be stale on day one.
   This is correct under D51.
4. **90 days means 90 device-local calendar days**, the same as worn items.
5. **Plan gate.** The ticket is P1 with `Gate: none`. Workspace `CLAUDE.md` §8 lists PLAN approval for P1 tickets, while
   this project's `.claude/loop.config.md` sets `Policy: high-paths`, and this plan touches no High path. This plan
   follows the project config; the orchestrator should confirm.
6. **Hotspots.** No ticket in `IN_PROGRESS`, `REVIEW` or `DONE` edits these files. Backlog tickets that will need a
   rebase after this one: BUG-015 (`ItemCard.tsx`, `copy.ts`), BUG-017 (`ItemCard.tsx`), BUG-012 and BUG-013
   (`suggest.test.ts`).
7. **Follow-ups, not in this diff (R7):**
   - With D51 the hero will read "Hôm nay có 0 món lâu chưa mặc — thử một món nhé?" until items reach 90 days in the app,
     which is awkward. The ticket does not ask for a copy change.
   - Clicking the "≥ 90 ngày chưa mặc" card at 0 shows "Không tìm thấy món đồ / Thử một từ khoá khác hoặc xoá bớt bộ lọc",
     which is misleading for a stat filter.

## Blocking questions

None

## Split proposal

None
