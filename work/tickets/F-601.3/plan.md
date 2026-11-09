Status: READY

# Plan — F-601.3: CSV import preview and import run

## Feature summary
`docs/feature-list.md` E6 "Import & Export (replace the mocks)", F-601 · CSV import · P0 · M1:
> - Preview step: first 20 rows, per-row validation errors, and the count of rows that will be imported or skipped.
> - Import sequentially with a progress bar; locations are find-or-create.
> - **AC:** the template CSV from the UI round-trips; a 200-row file imports without errors; invalid rows are reported and do not block the valid ones.
> - **Notes:** split into parser + validation (pure functions, unit tested) and preview UI + import.

The ticket's scope, quoted:
> - Replace the mock in the "CSV / Excel" tab: pick a `.csv` file or paste text → preview of the first 20 rows, per-row errors, and counts of rows to import and to skip.
> - Import sequentially with a progress bar; locations are find-or-create (as `repo.save` already does).
> - Rework `useWardrobe.importMany` to continue after a failed row, add each saved item to the state right away, and return per-row results. […] F-603 reuses this.
> - A summary at the end: imported, skipped, failed (with reasons).

Out of scope (ticket): `.xlsx`, undoing an import.

Decisions used: **D7** ("`wear_count` / `last_worn` are exported but ignored on import, and listed as "ignored columns" in the preview") and **D8** (CSV location matches an existing location by `normalize()`d name, otherwise created). Both are already implemented in `mapRows` (F-601.2); this ticket passes `wardrobe.locations` into it and shows `ignoredColumns`.

