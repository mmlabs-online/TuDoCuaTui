Status: READY

# Plan — F-601.1: CSV parser

## Feature summary
`docs/feature-list.md` F-601 · CSV import · P0 · M1:
> - Parse CSV with RFC 4180 quoting; detect `,` vs `;` delimiter; strip the UTF-8 BOM (Excel exports).
> - **Notes:** split into parser + validation (pure functions, unit tested) and preview UI + import.

Ticket scope (F-601.1):
> - `parseCsv(text) → { headers: string[], rows: string[][] }`.
> - RFC 4180: quoted fields, `""` escapes, newlines inside quotes, CRLF/LF.
> - Detect the delimiter (`,` vs `;`) from the header line, ignoring delimiters inside quotes.
> - Strip the UTF-8 BOM.
> - Skip fully empty lines.

Related: F-604 AC "A value with `"`, `,` and a newline survives an export → `parseCsv` round trip" (the
round-trip test belongs to F-604; this plan makes sure the parser can satisfy it). `work/decisions.md`:
no decision changes this ticket (D7/D8 apply to F-601.2). Out of scope: mapping (F-601.2), UI (F-601.3).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | UTF-8 BOM is stripped | `parse.test.ts › BOM › strips a leading BOM from the first header` and `› keeps a BOM that is not at the start` |
| 2 | `;`-delimited Excel export parses | `parse.test.ts › fixtures › parses the Excel semicolon export` (fixture `excel-semicolon.csv` with BOM + CRLF applied) |
| 3 | Quotes with embedded delimiter / newline / quote | `parse.test.ts › quoting › keeps a delimiter inside quotes`, `› keeps LF and CRLF inside quotes as \n`, `› unescapes doubled quotes`, plus `fixtures › parses the Google Sheets export` |
| 4 | Trailing newline does not add a row | `parse.test.ts › line endings › ignores a trailing LF / CRLF` |
| 5 | Ragged rows | `parse.test.ts › ragged rows › keeps short and long rows as-is` and `fixtures › parses ragged.csv` |
| 6 | CRLF and LF both work | `parse.test.ts › line endings › parses CRLF, LF and mixed input identically` |
| 7 | Delimiter detected from the header, ignoring quoted delimiters | `parse.test.ts › delimiter › picks ; when the header has more unquoted ; than ,`, `› ignores delimiters inside quoted headers`, `› defaults to , on a tie or a single column` |
| 8 | Fully empty lines are skipped | `parse.test.ts › empty lines › skips blank lines before the header, between rows and at the end`, `› skips delimiter-only lines` |
| 9 | Unterminated quote is reported, not silently accepted | `parse.test.ts › errors › throws CsvParseError with the line of the opening quote` |
| 10 | No dependency added | `git diff main -- package.json pnpm-lock.yaml` is empty |
| 11 | Coverage gate | `npx pnpm@10.34.3 test:coverage` passes with the new per-file threshold for `parse.ts` |
| 12 | Checks green | `npx pnpm@10.34.3 typecheck`, `npx pnpm@10.34.3 format:check`, `npx pnpm@10.34.3 test`, `npx pnpm@10.34.3 test:coverage`, `npx pnpm@10.34.3 build` all exit 0 |

## Ming verification after merge
None (pure logic, no UI; real-file checks happen in F-601.3).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/import-export/csv/parse.ts` | create: `parseCsv`, `CsvParseError`, `type ParsedCsv` | the parser (ticket technical notes) |
| `src/features/import-export/csv/parse.test.ts` | create: unit tests listed below | R8, ticket AC |
| `src/features/import-export/csv/__fixtures__/excel-semicolon.csv` | create: `;`-delimited, Vietnamese headers (`Tên;Loại;Trạng thái;Màu;Giá;Ghi chú`), a quoted field containing `;`, an unquoted value with `,` (`890,5`), a delimiter-only blank row `;;;;;` | ticket test plan (fixtures) |
| `src/features/import-export/csv/__fixtures__/google-sheets.csv` | create: `,`-delimited, quoted field with `,`, with a newline, with `""`, Vietnamese diacritics, trailing newline | ticket test plan |
| `src/features/import-export/csv/__fixtures__/ragged.csv` | create: rows shorter and longer than the header, a trailing delimiter, blank lines | ticket AC "ragged rows" |
| `vitest.config.ts` | add `"src/features/import-export/csv/parse.ts"` to `coverage.include` and `thresholds["src/features/import-export/csv/parse.ts"]: thresholds` | per-file coverage like `filters.ts` |

No other file. `work/backlog.md` is not touched (D16).

