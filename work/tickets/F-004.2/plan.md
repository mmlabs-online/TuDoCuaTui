Status: READY

# Plan — F-004.2: Extract the items feature from `App.tsx`

## Feature summary
`docs/feature-list.md` F-004 · Split `App.tsx` into modules · P0 · M1 · L:
> - Target structure:
>   - `src/features/items/` for `ItemCard`, `ItemGrid`, `Editor`, `FilterBar`, `StatsRow`
> - **AC:** no visual or behavioural change (compare screenshots before and after); `App.tsx` under 250 lines; build and typecheck pass.
> - **Notes:** split into 3 tickets (primitives → items feature → modals).

Ticket F-004.2 (slice 2 of 3) scope:
> - `src/features/items/`: `ItemCard`, `ItemGrid`, `Editor`, `FilterBar` (search + selects + category chips), `StatsRow`.
> - Also extract `Header` and `Hero` (not in the feature list's target structure, but without them `App.tsx` cannot get under 250 lines …).
> - Filter state can move into a `useItemFilters` hook that uses the F-005 helpers.

Out of scope: "Modals other than the editor (F-004.3)", "Behaviour changes". The "`App.tsx` under 250 lines" AC is
F-004.3's (its ticket lists it); this slice only has to make it reachable. UI copy centralisation (`copy.ts` per
feature, feature-list §7) is explicitly F-004.3's scope, so copy strings move verbatim here.

