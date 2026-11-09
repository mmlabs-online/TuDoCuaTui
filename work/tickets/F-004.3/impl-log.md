## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/App.test.tsx` | T1–T5 characterisation tests, own commit d45ec29, passing on the unrefactored App.tsx, not edited afterwards |
| `src/App.tsx` | Removed ImportModal/ExportModal/download/toast; wired `useToast`, `Toast`, `download`, `IMPORT_EXPORT_COPY` (458 → 225 lines) |
| `src/features/import-export/ImportModal.tsx`, `ImportPhotosTab.tsx`, `ImportCsvTab.tsx`, `ImportJsonTab.tsx`, `ExportModal.tsx` | Moved modals, one component per tab; all four state hooks stay in ImportModal |
| `src/features/import-export/download.ts` + `download.test.ts` | `exportFile` / `download` helper, T8–T10 |
| `src/features/import-export/copy.ts` (renamed from `messages.ts`) + `csv/map.ts` import | `IMPORT_EXPORT_COPY` added, `CSV_MAP_COPY` verbatim |
| `src/components/Toast.tsx` + `Toast.test.tsx` | `useToast` + `Toast`, T6–T7 |
| `vitest.config.ts` | `download.ts` in coverage include and thresholds |

### Tests added / changed
- `src/App.test.tsx` › "App import/export (local mode)": T1–T5 (5 tests)
- `src/components/Toast.test.tsx`: T6 (2 tests, incl. the early-clear behaviour) and T7
- `src/features/import-export/download.test.ts`: T8–T10

### Checks (actual output summary)
- typecheck: `tsc --noEmit` clean
- format:check: "All matched files use the correct format."
- test: 15 files, 262 tests passed
- test:coverage: passed, thresholds met (exit 0)
- build: built OK (vite, 230.71 kB js)
- `wc -l src/App.tsx`: 225
- Move check (`git diff --cached --color-moved=plain --color-moved-ws=allow-indentation-change`): all non-moved lines are imports, signatures/props, literal → `COPY.x` substitutions, `CSV_TEMPLATE` for `csv`, toast/notify wiring and `download(items, type)`. `git diff d45ec29..HEAD -- src/App.test.tsx` is empty. `grep` for the moved code in App.tsx and for `supabase` in the new files returns nothing. The only Vietnamese-range match in `*.tsx` is the `✦` glyph (allowed).

### Deviations
- T4/T5 in the tests: export options are found via `.export-options button` (their accessible name starts with `{ }`/`CSV`, so `/^JSON/` does not match); the BOM is read through `FileReader.readAsArrayBuffer` + `TextDecoder({ignoreBOM:true})` because `readAsText` strips it. Same assertions otherwise.
- `imported`/`exported` sit at the top level of `IMPORT_EXPORT_COPY` (as the plan's App wiring uses them); `processingFile`/`parsedCount` are under `.import`.
- The progress row is now one text node instead of several (plan-anticipated); the DOM text is identical.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `useToast.notify` does not clear the previous timer (early clear of a newer message); recorded in T6.
- `doImport` interval/timeouts are not cleared on unmount (mock is replaced in F-601.3).
- F-004.4 copy for the remaining features, as proposed in the plan.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: refactor commit about +350 / -262 lines excluding tests (mostly moves); tests about +180.
