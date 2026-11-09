Status: READY

# Plan: F-004.3, Extract modals and shrink `App.tsx` under 250 lines

## Feature summary
`docs/feature-list.md` F-004:
> - `src/features/import-export/`
> - **AC:** no visual or behavioural change (compare screenshots before and after); `App.tsx` under 250 lines; build and typecheck pass.
> - **Notes:** split into 3 tickets (primitives → items feature → modals).

`docs/feature-list.md` §7 Conventions:
> - UI copy is in Vietnamese and kept in one place per feature (no scattered string literals once F-004 is done).

Ticket scope:
> - `src/features/import-export/`: `ImportModal` (with one component per tab), `ExportModal`, and the `download` helper.
> - Move the toast into `src/components/Toast` with a `useToast` hook.
> - Put each feature's UI copy in one place (`copy.ts` per feature), as feature-list §7 requires.

`work/decisions.md` has nothing specific to F-004 or UI copy.

**Slice note:** this plan covers the modals, the toast, the download helper and **the import-export
`copy.ts`**. Moving the copy for the other features (items, layout, the App shell, components) is proposed
as F-004.4 under `## Split proposal`, because doing it here would more than double the diff.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `src/App.tsx` is under 250 lines | `wc -l src/App.tsx` < 250 (expected about 220). `grep -n "function ImportModal\|function ExportModal\|className=\"toast\"\|createObjectURL" src/App.tsx` returns nothing. |
| 2 | Screenshots identical before and after (agent substitute) | (a) `git diff --color-moved=plain --color-moved-ws=allow-indentation-change origin/main...HEAD -- src/App.tsx src/features/import-export src/components/Toast.tsx`: the only lines that are not moved are imports/exports, component signatures/props, the planned substitutions (literal → `IMPORT_EXPORT_COPY.x`, `csv` → `CSV_TEMPLATE`, toast/notify wiring, the `download(items, type)` call) and oxfmt re-wraps. (b) Every `className=`, `style={{…}}`, `placeholder`, `aria-*` and Vietnamese string from `origin/main:src/App.tsx` lines 229–456 appears in the new files or in `copy.ts`, with the same value. (c) The tab components return fragments, so `.import-content` has the same children. Ming takes the real screenshots (see below). |
| 3 | Import mock and export behave as today | The new characterisation tests in `src/App.test.tsx` (see *Tests to write*, T1–T5) are committed **before** the refactor, pass on that commit, and pass unchanged on HEAD (`git diff <char-commit>..HEAD -- src/App.test.tsx` is empty). The existing 10 App tests also still pass. |
| 4 | Toast behaves as today (2400 ms, check icon, `.toast`) | `src/components/Toast.test.tsx` (T6–T7). The App tests that wait for toast text still pass. |
| 5 | `download` helper is a separate, tested module | `src/features/import-export/download.test.ts` (T8–T10) passes. The file is in the coverage `include` and meets the thresholds (`pnpm test:coverage`). |
| 6 | Import-export UI copy lives in one place | `src/features/import-export/copy.ts` exists and holds `IMPORT_EXPORT_COPY` and `CSV_MAP_COPY`. `messages.ts` is deleted. `grep -nP "[À-ỹ]" src/features/import-export/*.tsx` returns nothing (the only Vietnamese text is in `copy.ts`; `csv/template.ts` is data, not copy). |
| 7 | Local mode (R1) | The tests run in local mode. `grep -rn supabase src/features/import-export src/components/Toast.tsx` returns nothing. |
| 8 | Build, typecheck, tests pass | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:coverage`, `pnpm build` are all green. |

## Ming verification after merge
- Local-mode screenshots before/after at 390px and desktop, light and dark: Import modal (all 3 tabs, the
  CSV tab with pasted text showing "Nhận N món", the photo tab during the mock progress bar), Export modal,
  and a toast.
- In a real browser: "Copy mẫu" puts the CSV template on the clipboard. Export JSON and CSV download
  `tu-do-cua-toi.json` / `tu-do-cua-toi.csv`, and the CSV opens in Excel with the Vietnamese text intact.
- The Figma Make preview still shows the 16 demo items and the modals open.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/App.test.tsx` | Add T1–T5 (a new `describe("App import/export (local mode)")`), in a **separate first commit**, before any refactor | Characterisation tests for AC 3, the same approach as F-004.2 |
| `src/features/import-export/ImportModal.tsx` | New. Moved from `App.tsx` `ImportModal`: header, tabs, footer, state (`tab`, `processing`, `progress`, `paste`) and the `doImport` mock. Renders the three tab components | Ticket scope |
| `src/features/import-export/ImportPhotosTab.tsx` | New. The `tab === 0` fragment. Props `{ processing: boolean; progress: number }` | "one component per tab" |
| `src/features/import-export/ImportCsvTab.tsx` | New. The `tab === 1` fragment. Props `{ paste: string; onPaste: (v: string) => void }`. Uses `CSV_TEMPLATE` directly | "one component per tab" |
| `src/features/import-export/ImportJsonTab.tsx` | New. The `tab === 2` fragment. No props | "one component per tab" |
| `src/features/import-export/ExportModal.tsx` | New. Moved from `App.tsx` `ExportModal`, unchanged props | Ticket scope |
| `src/features/import-export/download.ts` | New. `exportFile(items, type)` (pure) and `download(items, type)` (DOM) | Ticket scope ("the `download` helper") |
| `src/features/import-export/download.test.ts` | New. T8–T10 | R8 |
| `src/features/import-export/copy.ts` | New. `IMPORT_EXPORT_COPY` (all import/export UI strings, including the two toasts) + `CSV_MAP_COPY` moved verbatim from `messages.ts` | Ticket scope, §7 |
| `src/features/import-export/messages.ts` | Delete (its content moves to `copy.ts`) | One copy file per feature |
| `src/features/import-export/csv/map.ts` | One import line: `from "../messages"` → `from "../copy"` | Follows the move |
| `src/components/Toast.tsx` | New. `useToast()` hook + `Toast` component | Ticket scope |
| `src/components/Toast.test.tsx` | New. T6–T7 | R8 (the hook is small logic with a timer) |
| `src/App.tsx` | Remove `ImportModal`, `ExportModal`, `download`, the `toast` state/`notify`/toast JSX. Import the new modules. Use `IMPORT_EXPORT_COPY` for the two import/export toasts | AC 1 |
| `vitest.config.ts` | Add `src/features/import-export/download.ts` to `coverage.include` and `thresholds` (same pattern as `parse.ts`/`map.ts`). Do **not** touch the Figma plugins (this is `vitest.config.ts`, not `vite.config.ts`; R10) | AC 5 |

