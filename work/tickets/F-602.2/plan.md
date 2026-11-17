Status: READY

# Plan — F-602.2: JSON backup and restore in the app (client)

> Client half of F-602. The server half (F-602.1: `GET /api/backup`, `POST /api/restore`) is merged on `main`
> (`server/backup.js`, `server/validate.js:204-360`, contract in `server/README.md:79-88`). No `server/**`,
> `db/**` or auth file changes in this ticket. Expected tier: **Medium**.

## Feature summary
`docs/feature-list.md` F-602 (lines 218-221):
> - Export the full JSON (items + wear logs + locations, with photo paths) under `{version: 1}`.
> - Restore upserts by id and is idempotent: running it twice changes nothing.
> - **AC:** export, restore into an empty account and export again give identical JSON (except timestamps and photo URLs).

`work/decisions.md`:
> D1: Restore keeps ids when they are free or already owned by the caller; ids owned by another user get new ids, and
> every reference is remapped. Photos are not restored across accounts ... The AC "restore into an empty account"
> becomes "same account after wipe → identical JSON".

> D44: the app always runs against the Node API with real data and Identity sign-in; when the server is unreachable
> it shows an error, never demo data.

> D49: ... Restore merges locations by name, keeps file timestamps on insert, never deletes and never touches photos.
> Limits: 8 MiB, 200 locations, 3000 items, 50 000 wear logs; 1 restore in flight per user; 10/h per user, 60/h
> global; body timeouts 60 s total / 10 s idle on restore only. **Client does pre-checks only; the server is
> authoritative.**

