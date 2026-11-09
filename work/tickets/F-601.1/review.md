Verdict: REWORK

## Attempt 1 — 2026-11-07

### Checks (run by reviewer)
- typecheck: `npx pnpm@10.34.3 typecheck` → `tsc --noEmit` exit 0.
- format:check: `npx pnpm@10.34.3 format:check` → "All matched files use the correct format." exit 0.
- test: `npx pnpm@10.34.3 test` → 5 files, 86 tests passed, exit 0 (matches impl-log).
- test:coverage: `npx pnpm@10.34.3 test:coverage` → exit 0, per-file thresholds met. `parse.ts` actual
  coverage (json-summary): lines 100 %, statements 100 %, functions 100 %, branches 100 % (the text reporter
  hides fully covered files, which is why it is not in the table).
- build: `npx pnpm@10.34.3 build` → `vite build` ok, exit 0.
- No dependency added: `git diff origin/main...HEAD -- package.json pnpm-lock.yaml` is empty.
- Fixtures: all three are LF (`git ls-files --eol` → `i/lf w/lf`, 0 CR bytes) and have no BOM, as plan
  Assumption 10 says.

### Acceptance criteria
- [x] 1 BOM stripped — `parse.test.ts › BOM › strips a leading BOM…`, `› keeps a BOM that is not at the start` (pass). Probe: BOM + quoted first header `﻿"Tên";"Màu"` → headers `["Tên","Màu"]`.
- [x] 2 `;` Excel export — `fixtures › parses the Excel semicolon export` (BOM + CRLF applied) passes.
- [x] 3 Quotes with embedded delimiter / newline / quote — `quoting ›` tests + `fixtures › parses the Google Sheets export` pass. Probes: `""` at field start (`"""quoted"" rest"` → `"quoted" rest`, `""` → empty), quoted `;` with `,` delimiter kept in one field.
- [x] 4 Trailing newline — `line endings › ignores a trailing LF / CRLF` passes. Probe: trailing `\r\n\r\n` and a trailing whitespace-only line add no row.
- [x] 5 Ragged rows — `ragged rows ›` tests + `fixtures › parses ragged.csv` pass.
- [x] 6 CRLF / LF — `line endings › parses CRLF, LF and mixed input identically` passes. Probe: CR-only file (`a,b\r1,2\r"x\ry",3\r`) → rows `[["1","2"],["x\ny","3"]]`.
- [ ] 7 Delimiter detected from the header, ignoring quoted delimiters — FAILED for headers with a literal `"`, see Issue 1.
- [x] 8 Fully empty lines skipped — `empty lines ›` tests pass.
- [x] 9 Unterminated quote reported — `errors ›` tests pass. Probes: line numbers correct with CRLF, CR-only, blank lines and quoted newlines before the open quote.
- [x] 10 No dependency added — see Checks.
- [x] 11 Coverage gate — `vitest.config.ts:28,35` adds include + threshold; 100 % measured.
- [x] 12 Checks green — see Checks.

Other probes (pass): Vietnamese NFD text with combining marks (`Tên`, `Áo`) and `đ` are returned
byte-for-byte; emoji/surrogate pairs intact. Performance is linear: 100k-char line 4–14 ms; 1M → 7–94 ms;
4M → 98–307 ms (no quadratic growth for long unquoted, long quoted, `""`-heavy, many-field or many-row input).

Ming verification after merge: none (plan says none).

### Issues
#### Issue 1 — 🔴 blocker — correctness (delimiter detection disagrees with the parser's quoting rule)
- **Where**: `src/features/import-export/csv/parse.ts:26-28` (`detectDelimiter`).
- **Expected**: plan Approach: "A field is quoted only when its first non-space/tab character is `"` … A `"`
  inside an unquoted field is literal", and detection counts `,`/`;` "outside quotes" — i.e. the same quoting
  rule as `readRecords` (`parse.ts:55-57`). A header with a literal `"` in an unquoted field must be detected
  by its real unquoted delimiters.
