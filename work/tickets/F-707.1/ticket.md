# F-707.1: Occasion enum and rule prefilter in the outfit pool

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P1 |
| Size | S |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | data |
| Gate | none |
| Depends on | BUG-012, BUG-013 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | claude@2026-11-24T03:37:48Z |
| PR | — |

## Goal
Narrow the outfit candidate pool by occasion with pure rules before any AI call, so suggestions fit the occasion and fewer items reach the provider.

## Scope reference
`docs/feature-list.md` E7 → F-707 ("Occasion and suggestion token optimization") and its AC list; OQ-7 (answered by Ming 2026-11-22: "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch", mapped from category and tags). D53 (suggestion prices). Split F-707.1 "Occasion rules". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Fixed occasion enum (`di_lam`, `di_choi`, `hen_ho`, `du_tiec`, `du_lich` or similar ids) with Vietnamese labels through `src/constants/`/mappers (R6).
- Pure prefilter mapping each occasion from category and existing tags only (no schema change).
- Lower the client candidate cap from 40 to at most 20 in `candidatePool`.

## Out of scope
- Server validation (F-707.2); cache (F-707.3); occasion picker UI (F-707.4); a new item field for occasion.

## Acceptance criteria
- [ ] The occasion enum holds exactly the five values from OQ-7, with labels only through the mapper/constants layer.
- [ ] The prefilter is a pure function that maps occasions from category and tags only, with unit tests per occasion.
- [ ] The candidate pool returns at most 20 items.
- [ ] Existing `suggest.test.ts` cases (including BUG-012/BUG-013 behaviour) still pass.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- Runs after BUG-012 and BUG-013, which change the same `eligibility()` logic.
- Files: `src/features/outfits/suggest.ts` (+ tests), `src/constants/`.

## Test plan
- Unit: prefilter per occasion, cap 20, regression of existing suggest tests.
- Manual: none.

## Notes / answers from Ming

## Handoff
