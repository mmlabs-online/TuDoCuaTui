# F-704.1: "Hôm nay mặc gì?" — rule-based outfit suggestions

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | ui, data |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-18 |
| Claimed by | — |
| PR | — |

## Goal
Ming opens "Hôm nay mặc gì?" and sees 3 outfit ideas built from clothes she actually has and can wear now,
favouring pieces she has not worn for a while. First slice of F-704: no weather, no AI call, no server change.

## Feature reference
`docs/feature-list.md` F-704 · Outfit suggestion · P2 · M3 · L:
> "Hôm nay mặc gì?": suggests 3 outfits from active items using season, weather (optional) and stale items first.

Split (2026-11-18, Ming: "tạo ticket F-704 và tách nhỏ"): F-704.1 rules + UI (this ticket), F-704.2 weather,
F-704.3 AI-ranked suggestions. Related: F-801–F-803 (saved outfits, "Mặc bộ này hôm nay") are separate tickets and
not required here. Stale rule: `isStale` (`src/features/items/filters.ts`, `STALE_DAYS`). R5: wear stats come from
`wear_logs`, never stored.

## Scope
- A pure suggestion module (e.g. `src/features/outfits/suggest.ts`) that builds up to 3 outfits from items with
  status "Đang dùng" (`active`) and a photo or not:
  - an outfit is either top (Áo) + bottom (Quần/váy), or one-piece (Đầm, Set đồ, Áo dài), plus shoes (Giày/dép) when
    available; add outer (Khoác) in cold seasons; at most one accessory (Phụ kiện);
  - current season from today's date in UTC+7 (month → Xuân/Hạ/Thu/Đông; the mapping is a named constant); items
    tagged with the current season or with no season are eligible;
  - stale and never-worn items rank first; ties broken by a seeded shuffle so "Đổi gợi ý" gives a new set;
  - the 3 outfits do not reuse the same main piece; categories `bikini` and `other` are excluded.
- A "Hôm nay mặc gì?" entry point (a button in the header/hero area) opening a modal with the 3 outfits (photo or
  category icon, name), a short reason per outfit (e.g. "Lâu chưa mặc", season), and "Đổi gợi ý".
- Tapping an item opens it in the existing editor.
- Empty / too-few-items state with a Vietnamese message (e.g. needs at least one top + bottom or one dress).
- All copy in one place (R6).

## Out of scope
- Weather (F-704.2) and AI ranking (F-704.3).
- Saving outfits or "Mặc bộ này hôm nay" (F-801–F-803).
- Any server, database or migration change.

## Acceptance criteria
- [ ] With enough active items, the modal shows 3 outfits, each valid by the rules above (unit tests on the pure module with Vietnamese category labels, empty/null seasons, UTC+7 date boundaries).
- [ ] Only items with status "Đang dùng" are used; items out of season are skipped unless nothing else fits (unit test).
- [ ] Stale and never-worn items appear before recently worn ones (unit test).
- [ ] "Đổi gợi ý" gives a different set when alternatives exist (unit test with a fixed seed).
- [ ] Too few items shows a clear Vietnamese empty state.
- [ ] Works at 390px and in dark mode (one-off Playwright check, D42).
- [ ] All checks pass.

## Technical notes
- Files: new `src/features/outfits/` (pure module + modal + copy), `src/App.tsx` / header for the entry point,
  `src/index.css`. Reuse `ItemPhoto`, `categoryIcons`, `isStale`.
- Open question for the planner: month → season mapping for Vietnam (proposed: Xuân 2–4, Hạ 5–7, Thu 8–10,
  Đông 11–1); record it as an assumption.

## Test plan
- Unit: the pure module (rules, season, ranking, shuffle, edge cases). Component: modal states.
- Manual: Ming opens "Hôm nay mặc gì?" on a phone.

## Notes / answers from Ming

## Handoff