- **Actual**: `detectDelimiter` toggles `inQuotes` on **every** `"`, wherever it is. A mid-field quote in the
  header (an inch mark, a typo) hides the following delimiters, and with an odd quote count the scan runs on
  past the header into the data rows. Result: wrong delimiter, no error, the whole file collapses or splits
  wrongly. Reproduced:
  - `Size 5";Name;Color\n1;2;3` → headers `["Size 5\";Name;Color"]`, rows `[["1;2;3"]]` (expected `;`, 3 columns).
  - `x"y,a;b;c\nq;w;e` → `,` chosen (header has 1 `,` vs 2 `;` unquoted) → headers `["x\"y","a;b;c"]`.
  - `Size 5",Name\n"x;y";z;w` → `;` chosen from the **data row** → headers `["Size 5\",Name"]`, rows `[["x;y","z","w"]]` (expected `,`).
  The parser itself handles these quotes correctly (`quoting › treats a quote inside an unquoted field as a
  literal`), so only detection is wrong.
- **Fix instruction**: in `detectDelimiter`, open a quoted section only when the `"` is the first
  non-space/tab character of a field (track an `atFieldStart` flag: true at the start, after a counted
  delimiter and after a skipped blank line; stays true over spaces/tabs; false after any other character).
  Inside quotes, a `"` closes the section (a following `"` reopens it, which handles `""`); after closing, any
  further `"` in that field is literal. Simplest equivalent: detect with the same field-start rule
  `readRecords` uses (e.g. tokenize the first non-empty record once per candidate, or share a small helper).
  Add tests in `parse.test.ts › delimiter`: `ignores a literal quote inside an unquoted header field` with the
  three inputs above and their expected results.

