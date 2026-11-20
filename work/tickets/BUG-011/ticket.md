# BUG-011: Never-worn items show "hơn 1 năm" and a brand-new item counts as "≥ 90 ngày chưa mặc"

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S2 |
| Priority | P1 |
| Size | S |
| Areas | ui, data |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | v0.1.0 (T-002, commit 45c35f2: `ageInDays` falls back to 999) |
| Depends on | — |
| Needs Ming | Which rule the stale stats use (see Notes) |
| Attempts | 0 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | — |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-2). 70 of 71 items have never been
worn, and every one of their cards shows "👕 0× · hơn 1 năm". An item created during the test, one second earlier,
also showed "0× · hơn 1 năm", and the stat card "≥ 90 ngày chưa mặc" went from 70 to 71. The app has existed for
about two weeks, so "more than a year" is never true for these items. The test item was deleted afterwards.

## Environment
- Production v0.3.1, Chrome desktop.

## Steps to reproduce
1. Click "Thêm món đồ", enter a name, save.
2. Look at the new card and at the stat cards and the hero line.

## Expected
- A never-worn card says "chưa mặc" (not a day count).
- "≥ 90 ngày chưa mặc" and the hero line "Hôm nay có N món lâu chưa mặc" do not count an item added today as
  unworn for 90 days (exact rule per Ming's answer).

## Actual
- Card: "0× · hơn 1 năm". "≥ 90 ngày chưa mặc": +1. "Chưa mặc lần nào": +1. Hero: "Hôm nay có 71 món lâu chưa mặc".
- Both stat cards always show the same number, because the 90-day count includes every never-worn item.

## Root cause
**Confirmed**: `src/features/items/filters.ts:7` — `ageInDays = daysSince(date, now) ?? 999`. An empty `lastWorn`
becomes 999 days, so `src/features/items/ItemCard.tsx:39` prints "hơn 1 năm" and `isStale` (`filters.ts:9-10`) is
true. `docs/feature-list.md:44` defines stale as "not worn for 90 days or more, or never worn", so the count follows
the spec, but the label "≥ 90 ngày chưa mặc" and the card text do not.

## Scope
- Card wear pill: show "chưa mặc" when `lastWorn` is empty.
- Stale count, stat card label and hero line: apply the rule Ming picks (Notes).

## Out of scope
- Sort "Lâu chưa mặc" order (never-worn first is fine).
- Outfit suggestion ranking (it uses its own reasons).

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `ItemCard.test.tsx` › "never-worn item shows chưa mặc", plus a filters test for the chosen stale rule).
- [ ] The expected behaviour above holds.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/items/filters.ts`, `ItemCard.tsx`, `StatsRow.tsx`, `src/features/layout/Hero.tsx`, and
  `docs/feature-list.md:44` if the rule changes (record the change in `work/decisions.md`).
- If (b) is chosen, check that the item already carries `createdAt` from the API. Do not store a derived value (R5).

## Notes / answers from Ming
- Question: how should "≥ 90 ngày chưa mặc" (and the hero count) treat never-worn items?
  (a) Keep the spec and rename the card to "Lâu chưa mặc".
  (b) Count a never-worn item only when it was added 90 or more days ago (`createdAt`).
  (c) Count worn items only, so never-worn items appear only in "Chưa mặc lần nào".
  **Proposed default: (b).**

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)