Decisions: nothing in `work/decisions.md` changes this ticket. D16: do not touch `work/backlog.md`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Screenshots identical before and after (agent substitute; real screenshots are under *Ming verification*) | (a) `git diff --color-moved=plain --color-moved-ws=allow-indentation-change origin/main...HEAD -- src/` shows every JSX block removed from `App.tsx` reappearing unchanged (modulo indentation) in `src/features/items/*` / `src/features/layout/*`. Non-moved lines are only: imports/exports, component signatures and prop types, the prop wiring listed in *Approach* (e.g. `setFilters((f) => ({ ...f, status: v }))` → `onFilter("status", v)`), and `useItemFilters`. (b) No `className`, inline `style`, element order or Vietnamese string differs: every removed string literal / `className=` from `App.tsx` is present in the new files (reviewer line-set cross-check, as in F-004.1 review). (c) `src/App.test.tsx` › `renders the 16 demo items in local mode` passes **on main before the refactor and after it** (implementer records both runs in impl-log). |
| 2 | Filter, sort, category chips, stale/never cards, wear ±1, duplicate and delete behave as before | `src/App.test.tsx` (characterisation tests, listed below) is written and run green against the **unchanged** `App.tsx` first (commit 1), then stays green unchanged after the extraction (commit 2). Reviewer checks `git diff <commit1>..HEAD -- src/App.test.tsx` is empty and the suite passes. |
| 3 | Build, typecheck and tests pass | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:coverage`, `pnpm build` all exit 0 (use `npx pnpm@10.34.3 …` if `pnpm` is not on PATH). |
| 4 | Local mode keeps working (R1) | `App.tsx` still calls `useWardrobe(starter, locations)`; no new file imports `@/lib/supabase` or `supabase` (`grep -rn "lib/supabase" src/features/items src/features/layout` is empty). AC 2 tests run in local mode (vitest forces empty `VITE_SUPABASE_*`). |
| 5 | Items feature lives in its own folder | `src/features/items/` contains `ItemCard.tsx`, `ItemGrid.tsx`, `Editor.tsx`, `FilterBar.tsx`, `StatsRow.tsx`, `useItemFilters.ts`, `blankItem.ts`; `App.tsx` no longer declares `ItemCard`, `Editor`, `blankItem`, and has no inline `stats-grid`, `toolbar`, `categories`, `item-grid`, `topbar`, `intro` markup (`grep -n 'stats-grid\|className="toolbar"\|className="categories"\|item-grid\|topbar\|className="intro"' src/App.tsx` is empty). |
| 6 | `App.tsx` got substantially smaller (progress toward F-004.3's < 250) | `wc -l src/App.tsx` ≤ 480 (today 991). What remains besides `App` is only `ImportModal` and `ExportModal` (~220 lines, removed by F-004.3). |

## Ming verification after merge
- Local-mode screenshots (no `VITE_SUPABASE_*`, `pnpm dev`) at **390px and desktop**, **light and dark**, on `main`
  before and after the merge, same day (demo dates are relative to now): header (theme toggle, Import/Export/Thêm
  món đồ), hero (copy with stale count, collage of 4 photos, mobile Import/Export buttons at 390px), stats row (both
  clickable cards incl. active state), toolbar (search, 5 selects), category chips with icons and counts, item
  cards (frame colours, status badge, wear pill, colour dots), no-results state ("zzz"), editor modal (new and
  existing item, wear bar, colour/season chips), delete confirm.
- Click through every editor action in local mode: photo upload + "Bỏ ảnh", "Tự điền từ ảnh", Mặc hôm nay / −1,
  Nhân bản, Xoá, Huỷ, Lưu. (Photo upload / drag-drop is not covered by the automated tests.)
- In Supabase mode (hosted preview): the logout button still shows in the header.
- Figma Make preview still shows the 16 demo items.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/App.test.tsx` (new) | Characterisation tests of `App` in local mode (see Tests). Written and committed **before** the extraction. | AC 1c, 2 (agent substitute for manual clicking); F-004.1 follow-up "App render smoke test in local mode once RTL lands" |
| `src/features/items/useItemFilters.ts` (new) | Hook holding `query`, `category`, `filters`, `sort` state and the derived `counts`, `visible`, `hasActiveFilters`, plus `setFilter(key, v)`, `toggleSpecial`, `resetFilters`. Bodies moved verbatim from `App`; uses `matchesFilters` / `sortItems` from `./filters`. | Scope: `useItemFilters` |
| `src/features/items/blankItem.ts` (new) | Move `blankItem` verbatim, export it. | Used by `App.openNew`; keeps component files component-only (Vite fast refresh) |
| `src/features/items/ItemCard.tsx` (new) | Move `ItemCard` verbatim (same props incl. `age`). | Scope |
| `src/features/items/ItemGrid.tsx` (new) | The `loading ? <Skeleton/> : visible.length ? grid : items.length === 0 ? <Empty/> : no-results` block, verbatim. Props: `loading`, `visible: Item[]`, `total: number`, `onOpen(item)`, `onAdd`, `onImport`, `onReset`. | Scope |
| `src/features/items/Editor.tsx` (new) | Move `Editor` verbatim. | Scope |
| `src/features/items/FilterBar.tsx` (new) | `.toolbar` (search box + 5 `FilterSelect`s) and `.categories` chips, verbatim, rendered as a fragment so the DOM is unchanged. Props: `query`, `onQuery`, `filters`, `onFilter(key, v)`, `sort`, `onSort`, `category`, `onCategory`, `locationOptions`, `counts`, `total`. | Scope |
| `src/features/items/StatsRow.tsx` (new) | `.stats-grid` section verbatim; computes `most` inside. Props: `items`, `special`, `onToggleSpecial`. | Scope |
| `src/features/layout/Header.tsx` (new) | `<header className="topbar">` verbatim. Props: `count`, `dark`, `onToggleDark`, `showSignOut`, `onSignOut`, `onImport`, `onExport`, `onAdd`. | Scope ("Also extract Header") |
| `src/features/layout/Hero.tsx` (new) | `<section className="intro">` verbatim. Props: `items`, `onImport`, `onExport`. | Scope ("Also extract Hero") |
| `src/App.tsx` | Delete the moved code; render the new components; use `useItemFilters(items)`. Remove imports that become unused. Theme, editor/confirm/import/export/toast state, `save`, `update`, `openNew`, `download`, the error banner, the `.panel-heading` block, the `Editor`/`Confirm`/`ImportModal`/`ExportModal` wiring and both modal components stay. | Scope |

Not modified: `src/features/items/filters.ts` (+ test), `src/constants/*`, `src/components/*`, `src/data/*`,
`vitest.config.ts`, `package.json` (no new dependency — no `@testing-library/user-event`; use `fireEvent`),
`src/index.css`, `vite.config.ts` / `AGENTS.md` (R10), `work/backlog.md` (D16).

## Tests to write
All in `src/App.test.tsx` (jsdom, `@testing-library/react` `render`/`screen`/`fireEvent`/`within`/`waitFor`; local
mode is already forced by `vitest.config.ts`; `src/test/setup.ts` clears localStorage after each test; call
`cleanup` in `afterEach` if RTL auto-cleanup is not active with `globals: false`). Helper: `await renderApp()` that
renders `<App />` and waits until `.item-card` count is 16. Read expected numbers **from the rendered UI or from
`starter` + `src/features/items/filters.ts`**, never hard-code date-dependent counts.