Ticket scope (ticket.md lines 27-36):
> - `src/data/backup.ts`: types matching the F-602.1 wire format; `precheckBackup` (file ≤ 8 MiB, JSON parses,
>   `version === 1`, arrays present, count caps) — the server stays authoritative.
> - `WardrobeRepo.exportAll()` / `restore(backup)` in `repo.ts`; thin `call()`s in `repo.http.ts`; minimal
>   `src/test/memoryRepo.ts`; `useWardrobe.exportBackup` / `restoreBackup` (then `refresh()`).
> - `apiErrors.ts`: Vietnamese messages for `restore_busy`, `restore_conflict`, `request_timeout` on restore and the new
>   `invalid_input` reasons.
> - `ImportJsonTab.tsx` real flow (pick file or paste → pre-check → confirm "restoring overwrites items with the same
>   id and never deletes; photos are not in the file" → run → summary incl. `photosMissing`) and `ImportModal.tsx`
>   wiring.
> - `App.tsx` JSON export through `exportBackup()` and `download.ts` (CSV unchanged); `copy.ts` / `ExportModal` text.

Wire contract used (from `server/README.md:83-88`, `server/backup.js:84-118`, `:369`, `:396-452`):
- `GET /api/backup` → 200 `{ version: 1, exportedAt, locations[{id,name,parent_id,sort_order,created_at}],
  items[{id,name,category,status,brand,size,material,price,purchase_date,location_id,colors,seasons,tags,notes,
  created_at,updated_at,photo_id}], wearLogs[{id,item_id,worn_on}] }`; 503 `db_unavailable`.
- `POST /api/restore` (`application/json`) → 200 `{ summary: { locations: { inserted, updated, unchanged, merged,
  remapped }, items: { inserted, updated, unchanged, remapped }, wearLogs: { inserted, unchanged }, photosMissing } }`.
  Errors: 413 `payload_too_large`, 415 `unsupported_media_type`, 400 `invalid_json`, 400 `invalid_input`
  `{ field, reason }`, 408 `request_timeout`, 409 `restore_conflict`, 429 `rate_limited`, 503 `restore_busy`
  (`Retry-After: 5`), 503 `db_unavailable`, 500 `internal` (+ `requestId`). Error body shape
  `{ error: { code, field?, reason?, requestId? } }` is already parsed by `repo.http.ts:55-59`.
- Reasons the server can send for restore (`server/validate.js`): `notObject`, `versionUnsupported`, `unknownKey`,
  `invalidType`, `tooMany`, `idInvalid`, `duplicateId`, `nameRequired`, `nameTooLong`, `invalidValue`, `tooLong`,
  `duplicateName`, `danglingRef`, `cycle`, `timestampInvalid`, `priceNegative`, `priceInvalid`, `dateInvalid`,
  `duplicateWear`.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Export downloads the server backup (round trip on the real app: see Ming verification). | `src/data/repo.http.test.ts` › "exportAll GETs /api/backup and returns the body unchanged"; `src/App.test.tsx` › "export JSON downloads the server backup (pretty JSON, version 1) and CSV is unchanged"; `src/features/import-export/download.test.ts` › "backupFile". Reviewer reads `App.tsx`: JSON export goes only through `wardrobe.exportBackup()` (R1), no `items` serialisation left for JSON. |
| 2 | An invalid or oversized file shows a Vietnamese message and nothing is sent or written. | `src/data/backup.test.ts` › `precheckBackup` cases (too large, not JSON, top-level array, not an object, version ≠ 1, missing / non-array lists, each list over its cap) each return the expected reason; `src/features/import-export/ImportModal.test.tsx` › "JSON: oversized file shows the size message, is never read, restore is not called", "JSON: invalid pasted text shows the Vietnamese message, restore is not called", "JSON: server 400 invalid_input shows the field and reason in Vietnamese"; `src/data/apiErrors.test.ts` › restore messages. "Nothing written" on the server side is already proven by F-602.1 (`server/backup.db.test.ts` AC4). |
| 3 | The restore summary shows counts, including items whose photo was not restored. | `ImportModal.test.tsx` › "JSON: confirm → restore → summary shows item, location, wear-log counts and photosMissing; onRestored called"; `src/data/backup.test.ts` › `summaryLines` cases (zero photosMissing line hidden, non-zero shown). |
| 4 | 390px and dark mode; tests pass. | Checks green (`pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`). Reviewer opens `pnpm dev` (dev token proxy) at 390 px width in light and dark: Import → "JSON (backup)" → paste a small valid backup → "Kiểm tra & import" → confirm view (counts, warning) renders without horizontal scroll and readable in dark; an invalid paste shows the error; Export modal JSON option. **Do not press "Khôi phục" in `pnpm dev`**: per D45 the dev server may point at the production DB. The summary view is covered by the unit test above. |

## Ming verification after merge
- The ticket's manual AC on the real app: Export JSON → delete a few items (and optionally a location's items) →
  Import → JSON → pick the file → restore → Export JSON again → diff the two files: identical apart from
  `exportedAt` and `photo_id` (photos are not restored; the summary shows "N món chưa có ảnh").
