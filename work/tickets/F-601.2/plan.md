Status: READY

# Plan — F-601.2: CSV row mapping and validation

## Feature summary
`docs/feature-list.md` F-601 · CSV import · P0 · M1:
> - Header aliases in Vietnamese and English (e.g. `Tên` / `name`, `Loại` / `category`, `Vị trí` / `location`).
> - Values: category, status and season accept Vietnamese labels or ids, case- and diacritic-insensitive; multi-values are separated by `;` or `|`.
> - **AC:** the template CSV from the UI round-trips; a 200-row file imports without errors; invalid rows are reported and do not block the valid ones.
> - **Notes:** split into parser + validation (pure functions, unit tested) and preview UI + import.

F-604: "The CSV must re-import through F-601."
F-201 (validation rules reused): "Validation: name required (max 120 chars), price ≥ 0, purchase date not in the future."

Ticket scope (F-601.2), quoted:
> - Header aliases … `Tên`/`name`, `Loại`/`category`, `Trạng thái`/`status`, `Màu`/`colors`, `Mùa`/`seasons`, `Hãng`/`brand`, `Size`/`size`, `Vị trí`/`location`, `Giá`/`price`, `Ngày mua`/`purchase_date`, `Chất liệu`/`material`, `Tag`/`tags`, `Ghi chú`/`notes`.
> - Category, status, season and color accept a Vietnamese label or an id, case- and diacritic-insensitive. Multi-values are split on `;` or `|`.
> - Validation reuses the F-201 rules: name required and ≤ 120 characters, price ≥ 0 (accept `890000`, `890.000`, `890,000`), date in ISO or `dd/mm/yyyy` and not in the future, unknown color/category/status is an error.
> - `mapRows(parsed) → { valid: Item[], errors: { row, field, message }[], ignoredColumns: string[] }`.

Decisions:
- **D7**: "`wear_count` / `last_worn` are exported but ignored on import, and listed as "ignored columns" in the preview."
- **D8**: "A CSV location matches an existing location whose `normalize()`d name is equal (case/diacritic-insensitive, trimmed); otherwise it is created."

Out of scope: UI and the import run (F-601.3). F-201 has not landed, so no shared validation module exists yet; this ticket implements the same three rules in the CSV mapper (see Assumptions).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The UI template CSV maps to a valid item | `map.test.ts › template › CSV_TEMPLATE maps to one valid item with no errors` (asserts name "Áo sơ mi trắng", category "Áo", status "Đang dùng", colors ["Trắng","Kem"], brand "Uniqlo", size "M", location "Tủ ngăn 1", price 890000). The test imports `CSV_TEMPLATE`, which `App.tsx` now also uses, so the test checks the exact string the UI shows. |
| 2 | The F-604 export maps back with no errors | `map.test.ts › round trip › toCsv(starter) → parseCsv → mapRows gives every demo item back, no errors, ignoredColumns = ["wear_count","last_worn"]` and `› value with quote, comma, newline and empty price survives` |
| 3 | Invalid rows are reported and never block valid rows | `map.test.ts › rows › bad rows are reported with their row number and valid rows around them are kept` (rows 1, 3 valid; rows 2, 4 invalid → `valid.length === 2`, errors for rows 2 and 4 only) and `› one row with several bad fields reports one error per field` |
| 4 | Header aliases (VN + EN, case/diacritic-insensitive) | `map.test.ts › headers › every Vietnamese and English alias maps to its field` (table test over all 13 pairs, plus `TÊN`, `ten`, `  Ngày  mua `), `› unknown headers and wear_count/last_worn go to ignoredColumns`, `› a duplicated header keeps the first column and ignores the second` |
| 5 | Enum values: label or id, case/diacritic-insensitive; unknown is an error | `map.test.ts › enums › every category/status/season/color label and id maps to the label` (iterates `CATEGORY_TO_DB`, `STATUS_TO_DB`, `SEASON_TO_DB`, `COLOR_TO_DB`), `› "ao khoac", "AO KHOÁC", "outer" → "Áo khoác"`, `› unknown category / status / season / color → error on that field` |
| 6 | Multi-values split on `;` or `\|` | `map.test.ts › multi-values › splits on ; and \|, trims, drops empties and duplicates` (colors, seasons, tags) |
| 7 | Name rule | `map.test.ts › validation › name empty or blank → error`, `› name of 120 characters ok, 121 → error`, `› length counts NFC characters (NFD input of 120 chars is ok)` |
| 8 | Price rule | `map.test.ts › validation › price accepts 890000, 890.000, 890,000, 1.250.000 and empty (→ 0)`, `› price rejects -1, 12.5, 1.2345, 1.234,000, abc` |
| 9 | Date rule | `map.test.ts › validation › date accepts 2026-01-02, 02/01/2026, 2/1/2026 → "2026-01-02"`, `› date rejects 31/02/2026, 2026-13-01, 2026/01/02, abc`, `› date equal to today (UTC+7) ok, tomorrow → error`, `› today defaults to the UTC+7 date` (fake timers at `2026-11-08T18:00:00Z` → `2026-11-09` is today) |
| 10 | D8 location matching | `map.test.ts › locations › "tủ ngăn 1" maps to existing "Tủ ngăn 1"`, `› a new location keeps its first spelling for later rows ("Kệ Mới" then "ke moi" → "Kệ Mới")`, `› empty location stays ""` |
| 11 | Coverage gate | `npx pnpm@10.34.3 test:coverage` passes with `map.ts` added to the per-file thresholds |
| 12 | Checks green | `npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build` all exit 0 |

