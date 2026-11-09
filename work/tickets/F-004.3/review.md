## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/loving-fermi-t90upb` @ `188e9a5`, diff base `origin/main`.
- typecheck: `tsc --noEmit` clean (exit 0).
- format:check: "All matched files use the correct format." (74 files).
- test: 15 files, 262 tests passed.
- test:coverage: 262 passed, exit 0; all files 100 % stmts / 99.18 % branches / 100 % funcs / 100 % lines. `download.ts` is in `include` + `thresholds` (`vitest.config.ts:31,41`) and is hidden from the table because it is at 100 % (skipFull).
- build: `vite build` OK, `index-*.js` 230.71 kB (gzip 73.22 kB).
- Matches impl-log.md Attempt 1 (262 tests, 225 lines, 230.71 kB).

### Acceptance criteria
- [x] AC1 `src/App.tsx` is under 250 lines: `wc -l src/App.tsx` = **225** (was 458). `grep -n "function ImportModal\|function ExportModal\|className=\"toast\"\|createObjectURL" src/App.tsx` returns nothing.
- [x] AC2 screenshots identical (agent substitute):
  - Move check, run by reviewer: `git diff --color-moved=plain --color-moved-ws=allow-indentation-change origin/main...HEAD -- src/App.tsx src/features/import-export src/components/Toast.tsx`. Every non-moved line is one of: imports/`const COPY = …` aliases, component signatures/props, literal → `IMPORT_EXPORT_COPY.*` substitutions, `csv` → `CSV_TEMPLATE` (`ImportCsvTab.tsx`), `useToast`/`<Toast message={toast} />` wiring (`App.tsx` last child of `.app-shell`), the `onExport={(type) => { download(items, type); notify(…) }}` wiring, and the `exportFile`/`download` split. No `className`, `style`, attribute or element-order change.
  - Literal cross-check: each of the ~40 removed Vietnamese strings in `origin/main:src/App.tsx` 241–456 appears character-for-character in `src/features/import-export/copy.ts:15-66`. The JSON backup paragraph is joined with one space where the JSX line break was (JSX collapses it the same way). The progress row (`ImportPhotosTab.tsx:53`) is now one text node; the rendered text is identical (T3 asserts `"Đang xử lý 1/4: IMG_2031.jpg"`).
  - The tab components return fragments (`ImportPhotosTab.tsx:61`, `ImportCsvTab.tsx`, `ImportJsonTab.tsx`), so `.import-content` has the same children.
  - Real screenshots: Ming, after merge (see below).
- [x] AC3 import mock and export behave as today:
  - Characterisation tests T1–T5 were added in **d45ec29**, which touches only `src/App.test.tsx` (`git diff origin/main d45ec29 --stat -- src`). The refactor is the later commit **9d2a0fb**.
  - The reviewer ran them against the pre-refactor tree: `git archive d45ec29` into a scratch dir, `vitest run src/App.test.tsx` → **15/15 passed**.
  - `git diff d45ec29..HEAD -- src/App.test.tsx` is **empty**. On HEAD they still pass (part of the 262).
  - T1 checks the tabs, `active` class, `CSV_TEMPLATE` in `<pre>`, "Nhận 2 món", pasted CSV kept across tab switches, and Huỷ. T2 checks Copy mẫu → clipboard. T3 checks progress, disabled button, "Đã thêm 4 món vào tủ", 20 cards and modal closed. T4 checks the json/csv filenames, MIME types, 16 entries, BOM + `name,`, both toasts, 2 revokes and modal stays open. T5 checks Escape and the close button.
- [x] Toast unchanged (2400 ms, check icon, `.toast`): `src/components/Toast.tsx:5-24` matches old `App.tsx` 56-59/229-236. `Toast.test.tsx` covers 2399/2400 ms, the early-clear behaviour and the empty/non-empty render.
- [x] `download` is a separate tested module: `download.ts:6-25` has the same create/href/download/click/revoke order as old `App.tsx:82-90`. `download.test.ts` covers exportFile json (incl. `[]`) and csv, and the DOM sequence.
- [x] Import-export copy in one place: `copy.ts` holds `IMPORT_EXPORT_COPY` + `CSV_MAP_COPY` (verbatim from the deleted `messages.ts`). `csv/map.ts:4` import updated. `grep -nP "[À-ỹ]" src/features/import-export/*.tsx` → only the `✦` glyph (`ImportModal.tsx:58`), which the plan allows.
- [x] Local mode (R1): `grep -rn supabase src/features/import-export src/components/Toast.tsx` → nothing. App still calls `wardrobe.importMany`. All App tests run in local mode.
- [x] Build, typecheck and tests pass: see Checks.

**Split / F-004.4 consistency.** The ticket's three ACs (App < 250, no visual/behaviour change, checks green) are all met; none of them depends on the copy work. The deferred part is the third **Scope** bullet ("each feature's UI copy in one place"), which the plan narrows to import-export and proposes as F-004.4 (`plan.md` § Split proposal). This is consistent with the ticket's ACs, and the plan states it openly. It does mean feature-list §7 ("no scattered string literals once F-004 is done") is **not yet true** after this ticket: items/layout/shell/components strings remain, e.g. `App.tsx` `"Vui lòng nhập tên món đồ"`. The orchestrator must create the F-004.4 ticket (backlog row on `main`, depends on F-004.3) so the parent F-004 is not considered finished without it. Not a blocker for this slice.

### Ming verification after merge (carry into the PR)
- Local-mode screenshots before/after at 390px and desktop, light and dark: Import modal (3 tabs, CSV tab with pasted text showing "Nhận N món", photo tab during the mock progress), Export modal, a toast.
- Real browser: "Copy mẫu" copies the CSV template. Export JSON/CSV download `tu-do-cua-toi.json` / `.csv`, and the CSV opens in Excel with Vietnamese intact.
- The Figma Make preview still shows the 16 demo items and the modals open.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no data access added (see above).
- R2–R5: n/a.
- R6: copy is in `copy.ts`. Status labels still come from `@/constants/wardrobe` (`ImportPhotosTab.tsx:44`).
- R7: every changed file is in the plan's file table. `ticket.md` changes are orchestrator state.
- R8: T6–T10 plus the characterisation tests, all green.
- R9: DOM and classNames unchanged; `src/index.css` untouched, so 390px and dark mode behave as before (code-reading only).
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` untouched; only `vitest.config.ts` changed.

### Nits (do not block)
- `download.test.ts:27`: `afterEach(() => vi.unstubAllGlobals())` is a no-op, because nothing uses `vi.stubGlobal`. The `HTMLAnchorElement.prototype.click` spy and the `URL.createObjectURL`/`revokeObjectURL` overrides are never restored (`vi.restoreAllMocks()` would do it). This is harmless today because files are isolated. The same pattern is in T4 in `App.test.tsx`, which is frozen.
- `useToast().notify` gets a new identity on every render, as before. It only matters if it is ever put in an effect's dependency list.

### Follow-ups (out of scope)
- Create **F-004.4** (copy.ts for items, layout, App shell and components) per the plan's Split proposal, to finish feature-list §7.
- `useToast.notify` does not clear the previous timer, so an older timer clears a newer message early (recorded in `Toast.test.tsx`).
- The `doImport` interval/timeout is not cleared on unmount (the mock is replaced in F-601.3 / F-602 / F-603).