- Restore the same file a second time: summary shows everything "không đổi" (D49 idempotency).
- On the phone (iOS Safari, 390 px): Export JSON downloads/saves the file (the download now happens after an
  `await`; see Assumptions), and picking that file in the JSON tab works.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/data/backup.ts` (new) | Types `Backup`, `BackupLocation`, `BackupItem`, `BackupWearLog`, `RestoreSummary` (wire format above); `BACKUP_CAPS` (mirror of `server/validate.js:206`); `precheckBackupSize(bytes)`, `precheckBackup(text)`; `backupCounts(backup)`; `summaryLines(summary)` (pure, returns `{ key, n }[]` for the UI) | Scope bullet 1; pure logic first (R8) |
| `src/data/backup.test.ts` (new) | Unit tests below | R8 |
| `src/data/repo.ts` | Add `exportAll(): Promise<Backup>` and `restore(backup: Backup): Promise<RestoreSummary>` to `WardrobeRepo` | Scope bullet 2, R1 |
| `src/data/repo.http.ts` | `exportAll` → `call<Backup>("GET", "/backup")`; `restore` → `call<{ summary }>("POST", "/restore", backup)` returning `summary` | Scope bullet 2, R1 |
| `src/data/repo.http.test.ts` | Tests for the two calls and an error passthrough | R8 |
| `src/test/memoryRepo.ts` | Minimal `exportAll` / `restore`: keeps the last restored `Backup` (initially an empty v1 backup); `restore` stores it and returns a summary counting everything as inserted, `photosMissing` = items with `photo_id`; `exportAll` returns the stored backup with a fresh `exportedAt` | Interface must stay implemented by the test double |
| `src/test/fixtures.ts` | Add `fixtureBackup: Backup` (2 locations incl. "Tủ phòng ngủ", 3 items with Vietnamese names, one with `photo_id`, 2 wear logs) | Shared by backup, ImportModal and App tests |
| `src/data/useWardrobe.ts` | `exportBackup = () => repo.exportAll()`; `restoreBackup = async (b) => { const s = await repo.restore(b); await refresh(); return s; }`; return both | Scope bullet 2 |
| `src/data/useWardrobe.test.tsx` | "restoreBackup calls repo.restore then reloads items" (memory repo) | R8 |
| `src/data/apiErrors.ts` | Add `restore_busy`, `restore_conflict` to `API_ERROR_COPY`; add `RESTORE_ERROR_COPY` (overrides for `request_timeout`, `rate_limited`, `payload_too_large`, `invalid_json`, `network`), `BACKUP_REASON_COPY` (reason → Vietnamese), `describeBackupField(field)` and `restoreErrorMessage(e: unknown)` | Scope bullet 3, R6 |
| `src/data/apiErrors.test.ts` | Tests below | R8 |
| `src/features/import-export/useJsonRestore.ts` (new) | Small state hook for the JSON tab: input (paste text or picked file), phase `edit → confirm → running → done`, error, precheck result, summary; actions `setText`, `pickFile`, `clearFile`, `check`, `run`; derives the footer `primary` button | Keeps `ImportModal` readable; state survives tab switches like the CSV text |
| `src/features/import-export/ImportJsonTab.tsx` | Presentational: file input + button, file chip (name, size, "Bỏ chọn"), paste area, error line, confirm block (date, counts, warning, photo note), running line, summary | Scope bullet 4 |
| `src/features/import-export/ImportModal.tsx` | New props `restoreBackup`, `onRestored`; call `useJsonRestore`; tab 2 primary from the hook; tabs disabled while either CSV or JSON is running | Scope bullet 4 |
| `src/features/import-export/ImportModal.test.tsx` | JSON flow tests below; update `setup` / render calls for the new props | AC2, AC3 |
| `src/features/import-export/copy.ts` | `import.json`: new hint, placeholder, precheck messages, confirm/warning text, summary lines, buttons; `export.jsonHint` text; `restored` toast; `exportFailed` not needed (uses API copy) | R6, scope bullet 5 |
| `src/features/import-export/download.ts` | Extract `saveFile({ content, mime, filename })`; add `backupFile(backup)` (pretty JSON, `application/json`, `tu-do-cua-toi.json`) and `downloadBackup(backup)`; `exportFile` / `download` become CSV-only (the items-array JSON branch is removed) | Scope bullet 5 |
| `src/features/import-export/download.test.ts` | Replace the items-JSON case with `backupFile`; CSV unchanged | R8 |
| `src/features/import-export/ExportModal.tsx` | Optional `busy` prop: disables both options while the backup is being fetched | Avoid double requests on slow networks |
| `src/features/import-export/ExportModal.test.tsx` | "busy disables both export options" | R8 |
| `src/App.tsx` | JSON export: `await wardrobe.exportBackup()` → `downloadBackup` → toast, error → `notify(wardrobe.message(e))`, guarded by a ref + `exportBusy` state; CSV path unchanged; pass `restoreBackup` and `onRestored` to `ImportModal` | Scope bullet 5 |
| `src/App.test.tsx` | Update "export JSON and CSV …" (JSON is now the backup) and "Photos and JSON tabs are disabled …" (JSON tab is live); add a memory-repo restore → export round trip | Existing tests change behaviour |

No CSS change is planned: reuse `.backup-note`, `.file-btn`, `.or`, `.paste-area.json`, `.parse-summary`,
`.csv-error`, `.import-summary`, `.progress` (all have dark/mobile rules in `src/index.css`). If a 390 px or dark
issue needs a rule, the implementer may add it to `src/index.css` and record why in `impl-log.md`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/data/backup.test.ts` › precheckBackupSize › `8 MiB` ok, `8 MiB + 1` → `tooLarge` | AC2 size, no read |
| › precheckBackup › `fixtureBackup` (stringified, pretty) → ok with counts `{ locations: 2, items: 3, wearLogs: 2, withPhoto: 1 }` | happy path |
| › text over 8 MiB in UTF-8 bytes (Vietnamese text: char count < cap, byte count > cap) → `tooLarge` | bytes vs chars, diacritics |
| › empty / whitespace → `empty`; `"{"` → `notJson`; `[]` and `[{"name":"Áo"}]` → `legacyArray`; `"x"`, `null`, `1` → `notObject` | AC2 |
| › `version` missing, `2`, `"1"` → `versionUnsupported` | AC2 |
| › `items` missing / not an array (same for `locations`, `wearLogs`) → `missingList` with `field` | AC2 |
| › each list one over its cap (inject small caps) → `tooMany` with `field` and `max` | AC2 caps, N8 |
| › does not validate rows (an item with no name passes; the server is authoritative, D49) | scope |
| › summaryLines › all-zero summary; `photosMissing: 0` omits the photo line; `photosMissing: 2` includes it; remapped/merged shown only when > 0 | AC3 |
| `src/data/apiErrors.test.ts` › restoreErrorMessage › `restore_busy`, `restore_conflict`, `request_timeout`, `rate_limited`, `payload_too_large`, `invalid_json`, `network`, `internal` with requestId, unknown code → generic | AC2, R6 |
| › `invalid_input` + `items[3].name` / `nameRequired` → message contains "món #4" and the editor's name-required copy | field + reason |
| › `invalid_input` + `locations[0].parent_id` / `cycle`, `wearLogs[5].worn_on` / `dateInvalid`, `items` / `tooMany`, `null` field / `unknownKey`, unknown reason → generic invalid-file text | every new reason |
| › describeBackupField › `items[3].tags[1]` → "món #4 (tags)", `locations[0]` → "vị trí #1", `wearLogs[12].item_id`, `version`, `undefined` | pure mapper |
| › `API_ERROR_COPY` has `restore_busy` and `restore_conflict` (ApiError message not generic) | apiErrorMessage fallback |
| `src/data/repo.http.test.ts` › "exportAll GETs /api/backup and returns the body unchanged" | AC1 |
| › "restore POSTs the backup as JSON to /api/restore and returns summary" (method, Content-Type, body equals `JSON.stringify(backup)`) | AC3 |
| › "restore 400 invalid_input keeps field and reason; 503 restore_busy is an ApiError with that code" | AC2 |
| `src/data/useWardrobe.test.tsx` › "restoreBackup calls repo.restore then reloads items" (spy on `list` called again) | refresh after restore |
| `src/features/import-export/download.test.ts` › backupFile › pretty JSON (2 spaces), `application/json`, `tu-do-cua-toi.json`; `exportFile(items, "csv")` unchanged | AC1 |
| `src/features/import-export/ImportModal.test.tsx` › "JSON: paste a valid backup → Kiểm tra & import → confirm shows date (UTC+7), counts and the overwrite / no-delete / no-photos warning; restoreBackup not yet called" | flow |
| › "JSON: confirm → Khôi phục → running disables tabs → summary shows counts and 'N món chưa có ảnh'; onRestored(summary) called; primary becomes Xong and closes" | AC3 |
| › "JSON: oversized file (size stubbed to 8 MiB + 1) shows the size message, file is never read, restoreBackup not called" | AC2 |
| › "JSON: invalid pasted text (not JSON, legacy array, version 2, items over cap) shows the Vietnamese message; restoreBackup not called" | AC2 |
| › "JSON: picking a valid .json file shows its name and enables the check; Bỏ chọn returns to paste" | file path |
| › "JSON: server 400 invalid_input shows field + reason; 503 restore_busy shows the busy text and keeps 'Khôi phục' enabled to retry" | AC2, retry |
| › "JSON: editing the text after a check returns to edit (confirm cleared)" | stale confirm |
| `src/features/import-export/ExportModal.test.tsx` › "busy disables both export options" | double click |
| `src/App.test.tsx` › "export JSON downloads the server backup (pretty JSON, version 1) and CSV is unchanged" | AC1 |
| › "JSON tab restores a pasted backup (memory repo), shows the summary and toast; a following JSON export contains the restored rows" | AC1/AC3 wiring |
| › "export JSON failure shows the API message as a toast and downloads nothing" | error path |
| › update "Photos and JSON tabs are disabled…" → photos only (JSON tab no longer shows "Sắp có") | changed behaviour |