### Rules R1–R10 (CLAUDE.md)
No violations found. R6: error message is English, no UI copy. R7: changed files match the plan's file list
(plus the ticket's own work files). R8: pure logic with unit tests and a 100 % coverage threshold entry.
R1–R5, R9, R10 not affected.

### Nits (do not block)
- 💭 `parse.ts:86-89`: text after a closing quote keeps its trailing spaces (`"ab"  cd  ,e` → `ab  cd  `),
  and leading spaces in that tail are kept too. Plan wording ("spaces/tabs before the delimiter are dropped")
  is ambiguous here; lenient behaviour is fine, a test pinning it would document it.
- 💭 `parse.ts:89` and `:116` use `String.prototype.trim()`, which also strips NBSP and other Unicode
  whitespace (a line of ` , ` is skipped). Reasonable, but differs from the plan's "spaces/tabs"
  wording; mention it in the JSDoc.
- 💭 `detectDelimiter` scans the whole file when the header has an unbalanced quote (linear, so harmless
  once Issue 1 is fixed).

### Follow-ups (out of scope)
- Tab-delimited files (`a\tb`) parse as one column; tab is out of scope (plan Assumption 8). Consider for a
  later ticket if F-601.3 users paste from Sheets as TSV.
- U+2028/U+2029 are not line breaks (correct per RFC 4180); no action.

Verdict: PASS

## Attempt 2 — 2026-11-08

### Checks (run by reviewer, in the F-601.1 worktree)
- typecheck: `npx pnpm@10.34.3 typecheck` → `tsc --noEmit` exit 0.
- format:check: `npx pnpm@10.34.3 format:check` → exit 0 (32 files checked).
- test: `npx pnpm@10.34.3 test` → 5 files, 87 tests passed, exit 0 (matches impl-log Attempt 2).
- test:coverage: `npx pnpm@10.34.3 test:coverage` → exit 0, per-file thresholds met (incl. `parse.ts`).
- build: `npx pnpm@10.34.3 build` → `vite build` ok, exit 0.
- No dependency added: `git diff origin/main...HEAD -- package.json pnpm-lock.yaml` is empty.
- Attempt-2 diff (`79cfe8e..44ae929`): only `parse.ts` (`detectDelimiter`) and `parse.test.ts` (+1 test).

### Issue 1 (attempt 1) — resolved
`detectDelimiter` (`parse.ts:20-62`) now opens a quoted section only at a field start (after optional
spaces/tabs, after a counted delimiter, after a skipped blank line) or straight after a closing quote (`""`);
any other `"` is literal. That is the rule `readRecords` uses (`parse.ts:72` field start; `:82-85` `""`;
`:98-101` text after a closing quote is literal, so a later `"` in that field does not reopen).
Test: `parse.test.ts:53-63 › delimiter › ignores a literal quote inside an unquoted header field` (pass).

**On the implementer's deviation from the attempt-1 expected values: the implementer is right.**
- Input 1 `Size 5";Name;Color\n1;2;3` → `;`, headers `['Size 5"',"Name","Color"]`, rows `[["1","2","3"]]` — same as the review expected.
- Input 2 `x"y,a;b;c\nq;w;e`: attempt 1 printed the buggy output and noted "1 `,` vs 2 `;` unquoted". With the
  fixed rule `;` wins, so headers `['x"y,a',"b","c"]` (rows `[["q","w","e"]]`) is the correct result; the
  review's listed headers were the bug, not a target.
- Input 3 `Size 5",Name\n"x;y";z;w`: review expected `,`, and `,` is chosen. With `,`, the data row is one
  quoted field `x;y` followed by the literal tail `;z;w` (plan Assumption 5, test `quoting › appends non-space
  text after a closing quote literally`), so `[["x;y;z;w"]]` is what the parser must return. Any other value
  would need detection and record reading to disagree.

Reviewer probes against the attempt-2 code (all consistent between detection and reading):
`"a""b;c",d` → `,`, `["a\"b;c","d"]`; `"a""b,c";d` → `;`; ` "a,b" ;c` → `;`, `["a,b","c"]`;
`"ab"c"d;e;f,g` → `;`, `['abc"d',"e","f,g"]`; `"ab" "cd;e",f` → tie → `,`, `['ab "cd;e"',"f"]`
(tail literal, same in both); `;;\n\na;b` → `;` (delimiter-only line ignored by both);
`"a\n;;;",b` → `,`; BOM + `"Tên";"Màu";Giá\nÁo;Trắng;"890,5"` → `;`, Vietnamese text byte-for-byte.

### Acceptance criteria
- [x] 1 BOM stripped — `BOM ›` tests pass; probe above.
- [x] 2 `;` Excel export — `fixtures › parses the Excel semicolon export` passes.
- [x] 3 Quotes with embedded delimiter / newline / quote — `quoting ›` tests + Google Sheets fixture pass.
- [x] 4 Trailing newline — `line endings › ignores a trailing LF / CRLF` passes.
- [x] 5 Ragged rows — `ragged rows ›` tests + `fixtures › parses ragged.csv` pass.
- [x] 6 CRLF / LF — `line endings › parses CRLF, LF and mixed input identically` passes.
- [x] 7 Delimiter from the header, ignoring quoted delimiters — `delimiter ›` tests incl. the new
      `ignores a literal quote inside an unquoted header field` pass; probes above.
- [x] 8 Fully empty lines skipped — `empty lines ›` tests pass.
- [x] 9 Unterminated quote reported — `errors ›` tests pass.
- [x] 10 No dependency added — see Checks.
- [x] 11 Coverage gate — `vitest.config.ts` include + threshold; `test:coverage` exit 0.
- [x] 12 Checks green — see Checks.

Ming verification after merge: none (plan says none).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. Changed files = plan file list + the ticket's own work files (R7). R6: English error
message, no UI copy. R8: tests + coverage threshold. R1–R5, R9, R10 not affected.

### Nits (do not block)
- 💭 `parse.ts:29,39` (`hasContent`): detection treats a line of only quoted empty fields (`"";""`) as the
  header, while `parseCsv` drops it as an empty record. Probe: `"";""\na,b\n1,2` → `;` chosen from the
  dropped line → headers `["a,b"]`, rows `[["1,2"]]`. Only hit when a file starts with a fully-quoted blank
  row; fix would be to set `hasContent` only for a non-blank char inside quotes or outside a delimiter.
- 💭 Detection counts both candidates as field boundaries, while reading uses one; for mixed headers such as
  `a;"b,c",d` the tie picks `,` and the header splits as `['a;"b','c"','d']`. Pathological; a per-candidate
  tokenization would remove it.
- 💭 Attempt-1 nits (tail spaces after a closing quote; `trim()` vs spaces/tabs wording) still apply.

### Follow-ups (out of scope)
- Tab-delimited input (unchanged from attempt 1).
- The `"";""` leading-row nit above, if F-601.3 real-file testing shows such files.
