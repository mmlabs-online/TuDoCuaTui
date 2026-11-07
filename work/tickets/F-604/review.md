## Attempt 1 — 2026-11-07
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit`, no errors
- format:check: "All matched files use the correct format." (32 files)
- test: 5 files passed, 74 tests passed (matches impl-log)
- build: `vite build` ✓ built in 308ms

### Acceptance criteria
- [x] A value with `"`, `,` and a newline survives an export → `parseCsv` round trip. Evidence: `serialize.test.ts › round trip › value with quote, comma and newline survives` (name `Áo, dài`, notes `Nói "đẹp", mặc\nđi tiệc`) and `› several items keep column alignment`, both pass. Per the plan, they use a test-local RFC 4180 reader (`serialize.test.ts:27-59`, marked temporary) because `parseCsv` (F-601.1) is not on `main`. Exact-string quoting tests (`› quoting › …`) do not depend on that reader. F-601.2 AC2 covers the real `parseCsv` round trip.
- [x] The file opens in Excel with Vietnamese text intact. Preconditions are met: `› file › starts with the UTF-8 BOM` (exactly one BOM; byte check confirms `serialize.ts:3` is U+FEFF, EF BB BF), `› uses CRLF between records`, and `› quoting › Vietnamese diacritics pass through unchanged`. `App.tsx:534` builds the Blob from `toCsv(items)` with no second BOM, MIME `text/csv;charset=utf-8`. The real Excel and Sheets check is Ming's (below).
- [x] Re-import through F-601 works (deferred by the ticket until F-601.2). Precondition is met: `› headers › are exactly the English ids F-601.2 accepts, plus wear_count and last_worn` (header line equals the 13 F-601.2 ids + `wear_count,last_worn`).
- [x] Local mode still exports (R1). `download` reads the already-loaded `items` and makes no Supabase call. JSON branch unchanged. `toDateOnly` handles both the local ISO timestamp and the Supabase date-only `lastWorn` (`› toDateOnly ›` tests, including the UTC+7 boundary 16:59:59Z / 18:30Z).

### Ming verification after merge
- Open an exported `tu-do-cua-toi.csv` in **Excel (Windows)** by double-click. Check that Vietnamese diacritics are intact, there is one column per field, and a multi-line note stays in one cell.
- Import the same file into **Google Sheets** and check for the same result.
- If Windows uses the vi-VN list separator (`;`), Excel may put everything in one column on double-click. Report it so it becomes a follow-up. "Data → From Text/CSV" works regardless.

### Issues
None.

### Scope
Changed files: `src/App.tsx` (only `download` + one import), `src/features/import-export/csv/serialize.ts`, `serialize.test.ts`, which are exactly the plan's list. The other changes are `work/tickets/F-604/{plan,impl-log,ticket}.md`, which are workflow files. No out-of-plan changes.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no direct supabase use, works on local items. R3/R4: no photo paths or URLs exported. R5: wear values are exported, never stored. R6: English headers, labels as stored on `Item`, no new UI copy. R8: the pure module has unit tests. R9: no UI change. R10: `vite.config.ts`, `AGENTS.md` and `.figma/` untouched.

### Nits (do not block)
- `serialize.ts:3` and `serialize.test.ts:30,75,76,79` contain a literal invisible U+FEFF. It works and passes format:check, but `"﻿"` (and `/^﻿/`) would be visible in review and safe from editors that strip BOM-like characters.
- `toCsv` uses `i.price > 0`, so a missing or `NaN` price from old localStorage exports as empty. This is fine; just noting the implicit coercion.

### Follow-ups (out of scope)
- Swap the test-local reader in `serialize.test.ts` for `parseCsv` once F-601.1 merges (record as `debt` or a note on F-601.2).
- A tag or color containing `|` or `;` splits on re-import (F-601 splits on both).
- CSV formula-injection escaping (values starting with `=`, `+`, `-`, `@`).
- Add `serialize.ts` to the coverage thresholds in `vitest.config.ts`.
- Excel with the vi-VN `;` list separator: only if Ming hits it.