## Tests to write
Characterisation tests (commit 1, written and passing against the **current** `App.tsx`, then never edited):

| Test (file › name) | Covers |
|---|---|
| T1 `src/App.test.tsx › import modal switches tabs and keeps pasted CSV across tabs` | Open via `getAllByRole("button", { name: "Import" })[0]`. Photo tab shows "Kéo nhiều ảnh vào đây" and the footer button "Bắt đầu import". Click "CSV / Excel": shows "Nhập danh sách từ bảng tính", `<pre>` text equals `CSV_TEMPLATE`. Paste `"a\nb\nc"` into `Dán nội dung CSV tại đây…` → "Nhận 2 món". Click "JSON (backup)": shows "Khôi phục từ bản sao lưu", footer "Kiểm tra & import". Back to "CSV / Excel": the textarea still holds `"a\nb\nc"` (guards that `paste` state stays in `ImportModal`). The active tab button has class `active`. "Huỷ" closes the modal (`queryByText("THÊM NHIỀU MÓN")` is null). |
| T2 `src/App.test.tsx › "Copy mẫu" copies the CSV template` | Stub `navigator.clipboard` (`Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn() }, configurable: true })`), click "Copy mẫu", expect `writeText` called with `CSV_TEMPLATE`. |
| T3 `src/App.test.tsx › import mock shows progress, adds 4 items and closes` | Click "Bắt đầu import". The button becomes "Đang xử lý…" and disabled. A progress row "Đang xử lý 1/4: IMG_2031.jpg" with "25%" appears (use a text matcher on the `.progress span`'s `textContent`, because today it is several text nodes). Then `findByText("Đã thêm 4 món vào tủ", {}, { timeout: 5000 })`, the grid has 20 cards and the modal is closed. Real timers (about 2.2 s), test timeout 10 000 ms. |
| T4 `src/App.test.tsx › export JSON and CSV download files and keep the modal open` | Stub `URL.createObjectURL` (`vi.fn(() => "blob:x")`, capture the Blob) and `URL.revokeObjectURL`. Spy on `HTMLAnchorElement.prototype.click` and record `this.download`. Open via `getAllByRole("button", { name: "Export" })[0]`. Click the `/^JSON/` option: download `tu-do-cua-toi.json`, blob type `application/json`, `JSON.parse(text)` has 16 entries, toast "Đã xuất JSON". Click the `/^CSV/` option: `tu-do-cua-toi.csv`, type `text/csv;charset=utf-8`, the text starts with the BOM + `name,`, toast "Đã xuất CSV". "SAO LƯU & CHIA SẺ" is still shown (today the modal stays open after export). Read the Blob with `blob.text()`, or with `new Response(blob).text()` / `FileReader` if jsdom lacks it. |
| T5 `src/App.test.tsx › Escape and the close button close the modals` | Export modal: `fireEvent.keyDown(window, { key: "Escape" })` closes it. Import modal: the header `.icon-btn` close button closes it. |

Unit tests (with the refactor):

| Test (file › name) | Covers |
|---|---|
| T6 `src/components/Toast.test.tsx › useToast shows a message and clears it after 2400 ms` | `renderHook` + `vi.useFakeTimers()`: `notify("x")` → `toast === "x"`. At 2399 ms still `"x"`, at 2400 ms `""`. Also records today's behaviour: two quick `notify` calls each set their own timer, and the first timer clears the second message early. Do not "fix" this here (follow-up). |
| T7 `src/components/Toast.test.tsx › Toast renders nothing for an empty message and the check icon otherwise` | `""` → empty container. `"Đã lưu"` → `.toast` containing an `svg` and the text, including Vietnamese diacritics. |
| T8 `src/features/import-export/download.test.ts › exportFile json` | Content `=== JSON.stringify(items, null, 2)`, mime `application/json`, filename `tu-do-cua-toi.json`. Also the empty list → `"[]"`. |
| T9 `src/features/import-export/download.test.ts › exportFile csv` | Content `=== toCsv(items)` (BOM included, Vietnamese names intact), mime `text/csv;charset=utf-8`, filename `tu-do-cua-toi.csv`. |
| T10 `src/features/import-export/download.test.ts › download creates, clicks and revokes an object URL` | Stubs as in T4. `createObjectURL` is called once with a Blob of the right type, the anchor's `href`/`download` are set and `click` is called, and `revokeObjectURL` is called with the same URL. |

## Approach
1. **Characterisation first (own commit, `F-004.3: add import/export characterisation tests`).** Add T1–T5
   to `src/App.test.tsx` without touching `src/App.tsx`. Run `pnpm test`: all green on the unrefactored code.
   From here on, `src/App.test.tsx` is not edited.
2. **`copy.ts`.** Create `src/features/import-export/copy.ts`. Move `CSV_MAP_COPY` verbatim from `messages.ts`,
   delete `messages.ts` and fix the import in `csv/map.ts`. Add `IMPORT_EXPORT_COPY` with every Vietnamese
   string from the two modals, copied **character for character**: eyebrows, titles (`Đưa tủ đồ` + `vào app`
   as two keys around `<em>`), the `tabs` array, the photo-tab texts and labels, the default-status option "Đang dùng",
   the CSV-tab texts and placeholder, the JSON-tab texts and placeholder `[{"name": "Áo sơ mi", ...}]`, the footer
   texts (`cancel`, `processing: "Đang xử lý…"`, `startImport`, `checkAndImport`), the export texts, and the functions
   `processingFile: (n: number) => \`Đang xử lý ${n}/4: IMG_203${n}.jpg\``,
   `parsedCount: (n: number) => \`Nhận ${n} món\``, `imported: (n: number) => \`Đã thêm ${n} món vào tủ\``,
   `exported: (t: "json" | "csv") => \`Đã xuất ${t.toUpperCase()}\``. Format names and glyphs (`"JSON"`, `"CSV"`,
   `"{ }"`, `"✦"`) may stay in JSX. Keep the long backup paragraph as one string with a single space where the
   JSX line break was (JSX collapses it the same way).
3. **`download.ts`.** `export function exportFile(items: Item[], type: "json" | "csv"): { content: string; mime: string; filename: string }`
   and `export function download(items: Item[], type: "json" | "csv"): void`, which builds the Blob and runs the
   exact same anchor/createObjectURL/click/revoke sequence as today. `notify` stays in `App`, called after `download`,
   so the toast order does not change.
4. **Toast.** `src/components/Toast.tsx`: `useToast()` returns `{ toast, notify }`, where `notify` keeps today's
   semantics (`setToast(s); setTimeout(() => setToast(""), 2400)`, without clearing the previous timer).
   `Toast({ message })` returns `null` for `""`, otherwise the same `<div className="toast"><span><Icon name="check" size={15} /></span>{message}</div>`.
5. **Modals.** Move `ExportModal` verbatim. Move `ImportModal`, keep **all four state hooks in `ImportModal`** (so
   pasted CSV survives a tab switch, as today), and replace the three `tab === n && (<>…</>)` bodies with
   `tab === n && <ImportXTab … />`, where each tab returns the same fragment. `doImport` keeps `starter.slice(0, 4)`
   from `@/data/demo` and the same 550 ms / 500 ms timers (the mock is replaced in F-601.3/F-602/F-603, out of scope).
   Swap literals for `IMPORT_EXPORT_COPY.*`. Do not change classNames, element order or attributes.
6. **App.tsx.** Remove the moved code. Use `const { toast, notify } = useToast();` and `<Toast message={toast} />`
   in the same position (last child of `.app-shell`). Use `onExport={(type) => { download(items, type); notify(IMPORT_EXPORT_COPY.exported(type)); }}`
   and `notify(IMPORT_EXPORT_COPY.imported(saved.length))`. Remove unused imports (`CSV_TEMPLATE`, `toCsv`, `Field`,
   `Modal`, `statuses`, `Icon`). Leave the remaining item/shell strings in App untouched (F-004.4).
7. **Coverage.** Add `download.ts` to `vitest.config.ts` coverage `include` + `thresholds`.
8. **Self-check before handing off** (the F-004.2 nit): run every check, run the `--color-moved` diff from AC 2 and
   paste a summary into `impl-log.md`, and run `wc -l src/App.tsx`.

Rules: **R1**: no data access added; the modals receive callbacks and App still calls `wardrobe.importMany`.
**R6**: Vietnamese copy moves into `copy.ts`, and labels still come from `@/constants/wardrobe` (`statuses`).
**R7**: moves + wiring only. Bugs found (e.g. the uncleared interval/timeout) go to follow-ups. **R8**: T6–T10 + characterisation.
**R9**: DOM/classNames unchanged, `src/index.css` untouched. **R10**: `vite.config.ts`, `AGENTS.md`, `.figma/` untouched.
R2–R5: n/a.

## Specialist input used
None (no consult files).

## Assumptions
- `Header`/`Hero` stay in `src/features/layout/` (F-004.2 review follow-up). The feature list's target structure
  does not name a place for them, and moving them is not needed for this AC.
- "Screenshots identical" is checked by the agent with the move-diff + literal cross-check (as in F-004.2).
  Ming takes the real screenshots after merge.
- Copy for the items/layout/shell/components features is out of this slice (see Split proposal). Until F-004.4
  lands, the §7 rule is met only for import-export (and auth, which already has `authMessages.ts`).
- `csv/template.ts` (`CSV_TEMPLATE`) is sample data, not UI copy, so it stays where it is.
- Hotspots: `src/App.tsx`. No other ticket is `IN_PROGRESS`/`REVIEW`/`DONE`. F-601.3, F-602 and T-001
  depend on this ticket and will edit the new `src/features/import-export/*` files after it merges.
- Expected diff: about 230 lines moved out of App and about 300 added across the new files (mostly moved), plus about
  180 lines of tests. That is above 400 by raw count, but it is mostly moves, the same profile as F-004.2.

## Blocking questions
None.

## Split proposal
- **F-004.3 (this plan):** modals into `src/features/import-export/`, `Toast` + `useToast`, `download` helper,
  import-export `copy.ts`, App.tsx under 250 lines.
- **F-004.4 (proposed, new ticket):** `copy.ts` for `src/features/items/` (Editor, FilterBar, StatsRow, ItemCard,
  ItemGrid, the App shell's panel heading/error banner/item toasts), `src/features/layout/` (Header, Hero), and
  the copy in `src/components/` (`Empty`, `Confirm`), finishing feature-list §7 "no scattered string literals once
  F-004 is done". Size S–M. It depends on F-004.3, and it should land before F-201 if possible, to avoid Editor conflicts.
