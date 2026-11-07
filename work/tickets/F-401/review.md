## Attempt 1 — 2026-11-07
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: pass (`tsc --noEmit`, exit 0)
- format:check: pass ("All matched files use the correct format", 32 files)
- test: pass — 5 files, 85 tests (matches impl-log)
- test:coverage: pass, exit 0. `src/lib/text.ts` is 100% on all four metrics (coverage/lib/text.ts.html); the text reporter hides fully covered files, so text.ts/filters.ts/mappers.ts do not show up in the console table
- build: pass (`vite build`, 70 modules, 227.55 kB JS)

### Acceptance criteria
- [x] 1. Unit tests for the normaliser (every vowel × tone, đ, mixed case, composed + decomposed) — evidence: `src/lib/text.test.ts:20-58`, all green. The reviewer also checked independently: all 12 vowel groups × 6 tones + đ, in lower and upper case, each in raw/NFD/NFC form (438 inputs), gave 0 mismatches. Old vs new tone placement normalise to the same string: "Hoạ tiết" = "Họa tiết" → `hoa tiet`, "Hoà" = "Hòa", "Thuỷ" = "Thủy". NFD input whose marks are in reversed order still gives `e`.
- [x] 2. "ao so mi", "AO SƠ MI", "Áo sơ mi" give the same results — evidence: `filters.test.ts:84-91` (`query is diacritic- and case-insensitive`), with "quan" as the negative case.
- [x] 3. Searching a tag or a location finds the item — evidence: `filters.test.ts:93-105` (tag `"đi làm"` ← `"di lam"`, location `"Tủ ngăn 1"` ← `"tu ngan 1"`).
- [x] 4. All seven fields are searched; `size` is not — evidence: `filters.ts:26-28`, `filters.test.ts:93-105` (one item per field, plus the `size: "XL"` negative).
- [ ] 5. Placeholder updated to match — the one-line diff is at `src/App.tsx:715`, but its wording does not follow the plan's instruction. See Issue 1.
- [x] 6. Coverage gate includes the new module — evidence: `vitest.config.ts:25,31`; text.ts at 100%.
- [x] 7. Checks green — see above.

Search behaviour only got wider: in `matchesFilters` only the `hay` line and the query comparison changed (`filters.ts:26-30`). The category/status/season/location/color/stale conditions and `sortItems` are untouched. Blank or whitespace-only queries still match everything (`filters.test.ts:107-110`). The old regression test (`"ÁO"`, `"zara"`, `"XANH"`, `"ấm"`, `"quần"` false) is kept and passes.

Performance: `normalize` runs once per item for each `visible` recomputation (`App.tsx:496-501`, `useMemo` on `[items, query, category, filters, sort]`). That means every keystroke, not every render. A rough Node measurement with 1,000 synthetic items (notes about 240 chars) took about 18 ms per keystroke, including JIT warm-up; a few hundred items should take a few ms. That is acceptable for M1, and the plan explicitly excludes a cache. See Follow-ups.

### Ming verification after merge
- Type unaccented queries on a phone keyboard (e.g. "ao so mi", "xanh", a location without accents) and confirm the list filters correctly at 390px, in light and dark mode.
- Check how the longer placeholder truncates at 390px.

### Issues
#### Issue 1 — 🟡 should-fix — plan deviation / UI copy (R6)
- **Where**: `src/App.tsx:715`
- **Expected**: Plan Approach step 4: "if the form uses different labels for tags/material/location, use the form's labels instead and record it in impl-log." The item form labels the tags field `"Dịp / tag"` (`src/App.tsx:1178`). No field anywhere in the UI is called "thẻ".
- **Actual**: The placeholder uses `"thẻ"`. impl-log lists the mismatch under Follow-ups but does not apply the plan's rule, so users see a field name in the placeholder that appears nowhere else in the app.
- **Fix instruction**: Change the placeholder to `"Tìm theo tên, hãng, màu, tag, chất liệu, ghi chú, vị trí…"`. "tag" matches the form's "Dịp / tag", and "vị trí" is an acceptable short form of "Vị trí lưu trữ". Record the wording choice in impl-log Attempt 2. Change no other line.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data access touched, and local mode is unaffected (pure function in `src/lib/`). R2–R5: not applicable. R6: the placeholder is still Vietnamese and code/comments are English (wording issue above). R7: every changed file is in the plan's list; ticket.md/impl-log.md are process files. R8: the new pure logic has tests and a coverage threshold. R9: copy-only change, no layout or style edits; 390px/dark-mode check is under Ming verification. R10: no Figma Make files touched (`vite.config.ts`, `AGENTS.md` and `.figma/` unchanged).

### Nits (do not block)
- The `text.ts:1` doc comment line is about 130 chars long; oxfmt accepts it.
- `normalize` does not fold compatibility characters (e.g. NBSP is collapsed by `\s+`, which is fine; ligatures like "ﬁ" are not folded). This is irrelevant for Vietnamese input.

### Follow-ups (out of scope)
- If wardrobes grow past about 1,000 items or notes get long, precompute a normalised haystack per item (memoised on `items`) so typing only normalises the query.
- When F-004.1 moves the search input out of App.tsx, carry the new placeholder text with it (rebase note already in the plan).