Already merged and reused unchanged: `parseCsv` / `CsvParseError` (`csv/parse.ts`), `mapRows` (`csv/map.ts`), `CSV_TEMPLATE` (`csv/template.ts`), `CSV_MAP_COPY` error messages, `repo.save` (find-or-create location in Supabase mode via `ensureLocation`). The "template round-trips" and "export re-imports" parts of the F-601 AC are already covered at the mapping level by `map.test.ts` (F-601.2); this ticket covers the import run end to end.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The template CSV from the UI imports | `App.test.tsx › App import/export (local mode) › CSV tab imports the template: preview, progress, summary, item visible` — paste `CSV_TEMPLATE`, see "Sẽ nhập 1 món", click "Nhập 1 món", see the summary "Đã nhập: 1", close, 17 cards, a card "Áo sơ mi trắng", toast "Đã thêm 1 món vào tủ". |
| 2 | A 200-row file imports without errors | `csv/preview.test.ts › a generated 200-row CSV gives 200 items, 0 skipped, preview limited to 20 rows` and `data/importRunner.test.ts › 200 items all succeed in order with 200 progress calls`; plus `useWardrobe.test.tsx › local mode › importMany imports 200 items and all of them are in state`. |
| 3 | Invalid rows are reported and do not block valid ones | Preview: `csv/preview.test.ts › rows with errors are counted as skipped and listed with their messages; valid rows keep their row numbers`. Run: `importRunner.test.ts › a save that fails on row 3 does not stop rows 1, 2, 4, 5` (the ticket's own test plan). UI: `App.test.tsx › CSV tab reports invalid rows and imports only the valid ones` (5 rows, 2 invalid → "Sẽ nhập 3 món", "Bỏ qua 2 dòng lỗi", error texts visible, 3 new cards). Hook (Supabase fake): `useWardrobe.test.tsx › supabase mode › importMany continues after a failed row and keeps the saved rows in state` (replaces the "stops at the first failure" characterisation test). |
| 4 | Closing the modal mid-import stops after the current row; already saved items stay visible | `importRunner.test.ts › an abort during row 2 lets row 2 finish and never starts row 3`; `useWardrobe.test.tsx › local mode › importMany adds each saved item to state before the next row starts` (asserts `items` length inside `onProgress`); `ImportModal.test.tsx › closing the modal during an import aborts the signal passed to importMany` and `› Escape during an import aborts too`. |
| 5 | Photos and JSON tabs no longer write fake items (task brief; see Assumptions A1) | `App.test.tsx › Photos and JSON tabs are disabled until F-603 / F-602 and add nothing` — the primary button is disabled on both tabs, the "Sắp có" note is shown, and the card count stays 16. `grep -n "starter" src/features/import-export/ImportModal.tsx` returns nothing. |
| 6 | Parse error, empty input, header-only input | `csv/preview.test.ts › empty or whitespace text → empty`, `› unterminated quote → parseError with its line`, `› header only → ready with 0 rows`; UI: `App.test.tsx › CSV tab disables import for empty, header-only and broken CSV`. |
| 7 | Pick a `.csv` file | `App.test.tsx › picking a .csv file fills the text and shows the preview` (`fireEvent.change` on the hidden `input[type=file]` with a `File` holding `CSV_TEMPLATE`). |
| 8 | Checks | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`; `pnpm test:coverage` passes with `csv/preview.ts` added to the coverage include and thresholds (`importRunner.ts` is already under `src/data/**`). |

## Ming verification after merge
- Supabase mode, after M-1 (D18 says the `tudo_*` tables do not exist on the shared project yet, so this waits for M-1): import a 200-row file, an Excel `;` export ("CSV UTF-8" format) and a file with 5 bad rows (ticket test plan, "Manual"). Check that locations are not duplicated and that closing mid-import leaves the saved items in the list after a refresh.
- 390 px viewport and dark mode for the preview list, progress bar and summary (R9). The reviewer checks the CSS by reading it; the real look is Ming's.
- Product choice A1 below (Photos and JSON tabs disabled with a "Sắp có" note until F-603 / F-602). Ming can overturn it.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/importRunner.ts` (new) | `runImport(list, save, { onSaved, onProgress, signal })`: a sequential loop that keeps going after a failure, returns per-row results and stops before the next row once aborted | Pure loop with unit tests (rule 6, R8); reused by F-603 |
| `src/data/importRunner.test.ts` (new) | Unit tests for the runner | R8 |
| `src/data/useWardrobe.ts` | `importMany(list, { onProgress?, signal? })` delegates to `runImport` with `repo.save` (id reset to `""`), calls `upsertLocal` per saved row, maps errors with `message()`, returns `ImportResult[]` | Ticket scope ("Rework `useWardrobe.importMany`…") |
| `src/data/useWardrobe.test.tsx` | Update the two local `importMany` tests to the new signature and return value; replace the "stops at the first failure" test; add the per-row state and 200-row tests | The behaviour changes on purpose |
| `src/features/import-export/csv/preview.ts` (new) | `buildCsvPreview(text, options)`: parse + map → `empty` / `parseError` / `ready` with items, their row numbers, skipped count, the first 20 preview rows and ignored columns | Pure logic behind the preview (rule 6) |
| `src/features/import-export/csv/preview.test.ts` (new) | Unit tests | R8 |
| `src/features/import-export/ImportCsvTab.tsx` | Real file picker, textarea, preview list, counts, ignored columns, parse error, progress bar, end summary | Ticket scope |
| `src/features/import-export/ImportModal.tsx` | Remove the mock (`doImport`, `starter`, the timers). It owns the CSV import state (`edit` → `running` → `done`), the `AbortController` (aborted on unmount) and the footer button per tab. Photos/JSON: primary button disabled | Ticket scope and task brief |
| `src/features/import-export/ImportModal.test.tsx` (new) | Component test with a controllable fake `importMany`: abort on close and on Escape, and the button disabled while running | AC 4; you cannot pause the local repo mid-run from `App.test.tsx` |
| `src/features/import-export/ImportPhotosTab.tsx` | Drop the mock `processing` / `progress` props and the fake progress block; show the "Sắp có" note | The mock progress is the photos mock (A1); F-603 builds the real one |
| `src/features/import-export/ImportJsonTab.tsx` | Show the "Sắp có" note | A1 |
| `src/features/import-export/copy.ts` | Add the CSV preview / run / summary copy and `comingSoon`; remove `processingFile` and `parsedCount` (now dead) | R6: copy lives in one place per feature |
| `src/App.tsx` | Replace the `onDone` prop with `locations={wardrobe.locations}`, `importMany={wardrobe.importMany}` and `onImported={(n) => notify(IMPORT_EXPORT_COPY.imported(n))}` | The modal now runs the import itself |
| `src/App.test.tsx` | Update the tab test (no more "Nhận 2 món"), replace "import mock shows progress, adds 4 items and closes", and add the CSV and disabled-tab tests listed below | The characterisation tests record the mock, which is removed on purpose |
| `src/index.css` | Small styles for `.csv-preview` (row list), `.csv-error` (danger colour), `.import-summary` and `.coming-soon`, reusing the existing variables (`--danger`, `--muted`, `--border`, `--soft`) so dark mode works | R9 |
| `vitest.config.ts` | Add `src/features/import-export/csv/preview.ts` to coverage `include` and `thresholds` (same pattern as `map.ts`) | Keeps the coverage gate on new pure logic. Only the `test.coverage` block; `vite.config.ts` (R10) is not touched |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `importRunner.test.ts › saves rows in order and returns ok results with the saved items` | basic loop |
| `importRunner.test.ts › a save that fails on row 3 does not stop rows 1, 2, 4, 5` (results: index 2 `ok:false` carrying the thrown value; the others ok) | AC 3, ticket test plan |
| `importRunner.test.ts › onSaved runs for each saved row before the next save starts; never for failed rows` | per-row state |
| `importRunner.test.ts › onProgress counts attempted rows, failures included (1/5 … 5/5)` | progress |
| `importRunner.test.ts › an abort during row 2 lets row 2 finish and never starts row 3` (results length 2) | AC 4 |
| `importRunner.test.ts › an already aborted signal saves nothing and returns []` | edge |
| `importRunner.test.ts › empty list returns [] without calling save or onProgress` | edge |
| `importRunner.test.ts › 200 items all succeed in order with 200 progress calls` | AC 2 |
| `useWardrobe.test.tsx › local mode › importMany saves in order with fresh ids and reports progress` (updated: results `ok`, ids new) | regression |
| `useWardrobe.test.tsx › local mode › importMany works without options` (updated) | regression |
| `useWardrobe.test.tsx › local mode › importMany adds each saved item to state before the next row starts` | AC 4 |
| `useWardrobe.test.tsx › local mode › importMany imports 200 items and all of them are in state` | AC 2 |
| `useWardrobe.test.tsx › local mode › importMany stops when the signal is aborted` | AC 4 |
| `useWardrobe.test.tsx › supabase mode › importMany continues after a failed row and keeps the saved rows in state` (fake: row 1 saves, row 2 upsert returns `{ code: "23505" }`, row 3 saves → results ok/fail("Dữ liệu bị trùng")/ok, 2 items in state) | AC 3, error mapping |
| `preview.test.ts › empty or whitespace text → empty` | edge |
| `preview.test.ts › unterminated quote → parseError with its line` | edge |
| `preview.test.ts › header only → ready with 0 rows, 0 items, 0 skipped` | edge |
| `preview.test.ts › CSV_TEMPLATE → 1 item, 0 skipped, preview row 1 is ok` | AC 1 |
| `preview.test.ts › rows with errors are counted as skipped and listed with their messages; valid rows keep their row numbers` (rows 1, 3, 5 valid; 2, 4 invalid → `itemRows = [1,3,5]`; preview row 2 lists two messages when two fields are bad) | AC 3 |
| `preview.test.ts › a generated 200-row CSV gives 200 items, 0 skipped, preview limited to 20 rows` | AC 2, "first 20 rows" |
| `preview.test.ts › Excel ";" fixture with BOM previews like the "," version` (uses `__fixtures__/excel-semicolon.csv`) | delimiter / BOM path |
| `preview.test.ts › existing location "Tủ ngăn 1" is reused for "tủ ngăn 1"` (passes `locations`) | D8 wiring |
| `preview.test.ts › wear_count / last_worn are reported as ignored columns` | D7 |
| `preview.test.ts › Vietnamese names in NFD come out NFC` | diacritics |
| `ImportModal.test.tsx › import button shows "Nhập N món" and calls importMany with the valid items only` | wiring |
| `ImportModal.test.tsx › while running: progress shown, primary disabled, tabs disabled` | progress |
| `ImportModal.test.tsx › closing the modal during an import aborts the signal passed to importMany` (unmount, or click "Huỷ" → `onClose`, then unmount) | AC 4 |
| `ImportModal.test.tsx › Escape during an import aborts too` | AC 4 |
| `ImportModal.test.tsx › summary shows imported, skipped and failed rows with reasons and row numbers; calls onImported(count)` | summary |
| `App.test.tsx › import modal switches tabs and keeps pasted CSV across tabs` (updated: the "Nhận 2 món" assertion becomes "Bỏ qua 2 dòng lỗi" for `a\nb\nc`) | regression |
| `App.test.tsx › CSV tab imports the template: preview, progress, summary, item visible` | AC 1 |
| `App.test.tsx › CSV tab reports invalid rows and imports only the valid ones` | AC 3 |
| `App.test.tsx › CSV tab disables import for empty, header-only and broken CSV` | AC 6 |
| `App.test.tsx › picking a .csv file fills the text and shows the preview` | AC 7 |
| `App.test.tsx › Photos and JSON tabs are disabled until F-603 / F-602 and add nothing` (replaces "import mock shows progress, adds 4 items and closes") | AC 5 |

## Approach
1. **Runner** (`src/data/importRunner.ts`), no React:
   ```ts
   export type RunResult = { index: number; ok: true; item: Item } | { index: number; ok: false; error: unknown };
   export async function runImport(
     list: Item[],
     save: (item: Item) => Promise<Item>,
     opts?: { onSaved?: (item: Item, index: number) => void;
              onProgress?: (done: number, total: number) => void;
              signal?: AbortSignal },
   ): Promise<RunResult[]>
   ```
   Check `signal?.aborted` **before** each row (never cancel a save in flight: "stops after the current row"). Wrap each save in try/catch, push the result, call `onSaved` on success, then `onProgress(i + 1, total)`.
2. **Hook**: `importMany(list, opts?: { onProgress?; signal? })` → `Promise<ImportResult[]>`, where `ImportResult = { index; ok: true; item } | { index; ok: false; error: string }` (exported from `useWardrobe.ts`). It calls `runImport(list, (it) => repo.save({ ...it, id: "" }), { onSaved: upsertLocal, … })` and maps `error` through `message()`. It never throws for a row failure. Sequential on purpose, as the existing comment says.
3. **Preview** (`csv/preview.ts`):
   ```ts
   export const PREVIEW_ROWS = 20;
   export interface CsvPreviewRow { row: number; item?: Item; errors: string[] }
   export type CsvPreview =
     | { kind: "empty" }
     | { kind: "parseError"; line: number }
     | { kind: "ready"; total: number; items: Item[]; itemRows: number[]; skipped: number;
         rows: CsvPreviewRow[]; ignoredColumns: string[] };
   export function buildCsvPreview(text: string, options?: MapOptions): CsvPreview
   ```
   `text.trim() === ""` → `empty`. Catch `CsvParseError` only (rethrow anything else) → `parseError`. Otherwise call `mapRows`; group `errors` by `row`; `itemRows` = rows 1…total without errors, in order (this matches the order of `mapRows().valid`). `rows` = the first 20 data rows, each with its item or its error messages. `skipped` = number of distinct error rows. Do not change `map.ts`.
4. **ImportModal** gets the props `{ onClose, locations: string[], importMany, onImported: (count: number) => void }`. It keeps `tab` and `text` (the existing `paste` state, which survives tab switches as today) and adds `phase: "edit" | "running" | "done"`, `progress {done, total}`, `results`. `preview = useMemo(() => buildCsvPreview(text, { locations }), [text, locations])`.
   - Primary button: CSV tab in `edit` → `csv.importN(items.length)`, disabled when the preview is not `ready` or has 0 items. In `running` → `COPY.processing`, disabled. In `done` → `csv.done`, which calls `onClose`. Photos/JSON tabs → existing labels (`startImport` / `checkAndImport`), always disabled.
   - Start: create an `AbortController` in a ref and call `importMany(preview.items, { onProgress, signal })`. Then set `results`, set `phase = "done"` and call `onImported(okCount)` (App shows the existing toast `imported(n)`). Only call `onImported` when `okCount > 0`.
   - `useEffect(() => () => controllerRef.current?.abort(), [])`: closing the modal (Huỷ, ✕, Escape, backdrop: everything goes through `onClose` → App unmounts the modal) aborts. The hook keeps going until the current row ends, and the saved items are already in state (step 2). React ignores the state updates that arrive after unmount.
   - While `running`, the tab buttons are `disabled`.
   - Delete `doImport`, the `starter` import and the timers.
5. **ImportCsvTab** (presentational): props `text`, `onText`, `preview`, `phase`, `progress`, `summary`.
   - "Chọn file .csv" clicks a hidden `<input type="file" accept=".csv,text/csv">`. On change it reads `file.text()` (if jsdom 27 lacks `Blob.text`, use a small `FileReader` promise in the same file) and calls `onText`, then resets the input value so the same file can be picked again.
   - Keep the instructions, the template `<pre>` and "Copy mẫu" as they are.
   - The textarea is disabled while running.
   - `ready`: a `.parse-summary` with `csv.willImport(n)`, plus `csv.willSkip(m)` when `m > 0`, and `csv.ignoredColumns(list)` when the list is not empty. Then `csv.previewTitle(shown, total)` and a `.csv-preview` list: one line per row with `csv.rowLabel(row + 1)` (spreadsheet numbering, header = 1; see A3) and either `name · category · location` or the error messages in `.csv-error`. 0 rows → `csv.noRows`. `parseError` → `csv.parseError(line)` in `.csv-error`.
   - `running`: the existing `.progress` markup with `csv.running(done, total)` and the percentage.
   - `done`: `.import-summary` with `csv.summaryImported(ok)`, `csv.summarySkipped(skipped)` and `csv.summaryFailed(failed)`, plus a list `rowLabel(itemRows[index] + 1)`: reason for each failed result.
6. **Photos / JSON tabs**: each shows a `.coming-soon` note `COPY.comingSoon` ("Sắp có — hiện chỉ nhập được bằng CSV."). The rest of the Figma layout stays. `ImportPhotosTab` loses its props and the fake progress block.
7. **Copy** (`IMPORT_EXPORT_COPY.import`), exact strings because the tests assert them:
   - `comingSoon: "Sắp có — hiện chỉ nhập được bằng CSV."`
   - under `csv`:
     - `willImport: (n) => \`Sẽ nhập ${n} món\``
     - `willSkip: (n) => \`Bỏ qua ${n} dòng lỗi\``
     - `ignoredColumns: (c: string[]) => \`Bỏ qua cột: ${c.join(", ")}\``
     - `noRows: "Không có dòng dữ liệu nào"`
     - `parseError: (line) => \`File CSV lỗi: dấu ngoặc kép chưa đóng ở dòng ${line}\``
     - `previewTitle: (shown, total) => \`Xem trước ${shown}/${total} dòng\``
     - `rowLabel: (n) => \`Dòng ${n}\``
     - `importN: (n) => \`Nhập ${n} món\``
     - `running: (done, total) => \`Đang nhập ${done}/${total}\``
     - `summaryImported: (n) => \`Đã nhập: ${n}\``
     - `summarySkipped: (n) => \`Bỏ qua (lỗi dữ liệu): ${n}\``
     - `summaryFailed: (n) => \`Lỗi khi lưu: ${n}\``
     - `done: "Xong"`
   - Remove `processingFile` and `parsedCount`. Keep `columnsHint` as the `<small>` under the counts.
8. **App.tsx**: swap the props only (net change of about −5 lines). App stays under the 250 lines that F-004.3 targets.
9. **Tests and checks**: write the tests in the table, update the characterisation tests, add the coverage entries, then run all checks.

Rules:
- **R1**: all writes go through `wardrobe.importMany` → `repo.save`; no `supabase` in the components. Local mode works the same way, and the App tests run in local mode.
- **R5**: `wearCount` / `lastWorn` from the CSV are ignored (D7, already in `mapRows`).
- **R6**: every string is in `copy.ts`; labels ↔ ids only through `mapRows` and the mappers.
- **R7**: no change to `parse.ts`, `map.ts` or `repo.ts`.
- **R8**: the pure logic (`importRunner.ts`, `preview.ts`) has unit tests.
- **R9**: the preview list wraps and does not scroll sideways at 390 px; colours come from CSS variables.
- **R10**: `vite.config.ts` and `AGENTS.md` are not touched.
- R2–R4: not affected (no schema, no secrets, no photos).

## Specialist input used
None (no consult files).

## Assumptions
- **A1 (product choice to flag for Ming): Photos and JSON tabs.** After this ticket they keep their Figma layout, show "Sắp có — hiện chỉ nhập được bằng CSV." and their primary button is disabled, in **both** modes. The mock (`doImport` adding 4 `starter` items) is deleted. Why: in Supabase mode the mock would write demo items into Ming's real wardrobe. Keeping it in local mode only (as D9 does for the AI controls) would keep dead mock code and a fake progress bar that F-603 replaces anyway. The cost: the Figma Make preview no longer "imports" 4 demo items from the Photos tab. F-603 (photos) and F-602 (JSON) bring the real behaviour back. The default tab stays "Ảnh hàng loạt" (index 0), so the layout does not change. Alternative if Ming prefers: open on the CSV tab by default (a one-line change).
- **A2: closing = stopping.** There is no separate "Dừng" button. Huỷ, ✕, Escape and the backdrop all close the modal, and closing aborts after the current row (AC 4). If at least one row was saved before the close, the toast "Đã thêm n món vào tủ" still appears when the run ends, because `onImported` is App's `notify` and still works after the modal unmounts.
- **A3: row numbers.** `mapRows` numbers data rows from 1 (header excluded, blank lines dropped by `parseCsv`). The UI shows `row + 1` so that it matches Excel / Sheets row numbers when the file has no blank lines. With blank lines in the file, the shown number can be off. This is accepted, not fixed here.
- **A4: encoding.** The file is read as UTF-8 (`file.text()`). An Excel "CSV" saved in a legacy Windows code page shows broken diacritics. Ming exports with "CSV UTF-8". Detecting other encodings is a follow-up, not part of this ticket.
- **A5: no confirm step.** The preview updates live as the text changes. The single primary button "Nhập N món" starts the run; there is no extra "Kiểm tra" click.
- **A6: Supabase find-or-create.** `repo.save` → `ensureLocation` matches by exact name. Because `mapRows` canonicalises spellings against `wardrobe.locations` and earlier rows (D8), the same location is never created twice within one import or against existing ones. The locations list is read once, when the preview is built. The hook appends new locations to state as it goes, and this does not change the items being imported.
- **Hotspots.** `src/App.tsx` (props of `ImportModal` only) and `src/App.test.tsx`. No other ticket is `IN_PROGRESS` / `REVIEW` / `DONE`. Backlog tickets T-001 (edits `ImportPhotosTab.tsx` to hide the AI checkbox), F-602 (JSON tab) and F-603 (photos tab, reuses `importMany` / `runImport`) will rebase on this ticket's version of these files.
- **Size.** About 300 changed lines of production code (runner 40, preview 60, ImportCsvTab +90, ImportModal +50, copy +20, CSS +35) plus about 350 lines of tests. This is one implement/review cycle; most of the line count is tests.

## Blocking questions
None.

## Split proposal
None.