## Tests to write
All in `src/features/import-export/csv/parse.test.ts`, style as `src/features/items/filters.test.ts`
(`import { describe, expect, test } from "vitest"`, `describe` per behaviour, short `test` names, small helpers at
the top). Helpers: `read(name)` = `readFileSync(fileURLToPath(new URL("./__fixtures__/" + name, import.meta.url)), "utf8")`;
`crlf(s)` = `s.replace(/\n/g, "\r\n")`; `BOM = "﻿"`.

| Test (file › name) | Covers |
|---|---|
| `basics › parses headers and rows` | `a,b\n1,2` → `{ headers: ["a","b"], rows: [["1","2"]] }` |
| `basics › returns empty headers and rows for empty or blank input` | `""`, `"\n\n"`, `BOM` alone → `{ headers: [], rows: [] }` |
| `basics › returns no rows for a header-only file` | `a,b` and `a,b\n` → rows `[]` |
| `basics › keeps Vietnamese text unchanged` | `Tên,Màu\nÁo sơ mi,Trắng` byte-for-byte (no normalisation) |
| `basics › does not trim unquoted fields` | ` a , b ` → `[" a "," b "]` |
| `BOM › strips a leading BOM from the first header` | `BOM + "name,x"` → headers[0] === `"name"` |
| `BOM › keeps a BOM that is not at the start` | `"a\n﻿b"` → rows[0][0] === `"﻿b"` |
| `delimiter › picks ; when the header has more unquoted ; than ,` | `a;b;c\n1,5;2;3` → `[["1,5","2","3"]]` |
| `delimiter › picks , for a comma header` | baseline |
| `delimiter › ignores delimiters inside quoted headers` | `"a;b;c",d` → `,`; headers `["a;b;c","d"]`; and `"x,y";z` → `;` |
| `delimiter › defaults to , on a tie or a single column` | `name` (no delimiter) and `a;b,c` (1 vs 1) → `,` |
| `delimiter › detects from a header that spans lines inside quotes` | `"multi\nline";b\n1;2` → `;` |
| `quoting › keeps a delimiter inside quotes` | `"Hà Nội, VN"` |
| `quoting › unescapes doubled quotes` | `"5"" màn"` → `5" màn`; `""` → empty string |
| `quoting › keeps LF and CRLF inside quotes as \n` | `"a\r\nb"` and `"a\nb"` → `"a\nb"` |
| `quoting › treats a quote inside an unquoted field as a literal` | `5" screen,x` → `5" screen` |
| `quoting › ignores spaces around a quoted field` | `a, "b" ,c` → `["a","b","c"]` |
| `quoting › appends non-space text after a closing quote literally` | `"ab"cd,e` → `["abcd","e"]` |
| `line endings › parses CRLF, LF and mixed input identically` | same `toEqual` result for all three |
| `line endings › ignores a trailing LF / CRLF` | no extra row |
| `line endings › treats a lone CR as a line break` | `a\rb` → two lines |
| `empty lines › skips blank lines before the header, between rows and at the end` | leading/inner/trailing `\n`, `\r\n` |
| `empty lines › skips delimiter-only lines` | `a;b\n;\n1;2`, `a,b\n,,\n1,2` and a whitespace-only line `   ,  ` → skipped |
| `empty lines › keeps a row with one non-empty field` | `,x` kept as `["","x"]` |
| `ragged rows › keeps short and long rows as-is` | `a,b,c\n1\n1,2,3,4` → `[["1"],["1","2","3","4"]]` |
| `ragged rows › keeps an empty field for a trailing delimiter` | `a,b\n1,` → `[["1",""]]`; header `a,b,` → `["a","b",""]` |
| `errors › throws CsvParseError with the line of the opening quote` | `a,b\n1,"open\nmore` → `CsvParseError`, `instanceof Error`, `.line === 2`, `.name === "CsvParseError"` |
| `errors › throws for an unterminated quote in the header` | `"a,b` → `.line === 1` |
| `fixtures › parses the Excel semicolon export` | `parseCsv(BOM + crlf(read("excel-semicolon.csv")))` → exact `toEqual` |
| `fixtures › parses the Google Sheets export` | `read("google-sheets.csv")` → exact `toEqual` incl. embedded newline/quote/comma |
| `fixtures › parses ragged.csv` | exact `toEqual` |

