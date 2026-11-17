## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
Run through WSL (Ubuntu-24.04) on branch `ticket/F-602.2` at `edb335e`.
- typecheck: PASS (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- format:check: PASS ("All matched files use the correct format", 288 files).
- test: 15 failed | 1414 passed | 221 skipped (125 files: 3 failed, 111 passed, 11 skipped). All 15 failures are the
  known WSL-on-/mnt/d spawn timeouts: `server/index.cli.test.ts` x13, `server/photo-relocate.cli.test.ts` x1,
  `server/photo-sweep.cli.test.ts` x1 (recorded as failing on `origin/main` in the F-202.1 Handoff). Zero failures in
  `src/**`. The diff touches no `server/**` file (`git diff origin/main...HEAD --name-only | grep ^server/` is empty).
  Matches the impl-log numbers exactly.
- build: PASS (vite build, built in 3.58 s).

### Acceptance criteria
- [x] Export downloads the server backup — evidence: `src/data/repo.http.ts:116-118` (`call<Backup>("GET", "/backup")`,
  no new fetch); `repo.http.test.ts` › "exportAll GETs /api/backup and returns the body unchanged";
  `App.tsx:273-292` JSON path goes only through `wardrobe.exportBackup()` → `downloadBackup`, CSV path unchanged;
  `App.test.tsx` › "export JSON downloads the server backup (pretty JSON, version 1) and CSV is unchanged",
  "JSON tab restores a pasted backup … a following JSON export has the restored rows", "export JSON failure shows the
  API message as a toast and downloads nothing"; `download.test.ts` › backupFile. The real-app round trip diff is a
  Ming verification item (below).
- [x] An invalid or oversized file shows a Vietnamese message and nothing is sent — evidence:
  `useJsonRestore.ts` `pickFile` runs `precheckBackupSize` before `readFile` and returns early;
  `ImportModal.test.tsx` › "an oversized file shows the size message, is never read, restore is not called" (spies on
  `FileReader.readAsText`), "invalid pasted text shows the Vietnamese message and restore is not called";
  `backup.test.ts` › precheckBackup cases incl. UTF-8 bytes vs chars; server-side errors mapped in
  `apiErrors.ts:87-137` with tests "restoreErrorMessage …", "every reason the server can send has copy" (I checked the
  reason list against `server/validate.js` backup section: all covered, editor reasons reuse `EDITOR_COPY`).
- [x] The restore summary shows counts, including items whose photo was not restored — evidence: `summaryLines`
  (`backup.ts:124-141`) + `ImportJsonTab.tsx` summary block; summary shape matches `server/backup.js:369`;
  `ImportModal.test.tsx` › "confirm, restore: tabs disabled while running, summary with counts and photos, Xong
  closes"; `backup.test.ts` › summaryLines (photosMissing hidden at 0, shown otherwise).
- [x] 390px and dark mode; tests pass — tests: see Checks. Layout: no new CSS; the tab reuses `.backup-note`,
  `.file-btn`, `.or`, `.paste-area.json`, `.parse-summary`, `.csv-error` (has `overflow-wrap: anywhere`),
  `.import-summary`, `.progress`, which already use theme variables and have mobile rules in `src/index.css`.
  I could not open a browser in this review environment (no Playwright installed; `pnpm dev` needs sign-in), so the
  visual 390 px / dark check is carried to Ming verification below. Not treated as a blocker because no new styling
  was introduced.

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: export/restore via `WardrobeRepo` → `call()`; components do not fetch; `memoryRepo` is test-only.
- R2/R3/R4: no migration, no env/secret change, no photo access.
- R5: counts come from the server summary; nothing stored.
- R6: all Vietnamese copy in `copy.ts` / `apiErrors.ts`; reason ids stay English.
- R7: every changed file is in the plan's file list (`useJsonRestore` takes an extra `onClose` arg, noted in impl-log;
  not a scope change).
- R8: new pure logic (`precheckBackup*`, `summaryLines`, `describeBackupField`, `restoreErrorMessage`, repo methods)
  has unit tests.
- R9: see AC4 note. R10 retired.

### Nits (do not block)
- `useJsonRestore.ts` `run()`: when the modal is closed mid-restore, `onRestored` is skipped, so a successful restore
  gives no toast (the data still refreshes). Calling `onRestored(s)` before the `mounted` check would keep the toast.
- `ImportJsonTab.tsx` confirm view: if a pasted backup lacks `exportedAt`, the line reads "Bản sao lưu ngày " with
  no date (no crash; `toLocalDate` returns ""). The server will reject such a file anyway.
- The file chip reuses `.parse-summary`; a very long filename without break characters could widen it at 390 px
  (`.parse-summary b` has no `overflow-wrap`), and the "Bỏ chọn" button is not pushed to the right edge.
- `pickFile` read errors show the `notJson` text; a dedicated "could not read the file" message would be clearer.

### Ming verification after merge (from plan.md)
- Real app: Export JSON → delete a few items → Import → JSON → pick the file → restore → Export JSON again → diff:
  identical apart from `exportedAt` and `photo_id`; summary shows "N món chưa có ảnh".
- Restore the same file again: everything "không đổi".
- Phone (iOS Safari, 390 px): Export JSON saves the file (download after an `await`), picking it in the JSON tab works.
- 390 px and dark mode: Import → JSON (backup) → paste/pick → confirm view and error line readable, no horizontal
  scroll; Export modal JSON option (reviewer could not run a browser).

### Follow-ups (out of scope)
- Confirm the 15 server CLI spawn-test failures under WSL on /mnt/d against `main` (environment, not this diff).