## Ming verification after merge
None (pure logic; real files are checked in F-601.3).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/import-export/csv/map.ts` | **Create.** `mapRows(parsed, options?)`, header alias table, enum lookups, value parsers (`parsePrice`, `parseDate`, `splitMulti`). | Ticket "Files" note; the core of this ticket |
| `src/features/import-export/csv/map.test.ts` | **Create.** Unit tests listed below. | R8; ticket test plan |
| `src/features/import-export/csv/template.ts` | **Create.** `export const CSV_TEMPLATE = "name,category,status,colors,brand,size,location,price\nÁo sơ mi trắng,Áo,Đang dùng,Trắng\|Kem,Uniqlo,M,Tủ ngăn 1,890000";` (exact current string, unchanged). | AC1 must test the template the UI shows, not a copy that can drift |
| `src/App.tsx` | Replace the inline `const csv = "…"` in `ImportModal` with `const csv = CSV_TEMPLATE;` (+ import). No other change. | Single source for the template (AC1) |
| `src/features/import-export/messages.ts` | **Create.** `CSV_MAP_COPY`: Vietnamese error messages used by `map.ts` (R6: UI copy in one place per feature; F-601.3 adds its own copy here). | R6 |
| `vitest.config.ts` | Add `src/features/import-export/csv/map.ts` to `coverage.include` and `coverage.thresholds` (same `thresholds` object as `parse.ts`). Do not touch anything else. | R8; same treatment as `parse.ts` in F-601.1 |

Not modified: `src/data/mappers.ts`, `src/constants/wardrobe.ts`, `src/lib/text.ts`, `parse.ts`, `serialize.ts` (only imported).

## Tests to write
All in `src/features/import-export/csv/map.test.ts`. Use `parseCsv` to build inputs from CSV text where that reads better; pass `today: "2026-11-09"` explicitly except in the default-today test.

| Test (file › name) | Covers |
|---|---|
| `template › CSV_TEMPLATE maps to one valid item with no errors` | AC1 |
| `round trip › toCsv(starter) → parseCsv → mapRows gives every demo item back, no errors, ignoredColumns = ["wear_count","last_worn"]` (compare name, category, status, colors, seasons, brand, size, location, price, purchaseDate, material, tags, notes; pass `locations` from `@/data/demo`) | AC2, D7 |
| `round trip › value with quote, comma, newline and empty price survives` | AC2 edge |
| `round trip › a ;-delimited file with VN headers maps the same as the , English one` | parser + aliases together |
| `rows › bad rows are reported with their row number and valid rows around them are kept` | AC3 |
| `rows › one row with several bad fields reports one error per field` | AC3 |
| `rows › short rows read missing cells as empty; extra cells are ignored` | ragged input |
| `rows › header-only input gives no items and no errors` | empty |
| `rows › no name column → every row has a name error` | missing required column |
| `headers › every Vietnamese and English alias maps to its field` (13 pairs, upper case, no diacritics, extra spaces) | aliases |
| `headers › unknown headers and wear_count/last_worn go to ignoredColumns (original text, in column order); blank headers are dropped silently` | D7 |
| `headers › a duplicated header keeps the first column and ignores the second` | edge |
| `enums › every category/status/season/color label and id maps to the label` | enums |
| `enums › case and diacritics do not matter ("ao khoac", "AO KHOÁC", "outer")` | normalize |
| `enums › empty category → "Khác", empty status → "Đang dùng"` | defaults |
| `enums › unknown category / status / season / color → error on that field, message names the value` | validation |
| `multi-values › splits on ; and \|, trims, drops empties and duplicates` | separators |
| `validation › name …` (3 tests in row 7 of the AC table) | name rule |
| `validation › price …` (2 tests) | price rule |
| `validation › date …` (4 tests) | date rule, UTC+7 |
| `locations › …` (3 tests) | D8 |
| `text fields › brand, size, material, notes are trimmed and NFC-normalised; Vietnamese passes through` | diacritics |
| `output › valid items have id "", photo "", wearCount 0, lastWorn "", createdAt from options.now` | Item shape |

## Approach
1. **Types and signature** (`map.ts`):
   ```ts
   export type CsvField = "name" | "category" | "status" | "colors" | "seasons" | "brand" | "size"
     | "location" | "price" | "purchase_date" | "material" | "tags" | "notes";
   export interface RowError { row: number; field: CsvField; message: string }
   export interface MapResult { valid: Item[]; errors: RowError[]; ignoredColumns: string[] }
   export interface MapOptions { locations?: string[]; today?: string; now?: string }
   export function mapRows(parsed: ParsedCsv, options?: MapOptions): MapResult
   ```
   `row` is the 1-based index into `parsed.rows` (data rows, header excluded); F-601.3 shows it as-is. `field` is the English CSV id; `message` is Vietnamese from `CSV_MAP_COPY`.
2. **Headers**: alias table keyed by `normalize(alias)` → `CsvField` (13 pairs from the ticket, nothing more). For each header: `normalize(h)`; known and first occurrence → column index; empty → skip; otherwise push the original trimmed header to `ignoredColumns` (this covers `wear_count`/`last_worn`, D7, and duplicates).
3. **Enum lookups**: built once from `CATEGORY_TO_DB`, `STATUS_TO_DB`, `SEASON_TO_DB`, `COLOR_TO_DB` (R6: labels ↔ ids only through `mappers.ts`): `Map<normalize(label) | normalize(id), label>`. Output is always the Vietnamese label, which is what `Item` stores. No collisions exist between normalized labels and ids today; a test that iterates all four tables guards this.
4. **Value parsers** (exported for tests, pure):
   - `splitMulti(s)`: split on `/[;|]/`, trim, drop empties, dedupe (keep first order).
   - `parsePrice(s)`: trimmed empty → 0; `/^\d+$/` or `/^\d{1,3}([.,])\d{3}(\1\d{3})*$/` (one separator type) → integer; anything else → error.
   - `parseDate(s, today)`: empty → ""; `YYYY-MM-DD` or `d/m/yyyy` (1–2 digit day/month) → `YYYY-MM-DD` after a real-calendar check (round-trip through `Date.UTC`); then `> today` → error. `today` defaults to `toDateOnly(new Date().toISOString())` from `serialize.ts` (UTC+7 date).
5. **Per row**: read every mapped cell (`?? ""`), `trim()` and `normalize("NFC")` text. Name required, `[...name].length <= 120`. Category/status single value (empty → `"Khác"` / `"Đang dùng"`, as `rowToItem` defaults). Colors/seasons via `splitMulti` + lookup; collect all unknown values of a field into one error. Tags via `splitMulti`. Location via D8: build a `Map<normalize(name), name>` from `options.locations`; a miss is added with the CSV spelling so later rows reuse it. Collect every error for the row; push the `Item` only when the row has none.
6. **Item shape**: `{ id: "", photo: "", wearCount: 0, lastWorn: "", createdAt: options.now ?? new Date().toISOString(), ... }` — same as `blankItem()` plus the mapped fields. `id: ""` makes both repos create a new row (`repo.save`, `itemToRow`).
7. **Template**: move the string to `template.ts` and import it in `App.tsx`.
8. **Coverage**: add `map.ts` to `vitest.config.ts`.

Rules: R1: no data access (pure function; the import run is F-601.3). R5: wear columns ignored (D7). R6: labels via `mappers.ts`, copy in `messages.ts`. R8: unit tests + coverage threshold. R2/R3/R4/R9/R10: not touched (the `App.tsx` change does not affect the UI; `vite.config.ts` is not edited).

## Specialist input used
None (no consults).

## Assumptions
- **F-201 rules are re-implemented here**, not shared, because F-201 (BACKLOG) has no validation module yet. Follow-up for F-201: extract a shared `validateItem` and have both callers use it.
- Empty category → `"Khác"`, empty status → `"Đang dùng"` (same defaults as `rowToItem`); only a non-empty unknown value is an error. Empty price → 0, empty date → "".
- `dd/mm/yyyy` also accepts 1-digit day/month (`2/1/2026`), because Excel often writes dates that way. Full ISO timestamps are not accepted (the export writes date-only).
- Price with a currency suffix (`890.000đ`) is an error; the ticket lists only the three formats.
- Text is trimmed and NFC-normalised so a CSV saved on macOS (NFD) does not exceed 120 characters or create look-alike locations.
- Tags containing `;` or `|` are split on import, so such tags do not round-trip exactly. Known limitation, follow-up; the demo data and the template have none.
- `src/App.tsx` is a hotspot (F-004.3, F-601.3, T-001 will edit `ImportModal`). None is open now (all BACKLOG), so no rebase is expected; the edit is 2 lines.
- `serialize.test.ts` still uses its temporary `readCsv`; replacing it with `parseCsv` is a follow-up (R7), since this ticket's round-trip test already covers the real path.

## Blocking questions
None.

## Split proposal
None. Estimate: ~180 lines in `map.ts`, ~30 in `messages.ts`/`template.ts`/config/`App.tsx`, ~300 lines of tests.
