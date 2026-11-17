## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/data/backup.ts` (new) | Wire types, `BACKUP_CAPS`, `precheckBackupSize`, `precheckBackup`, `summaryLines` (plan, pure logic) |
| `src/data/backup.test.ts` (new) | R8 tests for the above |
| `src/data/repo.ts` | `exportAll` / `restore` on `WardrobeRepo` (R1) |
| `src/data/repo.http.ts` | Thin `call()`s for `GET /backup` and `POST /restore` |
| `src/data/repo.http.test.ts` | Tests for the two calls and error passthrough |
| `src/test/memoryRepo.ts` | Test double must implement the interface |
| `src/test/fixtures.ts` | `fixtureBackup` shared by tests |
| `src/data/useWardrobe.ts` | `exportBackup`, `restoreBackup` (restore then `refresh()`) |
| `src/data/useWardrobe.test.tsx` | restoreBackup reloads items; exportBackup |
| `src/data/apiErrors.ts` | `restore_busy`, `restore_conflict`, `RESTORE_ERROR_COPY`, `BACKUP_REASON_COPY`, `describeBackupField`, `restoreErrorMessage` (R6) |
| `src/data/apiErrors.test.ts` | Tests for the above |
| `src/features/import-export/useJsonRestore.ts` (new) | State hook for the JSON tab (edit → confirm → running → done) |
| `src/features/import-export/ImportJsonTab.tsx` | Real presentational JSON tab (file or paste, error, confirm, summary) |
| `src/features/import-export/ImportModal.tsx` | New props `restoreBackup`, `onRestored`; tab 2 primary from the hook; tabs disabled while JSON runs |
| `src/features/import-export/ImportModal.test.tsx` | JSON flow tests; new props in existing renders |
| `src/features/import-export/copy.ts` | JSON tab copy, `export.jsonHint`, `restored` toast (R6) |
| `src/features/import-export/download.ts` | `saveFile`, `backupFile`, `downloadBackup`; items-array JSON branch removed (CSV only) |
| `src/features/import-export/download.test.ts` | `backupFile` replaces the old items-JSON case |
| `src/features/import-export/ExportModal.tsx` | Optional `busy` prop disables both options |
| `src/features/import-export/ExportModal.test.tsx` | "busy disables both export options" |
| `src/App.tsx` | JSON export through `wardrobe.exportBackup()` with busy ref/state; wiring for `restoreBackup` / `onRestored` |
| `src/App.test.tsx` | Export test now the backup; JSON tab no longer "Sắp có"; restore → export round trip; export failure toast |

### Tests added / changed
- `src/data/backup.test.ts` › precheckBackupSize (8 MiB / +1); precheckBackup (happy path + counts, UTF-8 bytes vs chars, empty / notJson / legacyArray / notObject, version, missingList per list, tooMany per list with injected caps, rows not validated); summaryLines (all zero, photosMissing, remapped/merged)
- `src/data/apiErrors.test.ts` › restore errors (busy, conflict, overrides, internal + requestId, unknown, nameRequired with "món #4", cycle / dateInvalid / tooMany / unknownKey / unknown reason, every server reason has copy, describeBackupField)
- `src/data/repo.http.test.ts` › exportAll GET body unchanged; restore POST method / Content-Type / body / summary; 400 invalid_input keeps field and reason; 503 restore_busy is an ApiError
- `src/data/useWardrobe.test.tsx` › restoreBackup calls repo.restore then reloads items; exportBackup returns the repo backup
- `src/features/import-export/download.test.ts` › backupFile (replaces the items-JSON case); CSV unchanged
- `src/features/import-export/ExportModal.test.tsx` › busy disables both export options
- `src/features/import-export/ImportModal.test.tsx` › JSON tab (restore): confirm view, running → summary → Xong, oversized file never read, invalid pasted text, picking a file / Bỏ chọn, server 400 and 503 retry, editing after check
- `src/App.test.tsx` › export JSON downloads the server backup (pretty JSON); Photos tab disabled / JSON tab live; JSON restore → export round trip; export JSON failure toast

### Checks (actual output summary)
Run through WSL (Ubuntu-24.04, mise) after the first hand-written pass.
- typecheck: PASS (tsc --noEmit and tsc -p tsconfig.server.json).
- format:check: PASS ("All matched files use the correct format"), after `pnpm format` (only files in this diff changed).
- test: first run 21 failed; 3 were caused by this diff and fixed: (1) `describeBackupField` regex lost its backslashes when written (fixed in `src/data/apiErrors.ts`, also fixed the ImportModal invalid_input test), (2) `App.test.tsx` used `Blob.text()`, which jsdom lacks, so it now reads the blob through FileReader like the sibling test. Final `pnpm test`: 15 failed | 1414 passed | 221 skipped; every remaining failure is in `server/index.cli.test.ts` (13), `server/photo-relocate.cli.test.ts` (1), `server/photo-sweep.cli.test.ts` (1). These spawn the server / CLI as subprocesses (WSL on /mnt/d); this diff changes no `server/**` file (git status shows none), and all 907 `src` tests pass (`vitest run src`: 1 failed before fix 2, 0 after). The server failures are platform / environment related. I did not re-run them on origin/main (no second install available without touching node_modules), so "also fails on main" is not demonstrated, only that no server file is touched. One earlier run also showed `server/ai/tagPhoto.test.ts` 413 ECONNRESET (the known early-close flake), which passed in the final run.
- build: PASS (vite build, built in 3.7 s).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Server CLI tests (index.cli, photo-relocate.cli, photo-sweep.cli) fail in WSL on /mnt/d; worth confirming on main.
- `useJsonRestore` takes a third argument `onClose` (for the "Xong" button), which the plan's signature did not list.

### Scope self-check
- Could the diff be smaller? No; every file is in the plan list. No CSS change.
- Diff size: about +750 / -50 lines including tests (`git diff --stat` plus two new source files and one new test file).
