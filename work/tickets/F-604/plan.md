Status: READY

# Plan — F-604: Real CSV export

## Feature summary
`docs/feature-list.md`:
> #### F-604 · Real CSV export · P0 · M1 · S
> - Export all fields plus `wear_count` and `last_worn`, with proper quoting (current code wraps values in `"` without escaping) and a UTF-8 BOM.
> - The CSV must re-import through F-601.

> (F-601) Values: category, status and season accept Vietnamese labels or ids, case- and diacritic-insensitive; multi-values are separated by `;` or `|`.

`work/decisions.md`:
> D7 · CSV wear columns · `wear_count` / `last_worn` are exported but ignored on import, and listed as "ignored columns" in the preview.

Ticket scope (quoted):
> - `toCsv(items)`: every field (name, category, status, colors, seasons, brand, size, location, price, purchase_date, material, tags, notes) plus `wear_count` and `last_worn` (YYYY-MM-DD).
> - RFC 4180 quoting: double any `"` and quote fields that contain `,`, `"` or a newline. Multi-values are joined with `|`. Keep the UTF-8 BOM (it already exists).
> - Headers use the English ids that F-601.2 accepts.

Ticket technical note:
> Local mode `lastWorn` is an ISO timestamp, while Supabase mode uses a date only: normalise both to YYYY-MM-DD.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A value with `"`, `,` and a newline survives an export → `parseCsv` round trip. | `parseCsv` (F-601.1) is **not on `main`** (F-601.1 is IN_PROGRESS, unmerged), so this ticket must not import it. AC1 is met with a **test-local minimal RFC 4180 reader** inside `serialize.test.ts` (clearly marked "replace with `parseCsv` once F-601.1 is merged"), plus exact-string assertions that do not depend on any reader. Tests: `serialize.test.ts › round trip › value with quote, comma and newline survives` and `› quoting › …` (see table below). The real `parseCsv` round trip is enforced later by F-601.2 AC2 ("The F-604 export maps back with no errors (round-trip test, after F-604 lands)"). `pnpm test` green. |
| 2 | The file opens in Excel with Vietnamese text intact. | Reviewer checks the preconditions only: `serialize.test.ts › file › starts with the UTF-8 BOM` and `› uses CRLF between records`, and that `App.tsx` builds the Blob from `toCsv(items)` with no second BOM. Opening in real Excel → Ming verification. |
| 3 | Re-import through F-601 works (checked when F-601.2 lands). | Deferred by the ticket itself. Reviewer checks the precondition: `serialize.test.ts › headers › are exactly the English ids F-601.2 accepts, plus wear_count and last_worn` (header list matches the F-601.2 ticket alias list: `name, category, status, colors, seasons, brand, size, location, price, purchase_date, material, tags, notes`). Full check is F-601.2 AC2. |
| — | Local mode still exports (R1) | `pnpm dev` with no env vars → avatar menu → export → CSV downloads `tu-do-cua-toi.csv`; JSON export unchanged. `pnpm typecheck`, `pnpm format:check`, `pnpm build` green. |

## Ming verification after merge
- Open an exported `tu-do-cua-toi.csv` in **Excel (Windows)** by double-click: Vietnamese diacritics intact, one column per field, the multi-line note stays in one cell.
- Import the same file into **Google Sheets**: same result.
- If Ming's Windows uses Vietnamese regional settings (list separator `;`), Excel may put everything in one column on double-click. If that happens, tell Annie → follow-up ticket (see Assumptions); "Data → From Text/CSV" works regardless.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/import-export/csv/serialize.ts` | **Create.** `CSV_HEADERS`, `toCsv(items)`, and small exported helpers `csvField(value)` and `toDateOnly(value)`. Pure, no DOM. | Ticket scope; technical note names this file. |
| `src/features/import-export/csv/serialize.test.ts` | **Create.** Unit tests below, including the test-local RFC 4180 reader for AC1. | R8; AC1. |
| `src/App.tsx` | **Modify only the `download` function (lines ~532–561)**: replace the inline CSV string builder with `toCsv(items)`, drop the `"﻿" +` prefix (BOM now comes from `toCsv`), set the CSV MIME to `text/csv;charset=utf-8`; add one import line. Nothing else. | The download helper is the only caller; keep the diff tiny to limit conflicts with F-004.1. |

