Status: READY

# Plan — T-002: Fix date-only wear math and align local wear rules

## Feature summary
Not in the feature list. Accepted by `work/decisions.md`:

> | D9 | 2026-11-07 | Tickets not in the feature list | Accept T-001 (…), **T-002 (wear date math)**, T-003 (…). | They are bugs or gaps in today's code that block "daily use" | T-001, T-002, T-003 |

Source of the bug list, `docs/plan-M1.md` §4 row 22:

> `last_worn` is a date-only string parsed as UTC: between 00:00 and 07:00 (UTC+7), "worn today" shows **"-1 ngày"**, and the 90-day boundary shifts. Local mode counts every click; Supabase silently ignores a second wear the same day but still shows the success toast. Duplicate keeps `lastWorn`

Ticket scope (quoted):
- "Compute ages from local calendar dates in one helper (the editor's "Lần cuối … ngày trước" uses separate code)."
- "Local mode adds +1 on every "Mặc hôm nay" click, while Supabase allows one wear per item per day. Align local mode with the DB rule."
- "When today's wear already exists, show "Đã ghi nhận hôm nay rồi" instead of "Đã ghi nhận mặc hôm nay". F-501 (M2) defines that message for back-dated wear; this is only the today case."
- "Duplicate: also reset `lastWorn` (today only `wearCount` is reset)."
- Technical note: "`repo.wear(+1)` in Supabase mode uses `ignoreDuplicates`, so it cannot tell "inserted" from "already there". Return a flag".

Out of scope: back-dated wear (F-501).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Unit tests with a fixed clock at 02:00 UTC+7 show "hôm nay" for an item worn today. | `src/lib/dates.test.ts` › "daysSince is 0 at 02:00 UTC+7 for a YYYY-MM-DD worn today"; `src/features/items/filters.test.ts` › "ageInDays is 0 at 02:00 UTC+7 for today's date-only value"; `src/features/items/ItemCard.test.tsx` › "shows "hôm nay" at 02:00 UTC+7 for an item worn today" (renders the card with `age={ageInDays}` under `vi.setSystemTime("2026-11-07T02:00:00+07:00")`, `lastWorn: "2026-11-07"`). `pnpm test` green. |
| 2 | 90-day stale boundary uses calendar days (the "shifts by one day" part of the scope). | `filters.test.ts` › "isStale flips exactly at 90 calendar days for a YYYY-MM-DD value at 02:00 UTC+7" (89 → false, 90 → true). |
| 3 | Clicking "Mặc hôm nay" twice gives one wear in both modes, and the second click shows the "already" message. | Local: `src/data/repo.local.test.ts` › "wear +1 twice on the same day counts once and flags already"; `src/App.test.tsx` › "Mặc hôm nay twice counts once and shows "Đã ghi nhận hôm nay rồi"". Supabase: `src/data/repo.supabase.test.ts` › "+1 returns already=false when a row was inserted" and "+1 returns already=true when today's log already exists" (upsert `.select("id")` returns `[]`). Hook: `src/data/useWardrobe.test.tsx` › "wear passes the already flag through and does not store it on the item". |
| 4 | Editor "Lần cuối … ngày trước" uses the same helper. | Code read: `Editor.tsx` no longer contains `86400000` / `new Date(item.lastWorn)`; it calls `ageInDays`. `grep -n 86400000 src/features/items/Editor.tsx` returns nothing. |
| 5 | Duplicate resets `lastWorn` as well as `wearCount`. | `App.test.tsx` › "duplicate resets wear count and last worn" — after wear +1 then "Nhân bản" then save, the new card shows `0×` and not "hôm nay" (in local mode an empty `lastWorn` renders "hơn 1 năm"). |
| 6 | Checks green. | `pnpm typecheck && pnpm format:check && pnpm test && pnpm build`; coverage thresholds still met (`pnpm test:coverage`). |

