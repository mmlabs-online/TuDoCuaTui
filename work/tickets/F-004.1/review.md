## Attempt 1 — 2026-11-08
Verdict: PASS

### Checks (run by reviewer)
Run in worktree `.wt-tudocuatui/F-004.1`, branch `ticket/F-004.1` @ `ec244de`, merge-base with `origin/main` = `f13ea5c`.
- typecheck: pass (`tsc --noEmit`, exit 0)
- format:check: pass ("All matched files use the correct format", 44 files)
- test: pass (7 files, 87 tests; matches impl-log)
- build: pass (vite 8.0.5, 80 modules, built in 317ms)

### Acceptance criteria
- [x] 1. No visual or behavioural change (agent substitute) — evidence:
  (a) `git diff --color-moved=plain --color-moved-ws=allow-indentation-change origin/main...HEAD -- src/App.tsx src/components src/constants/wardrobe.ts src/data/demo.ts`: every non-moved line is one of: `import` lines, `function X` → `export function X` / `const X` → `export const X` declaration lines, the four derived lists (`wardrobe.ts:4-7`), the `sortOptions` literal (`wardrobe.ts:8-14`, same 5 labels and order as the old inline array), the two `THEME_KEY` swaps (`App.tsx` theme `useState` and `localStorage.setItem`), `useState<string>(sortOptions[0])` and `options={sortOptions}`. The removed `const colors = Object.keys(colorMap)` and the label literals are replaced by the derivations. No JSX, className, inline style or copy string changed. A line-set cross-check (removed lines from `App.tsx` vs. contents of the new files, whitespace-trimmed) gives the same result.
  (b) `src/constants/wardrobe.test.ts` pins `categoryNames`, `statuses`, `seasons`, `colors`, `sortOptions`, `frameColors` to the pre-refactor literals (values and order), and checks `colorMap` keys = `colors` and `categoryIcons` keys = `["Tất cả", ...categoryNames]`. All pass.
  (c) `src/data/demo.test.ts` pins 16 items / ids 1..16, labels known, photo-less items 14 and 16, the 4 locations (en dash kept), and the relative dates under fake timers. All pass.
- [x] 2. `tsc --noEmit`, `pnpm build`, `pnpm test` pass — evidence: Checks above.
- [x] 3. Label lists exist in one place only — evidence: `wardrobe.ts:4-7` derive from `CATEGORY_TO_DB`/`STATUS_TO_DB`/`SEASON_TO_DB`/`COLOR_TO_DB` (`mappers.ts`). The plan's grep hits only tests, demo item data in `demo.ts`, and `App.tsx:581` `update("seasons", ["Xuân", "Hạ"])`. That last one is the existing "Tự điền từ ảnh" mock value (also on `origin/main:src/App.tsx:1017`), not a label list.
- [x] 4. Local mode still loads the demo items — evidence: `App.tsx:50` `useWardrobe(starter, locations)` with both imported from `@/data/demo`; `demo.test.ts` length 16; `repo.local.test.ts` green.
- [x] 5. F-005 mapper round-trip still passes against shared constants — evidence: `git diff origin/main...HEAD -- src/data/mappers.ts src/data/mappers.test.ts` is empty; suite green.
- [x] 6. `App.tsx` uses `THEME_KEY` — evidence: `grep '"tu-do-theme"' src/App.tsx` returns nothing; import from `@/lib/theme` (`App.tsx:26`).

Ming verification after merge (not verified here; carry into the PR):
- Local-mode screenshots (no `VITE_SUPABASE_*`, `pnpm dev`) at 390px and desktop, light and dark, before and after the merge, same day: header, hero collage, stats row, filter dropdowns (Trạng thái / Mùa / Màu / Sắp xếp: same options and order), category chips with icons and counts, item cards (frame colours, colour dots), the no-results state ("zzz"), editor modal chips, delete confirm modal (Esc and backdrop click still close it).
- Figma Make preview still shows the 16 demo items.

### Scope
Changed files: 8 `src/components/*.tsx`, `src/constants/wardrobe.ts` (+test), `src/data/demo.ts` (+test), `src/App.tsx`, and the ticket's `impl-log.md`/`plan.md`/`ticket.md`. All are in the plan's file list. The diff is empty for `mappers.ts`, `filters.ts`, `vite.config.ts`, `AGENTS.md`, `package.json` and `vitest.config.ts`. `work/backlog.md` is untouched (D16).

Resumed WIP: the committed result matches the plan (moved code, not rewritten), as shown by the moved-line diff above.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data-access change; local path unchanged. R6: lists derive from `mappers.ts`; copy strings moved, not rewritten. R7: moves only, plus the adopted F-101 `THEME_KEY` follow-up listed in the plan. R8: new pure modules have tests. R9: no markup or CSS change. R10: Figma Make files untouched. R2–R5: not applicable.

### Merge note
PR #11 (F-401) changes 1 line of `src/App.tsx` (the search placeholder in the `App` JSX). This branch does not touch that line, but it rewrites large parts of the same file. Git may merge it cleanly. Whichever PR lands second should rebase and re-run the checks. This was not judged against F-004.1.

### Nits (do not block)
- `sortOptions` could be `as const` with a `SortOption` type once `sortItems` uses it (see follow-ups). It is left as `string[]` on purpose to keep the moves-only diff.

### Follow-ups (out of scope)
- Add `src/constants/**` to the coverage `include` (after F-005.2).
- Add an App render smoke test in local mode once RTL lands (F-005.2).
- Point `sortItems` in `src/features/items/filters.ts` at `sortOptions` after F-401 merges.