No other files. Not touched: `vitest.config.ts` (coverage thresholds — see Assumptions), `mappers.ts`, the import modal's template CSV (F-601.3).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `serialize.test.ts › headers › are exactly the English ids F-601.2 accepts, plus wear_count and last_worn` | First line after BOM equals `name,category,status,colors,seasons,brand,size,location,price,purchase_date,material,tags,notes,wear_count,last_worn`. |
| `serialize.test.ts › file › starts with the UTF-8 BOM` | `toCsv([])[0] === "﻿"`; exactly one BOM. |
| `serialize.test.ts › file › empty list gives BOM + header only` | Empty input. |
| `serialize.test.ts › file › uses CRLF between records` | Records separated by `\r\n`; no trailing separator required (assert the chosen form exactly). |
| `serialize.test.ts › quoting › plain value is not quoted` | `Uniqlo` → `Uniqlo`. |
| `serialize.test.ts › quoting › value with comma is quoted` | `a,b` → `"a,b"`. |
| `serialize.test.ts › quoting › value with quote is quoted and doubled` | `6" heel` → `"6"" heel"`. |
| `serialize.test.ts › quoting › value with LF or CRLF is quoted` | `a\nb`, `a\r\nb`, lone `\r`. |
| `serialize.test.ts › quoting › empty string is an empty field` | `""` → nothing between commas. |
| `serialize.test.ts › quoting › Vietnamese diacritics pass through unchanged` | `Áo sơ mi trắng`, `Tủ phòng ngủ – ngăn 1` (en dash) unquoted and byte-identical. |
| `serialize.test.ts › values › multi-values joined with pipe` | colors `["Trắng","Kem"]` → `Trắng|Kem`; seasons, tags likewise; empty array → empty field. |
| `serialize.test.ts › values › labels are exported as stored on Item` | category `Áo`, status `Đang dùng` (Vietnamese labels; F-601 accepts labels or ids). |
| `serialize.test.ts › values › price is a plain integer, empty when 0` | `890000` → `890000` (no thousands separator); `0` → empty. |
| `serialize.test.ts › values › wear_count is exported` | `wearCount: 7` → `7`; `0` → `0`. |
| `serialize.test.ts › values › missing optional fields do not throw` | An item from old localStorage without `seasons`/`tags`/`material`/`notes`/`purchaseDate` (cast) → empty fields. |
| `serialize.test.ts › toDateOnly › keeps a date-only value (Supabase mode)` | `2026-11-05` → `2026-11-05`. |
| `serialize.test.ts › toDateOnly › converts an ISO timestamp to the UTC+7 date (local mode)` | `2026-11-06T18:30:00.000Z` → `2026-11-07`; `2026-11-06T16:59:59.000Z` → `2026-11-06`. |
| `serialize.test.ts › toDateOnly › empty or invalid gives empty` | `""`, `"not a date"` → `""`. |
| `serialize.test.ts › round trip › value with quote, comma and newline survives` | AC1: an item whose `notes` is `Nói "đẹp", mặc\nđi tiệc` and `name` contains `,` → `toCsv` → test-local reader → same strings in the right columns; row count equals item count. |
| `serialize.test.ts › round trip › several items keep column alignment` | Two items, one with every field filled, one with empty fields. |