## Approach
1. Create `parse.ts` (no imports; pure function, no DOM):
   ```ts
   export interface ParsedCsv { headers: string[]; rows: string[][] }
   export class CsvParseError extends Error { readonly line: number; /* name = "CsvParseError" */ }
   export function parseCsv(text: string): ParsedCsv
   ```
   - Strip one leading `﻿`.
   - Single-pass character state machine over records (fields, `inQuotes`, physical line counter). Record
     terminators outside quotes: `\r\n`, `\n`, lone `\r`. Inside quotes: `""` → `"`; `\r\n` and lone `\r` are
     stored as `\n`; everything else verbatim.
   - A field is quoted only when its first non-space/tab character is `"`; leading spaces/tabs before that quote
     are dropped. After the closing quote, spaces/tabs before the delimiter/terminator are dropped; any other
     character is appended literally. A `"` inside an unquoted field is literal.
   - EOF while `inQuotes` → `throw new CsvParseError(message, lineOfOpeningQuote)` (1-based physical line).
     English message, e.g. `Unterminated quoted field starting on line 2` (F-601.3 owns the Vietnamese copy).
   - Delimiter detection: scan the first non-empty logical record (the header, which may contain quoted
     newlines) counting `,` and `;` outside quotes; `;` if its count is greater, else `,`. Then parse the whole
     text with that delimiter (two passes over the header is fine at this size).
   - Drop records whose every field is empty after `trim()` (covers `""`, whitespace-only and `;;;;` lines).
   - First kept record → `headers` (fields as parsed, not trimmed or normalised); the rest → `rows`, unchanged
     length (no padding, no truncation).
2. Add the three fixtures, stored LF and without BOM (see Assumptions); keep each under ~10 lines.
3. Write `parse.test.ts` per the table.
4. Update `vitest.config.ts` coverage include + per-file threshold.
5. Run the checks (`npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build`).

Rules: R6 — code and error message in English, no UI copy. R7 — only the files above. R8 — pure logic with
unit tests and a coverage threshold. R1–R5, R9, R10 not affected (no data access, UI, schema or Figma files).
Expected size ≈ 120 lines of code + ≈ 200 lines of tests + fixtures, well inside one cycle.

## Specialist input used
None (no consult files).

## Assumptions
Ming delegated these choices ("tự quyết định"); each is reversible and only affects F-601.2/F-601.3 consumers.
1. **Ragged rows: keep as-is** (no padding, no truncation). F-601.2 reads missing cells as empty and can report
   extra cells per row; padding here would hide that information.
2. **Trailing delimiter** produces a trailing empty field (RFC 4180): `1,` → `["1",""]`, also in the header
   (`a,b,` → headers `["a","b",""]`; F-601.2 ignores an empty header).
3. **Unterminated quote at EOF: throw `CsvParseError`** (typed, `instanceof Error`, with `.line`). Rationale: an
   open quote swallows every following line, so no per-row recovery is possible; it is a whole-file error.
   F-601.3 catches it and shows one file-level message with the line number; per-row errors stay F-601.2's job
   (`mapRows` errors). The signature stays exactly `parseCsv(text) → { headers, rows }` as the ticket states.
4. **Header-only file** → `{ headers: [...], rows: [] }`; **empty/blank file** → `{ headers: [], rows: [] }`
   (no throw). F-601.3 decides the "no data" message.
5. **Whitespace around quoted fields is tolerated and dropped** (`a, "b" ,c` → `b`); unquoted fields are never
   trimmed (F-601.2 trims/normalises values). Text after a closing quote is appended literally rather than
   rejected (lenient, like Excel/Sheets readers).
6. **"Fully empty line"** = a record whose fields are all empty after trim. This includes delimiter-only lines
   (`;;;;`), which Excel writes for blank formatted rows; skipping them is the intent of the scope line.
7. **Line endings inside quoted fields are normalised to `\n`**, so a value is identical whether the file came
   from Windows or Unix. Lone `\r` is a line break (old Mac exports).
8. **Delimiter tie** (including no delimiter at all) → `,`. Only `,` and `;` are candidates (tab is out of scope).
9. **Row numbers**: the result carries no source line numbers (signature as specified). F-601.2's `row` is the
   1-based index into `rows`; because empty lines are skipped it can differ from the spreadsheet line. If F-601.3
   needs file line numbers, that is a follow-up, not this ticket.
10. **Fixtures are stored LF and without a BOM.** `.gitattributes` has `* text=auto eol=lf`, so a CRLF fixture
    would be normalised on commit, and editors often strip BOMs. Tests apply `BOM + crlf(...)` explicitly to
    reproduce Excel bytes; this keeps the tests deterministic on Windows, macOS and CI without editing
    `.gitattributes`.
11. Fixtures are read with `node:fs` (`@types/node` is already in `tsconfig.json` `types`); oxfmt does not format
    `.csv`, so `format:check` is unaffected.
12. Hotspots: none. `vitest.config.ts` may also be edited by other open tickets that add coverage entries
    (e.g. F-601.2, F-604); a one-line rebase conflict is possible. `src/App.tsx` is not touched.

## Blocking questions
None.

## Split proposal
None.
