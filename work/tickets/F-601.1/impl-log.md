
## Attempt 1 — 2026-11-07

### Files touched
| File | Required because |
|---|---|
| src/features/import-export/csv/parse.ts | the parser |
| src/features/import-export/csv/parse.test.ts | R8, ticket AC |
| src/features/import-export/csv/__fixtures__/excel-semicolon.csv | fixture |
| src/features/import-export/csv/__fixtures__/google-sheets.csv | fixture |
| src/features/import-export/csv/__fixtures__/ragged.csv | fixture |
| vitest.config.ts | coverage include + per-file threshold (oxfmt reflowed the include array) |

### Tests added / changed
- parse.test.ts: basics, BOM, delimiter (+ leading-blank-lines detection), quoting, line endings, empty lines, ragged rows, errors, fixtures (all plan tests)

### Checks (actual output summary)
- typecheck: exit 0
- format:check: exit 0 (all files correct)
- test: 5 files, 86 tests passed
- test:coverage: exit 0, per-file threshold for parse.ts met
- build: exit 0 (vite build ok)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- None.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +~310 / -1 lines (parse.ts 120, tests 184, fixtures, config)