## Approach
1. **`src/data/backup.ts`** (pure).
   - Types exactly as the wire contract above (`category`/`status` are DB ids as `string`; `price: number | null`;
     dates as strings). `RestoreSummary` as in `server/backup.js:369`.
   - `BACKUP_CAPS = { bytes: 8 * 1024 * 1024, locations: 200, items: 3000, wearLogs: 50000 }` with a comment that it
     mirrors `server/validate.js:206` (server authoritative).
   - `precheckBackupSize(bytes, caps?)` → `{ ok: true } | { ok: false, reason: "tooLarge", max }`; used on
     `File.size` **before** reading the file.
   - `precheckBackup(text, caps?)` in order: trimmed empty → `empty`; UTF-8 byte length
     (`new TextEncoder().encode(text).length`) > cap → `tooLarge`; `JSON.parse` throws → `notJson`; top-level
     array → `legacyArray` (the old app JSON export was a bare item array, `download.ts:11`, and cannot be restored);
     not a plain object → `notObject`; `version !== 1` → `versionUnsupported`; `locations` / `items` / `wearLogs`
     not arrays → `missingList` + field; over cap → `tooMany` + field + max. Returns
     `{ ok: true, backup, counts: { locations, items, wearLogs, withPhoto } }`. No row validation (D49).
     Error reasons are constants; never echo file content.
   - `summaryLines(summary)` returns the ordered lines to show (keys + numbers; copy in `copy.ts`), skipping zero
     `remapped`, `merged` and `photosMissing`.
