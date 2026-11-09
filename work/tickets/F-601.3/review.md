# Review — F-601.3

## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit` clean, no output.
- format:check: "All matched files use the correct format." (89 files; the "No config found" notice was already there before this ticket).
- test: 25 files, 385 tests passed.
- test:coverage: 385 passed, thresholds met; All files 99.82 % stmts / 99.08 % branches; `csv/preview.ts` 95.65 % stmts / 91.66 % branches (uncovered: line 35, the rethrow of a non-`CsvParseError`).
- build: `vite build` OK (242 kB JS).
- These match impl-log Attempt 1.
- Visual (local mode, `vite preview`, 390×844, isMobile, light and dark): the template CSV plus 2 bad rows gives a preview with "Sẽ nhập 1 món", "Bỏ qua 2 dòng lỗi" and rows 2–4. The import runs and the summary shows "Đã nhập: 1 / Bỏ qua (lỗi dữ liệu): 2 / Lỗi khi lưu: 0". Nothing scrolls sideways: `documentElement.scrollWidth` = 390 and the `.csv-preview` scrollWidth equals its clientWidth (354). Dark mode uses the theme variables.

### Acceptance criteria
- [x] The template CSV from the UI imports. Evidence: `App.test.tsx › CSV tab imports the template: preview, progress, summary, item visible` (17 cards, "Áo sơ mi trắng", toast) and `preview.test.ts › CSV_TEMPLATE → 1 item…`. Also checked in the browser.
- [x] A 200-row file imports without errors. Evidence: `preview.test.ts › a generated 200-row CSV…`, `importRunner.test.ts › 200 items all succeed…` and `useWardrobe.test.tsx › importMany imports 200 items and all of them are in state` (202 items).
- [x] Invalid rows are reported and do not block valid ones.
  - Preview: `preview.test.ts › rows with errors are counted as skipped…`.
  - Runner: `importRunner.test.ts › a save that fails on row 3 does not stop rows 1, 2, 4, 5` (`src/data/importRunner.ts:21-31`, try/catch per row).
  - Hook, Supabase fake: `useWardrobe.test.tsx › importMany continues after a failed row…` (ok/fail "Dữ liệu bị trùng"/ok, `n1` and `n3` in state).
  - UI: `App.test.tsx › CSV tab reports invalid rows and imports only the valid ones`.
- [x] Closing the modal mid-import stops after the current row, and the saved items stay visible.
  - Abort on unmount: `ImportModal.tsx:39`. The runner checks `signal.aborted` only before each row (`importRunner.ts:22`), so a save in flight is never cancelled.
  - `upsertLocal` runs per saved row as `onSaved` (`useWardrobe.ts:93-96`).
  - Tests: `importRunner.test.ts › an abort during row 2 lets row 2 finish…`, `useWardrobe.test.tsx › importMany stops when the signal is aborted` (1 result, item in state) and `ImportModal.test.tsx › closing the modal… aborts` / `› Escape during an import aborts too`.
- [x] Plan AC 5: Photos and JSON tabs no longer write fake items.
  - `doImport` and `starter` are gone: `grep starter|demo src/features/import-export/*.tsx` finds nothing.
  - The primary button is hard-disabled with `onClick: undefined` for tabs 0 and 2 (`ImportModal.tsx:58-64`) in both modes.
  - The only write path left in the modal is `start` → `importMany(preview.items)`, and those items come from the user's CSV.
  - Test: `App.test.tsx › Photos and JSON tabs are disabled… and add nothing` (still 16 cards).
- [x] Plan AC 6: empty, header-only and broken CSV. Evidence: `preview.test.ts` (3 tests) and `App.test.tsx › CSV tab disables import for empty, header-only and broken CSV`.
- [x] Plan AC 7: picking a .csv file. Evidence: `App.test.tsx › picking a .csv file fills the text and shows the preview`.
- [x] Plan AC 8: checks. All green, see above.

### Characterisation-test changes (each one is named in the plan)
- `App.test.tsx › import modal switches tabs…`: "Nhận 2 món" → "Bỏ qua 2 dòng lỗi". Named in the plan, and correct: in `a\nb\nc`, `a` is the header and the 2 data rows have no `name`.
- `App.test.tsx › import mock shows progress, adds 4 items and closes`: removed and replaced by the "Photos and JSON tabs are disabled…" test and the new CSV tests. Named in the plan.
- `useWardrobe.test.tsx`: the 2 local `importMany` tests now use the new signature (one is renamed "without options"), and "stops at the first failure" is replaced by "continues after a failed row". Named in the plan.
- No other existing test was changed (checked with `git diff origin/main...HEAD -- '*.test.*'`).

