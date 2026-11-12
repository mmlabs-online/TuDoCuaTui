# Review — T-017

## Attempt 1 — 2026-11-12
Verdict: PASS

Reviewed commit `e053dfb` ("T-017: replace the item category list") against its parent `a08ed80` only; T-005.6 (PR #40) changes on the same branch were not reviewed.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0 (both `tsc --noEmit` and `tsc -p tsconfig.server.json`).
- format:check: `pnpm format:check` exit 0, "All matched files use the correct format." (181 files).
- test: `pnpm test` with `TEST_DATABASE_URL` set (scratch PostgreSQL 16 under /tmp, scram-sha-256 auth): Test Files 68 passed (68), Tests 856 passed (856). The DB suites ran and were not skipped. Verbose run shows `api.db.test.ts:253` (enum as a set), `:267` (PUT round trip for all 10), `:275` (PUT bag → 400) and `schema.db.test.ts:253` (category v2 migration) all passing.
- test:coverage: `CI=true pnpm test:coverage`: 68 files / 856 tests passed; All files 95.09% stmts / 94.13% branch / 92.87% funcs / 95.36% lines.
- build: `pnpm build` built OK (`dist/assets/index-*.js` 249.74 kB).
- These numbers match impl-log.md attempt 1.
- Manual migration: created a DB with only `20261110120000_init.sql` and `20261112120000_item_photos_drive.sql` applied, inserted 16 init-era items (bag 4, sport 2, home 2, top 2, dress 2, accessory 2, other 2), then ran `runMigrations` on `db/migrations/`. Result: top 2, dress 2, accessory 6, other 6; total 16 (no row lost, no `bag`/`sport`/`home` left). `enum_range(item_category)` = `{top,bottom,dress,outer,shoes,bag,accessory,sport,home,other,set,ao_dai,bikini}`. A second `runMigrations` exited cleanly (no-op). The scratch cluster was stopped and deleted afterwards.
- R9 visual check: `vite preview` of the build in local mode (no env file present, only `.env.example`). Playwright with Chrome at 390×844, deviceScaleFactor 1, light and dark (`tu-do-theme`). Results:
  - Chip row: 11 chips in order `Tất cả, Áo, Quần/váy, Đầm, Set đồ, Giày/dép, Áo dài, Khoác, Bikini, Phụ kiện, Loại khác`. `overflow-x: auto` (row clientWidth 342, scrollWidth 1139). No chip clips its own text. Document scrollWidth is 390, so the page does not scroll sideways. After scrolling the row to the end, "Loại khác" is fully visible (x 255–366) and filters to the empty state.
  - Editor "Loại" select options are exactly the 10 labels in order. "Áo dài" can be selected and renders correctly in both themes.
  - No page errors. Screenshots are in `/tmp/claude-0/-home-user/aafbf682-40d8-5602-b00c-ec6ad7f9275a/scratchpad/t017-review/shots/` (`{light,dark}-chips-start.png`, `-chips-end.png`, `-filter-loai-khac.png`, `-editor-category.png`, `-home.png`).

### Acceptance criteria
- [x] Editor, filter bar and item card show exactly the 10 categories in order (plus "Tất cả") — evidence:
  - `src/data/mappers.ts:24-35` (key order = display order) and `src/constants/wardrobe.ts:35-48` (icons).
  - Tests `src/constants/wardrobe.test.ts:15`, `src/App.test.tsx:78` and `src/features/items/Editor.test.tsx:147`.
  - `ItemCard.tsx:53` renders `item.category`, the label.
  - The Playwright run above.
- [x] An item can be saved with each of the 10 categories in API mode and local mode, and reloads with the same category — evidence:
  - API mode: `server/api.db.test.ts:267` (real Postgres, PUT then GET for each id).
  - Mapper round trip: `src/data/mappers.test.ts` "item → row → item keeps every label".
  - Local mode: `src/data/repo.local.test.ts:65` (a new repo instance reads the same storage).
- [x] After the migration no item has `bag`/`sport`/`home`; mapped per A1; no item lost — evidence:
  - `db/migrations/20261112140000_item_category_v2.sql:11-16`.
  - `server/schema.db.test.ts:253` checks ids, the 5→5 row count, that the wear count on the moved bag item is kept via `items_with_stats`, that all 10 ids are insertable afterwards, and that a second run is a no-op.
  - The manual 16-row run above.
- [x] `PUT /api/items` rejects a removed or unknown category with `invalidValue` — evidence:
  - `server/validate.js:7-19` (`CATEGORIES` has 10 ids; `DEPRECATED_CATEGORIES` is not in the accepted list).
  - `server/validate.test.ts:67` and `server/api.db.test.ts:275` (400 `invalid_input`/`category`/`invalidValue`).
  - Unknown values were already covered by the existing validate tests.
- [x] CSV: the template lists the new labels; old labels still import and map to the new categories — evidence:
  - Hint per A6: `src/features/import-export/copy.ts:45` and `ImportCsvTab.tsx:47`, tested by `src/App.test.tsx:355`.
  - Aliases: `csv/map.ts:85-86`, tested by `csv/map.test.ts:209` (Quần, Váy/Đầm, Áo khoác, Giày dép, Túi, bag, Đồ thể thao, sport, Đồ ngủ/ở nhà, home, Khác, upper case without diacritics).
  - Empty category → "Loại khác": `map.ts:168`.
  - I checked that no alias normalizes to the same key as a current label or id (they are set after `lookup`, and none overlap).
- [x] Works at 390px and in dark mode (10 chips + "Tất cả" scroll without clipping) — evidence: the Playwright run and screenshots above.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: `createLocalRepo.load()` maps old labels on read (`src/data/repo.ts:34-42`). Demo items were re-tagged (`src/data/demo.ts`, still 16). Local mode ran in the browser check. No component calls a backend directly.
- R2: the DB change is a new file and leaves the init migration untouched. The Supabase path stays as it is per A4 and the ticket's out-of-scope section (no Supabase migration, `src/types/database.ts` not regenerated). `db/migrations` has no RLS concept here, the same as the existing files.
- R3/R4/R5: no secrets, storage or derived-value changes.
- R6: labels ↔ ids and aliases only in `src/data/mappers.ts:11-59`. The hint copy is in `copy.ts`.
- R7: every changed file is in the plan's file list. `demo.test.ts` (listed as "only if needed") was not touched, and `impl-log.md` is the log.
- R8: checks are green, and the new pure logic (`toCategoryLabel`, aliases, CSV aliases, local mapping, validation) has unit tests.
- R9: verified above.
- R10: `AGENTS.md`, `.figma/` and `vite.config.ts` were not touched.

### Nits (do not block)
- `src/data/mappers.ts:133`: the `as ItemInsert["category"]` cast hides the A4 gap in Supabase mode (saving `set`/`ao_dai`/`bikini` fails there). It is documented in the comment and in the plan; it goes away with T-016.
- `server/validate.js:4`: the comment line is longer than the surrounding ones. Formatting is still green.
- `src/data/repo.local.test.ts:65` only proves the round trip; it would also be worth asserting that the stored JSON holds the new label. The behaviour is correct either way.

### Follow-ups (out of scope)
- Supabase mode cannot save Set đồ / Áo dài / Bikini (A4) until T-016 removes the Supabase path.
- Ming re-tags skirts from Đầm to Quần/váy by hand.
- Optional demo items for Áo dài / Bikini (A7; their chips currently show 0).
- F-701 AI tagging prompt and allowed ids need the new list when that feature is built.

### Security should-fix (added by orchestrator; Ming chose "fix before PR", 2026-11-12)
- 🟡 `src/data/mappers.ts:57-58` — `toCategoryLabel` uses `in` on plain objects, so prototype keys (`constructor`, `toString`, `__proto__`) are treated as matches instead of falling back to "Loại khác" (A9). Fix: own-property lookups (`Object.hasOwn`, or `Object.create(null)`/`Map`) for `CATEGORY_TO_DB`, `CATEGORY_FROM_DB`, `CATEGORY_ALIASES`, plus a `typeof v !== "string"` guard; test that `constructor`, `__proto__`, `toString` → "Loại khác" (also fix the `in` use in `mappers.test.ts:146-148`). Details: security-review.md Attempt 1.

→ Attempt 1 goes to **REWORK** for this item only (orchestrator, per Ming's choice).