2. **Repo** (R1): interface methods in `repo.ts`; `repo.http.ts` uses the existing `call()` (JSON body, auth,
   error mapping), no new fetch. `memoryRepo.ts` minimal double as listed. `useWardrobe` adds `exportBackup` and
   `restoreBackup` (refresh after success; a failing refresh sets `wardrobe.error` as today and does not hide the
   summary).
3. **Errors** (`apiErrors.ts`, R6): add `restore_busy` ("Đang có một lần khôi phục khác, thử lại sau vài giây") and
   `restore_conflict` ("Không khôi phục được vì trùng mã với dữ liệu khác — chưa có gì bị thay đổi") to
   `API_ERROR_COPY`. `RESTORE_ERROR_COPY` overrides the photo-flavoured generic texts for restore:
   `request_timeout` (sending the file took too long), `rate_limited` (too many restores in the last hour),
   `payload_too_large` (file larger than 8 MB), `invalid_json` (file is not valid JSON), `network` ("Mất kết nối khi
   khôi phục — chưa rõ đã xong chưa; khôi phục lại cùng tệp là an toàn" — safe because restore is idempotent, D49).
   `BACKUP_REASON_COPY` covers every reason listed in the contract; `nameRequired` / `nameTooLong` / `priceNegative`
   / `priceInvalid` / `dateInvalid` reuse `EDITOR_COPY.errors` as `apiErrorMessage` does. `describeBackupField`
   turns `items[3].name` into "món #4 (name)", `locations[i]` → "vị trí #i+1", `wearLogs[i]` → "lượt mặc #i+1",
   other fields unchanged. `restoreErrorMessage(e)`: `ApiError` → override, else invalid_input text
   "Tệp sao lưu không hợp lệ — <field>: <reason>", else `API_ERROR_COPY` via `apiErrorMessage`; non-ApiError →
   `generic`. The suggested texts are defaults; the implementer may polish wording but keeps all copy in
   `apiErrors.ts` / `copy.ts`.
4. **Copy** (`copy.ts`): `import.json.hint` → restore overwrites items with the same id, adds the others, never
   deletes; photos are not in the file. `pastePlaceholder` → `{"version": 1, "items": [...], ...}` (the current one
   shows the old array format). Precheck messages per reason (`tooLarge(maxMb)`, `empty`, `notJson`, `legacyArray`
   "Đây là tệp xuất cũ (chỉ danh sách món), không dùng để khôi phục được — hãy xuất lại bản sao lưu mới",
   `notObject`, `versionUnsupported`, `missingList(field)`, `tooMany(field, max)`); confirm block (`fileFrom(date)`,
   `counts(items, locations, wearLogs)`, `warning`, `photoNote(n)`); `restore` button "Khôi phục"; `running`
   "Đang khôi phục…"; summary line templates; `pickedFile(name, size)`, `clearFile` "Bỏ chọn". `export.jsonHint` →
   full backup (items, locations, wear history), for restore; `restored` toast "Đã khôi phục bản sao lưu".
   `import.comingSoon` stays (photos tab).
5. **`useJsonRestore(restoreBackup, onRestored)`**: state `{ text, file: { name, size, text } | null, phase, error,
   checked, summary }`. `pickFile(file)`: `precheckBackupSize(file.size)` first — on failure set the error and
   **do not read** the file; else read it (local FileReader helper, same pattern as `ImportCsvTab.tsx:16-22`; do
   not edit that file) and keep it out of the textarea (an 8 MiB textarea is heavy on phones). Any input change →
   phase `edit`, error and check cleared. `check()`: `precheckBackup(file?.text ?? text)` → error or phase
   `confirm`. `run()`: phase `running`, `await restoreBackup(checked.backup)`, then `done` + `onRestored(summary)`;
   on error back to `confirm` with `restoreErrorMessage(e)` (the user can retry or change the input). Ignore the
   result after unmount (ref) except that `useWardrobe` still refreshes. The restore request is **not** aborted on
   close (the server transaction may already be committing). `primary`: edit → "Kiểm tra & import" (existing
   `checkAndImport`), disabled when there is no input; confirm → "Khôi phục"; running → "Đang xử lý…" disabled;
   done → "Xong" → `onClose`.
6. **`ImportJsonTab`**: renders from the hook state: `.backup-note` with new hint; hidden `<input type="file"
   accept=".json,application/json">` + `.file-btn`; when a file is picked a chip with name, size and "Bỏ chọn"
   replaces the paste area; otherwise `.or` + `textarea.paste-area.json` (disabled while running); error in
   `.csv-error` with `role="alert"`; confirm block in `.parse-summary` (date via `toLocalDate(exportedAt)` shown as
   dd/mm/yyyy, counts, warning, photo note when `withPhoto > 0`); summary in `.import-summary`. No `comingSoon`.
7. **`ImportModal`**: new props `restoreBackup: (b: Backup) => Promise<RestoreSummary>` and
   `onRestored: (s: RestoreSummary) => void`; `const json = useJsonRestore(...)`; `primary` for tab 2 comes from
   `json.primary`; tab buttons disabled when `phase === "running" || json.phase === "running"`. CSV logic unchanged.
8. **Export** (`download.ts`, `App.tsx`, `ExportModal`): `saveFile` holds the Blob/anchor/revoke code;
   `downloadBackup(backup)` = `saveFile(backupFile(backup))` with `JSON.stringify(backup, null, 2)` (pretty, so
   Ming's manual diff is readable). In `App.tsx` the `onExport` handler: CSV → `download(items, "csv")` as today;
   JSON → if `exportingRef` set return; set `exportBusy`; `try { downloadBackup(await wardrobe.exportBackup());
   notify(exported("json")) } catch (e) { notify(wardrobe.message(e)) } finally { clear }`. `ExportModal busy`
   disables both options. `ImportModal` gets `restoreBackup={wardrobe.restoreBackup}` and
   `onRestored={() => notify(IMPORT_EXPORT_COPY.restored)}`.

Rules: **R1** — export and restore go through `WardrobeRepo` → `repo.http.ts` `call()`; components never fetch.
**R2** — no migration. **R3** — no secret or `VITE_*` change. **R4** — no photo access; photos are explicitly not
restored (copy says so). **R5** — nothing derived is computed or stored; counts come from the server summary.
**R6** — all Vietnamese text in `copy.ts` / `apiErrors.ts`, ids/reasons stay English. **R7** — only the files above.
**R8** — every new pure function and repo method has unit tests. **R9** — reuse existing responsive/dark classes;
reviewer checks 390 px + dark. **R10** — retired.

## Specialist input used
No consults for F-602.2. Inputs carried from F-602.1:
- Architect R-C / D49 "client does pre-checks only, server authoritative" → **adopted**: `precheckBackup` checks
  size, JSON, version, lists and caps only; row errors come from the server's `invalid_input { field, reason }`.
- F-602.1 plan "Restore adds and overwrites; it never deletes (F-602.2 copy must say so)" → **adopted** in the hint
  and confirm warning.
- F-602.1 review follow-up / security N8 (an account over the caps exports a file restore rejects) → **covered in
  copy**: the `tooMany` precheck message names the list and its maximum. A server-side export cap stays out of scope.

## Assumptions
- **Hotspots:** edits `src/App.tsx` (hotspot) and `src/data/repo.http.ts`. No other ticket is `IN_PROGRESS`,
  `REVIEW` or `DONE` in `work/backlog.md` (F-202.1 is merged), so no rebase is expected; branch from current `main`.
- The old JSON export (a bare array of `Item`s) is dropped: JSON export now always means the server backup. CSV is
  the human-readable export. Files exported by the old app are recognised and rejected with a clear message
  (`legacyArray`), not restored.
- Filename stays `tu-do-cua-toi.json` (no date suffix; not asked for).
- The download happens after an `await` (the backup fetch). Programmatic clicks on a `download` anchor with a blob:
  URL are not treated as pop-ups by current browsers, but iOS Safari behaviour is confirmed by Ming on the phone
  (Ming verification). If it fails there, the fix is a follow-up, not part of this diff.
- `revokeObjectURL` right after `click()` is the existing CSV behaviour and is kept.
- The pasted text is re-serialised by `call()` (`JSON.stringify`) before sending; it is never larger than the
  pre-checked input, so the client size check is sufficient for the 8 MiB body cap.
- Closing the modal during a restore does not cancel it; the data refresh still happens via `useWardrobe`.
- Reviewer and implementer must not run a real restore in `pnpm dev`: per D45 the dev server may be on the
  production database. UI checks stop at the confirm step; the restore path is covered by unit tests and by Ming
  after merge.
- Estimated size ≈ 420 non-test lines (backup.ts ≈ 90, apiErrors ≈ 60, repo/http/memory/useWardrobe ≈ 50,
  useJsonRestore ≈ 80, ImportJsonTab ≈ 90, ImportModal/App/download/ExportModal/copy ≈ 50). Slightly above the
  guide but already the second slice of a split; one implement/review cycle.

## Blocking questions
None.

## Split proposal
None (this ticket is already slice 2 of the F-602 split).