## Ming verification after merge
- Hosted Supabase, on the phone: open an item, tap "Mặc hôm nay" twice → count goes up once; second toast is "Đã ghi nhận hôm nay rồi".
- Between 00:00 and 07:00 local time (or any time the next morning): an item worn today shows "hôm nay" on its card, not "-1 ngày".

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/dates.ts` (new) | `localDate(d)`, `localToday(now?)` (moved here from `lib/supabase.ts`), `toLocalDate(value)` (YYYY-MM-DD passes through; timestamp → device-local calendar date; empty/invalid → `""`), `daysSince(value, now?)` (whole calendar days, `null` for empty/invalid, never negative). | Scope: "Compute ages from local calendar dates in one helper". Pure module, unit-tested (R8). |
| `src/lib/dates.test.ts` (new) | Unit tests for the helpers. | R8, AC 1. |
| `src/lib/supabase.ts` | Remove `localToday` (moved to `lib/dates.ts`). | Single home for date helpers; only `repo.ts` imports it. |
| `src/features/items/filters.ts` | `ageInDays` delegates to `daysSince` (empty/invalid → 999, as today for empty). `isStale` / `sortItems` unchanged otherwise. | Fixes "-1 ngày" and the stale boundary. |
| `src/features/items/filters.test.ts` | Replace "parses YYYY-MM-DD as UTC midnight (records current behaviour)" with the new behaviour; add 02:00 UTC+7 and stale-boundary cases. | AC 1, 2. |
| `src/features/items/ItemCard.test.tsx` (new) | Render test for the "hôm nay" label at 02:00 UTC+7. | AC 1 ("show 'hôm nay'"). |
| `src/data/repo.ts` | `wear` returns `WearOutcome = WearResult & { already: boolean }`. Local: one wear per local day, `lastWorn` stored as `localToday()`; −1 logic below. Supabase: `.upsert(…, { ignoreDuplicates: true }).select("id")`, `already = !data?.length`. Import `localToday` from `@/lib/dates`. | Scope items 2 and the technical note. |
| `src/data/repo.local.test.ts` | Replace "sets lastWorn to now" and "counts twice (records current behaviour)"; add the cases listed below. | R8, AC 3. |
| `src/data/repo.supabase.test.ts` | Update the `wear` tests for `.select("id")` after `upsert` and the `already` flag. | R8, AC 3. |
| `src/data/useWardrobe.ts` | `wear` strips `already` before merging into items state and returns the full outcome. | Keep `already` out of `Item` objects (they are saved and exported). |
| `src/data/useWardrobe.test.tsx` | Add the pass-through test. | R8, AC 3. |
| `src/features/items/copy.ts` | Add `EDITOR_COPY.wear = { worn: "Đã ghi nhận mặc hôm nay", alreadyWorn: "Đã ghi nhận hôm nay rồi", adjusted: "Đã điều chỉnh số lần mặc" }`. | R6: UI copy in one place per feature. |
| `src/App.tsx` | `onWorn`: pick toast by `already`; merge only `wearCount`/`lastWorn` into the editor. `onDuplicate`: add `lastWorn: ""`. | Scope items 3 and 4. |
| `src/App.test.tsx` | Add "Mặc hôm nay twice…" and "duplicate resets wear count and last worn". Existing wear tests stay green (demo item 0 was worn 3 days ago). | AC 3, 5. |
| `src/features/items/Editor.tsx` | "Lần cuối … ngày trước" uses `ageInDays(item.lastWorn)` from `./filters`. | Scope item 1 ("the editor … uses separate code"). |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/lib/dates.test.ts` › "localToday returns the UTC+7 date just after local midnight" (`setSystemTime("2026-11-06T17:30:00Z")` → `"2026-11-07"`) | moved helper, TZ boundary |
| `dates.test.ts` › "toLocalDate passes YYYY-MM-DD through unchanged" | DB format |
| `dates.test.ts` › "toLocalDate turns a timestamp into the local (UTC+7) calendar date" (`"2026-11-06T18:30:00.000Z"` → `"2026-11-07"`, `"2026-11-06T16:59:59.000Z"` → `"2026-11-06"`) | local-mode / demo ISO values |
| `dates.test.ts` › "toLocalDate returns "" for empty and invalid input" | empty values |
| `dates.test.ts` › "daysSince is 0 at 02:00 UTC+7 for a YYYY-MM-DD worn today" | AC 1, the bug |
| `dates.test.ts` › "daysSince is 0 at 23:59 and 1 at 00:00 the next local day" | day boundary in UTC+7 |
| `dates.test.ts` › "daysSince counts calendar days for ISO timestamps (worn 23:00 yesterday → 1 at 01:00)" | mixed formats |
| `dates.test.ts` › "daysSince returns null for empty/invalid and 0 for a future date" | edge cases, no negative ages |
| `dates.test.ts` › "daysSince across a month and year boundary" (`"2025-12-31"` at `2026-01-01T02:00+07:00` → 1; `"2026-02-28"` → `2026-03-01` = 1) | calendar math |
| `src/features/items/filters.test.ts` › "ageInDays is 0 at 02:00 UTC+7 for today's date-only value" (replaces the "records current behaviour" test) | AC 1 |
| `filters.test.ts` › "ageInDays returns 999 for an empty or invalid date" | empty values |
| `filters.test.ts` › "isStale flips exactly at 90 calendar days for a YYYY-MM-DD value at 02:00 UTC+7" | AC 2 |
| Existing `filters.test.ts` isStale / sort / filter tests stay green unchanged | regression |
| `src/features/items/ItemCard.test.tsx` › "shows "hôm nay" at 02:00 UTC+7 for an item worn today" | AC 1 |
| `ItemCard.test.tsx` › "shows "1 ngày" at 00:30 UTC+7 for an item worn yesterday" | boundary |
| `src/data/repo.local.test.ts` › "wear +1 sets lastWorn to today's local date (YYYY-MM-DD) and already=false" (at `2026-11-06T17:30:00Z` → `"2026-11-07"`) | local rule, TZ |
| `repo.local.test.ts` › "wear +1 twice on the same day counts once and flags already" (second call returns `already: true`, `wearCount` unchanged, stored item unchanged) | AC 3 |
| `repo.local.test.ts` › "wear +1 counts again on the next local day" | rule is per day, not per item |
| `repo.local.test.ts` › "wear +1 when lastWorn is an ISO timestamp from earlier today (demo/legacy data) flags already" | mixed formats |
| `repo.local.test.ts` › "wear −1 after today's wear restores the previous lastWorn" | undo symmetry |
| `repo.local.test.ts` › "wear −1 of today's wear with no remembered previous date clears lastWorn" (e.g. new repo instance) | fallback |
| `repo.local.test.ts` › "wear −1 to 0 clears lastWorn" | aligns with Supabase (no logs → null) |
| `repo.local.test.ts` › "wear −1 of an older wear keeps lastWorn" (replaces the "records current behaviour" test) | local has no history |
| Existing "wear −1 never goes below 0" and "wear on an item not in storage uses the passed item" stay (add `already: false` where `toEqual` is used) | regression |
| `src/data/repo.supabase.test.ts` › "+1 logs today's local date (UTC+7) ignoring duplicates, returns the stats and already=false" (call list now includes `select("id")` after `upsert`; upsert result `{ data: [{ id: "log-1" }] }`) | flag, inserted |
| `repo.supabase.test.ts` › "+1 returns already=true when today's log already exists" (upsert result `{ data: [] }`) | AC 3 |
| `repo.supabase.test.ts` › "+1 treats a null upsert result as already" (`{ data: null }`) | defensive edge |
| Existing −1 / error / null-stats tests updated to expect `already: false` | regression |
| `src/data/useWardrobe.test.tsx` › "wear passes the already flag through and does not store it on the item" (local repo, wear twice; second result `already: true`; `items[0]` has no `already` key, `wearCount` 1) | hook, no Item pollution |
| `src/App.test.tsx` › "Mặc hôm nay twice counts once and shows "Đã ghi nhận hôm nay rồi"" | AC 3 (local, end to end) |
| `App.test.tsx` › "duplicate resets wear count and last worn" | AC 5 |

