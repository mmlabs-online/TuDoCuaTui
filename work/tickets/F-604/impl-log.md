## Attempt 1 — 2026-11-07

### Files touched
| File | Required because |
|---|---|
| `src/features/import-export/csv/serialize.ts` | New: `CSV_HEADERS`, `toCsv`, `csvField`, `toDateOnly` (plan) |
| `src/features/import-export/csv/serialize.test.ts` | New: unit tests incl. test-local RFC 4180 reader for AC1 (plan) |
| `src/App.tsx` | `download` now uses `toCsv(items)`; one import line; MIME `text/csv;charset=utf-8` (plan) |

### Tests added / changed
- serialize.test.ts: headers, file (BOM, empty, CRLF), quoting (6 cases), values (5), toDateOnly (3), round trip (2). The reader is marked temporary pending `parseCsv` from F-601.1.

### Checks (actual output summary)
- typecheck: `tsc --noEmit` no errors
- format:check: All matched files use the correct format.
- test: 5 files passed, 74 tests passed
- build: built in 424ms

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Swap test-local reader for `parseCsv` once F-601.1 merges (F-601.2 AC2 covers the real round trip).
- Tags/colors containing `|` or `;` split on re-import.
- Optional: CSV formula-injection escaping; add `serialize.ts` to vitest coverage thresholds.
- Excel with `;` list separator (vi-VN) may open the comma CSV in one column; follow-up only if it happens.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +265 / -19 lines (mostly tests).
