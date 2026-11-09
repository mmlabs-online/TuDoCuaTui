# F-004.2: Extract the items feature from `App.tsx`

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | ui |
| Gate | none |
| Depends on | F-004.1 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/17 |

## Goal
The grid, filters, stats and editor live in their own feature folder, ready for F-201, F-202 and F-1002.

## Feature reference
`docs/feature-list.md` F-004 (split F-004.2). Decisions: `work/decisions.md`.

## Scope
- `src/features/items/`: `ItemCard`, `ItemGrid`, `Editor`, `FilterBar` (search + selects + category chips),
  `StatsRow`.
- Also extract `Header` and `Hero` (not in the feature list's target structure, but without them `App.tsx`
  cannot get under 250 lines; the `App` component alone is about 430 lines today).
- Filter state can move into a `useItemFilters` hook that uses the F-005 helpers.

## Out of scope
- Modals other than the editor (F-004.3).
- Behaviour changes.

## Acceptance criteria
- [ ] Screenshots are identical before and after (same set as F-004.1).
- [ ] Filter, sort, category chips, stale/never cards, wear ±1, duplicate and delete behave as before.
- [ ] Build, typecheck and tests pass.

## Technical notes
- Files: `src/App.tsx`, `src/features/items/*`.
- Hotspot: this ticket and F-004.3 rewrite `App.tsx`. Do not run other tickets that touch `App.tsx` at the same time.
- Expected tier: Medium.

## Test plan
- Unit: none new (behaviour unchanged).
- Manual: screenshots, plus clicking through every editor action in local mode.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-09 — claude — DONE
- Done: planned, implemented and reviewed in one attempt (PASS). Items feature moved to `src/features/items/`, layout to `src/features/layout/`; App.tsx 991 → 458 lines; characterisation tests in `src/App.test.tsx`. PR #17.
- In progress / next: Ming merges PR #17 and does the screenshot / click-through checks; then F-004.3 or F-601.2.
- Gotchas: Editor.tsx / ItemCard.tsx are the next hotspot (F-004.3, F-201, F-202.x, F-1002, T-002) — run those one at a time.