## Approach
1. **`src/lib/dates.ts`.** Device-local calendar math (the same zone `localToday()` already writes into `worn_on`; tests run in `Asia/Ho_Chi_Minh` via `vitest.config.ts`).
   - `localDate(d: Date | number)`: `YYYY-MM-DD` from `getFullYear/getMonth/getDate`.
   - `localToday(now = Date.now())`: `localDate(now)`. Move it from `lib/supabase.ts` (only `repo.ts` imports it).
   - `toLocalDate(value)`: `""` → `""`; `/^\d{4}-\d{2}-\d{2}$/` → unchanged; else `Date.parse`, `NaN` → `""`, otherwise `localDate(t)`.
   - `daysSince(value, now = Date.now())`: `d = toLocalDate(value)`, `null` if `""`; otherwise `(Date.UTC(today y,m,d) − Date.UTC(d y,m,d)) / 86400000`, clamped with `Math.max(0, …)`. Using `Date.UTC` on both dates keeps the result an integer and DST-safe.
2. **`filters.ts`.** `ageInDays = (date, now = Date.now()) => daysSince(date, now) ?? 999`. `ItemCard`, `isStale`, `sortItems`, `StatsRow` and `Hero` pick this up with no change.
3. **`Editor.tsx`.** Replace the inline `Math.floor((Date.now() - +new Date(item.lastWorn)) / 86400000)` with `ageInDays(item.lastWorn)`. Keep the text "Lần cuối {n} ngày trước" as is (no new copy).
4. **`repo.ts`.**
   - `export type WearOutcome = WearResult & { already: boolean }` and `wear(...): Promise<WearOutcome>`. Document it: `already` is true when +1 found a wear for today, and it is always false for −1.
   - Local `wear`: `today = localToday()`; `wornToday = toLocalDate(cur.lastWorn) === today`.
     - +1: if `wornToday`, return the current stats with `already: true` and do not persist. Otherwise remember `prevWorn.set(id, cur.lastWorn)` (a `Map` in the repo closure, in memory only), then persist `{ wearCount: +1, lastWorn: today }` with `already: false`.
     - −1: `wearCount = max(0, n−1)`. `lastWorn`: `""` if the new count is 0; else, if `wornToday`, `prevWorn.get(id) ?? ""` (and delete the entry); else unchanged.
   - Supabase `wear` +1: chain `.select("id")` after the upsert; `already = !(data && data.length)`. With `ignoreDuplicates` PostgREST runs `ON CONFLICT DO NOTHING … RETURNING`, so a duplicate returns no row. The owner-full-access RLS policy on `tudo_wear_logs` already allows the `RETURNING` select (init migration, line 153). The stats query stays as it is. −1 returns `already: false`.
