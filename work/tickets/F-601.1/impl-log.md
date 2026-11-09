
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

## Attempt 2 — 2026-11-08 (REWORK: review Issue 1)

### Files touched
| File | Required because |
|---|---|
| src/features/import-export/csv/parse.ts | `detectDelimiter` now opens a quoted section only at a field start (after optional spaces/tabs) or right after a closing quote; a mid-field `"` is literal, same rule as `readRecords` |
| src/features/import-export/csv/parse.test.ts | new test `delimiter › ignores a literal quote inside an unquoted header field` |

### Notes
- Review's expected values for inputs 2 and 3 were inconsistent with its own rule. With the correct rule, `x"y,a;b;c` has 1 unquoted `,` vs 2 `;`, so `;` wins: headers `['x"y,a', "b", "c"]`. `Size 5",Name` picks `,`, so the data row `"x;y";z;w` is one field `x;y;z;w` (text after a closing quote is kept). Tests pin these actual correct results; input 1 matches the review exactly.

### Checks (run in the worktree)
- typecheck: exit 0
- format:check: exit 0
- test: 5 files, 87 tests passed
- test:coverage: exit 0 (parse.ts threshold met)
- build: exit 0 (vite build ok)

### Out-of-plan files
None.
