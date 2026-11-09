
## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/features/import-export/csv/map.ts` | New: `mapRows`, aliases, enum lookups, `parsePrice`/`parseDate`/`splitMulti` |
| `src/features/import-export/csv/map.test.ts` | New: tests listed in the plan (R8) |
| `src/features/import-export/csv/template.ts` | New: single source of `CSV_TEMPLATE` |
| `src/features/import-export/messages.ts` | New: `CSV_MAP_COPY` Vietnamese error messages (R6) |
| `src/App.tsx` | `csv = CSV_TEMPLATE` + import (2 lines) |
| `vitest.config.ts` | `map.ts` added to coverage include and thresholds |

### Tests added / changed
- `map.test.ts`: all groups from the plan (template, round trip, rows, headers, enums, multi-values, validation, locations, text fields, output) plus `createdAt defaults to the current time`.

### Checks (actual output summary)
- typecheck: exit 0
- format:check: exit 0
- test: 13 files, 251 tests passed
- test:coverage: passed; `map.ts` 100% lines/functions, 95.94% branches
- build: exit 0 (built)

### Deviations
- Exported `parseDate` returns `{ ok, value | reason }` rather than a bare string so the mapper can tell "bad" from "future"; `mapRows` behaviour is as planned.
- Test inputs with `,` in a value are quoted in the CSV helper (`1.234,000`).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- F-201: extract shared `validateItem`, reuse in the CSV mapper.
- Tags containing `;` or `|` do not round-trip exactly.
- `serialize.test.ts` still uses temporary `readCsv`; switch to `parseCsv`.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: ~+720 / -3 lines (about half is tests).
