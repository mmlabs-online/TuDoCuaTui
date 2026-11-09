## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb` @ `2309d86`, merge-base with `origin/main` = `1ab9dd6`.
- typecheck: `pnpm typecheck` (tsc --noEmit), exit 0, no errors.
- format:check: "All matched files use the correct format." (61 files).
- test: 12 files, 219 tests passed.
- test:coverage: 12 files, 219 passed; 100% statements/branches/functions/lines (348/291/76/293), thresholds met.
- build: `vite build` OK (index JS 229.16 kB, CSS 44.68 kB).
- Characterisation tests on the pre-refactor code: exported `ce6deec` (`git archive`) to a scratch dir and ran
  `vitest run src/App.test.tsx` there: 10/10 passed. `git diff --quiet ce6deec^ ce6deec -- src/App.tsx` → App.tsx
  unchanged in that commit. `git diff ce6deec..HEAD -- src/App.test.tsx` is empty, and the only commit touching the
  file is `ce6deec`.
- These results match impl-log Attempt 1.

### Acceptance criteria
- [x] 1. Screenshots identical (agent substitute) — evidence:
  (a) I ran `git diff --color-moved=plain --color-moved-ws=allow-indentation-change origin/main...HEAD -- src/App.tsx src/features/`
  (the implementer skipped this). Lines that are not moved are only imports/exports, component signatures/prop
  types, the `useItemFilters` destructure/body additions, and the planned substitutions: `items.length`→`count`/`total`,
  `setDark(!dark)`→`onToggleDark`, `wardrobe.mode === "supabase"`→`showSignOut`, `wardrobe.signOut`→`onSignOut`,
  `setImportOpen/ExportOpen(true)`→`onImport`/`onExport` (`onClick={() => setImportOpen(true)}`→`onClick={onImport}`,
  same behaviour), `openNew`→`onAdd`, `setQuery`→`onQuery`, `setFilters((f)=>({...f,k:v}))`→`onFilter("k", v)`,
  `setSort`→`onSort`, `setCategory`→`onCategory`, `resetFilters`→`onReset`, `filters.special`→`special`,
  `toggleSpecial`→`onToggleSpecial`, card onClick→`onOpen(item)`, heading condition→`hasActiveFilters`. Several
  lines show as changed only because oxfmt re-wrapped them after de-indentation (Header sign-out `<button>`
  (src/features/layout/Header.tsx:39), `FilterSelect` sort (src/features/items/FilterBar.tsx), category `<button>`,
  `StatsRow` `<small>`, Hero copy (src/features/layout/Hero.tsx). The Hero line `…thử một món⏎nhé?` became
  `…thử một món nhé?`. JSX collapses that newline to one space, so the rendered text is the same.
  `Editor`, `ItemCard`, `blankItem` bodies are fully moved (only import/`export` lines are new).
  (b) Literal cross-check: every `className=`, `style={{…}}`, `aria-label`, string literal and non-ASCII text node
  from `origin/main:src/App.tsx` is present in `App.tsx` + `src/features/{items,layout}/*`, except the two stat-card
  template classNames where `filters.special`→`special` (planned) and the 5 substitution lines above.
  `FilterBar` (src/features/items/FilterBar.tsx:38-90) and `ItemGrid` (src/features/items/ItemGrid.tsx:26-49) return
  fragments, so no wrapper element was added. Element order in `App` (src/App.tsx:94-236) is unchanged: Header,
  error banner, main(Hero, StatsRow, wardrobe-panel(panel-heading, FilterBar, ItemGrid)), modals, toast.
  (c) `renders the 16 demo items in local mode` passes on `ce6deec` (pre-refactor) and on HEAD.
- [x] 2. Filter, sort, chips, stale/never, wear ±1, duplicate, delete behave as before — evidence: src/App.test.tsx:30-141
  (10 tests matching the plan's table). They pass before and after with the test file unchanged (see Checks).
- [x] 3. Build, typecheck, tests pass — see Checks.
- [x] 4. Local mode (R1) — evidence: src/App.tsx:24 `useWardrobe(starter, locations)` unchanged. `grep -rn supabase
  src/features/items src/features/layout` returns nothing. The tests run in local mode.
- [x] 5. Items feature folder — evidence: `src/features/items/{ItemCard,ItemGrid,Editor,FilterBar,StatsRow}.tsx`,
  `useItemFilters.ts`, `blankItem.ts` exist. The plan's grep for `stats-grid|toolbar|categories|item-grid|topbar|intro`
  on src/App.tsx returns nothing. App.tsx no longer declares `ItemCard`/`Editor`/`blankItem`.
- [x] 6. `wc -l src/App.tsx` = 458 (≤ 480). The only other components left are `ImportModal`/`ExportModal` (src/App.tsx:240+).

Scope: changed files = plan's file list + ticket.md/impl-log.md/plan.md (workflow). No out-of-plan source files.
`work/backlog.md` is untouched (D16).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: see AC 4. R2–R5: n/a (no migrations, env, storage or stored derived values). R6: copy
was moved without changes, and labels still come from `@/constants/wardrobe`. R7: diff limited to moves + wiring.
R8: characterisation tests added. `useItemFilters` adds only the one-line `setFilter`/`hasActiveFilters`, which
the App tests exercise. R9: from reading the code, the classNames (incl. `desktop-btn` src/features/layout/Header.tsx:43,46
and `mobile-import` src/features/layout/Hero.tsx:43), the inline styles and the DOM structure are unchanged, and
`src/index.css` is untouched, so 390px and dark-mode rendering should be unchanged. Ming's screenshots confirm
after merge. R10: `AGENTS.md`, `.figma/`, `vite.config.ts` untouched.

### Nits (do not block)
- impl-log Attempt 1 skipped the plan's step-6 `--color-moved` self-check. The reviewer ran it (clean), but next
  time the implementer should run it.
- `ItemGrid` keeps the `Skeleton`/`Empty` helpers in the same file (fine). `StatsRow.special`/`onToggleSpecial` are
  typed `string`, while a `"" | "stale" | "never"` union would be tighter. This is a later cleanup.

### Follow-ups (out of scope)
- Add `src/features/items/**` and `src/constants/**` to the coverage `include`.
- `ItemCard` could import `ageInDays` directly instead of taking the `age` prop.
- `sortItems` should use `sortOptions` (F-004.1 follow-up, still open).
- `Header`/`Hero` live in `src/features/layout/`. F-004.3 can move them if another location is preferred.

### Ming verification after merge (carry into the PR)
- Local-mode screenshots at 390px and desktop, light and dark, before/after on the same day: header, hero (stale
  count, collage, mobile Import/Export), stats row (incl. active state), toolbar, category chips, item cards,
  no-results ("zzz"), editor (new + existing, wear bar, colour/season chips), delete confirm.
- Click through every editor action in local mode, including photo upload / "Bỏ ảnh" / "Tự điền từ ảnh" (not
  covered by the automated tests).
- Supabase mode (hosted preview): the logout button still shows in the header.
- Figma Make preview still shows the 16 demo items.