| Test (file › name) | Covers |
|---|---|
| `src/App.test.tsx` › `renders the 16 demo items in local mode` | 16 `.item-card`s, "16 kết quả", header "16 món" |
| › `search narrows the grid and "Xoá bộ lọc" resets it` | type "zzz" → "Không tìm thấy món đồ"; click the no-results "Xoá bộ lọc" button → 16 cards; diacritic-insensitive query (e.g. `"so mi linen"`) finds "Áo sơ mi linen trắng" (F-401 behaviour preserved) |
| › `category chip filters and shows its count` | click chip "Quần": card count equals the number in that chip's `<span>` and equals `starter.filter(i => i.category === "Quần").length`; chip gets class `active`; "Tất cả" chip restores 16 |
| › `status select filters` | `fireEvent.change` on the select showing "Trạng thái" to "Cất kho": every visible card shows badge "Cất kho"; count equals `starter.filter(status === "Cất kho").length` |
| › `sort "Tên A→Z" orders cards by Vietnamese name` | after change, card `h3` texts equal `starter.map(n => n.name).sort((a,b)=>a.localeCompare(b,"vi"))` |
| › `stale and never stat cards toggle a filter` | click "≥ 90 ngày chưa mặc" card: card count equals the number in its `<strong>` and the card has class `active`; click again → 16. Same for "Chưa mặc lần nào" |
| › `wear +1 and −1 from the editor` | open the first card; read "Đã mặc N lần"; click "Mặc hôm nay" → "Đã mặc N+1 lần" and toast "Đã ghi nhận mặc hôm nay"; click "−1" → "Đã mặc N lần" and toast "Đã điều chỉnh số lần mặc" |
| › `duplicate creates a new item on save` | open a card, click "Nhân bản" → heading "Món đồ mới", name input value ends with " (bản sao)", toast "Đã tạo bản sao"; click "Lưu món đồ" → 17 cards, toast "Đã thêm vào tủ" |
| › `delete asks for confirmation and removes the item` | open a card, "Xoá" → "Xoá món đồ này?"; "Giữ lại" closes the confirm, still 16; "Xoá" again → "Xoá món đồ" → 15 cards, toast "Đã xoá món đồ", editor closed |
| › `saving a new item without a name shows a validation toast` | header "Thêm món đồ" → "Lưu món đồ" → toast "Vui lòng nhập tên món đồ", editor still open |

