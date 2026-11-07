# F-601.1: CSV parser

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data |
| Gate | none |
| Depends on | F-005 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
A small, tested, dependency-free CSV parser that handles files from Excel and Google Sheets.

## Feature reference
`docs/feature-list.md` F-601 (split F-601.1). Decisions: `work/decisions.md`.

## Scope
- `parseCsv(text) → { headers: string[], rows: string[][] }`.
- RFC 4180: quoted fields, `""` escapes, newlines inside quotes, CRLF/LF.
- Detect the delimiter (`,` vs `;`) from the header line, ignoring delimiters inside quotes.
- Strip the UTF-8 BOM.
- Skip fully empty lines.

## Out of scope
- Mapping to items (F-601.2).
- UI (F-601.3).

## Acceptance criteria
- [ ] Unit tests: BOM, `;`-delimited Excel export, quotes with embedded delimiter/newline/quote, trailing
      newline, ragged rows.

## Technical notes
- Files: `src/features/import-export/csv/parse.ts` (+ test).
- No library needed at this size; if one is preferred, `papaparse` is the usual choice (decision not needed for M1).
- Expected tier: Low/Medium.

## Test plan
- Unit: as above, with fixture files in `src/features/import-export/csv/__fixtures__/`.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
