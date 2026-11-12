Status: READY

# Plan — T-017: Replace the item category list

> Gate: plan-approval (High tier: touches `db/migrations/**`). Ming: please confirm assumptions **A1–A10** below when
> approving. Each has a stated default, so implementation can start as soon as the plan is approved.

## Feature summary
- `work/decisions.md` D29 (2026-11-12): "Categories become Áo, Quần/váy, Đầm, Set đồ, Giày/dép, Áo dài, Khoác, Bikini,
  Phụ kiện, Loại khác. `bag`, `sport`, `home` are retired; mapping of existing items decided in T-017 plan."
  It amends `docs/feature-list.md` §1: "Categories: `top, bottom, dress, outer, shoes, bag, accessory, sport, home, other`."
- Ticket goal: "**Áo, Quần/váy, Đầm, Set đồ, Giày/dép, Áo dài, Khoác, Bikini, Phụ kiện, Loại khác** (in this order)."
- Touches F-201 (editor), F-301 (filters), F-601 (CSV import/template). F-701 (AI ids) and the Supabase schema are out of scope.

### Category table (final, subject to A1–A3)
| # | Label (UI) | id (DB/API) | Old labels / ids accepted as aliases | Icon |
|---|---|---|---|---|
| 1 | Áo | `top` | — | ♧ (unchanged) |
| 2 | Quần/váy | `bottom` | Quần | ♢ (unchanged) |
| 3 | Đầm | `dress` | Váy/Đầm | ❀ (unchanged) |
| 4 | Set đồ | `set` (new) | — | ◫ |
| 5 | Giày/dép | `shoes` | Giày dép | ◡ (unchanged) |
| 6 | Áo dài | `ao_dai` (new) | — | ❦ |
| 7 | Khoác | `outer` | Áo khoác | ♤ (unchanged) |
| 8 | Bikini | `bikini` (new) | — | ☼ |
| 9 | Phụ kiện | `accessory` | Túi, `bag` | ✺ (unchanged) |
| 10 | Loại khác | `other` | Khác, Đồ thể thao, Đồ ngủ/ở nhà, `sport`, `home` | ＋ (unchanged) |

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Editor, filter bar and item card show exactly the 10 categories in order (plus "Tất cả" in the filter). | `wardrobe.test.ts › categoryNames is the D29 list in order`; `App.test.tsx › category chips are "Tất cả" + the 10 categories in order`; `Editor.test.tsx › category select lists the 10 categories in order`. Item card renders `item.category` (label) unchanged; demo items use only new labels (`demo.test.ts`). `pnpm dev` without env: chips and editor select show the list. |
| 2 | An item can be saved with each of the 10 categories in API mode and local mode, and reloads with the same category. | API: `api.db.test.ts › PUT each of the 10 categories round-trips` (real Postgres) and `mappers.test.ts › item → row → item keeps every label` (10 labels). Local: `repo.local.test.ts › every category saves and reloads`. |
| 3 | After the migration no item has `bag`/`sport`/`home`; mapped as agreed (A1); no item lost. | `schema.db.test.ts › category v2 migration moves bag→accessory, sport/home→other, keeps every row` (real Postgres). |
| 4 | `PUT /api/items` rejects a removed or unknown category with `invalidValue`. | `validate.test.ts › removed categories bag/sport/home → invalidValue`; `api.db.test.ts › PUT with category bag → 400 invalid_input field category reason invalidValue`. (The API has no `POST /api/items`; creation is `PUT /api/items/:id`.) |
| 5 | CSV: template lists the new labels; old labels (`Túi`, `Váy/Đầm`, `Khác`, …) still import and map to the new categories. | `map.test.ts › every old label and old id maps to its new label` and existing `every category … label and id maps to the label` (now 10 labels); `ImportModal.test.tsx` / `App.test.tsx › CSV tab lists the allowed category labels` (A6). |
| 6 | Works at 390px and in dark mode (10 chips + "Tất cả" scroll without clipping). | Chip count stays 11 (was 11); `.categories` already has `overflow-x: auto` with `white-space: nowrap` (`src/index.css:329-348`). Reviewer: `pnpm dev`, devtools 390px, light + dark, scroll the chip row to "Loại khác"; open the editor select. Also Ming after merge. |

