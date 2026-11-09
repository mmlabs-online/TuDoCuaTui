Status: READY

# Plan — F-401: Make search diacritic-insensitive

## Feature summary
`docs/feature-list.md` F-401:
> - Normalise with NFD, strip diacritics and handle `đ`, so "ao so mi" matches "Áo sơ mi".
> - Search across name, brand, colors, tags, material, notes and location.
> - **AC:** unit tests for the normaliser.

Ticket scope:
> - `src/lib/text.ts`: `normalize(s)` = lowercase, NFD, strip combining marks, `đ/Đ` → `d`, collapse spaces.
> - Search across name, brand, colors, tags, material, notes and location. Today it searches only name, brand, colors and notes.
> - Update the search placeholder to match.

`work/decisions.md` D8 (constrains the API, not this ticket's scope):
> A CSV location matches an existing location whose `normalize()`d name is equal (case/diacritic-insensitive, trimmed) … — F-601.2

So `normalize` must be a standalone, exported, pure function and must also **trim**. Out of scope (ticket): fuzzy matching or typo tolerance.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Unit tests for the normaliser: every Vietnamese vowel with every tone, `đ`, mixed case, and both composed and decomposed input | `src/lib/text.test.ts` contains the tests listed below; `npx pnpm@10.34.3 test` green |
| 2 | "ao so mi", "AO SƠ MI" and "Áo sơ mi" give the same results | `filters.test.ts › matchesFilters › query is diacritic- and case-insensitive` — an item named "Áo sơ mi" matches all three queries, and a non-matching item matches none |
| 3 | Searching a tag or a location finds the item | `filters.test.ts › matchesFilters › query matches every searchable field` — tag, location and material each matched (including unaccented, e.g. "tu ngan 1" → location "Tủ ngăn 1") |
| 4 | Search covers name, brand, colors, tags, material, notes, location (feature list) | Same test as #3 covers all seven fields; a field outside the list (`size`) is shown not to match |
| 5 | Placeholder updated to match | `src/App.tsx` diff is one line: the `placeholder` of the search input lists the seven fields (text in Approach step 4); observable in `pnpm dev` (local mode) |
| 6 | Coverage gate includes the new module | `vitest.config.ts` adds `src/lib/text.ts` to `coverage.include` and to `coverage.thresholds` with the shared `thresholds` object; `npx pnpm@10.34.3 test:coverage` green |
| 7 | Checks green (R8) | `npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build` all pass |

## Ming verification after merge
- Type unaccented queries on a phone keyboard (ticket "Manual" test plan), e.g. "ao so mi", "xanh", a location without accents, and confirm the list filters as expected at 390px.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/text.ts` | **Create.** Export `normalize(s: string): string` | Ticket scope; D8 / F-601.2 reuse it |
| `src/lib/text.test.ts` | **Create.** Unit tests for `normalize` | AC 1, R8 |
| `src/features/items/filters.ts` | Build the haystack from the seven fields and compare `normalize(hay).includes(normalize(query))` | AC 2–4 |
| `src/features/items/filters.test.ts` | Replace the "diacritic-sensitive (records current behaviour)" test; extend the field-coverage test | AC 2–4; the old test asserts the behaviour this ticket removes |
| `src/App.tsx` | Placeholder string of the search input (currently line ~715) **only** | Ticket scope "Update the search placeholder" |
| `vitest.config.ts` | Add `src/lib/text.ts` to `coverage.include` and `coverage.thresholds` | Keep new pure logic under the 80% gate (R8, D6 style) |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `text.test.ts › normalize › strips every tone from every vowel` | Table-driven: for each base vowel `a ă â e ê i o ô ơ u ư y`, all six tone forms (none, sắc, huyền, hỏi, ngã, nặng), written out as literal composed strings, e.g. `"aáàảãạ"`, `"ăắằẳẵặ"`, `"âấầẩẫậ"`, `"eéèẻẽẹ"`, `"êếềểễệ"`, `"iíìỉĩị"`, `"oóòỏõọ"`, `"ôốồổỗộ"`, `"ơớờởỡợ"`, `"uúùủũụ"`, `"ưứừửữự"`, `"yýỳỷỹỵ"` → each char normalises to `a`/`e`/`i`/`o`/`u`/`y` |
| `text.test.ts › normalize › handles uppercase vowels with tones` | Same table upper-cased (e.g. `"ẮẰẲẴẶ"`, `"ỨỪỬỮỰ"`) → lowercase base letter |
| `text.test.ts › normalize › maps đ and Đ to d` | `"đồ"` → `"do"`, `"Đầm"` → `"dam"`, `"ĐĐ"` → `"dd"` |
| `text.test.ts › normalize › composed and decomposed input give the same result` | `normalize(s) === normalize(s.normalize("NFD"))` and `=== normalize(s.normalize("NFC"))` for `"Áo sơ mi"`, `"Tủ ngăn 1"`, `"Xanh dương"`; result `"ao so mi"` etc. |
| `text.test.ts › normalize › lowercases mixed case` | `"AO SƠ MI"`, `"Áo Sơ Mi"`, `"ao so mi"` → all `"ao so mi"` |
| `text.test.ts › normalize › collapses and trims whitespace` | `"  Áo   sơ\tmi \n"` → `"ao so mi"`; `""` → `""`; `"   "` → `""` |
| `text.test.ts › normalize › leaves ASCII, digits and punctuation unchanged apart from case` | `"Zara-2024, M/L"` → `"zara-2024, m/l"` |
| `filters.test.ts › matchesFilters › query is diacritic- and case-insensitive` | Item `name: "Áo sơ mi"`: `"ao so mi"`, `"AO SƠ MI"`, `"Áo sơ mi"` all true; `"quan"` false. Also colors: `"xanh"` and `"xanh duong"` match `colors: ["Xanh dương"]`; `"do"` matches `colors: ["Đỏ"]` |
| `filters.test.ts › matchesFilters › query matches every searchable field` | Separate items each with one field set: name, brand, colors, tags (`["đi làm"]` ← `"di lam"`), material (`"Lụa"` ← `"lua"`), notes, location (`"Tủ ngăn 1"` ← `"tu ngan 1"`) → true; item with only `size: "XL"` and query `"xl"` → false |
| `filters.test.ts › matchesFilters › blank or whitespace query matches everything` | `""` and `"   "` → true (normalised query is empty) |
| (keep) `filters.test.ts › query matches name, brand, colors and notes, case-insensitively` | Existing assertions still pass unchanged (`"ÁO"`, `"zara"`, `"XANH"`, `"ấm"`, `"quần"` false) — keep as regression |
| (delete) `filters.test.ts › query is diacritic-sensitive (records current behaviour)` | Removed: it asserts `"ao"` does **not** match `"Áo"`, which is the bug this ticket fixes. Its replacement is the diacritic-insensitive test above |

## Approach
1. **`src/lib/text.ts`** (pure, no imports):
   ```ts
   /** Lowercase, strip Vietnamese diacritics (đ → d), collapse and trim whitespace. Used for search and for matching names (D8). */
   export function normalize(s: string): string {
     return s
       .normalize("NFD")
       .replace(/[̀-ͯ]/g, "")
       .replace(/[đĐ]/g, "d")
       .toLowerCase()
       .replace(/\s+/g, " ")
       .trim();
   }
   ```
   Notes for the implementer: `đ/Đ` (U+0111/U+0110) do **not** decompose under NFD, hence the explicit replace. U+0300–U+036F covers every Vietnamese tone mark and the breve/circumflex/horn. Trim is required by D8 ("trimmed").
2. **`filters.ts`**: import `normalize` from `@/lib/text`; build
   `hay = normalize([i.name, i.brand, ...i.colors, ...i.tags, i.material, i.notes, i.location].join(" "))`
   and use `hay.includes(normalize(query))`. Leave every other condition in `matchesFilters`, and `sortItems`, unchanged. Do not add a cache/memo (item counts are small; out of scope).
3. **Tests**: write `text.test.ts`; in `filters.test.ts` delete the diacritic-sensitive test and add the three tests above.
4. **`App.tsx`**: change only the search input placeholder from `"Tìm theo tên, hãng, màu, ghi chú…"` to `"Tìm theo tên, hãng, màu, thẻ, chất liệu, ghi chú, vị trí…"`. No other edits. (Wording reuses the item form's labels; if the form uses different labels for tags/material/location, use the form's labels instead and record it in impl-log.)
5. **`vitest.config.ts`**: `include: ["src/data/**", "src/features/items/filters.ts", "src/lib/text.ts"]`; add `"src/lib/text.ts": thresholds` to `coverage.thresholds`.
6. Run checks: `npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build`.

Rules: R1 — no data access touched; local mode unaffected. R6 — the placeholder stays Vietnamese UI copy; code and comments English. R7 — only the files above. R8 — new pure logic with unit tests and coverage threshold. R9 — placeholder is longer; the input already exists and truncates with ellipsis natively; Ming checks 390px after merge. R10 — `vite.config.ts`/`AGENTS.md`/`.figma/` untouched (only `vitest.config.ts`). R2–R5 not applicable. Expected tier: Medium.

## Specialist input used
None (no `consult-*.md` for F-401).

## Assumptions
- **Hotspot `src/App.tsx`:** F-004.1 (running in parallel) is moving App.tsx code into components. This ticket changes only the placeholder string, so expect a trivial rebase/conflict on that one line; whoever lands second re-applies the new placeholder text wherever the search input ends up.
- The haystack joins fields with spaces, so a multi-word query can match across field boundaries (e.g. "zara xanh" over brand + color). This is today's behaviour and is kept; not a requirement either way.
- Query and haystack are both normalised, so the query's own spaces are collapsed/trimmed (`"  ao  "` behaves like `"ao"`); a whitespace-only query matches everything, same as an empty one today.
- Labels in `Item` (colors, location, category) are Vietnamese strings, so searching "xanh" matches "Xanh dương", "Xanh lá" etc. Category and status are **not** added to the text search: the feature list names exactly seven fields, and category already has its own filter.
- F-601.2 will import `normalize` from `@/lib/text` for D8; this plan fixes its name, path and trimming behaviour accordingly.
- `work/backlog.md` is not touched (D16).

## Blocking questions
None.

## Split proposal
None (estimated diff ~150 lines, mostly tests).
