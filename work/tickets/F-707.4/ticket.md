# F-707.4: Occasion picker; AI runs only on an explicit tap

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux, data |
| Gate | none |
| Depends on | F-707.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Let the user pick an occasion in the outfits modal and call the AI only when they tap, so no credit is ever spent by a weather or place change.

## Scope reference
`docs/feature-list.md` E7 → F-707 ("Occasion and suggestion token optimization") and its AC list; OQ-7 (answered by Ming 2026-11-22: "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch", mapped from category and tags). D53 (suggestion prices). Split F-707.4 "Occasion UI"; OQ-16 (D52 ordering). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Occasion picker (the five OQ-7 values) in the outfits modal; the rule-based set follows the chosen occasion.
- Remove the automatic AI call on pool, weather or seed changes; AI runs only on an explicit action (toggle-on tap or "Đổi gợi ý").
- Send `occasion` through the `aiOutfits` client (R1).

## Out of scope
- Credit display (F-706.7); chibi view (F-709.3); free-text occasions (non-goal).

## Acceptance criteria
- [ ] The user can pick one of the five occasions; the rule-based suggestions follow it.
- [ ] Changing weather or place never triggers a paid call by itself (modal test with a fake client counting calls).
- [ ] The AI is called only after an explicit tap, and the selected occasion is sent.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- **D52 ordering:** this ticket ships before or in the same release as F-706.4, so no user is charged without tapping (OQ-16).
- The modal calls the AI from an effect keyed on pool, weather and seed (`src/features/outfits/OutfitsModal.tsx:115,133-156`, ai-stylist-notes.md:52); remove it.
- Files: `OutfitsModal.tsx`, `copy.ts`, `src/data/aiOutfits.ts` (+ tests). T-032 (open F-704 tidy-ups) touches the same modal.

## Test plan
- Unit: modal call counting on weather/place change, occasion sent on tap.
- Manual: one-off Playwright check at 390px/dark.

## Notes / answers from Ming

## Handoff
