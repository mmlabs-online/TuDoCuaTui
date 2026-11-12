# Implementation log — T-017

## Attempt 1

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261112140000_item_category_v2.sql` (new) | AC3: add `set`, `ao_dai`, `bikini`; move `bag`→`accessory`, `sport`/`home`→`other`; new values not used in the file (55P04) |
| `server/validate.js` | `CATEGORIES` = 10 ids in display order; `DEPRECATED_CATEGORIES` rejected by the API (AC4) |
| `server/validate.test.ts` | removed ids → `invalidValue` |
| `server/api.db.test.ts` | enum drift test as set check; PUT round-trip for the 10 ids; PUT `bag` → 400 |
| `server/schema.db.test.ts` | migration test on real Postgres (rows kept, wear count kept, 10 ids insertable, second run no-op) |
| `src/data/mappers.ts` | `CategoryId`, 10-label `CATEGORY_TO_DB`, `CATEGORY_ALIASES`, `toCategoryLabel`, `OTHER_CATEGORY` (R6) |
| `src/data/mappers.test.ts` | aliases, null/unknown rows, itemToRow fallbacks |
| `src/constants/wardrobe.ts`, `wardrobe.test.ts` | `categoryIcons` keys (A8); expected list |
| `src/data/repo.ts`, `repo.local.test.ts` | local mode maps old labels on load (R1); save/reload of all 10 |
| `src/data/demo.ts` | demo items re-tagged (A7), 16 items kept |
| `src/features/import-export/csv/map.ts`, `map.test.ts` | aliases for old labels/ids; empty → "Loại khác" |
| `src/features/import-export/copy.ts`, `ImportCsvTab.tsx` | categories hint line (A6) |
| `src/App.test.tsx`, `src/features/items/Editor.test.tsx` | chip/select order tests, CSV hint test, `Quần` → `Quần/váy` |
| `docs/feature-list.md`, `docs/data-model.md` | category glossary per D29 |

### Tests added
validate (removed ids), api.db (set check, 10-id round-trip, bag → 400), schema.db (category v2 migration), mappers (4), repo.local (2), map (alias test), App (chips, CSV hint), Editor (select order), wardrobe (list).

### Checks
- `pnpm typecheck`: pass
- `pnpm format:check`: All matched files use the correct format
- `pnpm test` (with TEST_DATABASE_URL, scratch PG16): Test Files 68 passed (68), Tests 856 passed (856); DB tests ran, not skipped
- `CI=true pnpm test:coverage`: 68 files / 856 tests passed; All files 95.09% statements
- `pnpm build`: built OK
- Scratch PostgreSQL stopped and deleted afterwards.
- Not done: manual 390px / dark-mode check in a browser (no CSS change, chip count unchanged at 11); reviewer/Ming to check.

### Out-of-plan files
None.

### Follow-ups
- Supabase mode cannot save Set đồ / Áo dài / Bikini (A4) until T-016 removes that path; `src/types/database.ts` not regenerated.
- Re-tag skirts from Đầm to Quần/váy by hand.
- No demo items for Áo dài / Bikini (A7).

### Scope self-check
Only plan files touched; no Supabase migration, no `.env` read, no Figma files.

## Attempt 2 (REWORK: security should-fix)

### Files touched
- `src/data/mappers.ts`: `toCategoryLabel` uses own-property lookups (`hasOwnProperty.call`; `Object.hasOwn` is not in the TS lib target) and a `typeof v !== "string"` guard. Required because `in` on plain objects let `constructor`/`__proto__`/`toString` through.
- `src/data/mappers.test.ts`: new test for prototype keys and non-strings → "Loại khác", and `itemToRow` → `other`.

### Tests
New test fails without the fix (1 failed | 22 passed), passes with it.

### Checks
- `pnpm typecheck`: pass
- `pnpm format:check`: All matched files use the correct format
- `pnpm test` (scratch PG16, scram): Test Files 68 passed, Tests 857 passed
- `CI=true pnpm test:coverage`: 857 passed; All files 95.1% statements
- `pnpm build`: built OK
- Scratch PostgreSQL stopped and deleted.

### Out-of-plan files
None.

### Follow-ups
None new.

### Scope self-check
Only the listed review issue fixed.
