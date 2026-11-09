
# Implementation log — F-004.1

## Attempt 1
Resumed WIP: a previous session left uncommitted work in this worktree (already rebased onto origin/main, which has F-604 and T-004). I verified it against plan.md line by line (moved blocks, constants derived from `mappers.ts`, `THEME_KEY`, `sortOptions`, tests) and kept it unchanged. F-401's new search placeholder is not on `origin/main` yet (App.tsx there still has "Tìm theo tên, hãng, màu, ghi chú…"), so it is untouched here.

### Files touched
- `src/components/{Icon,Btn,Modal,Field,FilterSelect,Confirm,Skeleton,Empty}.tsx` (new) - required because: scope primitives, moved verbatim.
- `src/constants/wardrobe.ts` (new) - required because: constants; label lists derived from `mappers.ts`.
- `src/constants/wardrobe.test.ts` (new) - required because: R8, pins lists and order.
- `src/data/demo.ts` (new) - required because: demo data moved out of App.
- `src/data/demo.test.ts` (new) - required because: R8, pins demo data.
- `src/App.tsx` - required because: remove moved code, add imports, `THEME_KEY`, `sortOptions`.

### Tests added
`wardrobe.test.ts` (lists, key sets, frameColors), `demo.test.ts` (16 items, known labels, photos, locations, fake-timer dates).

### Checks (run in this worktree)
- typecheck: pass (tsc --noEmit, exit 0)
- format:check: All matched files use the correct format
- test: 7 files, 87 tests passed
- build: built OK

### Out-of-plan files
None.

### Follow-ups
- Add `src/constants/**` to coverage `include` after F-005.2.
- App render smoke test once RTL lands.
- Point `sortItems` in `filters.ts` at `sortOptions` after F-401 merges.

### Scope self-check
Moves only; no JSX, className or copy changes. Only non-moved lines are imports/exports, derived lists, `THEME_KEY`, `sortOptions`.
