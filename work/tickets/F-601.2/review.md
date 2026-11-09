## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0
- format:check: `pnpm format:check` exit 0 ("All matched files use the correct format", 65 files)
- test: `pnpm test` exit 0 — 13 files, 251 tests passed (matches impl-log)
- test:coverage: `pnpm test:coverage` exit 0 — `map.ts` 100 % stmts / 95.94 % branches / 100 % funcs / 100 % lines (uncovered branches 140, 227–228); thresholds met
- build: `pnpm build` exit 0 (`✓ built`)

### Acceptance criteria
- [x] The UI template CSV maps to a valid item — `map.test.ts › template › CSV_TEMPLATE maps to one valid item with no errors` passes; `src/App.tsx:246` now uses `CSV_TEMPLATE` from `src/features/import-export/csv/template.ts:1`, so the test checks the string the UI shows (string identical to the removed inline one).
- [x] The F-604 export maps back with no errors — `map.test.ts › round trip › toCsv(starter) → parseCsv → mapRows …` (all 13 fields compared, `ignoredColumns = ["wear_count","last_worn"]`, D7) and `› value with quote, comma, newline and empty price survives` pass.
- [x] Invalid rows are reported and never block valid rows — `map.test.ts › rows › bad rows are reported with their row number …` (rows 2, 4 errors; A, C kept) and `› one row with several bad fields reports one error per field`; implementation collects per-row errors and only skips that row (`map.ts` `if (rowErrors.length) { errors.push(...); return; }`).
- [x] Header aliases VN + EN, case/diacritic/space-insensitive — `headers › every Vietnamese and English alias maps to its field` (13 pairs × 4 spellings), unknown/duplicate/blank header tests pass; alias table `map.ts` `ALIASES` has exactly the 13 ticket pairs.
- [x] Enums label or id, unknown → error — `enums ›` 4 tests; lookups built only from `CATEGORY_TO_DB`/`STATUS_TO_DB`/`SEASON_TO_DB`/`COLOR_TO_DB` (R6). Unknown colors are now rejected, closing the `COLOR_TO_DB[c] ?? c` gap noted in the ticket.
- [x] Multi-values split on `;` / `|` — `multi-values › splits on ; and |, trims, drops empties and duplicates`.
- [x] Name rule (required, ≤ 120, NFC length) — `validation › name …` 3 tests.
- [x] Price rule (890000 / 890.000 / 890,000, ≥ 0) — `validation › price accepts …`, `› price rejects -1, 12.5, 1.2345, 1.234,000, abc`.
- [x] Date rule (ISO, d/m/yyyy, real calendar, not future, UTC+7 default) — `validation › date …` 4 tests incl. fake-timer `2026-11-08T18:00:00Z` → today `2026-11-09`.
- [x] D8 location matching — `locations ›` 3 tests.
- [x] Coverage gate — `vitest.config.ts` adds `map.ts` to `include` and `thresholds`; coverage run green.
- [x] Checks green — see above.

Ming verification after merge: none (per plan).

### Scope
Changed files: `map.ts`, `map.test.ts`, `template.ts`, `messages.ts`, `src/App.tsx` (2 lines), `vitest.config.ts` (2 lines), plus ticket/plan/impl-log workflow files — all in the plan's file list. No out-of-plan files.
Deviation `parseDate` returning `{ ok, value | reason }` is a reasonable internal shape change (lets the mapper pick "bad" vs "future" message); `mapRows` contract unchanged. Quoting in the test helper is test-only.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: pure function, no data access, local mode untouched. R2/R3/R4: not touched. R5: wear columns ignored and reported (D7). R6: labels ↔ ids via `mappers.ts`; Vietnamese messages in `src/features/import-export/messages.ts`. R7: diff inside plan. R8: unit tests + coverage threshold. R9: no visible UI change. R10: `vite.config.ts`, `AGENTS.md`, `.figma/` untouched.

### Nits (do not block)
- 💭 `map.ts` location step registers a new location spelling even when the row ends up invalid, so a later valid row's location takes the spelling from an invalid row. Harmless (same normalized name), but registering only for valid rows would be cleaner.
- 💭 Defaults `"Khác"` / `"Đang dùng"` are string literals in `map.ts` (same as `rowToItem`); a shared constant would avoid drift.
- 💭 `parsePrice` accepts arbitrarily long digit strings (> `Number.MAX_SAFE_INTEGER`) without error.

### Follow-ups (out of scope)
- F-201: extract a shared `validateItem` and use it in the CSV mapper (plan assumption).
- Tags containing `;` or `|` do not round-trip exactly.
- `serialize.test.ts` still uses its temporary `readCsv`; switch to `parseCsv`.