Checks: `pnpm typecheck`, `pnpm format:check`, `pnpm test` (DB tests need the test Postgres, `server/test/pg.ts`; they must run, not skip, for the reviewer's evidence), `pnpm build`.

## Ming verification after merge
- Production deploy runs the migration (backup is taken first by the deploy workflow). Check that items formerly in
  Túi now show under Phụ kiện and former Đồ thể thao / Đồ ngủ/ở nhà items under Loại khác; total item count unchanged.
- Real phone (390px class), light and dark: chip row scrolls to "Loại khác"; editor select shows the 10 entries.
- Re-tag skirts from Đầm to Quần/váy by hand (out of scope per ticket).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261112140000_item_category_v2.sql` | New. Header comment + manual-rollback block; `alter type item_category add value if not exists` ×3 (`set`, `ao_dai`, `bikini`); `update items set category='accessory' where category='bag'`; `update items set category='other' where category in ('sport','home')`. Do NOT use the new values anywhere in this file (55P04). | AC3; new ids must be storable (AC2) |
| `server/validate.js` | `CATEGORIES` = the 10 new ids in display order; new `DEPRECATED_CATEGORIES = ["bag","sport","home"]` (kept in the enum, rejected by the API); update the "Copied from" comment to name both migrations. | AC4, AC2 |
| `server/validate.test.ts` | Removed ids → `invalidValue`; 10 new ids accepted. | R8 |
| `server/api.db.test.ts` | Replace the enum-equality assertion for `item_category` with set checks (see Tests); add PUT round-trip for each of the 10 ids and PUT `bag` → 400. | AC2, AC4; existing test breaks by design |
| `server/schema.db.test.ts` | Add the migration test on real Postgres. | AC3 |
| `src/data/mappers.ts` | Own `CategoryId` union (10 ids), `CATEGORY_TO_DB` (10 labels, display order), `CATEGORY_FROM_DB` (10↔10), `CATEGORY_ALIASES` (old labels + retired ids → new label), `OTHER_CATEGORY = "Loại khác"`, `toCategoryLabel(v)` (label / alias / id → label, else "Loại khác"); `rowToItem` uses `toCategoryLabel`; `itemToRow` uses label or alias → id, fallback `other`, with a commented cast to the Supabase `ItemInsert["category"]` type (A4). | R6 single mapping place; AC1, AC2, AC5 |
| `src/data/mappers.test.ts` | Update round-trip/null-row expectations ("Loại khác"); add alias tests. | R8 |
| `src/constants/wardrobe.ts` | `categoryIcons` keys = "Tất cả" + 10 new labels (A8). `categoryNames` unchanged code (derives from `CATEGORY_TO_DB`). | AC1 |
| `src/constants/wardrobe.test.ts` | New expected list; icon-key test unchanged. | R8 |
| `src/data/repo.ts` | `createLocalRepo.load()`: map each item's `category` through `toCategoryLabel` (stored and starter items). No change to the Supabase repo body. | Local mode with old labels (R1, AC2) |
| `src/data/repo.local.test.ts` | Old labels in localStorage are mapped on `list()`; each of the 10 categories saves and reloads. | R8 |
| `src/data/demo.ts` | Re-tag demo items to new labels (A7). Count stays 16. | AC1, demo test |
| `src/data/demo.test.ts` | Only if needed: already asserts `categoryNames` contains every demo category; no change expected. | — |
| `src/features/import-export/csv/map.ts` | Category lookup = `lookup(CATEGORY_TO_DB)` plus normalized `CATEGORY_ALIASES`; empty category → `OTHER_CATEGORY` instead of literal "Khác". | AC5 |
| `src/features/import-export/csv/map.test.ts` | Header pair `Quần` → `Quần/váy`; "ao khoac" test expects "Khoác"; empty → "Loại khác"; new alias test. | R8, AC5 |
| `src/features/import-export/copy.ts` | Add `csv.categoriesHint: (labels: string[]) => \`Loại dùng được: ${labels.join(", ")}\``. | AC5 (A6), R6 copy in one place |
| `src/features/import-export/ImportCsvTab.tsx` | Render `CSV.categoriesHint(categoryNames)` as a `<p>` in the `.instructions` block. | AC5 (A6) |
| `src/App.test.tsx` | `chip("Quần")` → `chip("Quần/váy")`; new chip-order test; CSV hint test. | Existing test uses an old label; AC1, AC5 |
| `src/features/items/Editor.test.tsx` | Add: category select lists the 10 labels in order. | AC1 |
| `docs/feature-list.md` | §1 glossary line → the 10 new ids, "(D29; `bag`, `sport`, `home` retired)". | Keep scope doc consistent with D29 |
| `docs/data-model.md` | Line 63 category list → same as above, note retired values remain in the enum. | Same |

Not touched (on purpose): `src/types/database.ts` (Supabase generated types; not regenerated, no Supabase migration — A4),
`supabase/migrations/**`, `server/items.js` (no change needed, consult §3), `src/index.css` (chip row already scrolls),
`src/features/items/blankItem.ts` and `Editor.tsx` default "Áo" (label unchanged), `ItemCard.tsx`, CSV `serialize.ts`
(writes the label), `src/features/import-export/csv/template.ts` (sample row uses "Áo", still valid — A6).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/validate.test.ts › each of the 10 categories is accepted` (existing loop over `CATEGORIES`, now 10) | AC2 |
| `server/validate.test.ts › bag, sport, home → invalidValue on category` | AC4 |
| `server/api.db.test.ts › item_category enum = CATEGORIES ∪ DEPRECATED_CATEGORIES (as sets); every CATEGORIES value is in pg_enum` (replaces the ordered equality for categories only; `item_status` keeps the ordered check) | drift guard |
| `server/api.db.test.ts › PUT each of the 10 categories round-trips (200, GET returns the same id)` | AC2 API mode |
| `server/api.db.test.ts › PUT with category bag → 400 invalid_input, field category, reason invalidValue` | AC4 |
| `server/schema.db.test.ts › category v2 migration: bag→accessory, sport/home→other, other rows unchanged, row count unchanged` — temp dir with copies of `20261110120000_init.sql` and `20261112120000_item_photos_drive.sql`; `runMigrations`; insert items with `bag`, `sport`, `home`, `top`, `other` (and one wear log on the `bag` item); run `runMigrations` on `realDir`; assert categories, ids, count, and that `items_with_stats` still returns the wear count of the moved item | AC3 |
| same test (continued) › `insert into items (name, category)` succeeds for each of the 10 ids after the migration; a second `runMigrations` on `realDir` is a no-op | AC2, 55P04 guard, idempotency |
| `src/data/mappers.test.ts › CATEGORY round trip` (existing, now 10) and `item → row → item keeps every label` (existing loop) | AC2 |
| `src/data/mappers.test.ts › rowToItem maps bag→Phụ kiện, sport/home→Loại khác, unknown/null→Loại khác` | Supabase/old-row reads |
| `src/data/mappers.test.ts › toCategoryLabel: every old label and every id → new label` | aliases |
| `src/data/mappers.test.ts › itemToRow: old label Túi → accessory, Váy/Đầm → dress, unknown → other` | write path |
| `src/data/mappers.test.ts › aliases never shadow a current label` (no alias key equals a `CATEGORY_TO_DB` key or id other than its own) | consistency |
| `src/constants/wardrobe.test.ts › categoryNames is the D29 list in order` | AC1 |
| `src/data/repo.local.test.ts › list maps old category labels from localStorage (Túi→Phụ kiện, Váy/Đầm→Đầm, Khác→Loại khác, Đồ thể thao→Loại khác)` | local mode |
| `src/data/repo.local.test.ts › every category saves and reloads` (new repo instance reading the same storage) | AC2 local mode |
| `src/features/import-export/csv/map.test.ts › every old label and old id maps to its new label` (Quần, Váy/Đầm, Áo khoác, Giày dép, Túi, Đồ thể thao, Đồ ngủ/ở nhà, Khác, bag, sport, home; case/diacritic-insensitive) | AC5 |
| `src/features/import-export/csv/map.test.ts › empty category → "Loại khác"` (updated) | AC5 |
| `src/App.test.tsx › category chips are "Tất cả" + the 10 categories in order` | AC1 |
| `src/App.test.tsx › CSV tab lists the allowed category labels` | AC5 |
| `src/features/items/Editor.test.tsx › category select lists the 10 categories in order` | AC1 |

## Approach
1. **Migration** (`db/migrations/20261112140000_item_category_v2.sql`), exactly the consult's SQL. The migrator runs each
   file in one transaction (`server/migrator.js:158-178`); `ADD VALUE` inside a transaction is fine on PG 12+ as long
   as the new values are not used before commit, so the file only moves rows onto existing values. Expand-only: old enum
   values stay (`db/migrations/README.md` "Expand then contract"). Default stays `'other'`. Rollback block in the
   header: the UPDATEs are not reversible (rely on the pre-migrate backup); the added values can stay.
2. **Server validation**: `CATEGORIES` = `["top","bottom","dress","set","shoes","ao_dai","outer","bikini","accessory","other"]`,
   `DEPRECATED_CATEGORIES = ["bag","sport","home"]`. `parseItemInput` unchanged, so `bag` etc. fail with
   `invalidValue`. Fix the drift test as above.
3. **Mappers (R6)**: one place for labels ↔ ids and aliases in `src/data/mappers.ts`. `CategoryId` is a local union so
   the API/local code no longer depends on the Supabase enum type. `CATEGORY_FROM_DB = invert(CATEGORY_TO_DB)` stays
   valid because aliases live in a separate table. `toCategoryLabel(v: string | null | undefined): string` resolves
   current label → itself, current id → label, alias (label or retired id) → new label, anything else → "Loại khác".
   `itemToRow` resolves `CATEGORY_TO_DB[label] ?? CATEGORY_TO_DB[CATEGORY_ALIASES[label]] ?? "other"`.
4. **Constants**: update `categoryIcons` (A8). `categoryNames` follows `CATEGORY_TO_DB` key order = display order, so
   the editor select (`Editor.tsx:224`), chips (`FilterBar.tsx:81`) and counts (`useItemFilters.ts:22`) update with no
   component change.
5. **Local mode (R1)**: in `createLocalRepo.load()`, after reading storage (or starter), map
   `items.map(i => ({ ...i, category: toCategoryLabel(i.category) }))` into the cache. Storage is rewritten in the new
   form on the next `persist` (no eager write).
6. **Demo items** (A7): re-tag labels; keep 16 items and ids.
7. **CSV**: extend the category lookup with aliases; empty → `OTHER_CATEGORY`; add the allowed-labels hint (A6).
   Export (`serialize.ts`) writes the current label, so a fresh export re-imports to the same category.
8. **Docs**: one-line glossary updates in `docs/feature-list.md` and `docs/data-model.md` citing D29.
9. **UI check (R9)**: 11 chips as before; no CSS change. Verify at 390px light/dark; labels are short (longest
   "Loại khác", "Quần/váy").
10. Run all checks with the DB tests enabled.

Rules: R1 (local mode via `createLocalRepo`, demo items kept), R2 (DB change is a new file; Supabase path untouched —
no Supabase migration, types not regenerated, per ticket out-of-scope and consult §5), R3 (no secrets), R5 (no derived
values), R6 (labels ↔ ids only in `mappers.ts`/`constants`, copy in `copy.ts`), R7 (file list above), R8 (tests listed),
R9 (390px + dark verification), R10 (no Figma files).

## Specialist input used
`consult-database-optimizer.md`:
- §1 single-file migration, no use of new values in the same file — **adopted**.
- §2 enum keeps 13 labels, display order client-side, replace the ordered drift test with set checks + `DEPRECATED_CATEGORIES` — **adopted** (constant exported from `validate.js`).
- §3 no `ALTER COLUMN TYPE` / type rebuild; `server/items.js` unchanged — **adopted**.
- §4 default stays `'other'` — **adopted**.
- §5 split canonical map / alias table / explicit `CATEGORY_FROM_DB`; leave Supabase path as-is; do not regenerate `src/types/database.ts`; "Khác" fallback → "Loại khác" — **adopted** (A4).
- Recommended real-Postgres test incl. 10-id insert, second run no-op, `items_with_stats` — **adopted**; `'nope'` → 22P02 is already covered by `schema.db.test.ts:177`.
- Migration file name `20261112140000_item_category_v2.sql` — **adopted**.

## Assumptions
For Ming to confirm at plan approval (defaults applied unless she says otherwise):
- **A1 — Mapping of retired categories:** `bag` (Túi) → `accessory` (Phụ kiện); `sport` (Đồ thể thao) and `home`
  (Đồ ngủ/ở nhà) → `other` (Loại khác). Irreversible in the DB (backup taken by the deploy workflow).
- **A2 — New ids:** `set` (Set đồ), `ao_dai` (Áo dài), `bikini` (Bikini).
- **A3 — Kept ids for renamed labels:** Quần→Quần/váy keeps `bottom`, Váy/Đầm→Đầm keeps `dress`, Áo khoác→Khoác keeps
  `outer`, Giày dép→Giày/dép keeps `shoes`, Khác→Loại khác keeps `other`. Existing "Váy/Đầm" items stay Đầm (skirts are
  re-tagged by hand, out of scope).
- **A4 — Supabase path left as-is:** no Supabase migration, `src/types/database.ts` not regenerated. Reads map
  `bag/sport/home` to the new labels; **saving Set đồ / Áo dài / Bikini in Supabase mode will fail** (enum lacks them)
  until T-016 removes that path. Production uses the Node API (D23), so this affects nobody today.
- **A5 — Display order** = the ticket order (Áo, Quần/váy, Đầm, Set đồ, Giày/dép, Áo dài, Khoác, Bikini, Phụ kiện,
  Loại khác) in the editor, chips and CSV hint; the Postgres enum order is not used for display.
- **A6 — "Template lists the new labels"** is met by a hint line under the CSV instructions: "Loại dùng được: Áo,
  Quần/váy, …" (built from `categoryNames`). The copy-able sample row (`CSV_TEMPLATE`) stays as is (its "Áo" is still
  valid), so the template-based tests keep working.
- **A7 — Demo items** (16 kept): Quần → Quần/váy, Váy/Đầm → Đầm, Áo khoác → Khoác, Giày dép → Giày/dép, "Túi đeo vai
  da đen" → Phụ kiện, "Quần jogger xám" → Quần/váy, "Bộ pyjama cotton" → Set đồ. No demo items are added for Áo dài /
  Bikini (their chips show 0); adding them would change the "16 món" assertions across many tests.
- **A8 — Icons** (unicode glyphs like the existing ones): Set đồ "◫", Áo dài "❦", Bikini "☼"; renamed categories keep
  their old glyph.
- **A9 — Local mode:** any category label in localStorage that is neither current nor an alias becomes "Loại khác" on
  read (previously it was shown as-is but matched no chip). CSV still rejects unknown category text with the existing
  error.
- **A10 — CSV aliases:** old labels and retired ids are accepted case- and diacritic-insensitively (existing
  `normalize`): Quần, Váy/Đầm, Áo khoác, Giày dép, Túi, Đồ thể thao, Đồ ngủ/ở nhà, Khác, `bag`, `sport`, `home`.

Other (no confirmation needed):
- Rollback to the previous app image after the migration is safe to read; items saved as `set`/`ao_dai`/`bikini` show
  as "Khác" in the old image (consult Risks).
- In the short window between `migrate` and the new app starting, the old app could still write `bag`; single user,
  negligible; a later re-run of this migration is not automatic (it is recorded as applied).
- Hotspot files possibly shared with other open tickets: `src/data/mappers.ts`, `src/data/repo.ts` (T-016 Supabase
  removal, on hold), `server/validate.js`, `src/App.test.tsx`.
- Expected diff size ~300 lines incl. tests; one implement/review cycle.

## Blocking questions
None.

## Split proposal
None.
