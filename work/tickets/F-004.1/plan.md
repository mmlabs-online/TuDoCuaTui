Status: READY

# Plan — F-004.1: Extract UI primitives and constants from `App.tsx`

## Feature summary
`docs/feature-list.md` F-004 · Split `App.tsx` into modules · P0 · M1 · L:
> - Target structure:
>   - `src/components/` for UI primitives: `Icon`, `Btn`, `Modal`, `Field`, `Confirm`, `Skeleton`, `Empty`
>   - `src/constants/wardrobe.ts` for the label lists, color map and frame colors (one source shared with `mappers.ts`)
> - **AC:** no visual or behavioural change (compare screenshots before and after); `App.tsx` under 250 lines; build and typecheck pass.
> - **Notes:** split into 3 tickets (primitives → items feature → modals).

Ticket F-004.1 scope (slice 1 of 3): components `Icon`, `Btn`, `Modal`, `Field`, `Confirm`, `Skeleton`, `Empty`,
`FilterSelect`; `src/constants/wardrobe.ts` ("category names and icons, statuses, seasons, `colorMap`,
`frameColors`, sort options. Derive the label lists from `mappers.ts` (or the other way round), so there is one
source"); `src/data/demo.ts` ("the `starter` demo items, `photos` and default `locations`"). Out of scope: "Any
visual or behavioural change". The "`App.tsx` under 250 lines" AC belongs to F-004.2/F-004.3, not this slice.

Also adopted (constant extraction, zero behaviour change): F-101 review follow-up — "F-004.1: `App.tsx` should
import `THEME_KEY` from `src/lib/theme.ts` (the key is currently duplicated)" (`work/tickets/F-101/review.md`).

Decisions: none in `work/decisions.md` change this ticket. D16 applies (do not touch `work/backlog.md`).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | No visual or behavioural change (agent substitute for the screenshot AC; real screenshots are under *Ming verification*) | (a) `git diff --color-moved=dimmed-zebra --color-moved-ws=allow-indentation-change main -- src/` shows every removed block from `App.tsx` reappearing unchanged in the new files; the only non-moved lines are `import`/`export` keywords, the label-list derivations in `wardrobe.ts`, the `THEME_KEY` swap and `useState<string>(sortOptions[0])` (see Approach). (b) `src/constants/wardrobe.test.ts` pins every list to the exact pre-refactor literal (values **and order**), so derived lists render the same chips/options in the same order. (c) `src/data/demo.test.ts` pins the demo data (16 items, ids, photos, locations). (d) No JSX, className, inline style or copy string differs: `git diff main -- src/ \| grep '^[+-]' \| grep -v '^[+-]\s*\(import\|export\|$\)'` contains only moved lines (cross-check with (a)). |
| 2 | `tsc --noEmit`, `pnpm build` and `pnpm test` pass | `npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build` all exit 0. |
| 3 | Label lists exist in one place only | `wardrobe.ts` derives `categoryNames`, `statuses`, `seasons`, `colors` with `Object.keys(...)` from `CATEGORY_TO_DB`, `STATUS_TO_DB`, `SEASON_TO_DB`, `COLOR_TO_DB` in `mappers.ts`; no array literal of these labels remains outside `mappers.ts` and test files: `grep -rn '"Váy/Đầm", *$\|"Cất kho",\|"Xuân", "Hạ"' src --include=*.ts --include=*.tsx` hits only `mappers.ts`, tests, and demo item data in `demo.ts`. `colorMap` and `categoryIcons` are keyed by the same labels and a test asserts their keys equal the mapper labels (`wardrobe.test.ts`). |
| 4 | Local mode still loads the demo items (ticket technical note: "Must not break the Figma Make preview") | `App.tsx` still calls `useWardrobe(starter, locations)` with both imported from `@/data/demo`; `demo.test.ts` asserts `starter.length === 16`; existing `src/data/repo.local.test.ts` stays green. |
| 5 | F-005 mapper round-trip test still passes against the shared constants (ticket test plan) | `src/data/mappers.test.ts` unchanged and green; `mappers.ts` unchanged. |
| 6 | `App.tsx` uses `THEME_KEY` (F-101 follow-up) | `grep -n '"tu-do-theme"' src/App.tsx` returns nothing; both reads/writes use `THEME_KEY` from `@/lib/theme`. |

## Ming verification after merge
- Screenshots of local mode (no `VITE_SUPABASE_*` in env, `pnpm dev`) at **390px and desktop**, **light and dark**,
  on `main` before the merge commit and after it, taken the same day (demo dates are relative to "now").
  Compare: header, hero collage, stats row, filter selects (open the Trạng thái / Mùa / Màu / Sắp xếp dropdowns —
  same options, same order), category chips with icons and counts, item cards (frame colours, colour dots), the
  no-results state (search for "zzz"), editor modal (colour/season chips), delete confirm modal (Esc and backdrop click still close it).
- Figma Make preview still shows the 16 demo items.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/components/Icon.tsx` (new) | Move `Icon` verbatim; `export function Icon`. | Scope: primitives |
| `src/components/Btn.tsx` (new) | Move `Btn` verbatim. | Scope |
| `src/components/Modal.tsx` (new) | Move `Modal` verbatim (imports `useEffect`). | Scope |
| `src/components/Field.tsx` (new) | Move `Field` verbatim. | Scope |
| `src/components/FilterSelect.tsx` (new) | Move `FilterSelect` verbatim (imports `Icon`). | Scope |
| `src/components/Confirm.tsx` (new) | Move `Confirm` verbatim (imports `Modal`, `Btn`, `Icon`). Copy strings stay inline for now. | Scope |
| `src/components/Skeleton.tsx` (new) | Move `Skeleton` verbatim. | Scope |
| `src/components/Empty.tsx` (new) | Move `Empty` verbatim (imports `Btn`, `Icon`). | Scope |
| `src/constants/wardrobe.ts` (new) | `categoryNames`, `statuses`, `seasons`, `colors` derived from `mappers.ts`; `colorMap`, `categoryIcons`, `frameColors` moved verbatim; `sortOptions` = the 5 sort labels from the Sắp xếp `FilterSelect`, in the same order. | Scope: constants, one source |
| `src/constants/wardrobe.test.ts` (new) | Pins lists and key sets (see Tests). | R8; AC 1, 3 |
| `src/data/demo.ts` (new) | Move `photos` (module-private), `locations`, `daysAgo`, `starter` verbatim; export `starter` and `locations`. | Scope: demo data |
| `src/data/demo.test.ts` (new) | Pins demo data shape (see Tests). | R8; AC 1, 4 |
| `src/App.tsx` | Delete the moved code; add imports; `THEME_KEY` replaces both `"tu-do-theme"` literals; Sắp xếp `FilterSelect` gets `options={sortOptions}` and the sort state `useState<string>(sortOptions[0])`. Remove imports that become unused. Nothing else. | Scope; F-101 follow-up |

Not modified: `src/data/mappers.ts` (stays the source of the labels, so the F-005 round-trip test is untouched),
`src/features/items/filters.ts` (F-401 hotspot), `vitest.config.ts` and `package.json` (F-005.2 hotspot),
`src/types/item.ts`, `work/backlog.md` (D16).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/constants/wardrobe.test.ts` › `categoryNames keeps the original labels and order` | `toEqual(["Áo","Quần","Váy/Đầm","Áo khoác","Giày dép","Túi","Phụ kiện","Đồ thể thao","Đồ ngủ/ở nhà","Khác"])` — the pre-refactor literal from `App.tsx` |
| › `statuses keeps the original labels and order` | `["Đang dùng","Cất kho","Đang giặt-sửa","Cho mượn","Muốn thanh lý"]` (ImportModal relies on `statuses.slice(1)`) |
| › `seasons keeps the original labels and order` | `["Xuân","Hạ","Thu","Đông"]` |
| › `colors keeps the original labels and order` | the 16 colour labels in the old `colorMap` key order (Đen … Hoạ tiết) |
| › `colorMap has a swatch for every colour label and nothing else` | `Object.keys(colorMap)` equals `colors` (same order) — guards drift between the hex map and `COLOR_TO_DB` |
| › `categoryIcons covers "Tất cả" and every category` | `Object.keys(categoryIcons)` equals `["Tất cả", ...categoryNames]` |
| › `sortOptions keeps the original labels and order` | `["Mới thêm","Tên A→Z","Mặc nhiều nhất","Lâu chưa mặc","Giá cao → thấp"]` (pure list check) |
| › `frameColors is unchanged` | the 6 hex values in order |
| `src/data/demo.test.ts` › `starter has the 16 demo items with ids 1..16` | length and ids |
| › `every demo item uses known labels` | each `category ∈ categoryNames`, `status ∈ statuses`, every colour ∈ `colors`, every season ∈ `seasons`, `location ∈ locations` (Vietnamese diacritics compared exactly) |
| › `items 14 and 16 have no photo, the others do` | `photo === ""` for indices 13 and 15, non-empty https URL otherwise |
| › `default locations are the 4 original ones` | exact array (en dash `–` preserved) |
| › `lastWorn and createdAt are ISO dates relative to now` | with `vi.useFakeTimers` + `vi.setSystemTime` **before** a dynamic `import("./demo")` (+ `vi.resetModules()`), item 1 `lastWorn` is 3 days before the fixed time and `createdAt` equals it; skip if it makes the file flaky — the other four tests are the required ones |

All tests are pure TypeScript (no DOM, no RTL). `src/data/demo.ts` falls under the existing coverage `include`
(`src/data/**`); no per-file threshold applies to it, and the tests import it fully.

## Approach
1. Create `src/constants/wardrobe.ts`. Derive: `export const categoryNames = Object.keys(CATEGORY_TO_DB);`
   `export const statuses = Object.keys(STATUS_TO_DB) as Status[];` `export const seasons = Object.keys(SEASON_TO_DB);`
   `export const colors = Object.keys(COLOR_TO_DB);`. Insertion order of the mapper objects equals the old
   literals (checked during planning; no integer-like keys), so UI order is unchanged — the tests pin it.
   Move `colorMap`, `categoryIcons`, `frameColors` verbatim. Add `export const sortOptions = [...]` with the
   five labels in the current order. Keep the existing camelCase names to keep `App.tsx` changes to imports only.
2. Create `src/data/demo.ts`: move `photos`, `locations`, `daysAgo`, `starter` verbatim (import `Item`, `Status`
   types). Export `starter` and `locations`. `daysAgo` still runs at module load, as before.
3. Create the eight `src/components/*.tsx` files: one component per file, named export, body copied verbatim.
   Keep the existing `React.ReactNode` / `React.ButtonHTMLAttributes` / `React.CSSProperties` type references as
   they are (they typecheck today); add `import { useEffect } from "react"` only in `Modal.tsx`. No barrel file.
4. Edit `src/App.tsx`: delete the moved declarations, import from `@/components/*`, `@/constants/wardrobe`,
   `@/data/demo`, `@/lib/theme`. Replace the two `"tu-do-theme"` literals with `THEME_KEY`. Replace the inline
   sort array with `sortOptions` and type the sort state `useState<string>(sortOptions[0])` (equivalent to
   `"Mới thêm"`). `blankItem`, `ItemCard`, `Editor`, `ImportModal`, `ExportModal` and `App` stay (F-004.2/.3).
5. Write the two test files; run `npx pnpm@10.34.3 format` then all checks.
6. Self-check with `git diff --color-moved=...` (AC 1a) before handing to review.

Rules: **R1** — local mode untouched; `useWardrobe(starter, locations)` call unchanged. **R6** — labels ↔ DB
ids stay in `mappers.ts`, UI lists live in `src/constants/` derived from it; copy strings inside `Confirm`/`Empty`
are moved, not rewritten (the "one place per feature" copy rule is satisfied at the end of F-004, see
Assumptions). **R7** — moves only. **R8** — new pure modules get tests. **R9** — no CSS/markup change, so 390px
and dark mode are unaffected (Ming's screenshots confirm). **R10** — `AGENTS.md`, `.figma/`, `vite.config.ts`
untouched. R2–R5 not applicable.

## Specialist input used
None (no consult files).

## Assumptions
- **Hotspot `src/App.tsx`**: F-401 (open, PLANNING) changes the search placeholder line inside the `App` JSX and
  `src/features/items/filters.ts`. This ticket does not touch that JSX line or `filters.ts`, so git should merge
  both; whichever lands second rebases. F-004.2/F-004.3 depend on this ticket and rewrite `App.tsx` afterwards.
- **F-005.2** edits `vitest.config.ts`, `package.json`, `pnpm-lock.yaml` and adds `src/test/fakeSupabase.ts`,
  `src/data/repo.supabase.test.ts`, `src/data/useWardrobe.test.tsx` — no overlap; this plan deliberately leaves
  `vitest.config.ts` alone (so `src/constants/**` is not in the coverage `include` yet — follow-up below).
- **F-601.1** adds `src/features/import-export/csv/*` — no overlap.
- No render smoke test: React Testing Library arrives with F-005.2. Behavioural equivalence rests on the
  moved-code diff, typecheck, the list-pinning tests and Ming's screenshots.
- `filters.ts` `sortItems` still compares against the sort labels as string literals; the *list* lives only in
  `sortOptions`. Pointing `sortItems` at shared constants is a follow-up after F-401 merges (avoids a conflict).
- The `Status` union in `src/types/item.ts` is a type, not a runtime list; it stays as is.
- `"Tất cả"` remains an inline label in `App.tsx`, `categoryIcons` and `filters.ts`; it is a single sentinel, not
  a list. Centralising UI copy (R6 "one place per feature") is finished by F-004.2/F-004.3.
- Follow-ups for the reviewer to record (not in this diff): add `src/constants/**` to coverage `include`
  (after F-005.2); App render smoke test in local mode once RTL lands (F-005.2); `sortItems` uses `sortOptions`.

## Blocking questions
None.

## Split proposal
None. The ticket is already slice 1 of 3 of F-004. The diff is about 600 lines removed from `App.tsx` and about
the same added in new files, but it is pure moves (reviewable with `--color-moved`); new logic is under ~30 lines
plus ~120 lines of tests.
