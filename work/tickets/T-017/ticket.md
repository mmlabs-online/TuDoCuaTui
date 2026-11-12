# T-017: Replace the item category list

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Items |
| Areas | ui, data, db |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-12 |
| Claimed by | claude@2026-11-12T08:40:10Z |
| PR | — |

## Goal
Ming's category list replaces the current one, so items are grouped the way she actually sorts her wardrobe:
**Áo, Quần/váy, Đầm, Set đồ, Giày/dép, Áo dài, Khoác, Bikini, Phụ kiện, Loại khác** (in this order).

## Feature reference
Not in `docs/feature-list.md` as a feature; it changes the domain glossary (§1, "Categories: `top, bottom, dress,
outer, shoes, bag, accessory, sport, home, other`"). Recorded as decision D29 (Ming, 2026-11-12, "làm gấp").
Touches F-201 (editor), F-301 (filters), F-601 (CSV import/template), F-701 (allowed ids, later).

## Scope
- New category set (labels ↔ ids only via `src/data/mappers.ts` / `src/constants/`, R6). Current → new:
  | Current label (id) | New label (id) |
  |---|---|
  | Áo (`top`) | Áo (`top`) |
  | Quần (`bottom`) | Quần/váy (`bottom`) |
  | Váy/Đầm (`dress`) | Đầm (`dress`) |
  | Áo khoác (`outer`) | Khoác (`outer`) |
  | Giày dép (`shoes`) | Giày/dép (`shoes`) |
  | Phụ kiện (`accessory`) | Phụ kiện (`accessory`) |
  | Khác (`other`) | Loại khác (`other`) |
  | — | Set đồ (new id, e.g. `set`) |
  | — | Áo dài (new id, e.g. `ao_dai`) |
  | — | Bikini (new id, e.g. `swimwear`/`bikini`) |
  | Túi (`bag`) | removed → existing items move to Phụ kiện (proposal, confirm in plan) |
  | Đồ thể thao (`sport`) | removed → existing items move to Loại khác (proposal, confirm in plan) |
  | Đồ ngủ/ở nhà (`home`) | removed → existing items move to Loại khác (proposal, confirm in plan) |
- DB: new expand-only migration in `db/migrations/` adding the new enum values and moving existing rows off the
  removed values (the self-hosted Postgres in production, D23). Server validation (`server/validate.js`) accepts
  only the new set.
- Client: editor picker, filter chips + icons, item card, demo items, blank item default, CSV template/serialize/import.
- CSV import keeps accepting the old labels/ids and maps them to the new ones (so old exports still import).

## Out of scope
- Supabase schema (`supabase/migrations/`): Supabase is being removed (T-016, on hold); the planner decides
  whether the Supabase repo path needs a mapping or is left as-is, without a Supabase migration.
- Splitting existing "Váy/Đầm" items into skirts (now Quần/váy) vs dresses — Ming re-tags by hand.
- AI tagging (F-701) prompt/ids.

## Acceptance criteria
- [ ] The editor, filter bar and item card show exactly the 10 categories above, in that order (plus "Tất cả" in the filter).
- [ ] An item can be saved with each of the 10 categories in API mode and local mode, and reloads with the same category.
- [ ] After the migration, no item has category `bag`, `sport` or `home`; they are mapped as agreed in the plan; no item is lost.
- [ ] `PUT/POST /api/items` rejects a removed or unknown category with the existing `invalidValue` error.
- [ ] CSV: the template lists the new labels; old labels (e.g. `Túi`, `Váy/Đầm`, `Khác`) still import and map to the new categories.
- [ ] Works at 390px and in dark mode (10 chips + "Tất cả" scroll/wrap without clipping).

## Technical notes
- Files (likely): `db/migrations/<new>.sql`, `server/validate.js`, `src/data/mappers.ts`, `src/constants/wardrobe.ts`,
  `src/types/database.ts`, `src/data/demo.ts`, `src/features/items/*`, `src/features/import-export/csv/*`, tests.
- Migrations are expand-only: Postgres cannot drop enum values without recreating the type; keep the old values in
  the enum and stop using them. `ALTER TYPE … ADD VALUE` cannot be used in the same transaction as the new value
  (check how `server/migrator.js` wraps migrations).
- Local mode: items in localStorage with old ids need the same mapping on read.
- Risks / open questions: the mapping of the 3 removed categories; the new ids; whether "Set đồ" needs anything beyond a label.

## Test plan
- Unit: mappers (label ↔ id, old-label aliases), server validation, CSV map/template, local-repo mapping of old ids.
- DB: migration test on real Postgres (rows with `bag`/`sport`/`home` are moved; new values insertable).
- Manual: editor + filters at 390px, light and dark.

## Notes / answers from Ming
- 2026-11-12: "thêm 1 task làm gấp bây giờ: Thay đổi category: Áo, quần/váy, đầm, set đồ, giày/dép, áo dài, khoác, bikini, Phụ kiện, loại khác"

## Handoff
