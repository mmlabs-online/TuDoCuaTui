# T-002: Fix date-only wear math and align local wear rules

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E5 — Wear tracking |
| Areas | data |
| Gate | none |
| Depends on | F-005, F-004.2 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-09T08:45:37Z |
| PR | — |

## Goal
Wear dates and counts are correct in Vietnam's time zone and behave the same in both modes.

## Feature reference
Not in the feature list: comes from a mismatch in `docs/plan-M1.md` §4; accepted in `work/decisions.md` D9.

## Scope
- Supabase returns `last_worn` as `YYYY-MM-DD`. `new Date("2026-11-07")` is UTC midnight, which is 07:00 in
  UTC+7. Between 00:00 and 07:00 local time, an item worn today shows **"-1 ngày"** on the card. The
  90-day stale boundary also shifts by one day. Compute ages from local calendar dates in one helper (the
  editor's "Lần cuối … ngày trước" uses separate code).
- Local mode adds +1 on every "Mặc hôm nay" click, while Supabase allows one wear per item per day. Align
  local mode with the DB rule.
- When today's wear already exists, show "Đã ghi nhận hôm nay rồi" instead of "Đã ghi nhận mặc hôm nay".
  F-501 (M2) defines that message for back-dated wear; this is only the today case.
- Duplicate: also reset `lastWorn` (today only `wearCount` is reset).

## Out of scope
- Back-dated wear (F-501).

## Acceptance criteria
- [ ] Unit tests with a fixed clock at 02:00 UTC+7 show "hôm nay" for an item worn today.
- [ ] Clicking "Mặc hôm nay" twice gives one wear in both modes, and the second click shows the "already" message.

## Technical notes
- Files: `src/features/items/filters.ts`, `src/data/repo.ts` (local `wear`), `src/data/useWardrobe.ts`, the editor.
- `repo.wear(+1)` in Supabase mode uses `ignoreDuplicates`, so it cannot tell "inserted" from "already there".
  Return a flag, for example by comparing `wear_count` before and after.
- Not in the feature list, so it needs Ming's OK. These are bugs in today's code, and M1 promises daily use.

## Test plan
- Unit: age helper with fake timers in `Asia/Ho_Chi_Minh` (`TZ` env in Vitest); local repo wear twice.
- Manual: smoke test step "wear today twice".

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