Edge cases covered: Vietnamese diacritics (search, `localeCompare("vi")`), empty name, local mode. UTC+7 / day
boundary is not exercised (date math is unchanged and already tested in `filters.test.ts`). Tests must not depend
on `Date.now()` beyond what `starter` itself computes. Use buttons' accessible names (`getByRole("button", { name:
… })`) where unique; scope to `within(modal)` where the same label exists twice (e.g. "Xoá bộ lọc", "Xoá").

No separate unit test for `useItemFilters`: its logic is the already-tested `matchesFilters`/`sortItems` plus
state wiring, which the App tests exercise. No coverage-config change (follow-up below).

## Approach
1. **Commit 1 — tests on the old code.** Write `src/App.test.tsx` against the current `App.tsx` and make it pass
   without touching any other file. Run all checks. Commit (`F-004.2: add App characterisation tests`). If a test
   can only pass by changing product code, stop and record it in impl-log (that would be a pre-existing bug →
   follow-up, not a fix here).
2. Create `useItemFilters(items: Item[])` by moving the `query`/`category`/`filters`/`sort` `useState`s, the
   `counts` and `visible` `useMemo`s (same deps), `resetFilters` and `toggleSpecial` verbatim. Add
   `setFilter = (key: keyof ItemFilters, v: string) => setFilters((f) => ({ ...f, [key]: v }))` (same update as the
   four inline closures) and `hasActiveFilters = !!(query || category !== "Tất cả" || Object.values(filters).some(Boolean))`
   (same expression as the heading condition). Return all of them plus the setters.
3. Move `blankItem`, `ItemCard`, `Editor` into their files verbatim (`export function` / `export const`), adding
   only the imports they need (`@/components/*`, `@/constants/wardrobe`, `@/types/item`, `useRef` for Editor).
   Keep `React.CSSProperties` as is (it typechecks today).
4. Create `StatsRow`, `FilterBar`, `ItemGrid`, `Header`, `Hero` by cutting the JSX verbatim and replacing the
   closed-over identifiers with props (mapping: `items.length` → `count`/`total`; `setDark(!dark)` →
   `onToggleDark`; `wardrobe.mode === "supabase"` → `showSignOut`; `wardrobe.signOut` → `onSignOut`;
   `setImportOpen(true)` → `onImport`; `setExportOpen(true)` → `onExport`; `openNew` → `onAdd`; `setQuery` →
   `onQuery`; `setFilters((f)=>({...f, k: v}))` → `onFilter("k", v)`; `setSort` → `onSort`; `setCategory` →
   `onCategory`; `resetFilters` → `onReset`; the card `onClick` body → `onOpen(item)`). `FilterBar` returns a
   fragment `<>toolbar + categories</>` so the DOM is unchanged; `.panel-heading` stays in `App`. Keep the
   `ItemCard` call with `age={ageInDays}` inside `ItemGrid`.
5. Rewrite `App`'s JSX to render `Header`, the error banner (unchanged), `<main>` with `Hero`, `StatsRow`,
   `<section className="wardrobe-panel">` (panel heading + `FilterBar` + `ItemGrid`), then the unchanged modal /
   toast tail. `onOpen` = `(item) => { setEditor({ ...item }); setIsNew(false); }`. Remove now-unused imports.
6. Run `pnpm format`, all checks; `src/App.test.tsx` must pass unchanged. Self-check with the `--color-moved` diff
   (AC 1a) and `wc -l src/App.tsx` (AC 6). Commit (`F-004.2: extract items feature from App.tsx`).

Rules: **R1** — no data-access change; components get data via props, `useWardrobe` stays the single source; no
new `supabase` import. **R6** — copy moved verbatim, labels still from `src/constants/wardrobe.ts`; per-feature
`copy.ts` is F-004.3. **R7** — moves plus prop wiring only; anything else → follow-ups. **R8** — characterisation
tests added; no new pure logic beyond the hook's one-line `setFilter`/`hasActiveFilters`. **R9** — markup and
classes unchanged, so 390px/dark unchanged (Ming's screenshots confirm). **R10** — untouched. R2–R5 n/a.

## Specialist input used
None (no consult files).

## Assumptions
- **Hotspot `src/App.tsx`**: F-004.3 (BACKLOG, depends on this ticket) rewrites it next. No other open ticket
  (IN_PROGRESS / REVIEW / DONE) edits `App.tsx` right now; F-201, F-202.x, F-1002, T-002 all depend on this
  ticket and will edit `src/features/items/Editor.tsx` / `ItemCard.tsx` afterwards. Do not run them in parallel.
- **Location of `Header`/`Hero`**: the feature list gives none. Chosen `src/features/layout/` (app shell, not a
  UI primitive, not items-specific). Non-blocking; easy to move in F-004.3 if preferred.
- `ItemGrid` owns the loading/empty/no-results switch because it is the grid's state machine; `.panel-heading`
  (result count + "Xoá bộ lọc") stays in `App` to keep `FilterBar` = "search + selects + category chips" as the
  ticket defines it.
- `ItemCard` keeps its `age` prop (moves-only); importing `ageInDays` directly is a later cleanup.
- RTL is installed (F-005.2: `@testing-library/react` 16, jsdom). `crypto.randomUUID` is available in the vitest
  jsdom env (used by the local repo today). If `autoFocus` or the `Modal` Esc listener cause act() warnings, wrap
  interactions with `await waitFor(...)`; warnings are not failures.
- The App tests are integration tests, not coverage-gated; adding `src/features/items/**` / `src/constants/**` to
  coverage `include` is a follow-up (changing `vitest.config.ts` is outside this plan).
- Expected diff: ~600 moved lines + ~80 lines of new wiring/hook + ~200 lines of tests. Pure moves are reviewable
  with `--color-moved`, so one cycle is realistic.
- Follow-ups for the reviewer to record (not in this diff): coverage include for `src/features/items/**` and
  `src/constants/**`; `ItemCard` imports `ageInDays` instead of the `age` prop; `sortItems` uses `sortOptions`
  (F-004.1 follow-up, still open).

## Blocking questions
None.

## Split proposal
None. The ticket is already slice 2 of 3 of F-004; the bulk is moved code.