5. **`useWardrobe.ts`.** `const out = await repo.wear(item, delta); const { already: _a, ...stats } = out;` (or explicit pick). `setItems` merges `stats` only, and the hook returns `out`.
6. **`copy.ts` + `App.tsx`.** Add `EDITOR_COPY.wear`. In `onWorn`, merge only `{ wearCount, lastWorn }` into the editor; toast `delta < 0 ? adjusted : res.already ? alreadyWorn : worn`. In `onDuplicate`, add `lastWorn: ""`.
7. Update the tests listed above, then run the checks.

Rules:
- R1: every change goes through `WardrobeRepo`, in both implementations, and local mode stays default in tests.
- R5: nothing derived is stored in Supabase; local mode keeps its counters, as today.
- R6: Vietnamese toasts go to `features/items/copy.ts`.
- R7: `toDateOnly` is not moved (see Assumptions).
- R8: pure logic and the repo have tests.
- R9: no layout change.
- R2/R3/R4/R10: not touched.

## Specialist input used
None (no consult files).

## Assumptions
- **"Local calendar date" means the device time zone**, the same as `localToday()`, which already writes `worn_on` in Supabase mode. For Ming (Vietnam) this equals UTC+7, and tests pin `TZ=Asia/Ho_Chi_Minh`. `toDateOnly` in `csv/serialize.ts` uses a fixed +7 offset for CSV export and validation. The two agree for UTC+7 devices.
- **Not moving `toDateOnly` into `src/lib`** in this ticket. F-201 flagged that move, but it touches `serialize.ts`, `map.ts`, `validate.ts`, `Editor.tsx` and two test files, none of which this ticket needs beyond the Editor wear line (R7). `src/lib/dates.ts` is created here, so it becomes the natural target. Follow-up: "Move `toDateOnly` to `src/lib/dates.ts` and decide device-local vs fixed UTC+7 in one place."
- Local mode now stores `lastWorn` as `YYYY-MM-DD`, the same format as Supabase. Demo items and existing localStorage data keep their ISO timestamps; `toLocalDate` reads both, and CSV export already normalises both via `toDateOnly`.
- Local −1 cannot know the previous wear date (local mode has no wear log, `docs/plan-M1.md` row 18). The repo remembers it in memory for the session. After a reload, undoing today's wear clears `lastWorn`. Without this, undo followed by "Mặc hôm nay" would be refused as "already".
- `daysSince` clamps future dates (clock or zone change) to 0, so the card never shows a negative age. The Editor keeps the existing "Lần cuối 0 ngày trước" wording for today: no new copy is added.
- Supabase mode still runs the stats query when `already` is true, so the UI also picks up a wear logged from another device.
- **Hotspots:**
  - `src/App.tsx` is edited (small changes in `onWorn` and `onDuplicate`).
  - No other ticket is currently `IN_PROGRESS`/`REVIEW`/`DONE`.
  - `src/data/repo.ts` will later be edited by T-005.2–T-005.4 (photos, a different part of the file). They are not open yet, so expect only an easy rebase.
- Estimated diff: ~120 lines of source and ~200 lines of tests, within one cycle.

## Blocking questions
None.

## Split proposal
None.