## Approach
1. Create `serialize.ts`:
   - `CSV_HEADERS` = the 15 ids in ticket order (13 F-601.2 English ids + `wear_count`, `last_worn`).
   - `csvField(v: string)`: if `/[",\r\n]/` matches, wrap in `"` and double every `"`; else return as-is. (`\r` is included so a lone CR cannot break a record — still "a newline".)
   - `toDateOnly(v)`: `""` → `""`; `/^\d{4}-\d{2}-\d{2}$/` → as-is; otherwise `new Date(v)`; invalid → `""`; else shift by +7 h and take `toISOString().slice(0, 10)`. Fixed offset is correct because Vietnam has no DST, and it does not depend on the machine's TZ (vitest pins `Asia/Ho_Chi_Minh`, the browser may not). Used for `last_worn` and `purchase_date`.
   - `toCsv(items: Item[]): string` = `"﻿"` + header line + one line per item, joined with `"\r\n"`. Multi-values `(arr ?? []).join("|")`; strings `?? ""`; price `> 0 ? String(Math.round(price)) : ""`; `wear_count` `String(wearCount ?? 0)`. Every field passes through `csvField`.
2. Write `serialize.test.ts` (table above). The test-local reader is ~20 lines, a straightforward RFC 4180 state machine (quoted fields, `""`, CR/LF inside quotes, CRLF/LF record ends, BOM strip), with a header comment: "Temporary: replace with `parseCsv` from `./parse` after F-601.1 merges (F-601.2 AC2 covers the real round trip)."
3. Edit `App.tsx` `download`: `const blob = new Blob([type === "json" ? JSON.stringify(items, null, 2) : toCsv(items)], { type: type === "json" ? "application/json" : "text/csv;charset=utf-8" });` and remove the old `csv` const. Do not move or rename `download`, `notify`, or the anchor logic.
4. Run checks: `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`.

Rules: **R1** — export reads the already-loaded `items` from `useWardrobe`; no direct Supabase call; works in local mode. **R5** — `wear_count`/`last_worn` are exported, never stored (D7: ignored on import). **R6** — headers are English ids; values are the Vietnamese labels already on `Item` (which F-601 accepts), no new UI copy. **R7** — only the three files above. **R8** — pure module with unit tests. **R9** — no UI change. **R3/R4/R10** — not affected (no photo paths/URLs exported; `vite.config.ts` untouched).

## Specialist input used
None (no consult files).

## Assumptions
- **AC1 without `parseCsv` (reversible, Annie's call per delegated decisions):** a test-local reader stands in for `parseCsv`. The orchestrator should record a `debt` follow-up (or a note in F-601.2's ticket) to swap the test-local reader for `parseCsv` once F-601.1 merges; F-601.2 AC2 already requires the real round trip.
- **Hotspot `src/App.tsx`:** F-004.1 (IN_PROGRESS) extracts constants/components from `App.tsx`. `download` sits inside the `App` component and is not in F-004.1's extraction list, so the change is confined to ~25 lines there plus one import line near the top (imports are a likely, trivial rebase conflict). Expect a rebase if F-004.1 merges first.
- **Same folder as F-601.1:** F-601.1 creates `src/features/import-export/csv/parse.ts`; this ticket creates `serialize.ts` in the same folder — no file overlap.
- **Values are Vietnamese labels, not DB ids** (category, status, colors, seasons), matching today's export and the UI template CSV; F-601 accepts both. Reversible.
- **Price 0 exports as empty**, because `itemToRow` already treats `price <= 0` as "no price" (`null`). Reversible.
- **Record separator CRLF** (RFC 4180 §2.1); Excel, Sheets and F-601.1 (CRLF/LF in scope) all accept it.
- **Delimiter stays `,`.** A `sep=,` hint line would make Excel ignore the BOM (mojibake) and is not in the F-601.1 parser scope. Risk: Excel with a `;` list separator (vi-VN regional settings) opens comma CSV in one column; covered by Ming verification, follow-up only if it actually happens.
- **Known limitation, not fixed here (R7):** a tag or color containing `|` or `;` will be split on re-import (F-601 splits multi-values on both). Rare in practice; noted for the follow-ups list.
- **Not in scope:** CSV/formula-injection escaping (values starting with `=`, `+`, `-`, `@`) — the file holds the user's own data; follow-up candidate only. Adding `serialize.ts` to the coverage thresholds in `vitest.config.ts` is also left out to avoid a shared-file conflict with F-601.1; follow-up candidate.

## Blocking questions
None.

## Split proposal
None (estimated ~150 changed lines, mostly tests).