### Deviations (impl-log)
1. The per-row state test in the hook is weaker than the plan wording. **Accepted.** React batches updates inside `act`. The ordering guarantee (onSaved before the next save) is tested exactly in `importRunner.test.ts › onSaved runs for each saved row before the next save starts`, and the abort test in the hook shows that the saved item is in state.
2. `results` prop instead of `summary`. **Accepted.** Same data, no behaviour change.
3. "Bỏ qua N dòng lỗi" rendered as `<small className="csv-error">`. **Accepted.** The colour does not apply, though; see Nits.
4. The Escape test unmounts after `onClose`. **Accepted.** In the app, App does the unmount (`App.tsx:214`, `importOpen &&`).
5. Excel fixture test: it compares the BOM + `;` fixture with the equivalent `,` text, because both fixture rows are invalid by design. **Accepted.** It still exercises the delimiter and BOM path.

### Issues
#### Issue 1 — 🟡 should-fix — summary can describe a different CSV
- **Where**:
  - `src/features/import-export/ImportCsvTab.tsx:66`: the file button is enabled during `running`.
  - `ImportCsvTab.tsx:71-78`: the textarea is enabled during `done`.
  - `ImportCsvTab.tsx:133-147`: the summary reads `preview.skipped` and `preview.itemRows` from the current text.
- **Expected**: the summary describes the CSV that was imported.
- **Actual**: two ways the summary goes wrong:
  - The user picks another file mid-run, or edits the text after the run. `preview` is then rebuilt, so "Bỏ qua (lỗi dữ liệu)" and the "Dòng N" labels of failed rows come from the new text.
  - No data is wrong (the run uses the items captured at `start`), but the report is misleading.
- **Fix instruction** (next touch of this file; does not block this PR):
  - Disable the "Chọn file .csv" button while `phase === "running"`.
  - Keep the `preview` used at `start` (for example in a ref or state, next to `results`) and render the summary from it, or make the textarea and the file button read-only in `done`.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: the modal writes only through the `importMany` prop (`App.tsx:217-219` → `useWardrobe.importMany` → `repo.save`). No `supabase` import in the changed components. Local mode is covered by the App tests and the browser check.
- R2–R4: not touched.
- R5: `wear_count` / `last_worn` are ignored and shown as ignored columns (D7, `preview.test.ts`).
- R6: all new copy is in `copy.ts:46-58`. Category and location shown in the preview are UI labels from `mapRows`.
- R7: every changed file is in the plan's table. `parse.ts`, `map.ts` and `repo.ts` are untouched.
- R8: `importRunner.ts` and `preview.ts` have unit tests and coverage thresholds (`vitest.config.ts:34,48`).
- R9: checked at 390 px in light and dark (screenshots below). `overflow-wrap: anywhere` is set on the preview rows and the errors.
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

### Nits (do not block)
- 💭 `.parse-summary small` (`index.css:938`, specificity 0-1-1) overrides `.csv-error` (0-1-0), so "Bỏ qua N dòng lỗi" shows muted grey, not danger red (visible in the screenshots). Fix with `.parse-summary small.csv-error { color: var(--danger) }`.
- 💭 `ImportModal.tsx` `start` has no try/finally. `importMany` does not reject today, but if it ever did, the modal would stay in `running`.
- 💭 `preview.ts:35` (the rethrow) is not covered.
- 💭 The impl-log says "5 deviations" in the hand-off, but its Deviations list has 4 entries. The 5th (the Excel fixture) is under "Tests added".

### Follow-ups (out of scope)
- On mobile, the progress bar and the end summary render below the preview list (up to 20 rows), so the user has to scroll to see them. Consider scrolling them into view, or showing progress and summary above the preview.
- Issue 1 above, if it is not picked up with T-001 / F-603, which touch this modal.
- Plan A3: row numbers are off when the file has blank lines. Plan A4: non-UTF-8 Excel CSV.

### Ming verification after merge
- Supabase mode, after M-1:
  - import a 200-row file, an Excel `;` "CSV UTF-8" export and a file with 5 bad rows;
  - check that no location is duplicated;
  - close the modal mid-import, refresh, and check that the saved items are still there.
- Look at the preview, the progress bar and the summary at 390 px in light and dark on a real phone.
- Product choice A1: the Photos and JSON tabs are disabled with "Sắp có — hiện chỉ nhập được bằng CSV." until F-603 / F-602, so the Figma Make preview no longer adds 4 demo items from the Photos tab. Ming can overturn this.

### Screenshots (reviewer, local mode, 390×844, deviceScaleFactor 1)
- `/tmp/claude-0/-home-user-TuDoCuaTui/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/preview-light.png`
- `/tmp/claude-0/-home-user-TuDoCuaTui/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/preview-dark.png`
- `/tmp/claude-0/-home-user-TuDoCuaTui/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/summary-light.png`
- `/tmp/claude-0/-home-user-TuDoCuaTui/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/summary-dark.png`
