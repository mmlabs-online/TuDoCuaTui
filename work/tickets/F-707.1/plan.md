Status: READY

# Plan — F-707.1: Occasion enum and rule prefilter in the outfit pool

## Scope summary
- `docs/feature-list.md` E7 → F-707: *"**F-707.1 Occasion rules:** fixed occasion enum and a pure prefilter in the rule pool; candidate cap lowered. Runs after BUG-012 and BUG-013, which change the same `eligibility()` logic."*
- F-707 AC used by this slice (client side only; server enforcement is F-707.2): *"At most 20 candidates reach the provider, enforced on the server (target about 15 to 20, down from 40)."*
- AI stylist flow: *"the user picks an occasion (fixed enum, no free text) → rules prefilter the wardrobe → a cheap text model picks 3 outfits from metadata only"*. Non-goals: *"free-text occasions"*.
- OQ-7: *"Default: Ming supplies 4 to 6 occasions; the rules map them from category and existing tags only, with no schema change. Proposed list: "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch". **Answered (Ming 2026-11-22):** the proposed list, mapped from category and tags."*
- `docs/ai-stylist-notes.md` §2.4 (advice): *"Prefilter candidates with rules, from 40 down to about 15 to 20."*
- `work/decisions.md`: no entry on occasions (OQ-7's answer is recorded in the feature list). D53 (credits) is unaffected by this slice: there is no server or credit change.
- Ticket scope: the five ids `di_lam`, `di_choi`, `hen_ho`, `du_tiec`, `du_lich` with Vietnamese labels through `src/constants/` (R6); a pure prefilter from category and existing tags (no schema change); `candidatePool` cap from 40 to at most 20.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The occasion enum holds exactly the five values from OQ-7, with labels only through the mapper/constants layer. | `occasion.test.ts` › "enum holds exactly the five OQ-7 occasions" (ids, labels, `isOccasionId`). Grep: the labels "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch" appear in `src/constants/occasions.ts` only, plus test files. |
| 2 | The prefilter is a pure function that maps occasions from category and tags only, with unit tests per occasion. | `occasion.test.ts` › `describe("fitsOccasion")` with one `it` per occasion (5), plus the normalisation and edge-case tests listed below. Code check: `fitsOccasion` reads only `item.tags` and `item.category`, and the file has no I/O, no `Date`, no randomness. `suggest.test.ts` › the "occasion:" cases for the pool step. |
| 3 | The candidate pool returns at most 20 items. | `suggest.test.ts` › "caps at 20" (`AI_CANDIDATE_CAP` is 20, 60 eligible → 20) and "round-robin keeps every role under the cap" (length `AI_CANDIDATE_CAP`). |
| 4 | Existing `suggest.test.ts` cases (including BUG-012/BUG-013 behaviour) still pass. | `pnpm test`. Every existing case is unchanged except the two cap assertions (40 → `AI_CANDIDATE_CAP`/20), which AC 3 requires. The BUG-012 case ("hot weather in a winter month does not report Đông") and the BUG-013 cases ("cold weather with no Đông items flags the fallback", "in cold weather fallback, items not tagged Hạ rank before summer items") are untouched and pass. `OutfitsModal.test.tsx` passes unchanged. |
| 5 | All checks pass (format, typecheck, test, build). | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green. |

## Ming verification after merge
None. No caller passes an occasion until F-707.4. The only user-visible change is that AI suggestions get at most 20 candidates instead of 40. The server still accepts up to 40 (`server/ai/outfitSuggest.js:9`); F-707.2 lowers that.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/constants/occasions.ts` (new) | `OCCASION_IDS` (5 ids, `as const`), `type OccasionId`, `OCCASION_LABELS: Record<OccasionId, string>` (Vietnamese labels), `isOccasionId(v: unknown)`. | AC 1; R6 (labels only in constants) | No |
| `src/features/outfits/occasion.ts` (new) | Pure rules: `OCCASION_TAG_KEYWORDS` (normalised keywords per occasion), `OCCASION_CATEGORIES` (category ids allowed for untagged items), `tagOccasions(tags)`, `fitsOccasion(item, occasion)`. | AC 2; pure logic in a plain module (planner rule 6, R8) | No |
| `src/features/outfits/occasion.test.ts` (new) | Unit tests for the enum and `fitsOccasion`. | AC 1, AC 2; R8 | No |
| `src/features/outfits/suggest.ts` | `AI_CANDIDATE_CAP` 40 → 20; optional `occasion` in `eligibility` opts, `SuggestOptions` and `candidatePool` opts; occasion pool step after the season step; in `candidatePool`, items whose tags name the occasion sort before untagged ones. | AC 2, AC 3 | No |
| `src/features/outfits/suggest.test.ts` | Update the two cap assertions; add the "occasion:" cases. | AC 2–4; R8 | No |

No High path is touched. `server/**` (the 40 limit) and `OutfitsModal.tsx` are out of scope (F-707.2, F-707.4).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `occasion.test.ts` › "enum holds exactly the five OQ-7 occasions": `OCCASION_IDS` equals `["di_lam","di_choi","hen_ho","du_tiec","du_lich"]`; `OCCASION_LABELS` equals `{di_lam:"Đi làm", di_choi:"Đi chơi", hen_ho:"Hẹn hò", du_tiec:"Dự tiệc", du_lich:"Du lịch"}`; `isOccasionId` is true for each id and false for `"Đi làm"`, `"di lam"`, `"DI_LAM"`, `""`, `undefined`, `null`, `1` | AC 1 |
| `occasion.test.ts` › "each label is a keyword of its own occasion": `tagOccasions([label])` equals `{id}` for all 5 | AC 2; the labels and rules cannot drift apart |
| `occasion.test.ts` › `it.each` over the 5 occasions, "<id>: a tag for it matches, a tag only for another occasion does not, an untagged item follows the category rule". Cases: `di_lam` with tag "công sở"; `di_choi` with "dạo phố"; `hen_ho` with "date"; `du_tiec` with "tiệc cưới"; `du_lich` with "#dulich" | AC 2 (one test per occasion) |
| `occasion.test.ts` › "untagged Áo dài: excluded for di_choi and du_lich, included for di_lam, hen_ho, du_tiec; an Áo dài tagged 'đi chơi' fits di_choi" | AC 2 (category part of the rule) |
| `occasion.test.ts` › "tags match regardless of diacritics, case, NFD, extra spaces and punctuation": "ĐI LÀM", "di lam", NFD "Đi làm", "đi   làm", "#đi-làm" all give `di_lam` | Domain focus: diacritics and `đ` |
| `occasion.test.ts` › "keywords match whole words only": "update" does not give `hen_ho`; "tiệc" gives `du_tiec` | No false positives |
| `occasion.test.ts` › "an item tagged for two occasions fits both, and fits neither of the other three" (tags `["đi làm", "đi chơi"]`, and a single tag "đi làm, đi chơi") | AC 2 |
| `occasion.test.ts` › "unrelated, empty and blank tags count as untagged" (`["yêu thích", "cotton"]`, `[]`, `["", "  "]`) | Domain focus: empty fields |
| `suggest.test.ts` › "caps at 20" (renamed from "caps at 40"): 60 eligible → `AI_CANDIDATE_CAP`; `AI_CANDIDATE_CAP` is 20 | AC 3 |
| `suggest.test.ts` › "round-robin keeps every role under the cap": `toHaveLength(AI_CANDIDATE_CAP)` instead of 40; body otherwise unchanged | AC 3, AC 4 |
| `suggest.test.ts` › candidatePool "occasion: drops main pieces tagged only for another occasion" (3 Đầm tagged "đi làm", 3 tagged "du lịch", 1 untagged; `di_lam` → the 3 "đi làm" and the untagged one) | AC 2 |
| `suggest.test.ts` › candidatePool "occasion: items tagged for it come first within a role" (25 never-worn untagged Áo + 1 worn Áo tagged "hẹn hò"; `hen_ho` → the tagged one is first and present under the cap) | AC 2, AC 3 |
| `suggest.test.ts` › candidatePool "occasion: shoes, outer and accessory keep all their items when none fit" (Giày/dép tagged only "du lịch", occasion `di_lam` → still in the pool) | AC 2 (fallback) |
| `suggest.test.ts` › candidatePool "occasion: main pieces fall back to the season pool when the filtered ones cannot build an outfit" (only Áo + Quần/váy tagged "đi làm", occasion `hen_ho` → all of them returned; and Áo tagged "hẹn hò" + Quần/váy tagged "đi làm" only → both kept, because top alone cannot build an outfit) | AC 2 (fallback) |
| `suggest.test.ts` › candidatePool "occasion: runs after the season step" (July: Áo tagged "hẹn hò" with seasons `["Đông"]` and an untagged Áo with `["Hạ"]`; `hen_ho` → only the Hạ one) | AC 2, AC 4 (BUG-012/013 season logic unchanged) |
| `suggest.test.ts` › candidatePool "without an occasion, tags are ignored" (items tagged "đi làm" and "du lịch" all kept; result equals the call with `occasion: undefined`) | AC 4 |
| `suggest.test.ts` › suggestOutfits "occasion: main pieces come from the occasion" (3 Đầm tagged "đi làm", 3 tagged "du tiệc"; `di_lam`, seeds 1–10 → every main id is from the "đi làm" set) and "occasion undefined gives the same result as today" (`toEqual(run(items))`) | AC 2, AC 4 |
| `suggest.test.ts` › "occasion: does not mutate the input" (`structuredClone` check for `candidatePool` with an occasion) | Purity |

## Approach
1. **Constants** (`src/constants/occasions.ts`, R6). The ids come from the ticket and the labels from OQ-7, word for word. `isOccasionId` is exported for F-707.2/F-707.4. The server cannot import `src/` TS, so F-707.2 mirrors the list the same way `src/shared/ai/errors.ts` ↔ `server/ai/catalog.js` does today.
2. **Rules** (`src/features/outfits/occasion.ts`, pure, imports only `@/lib/text`, `@/data/mappers` and the constants):
   - A tag is matched with `normalize` from `src/lib/text.ts` (NFD, strip marks, `đ`→`d`, lowercase, trim), then `[^a-z0-9]+` → one space. A keyword matches when `` ` ${tag} ` `` contains `` ` ${keyword} ` ``, which means whole words only. `tagOccasions(tags): Set<OccasionId>`.
   - Default keyword table (normalised; each includes its own label, enforced by a test):
     - `di_lam`: "di lam", "dilam", "cong so", "van phong", "work", "office"
     - `di_choi`: "di choi", "dichoi", "dao pho", "cafe", "casual"
     - `hen_ho`: "hen ho", "henho", "date"
     - `du_tiec`: "du tiec", "dutiec", "tiec", "dam cuoi", "su kien", "party"
     - `du_lich`: "du lich", "dulich", "di bien", "travel", "beach"
   - `OCCASION_CATEGORIES` (category ids allowed for an item with no occasion tag): every rule role (`top`, `bottom`, `dress`, `set`, `ao_dai`, `shoes`, `outer`, `accessory`) for `di_lam`, `hen_ho` and `du_tiec`; all except `ao_dai` for `di_choi` and `du_lich`. `bikini`/`other` never reach the pool (`ruleRole`).
   - `fitsOccasion(item, occasion)`: the item's tags name `occasion` → true. Its tags name only other occasions → false. It has no occasion tag → `OCCASION_CATEGORIES[occasion]` includes `CATEGORY_TO_DB[item.category]`.
3. **Pool step** in `eligibility()` (`suggest.ts:100`), only when `opts.occasion` is set, applied to the season `pools` after they are built. This keeps the BUG-012/013 season and weather logic and the `fallback` flag exactly as they are:
   - Accompaniment roles (`shoes`, `outer`, `accessory`): `fit.length ? fit : all`.
   - Main roles (`dress`, `set`, `ao_dai`, `top`, `bottom`): filter each role. If the filtered mains can still build an outfit (any one-piece, or both top and bottom), use them. Otherwise keep the unfiltered season mains, so an occasion never leaves the user with no suggestion.
   - Item order inside each pool is kept, so the `rank`/`shuffle` call order of `suggestOutfits` is unchanged and the same seed gives the same result.
4. **`candidatePool`**: accept `occasion?`. In the per-role sort, add one key after the existing cold/Hạ penalty and before `byUnworn`: tags name the occasion → 0, otherwise 1. Without an occasion every item gets 0, so the order is the current one.
5. **Cap**: `AI_CANDIDATE_CAP = 20` and update its doc comment ("F-707.1; server limit lowered in F-707.2"). The round-robin loop is unchanged.
6. **Types**: `SuggestOptions` and both `opts` types get `occasion?: OccasionId`. No caller changes (`OutfitsModal.tsx` keeps calling without an occasion until F-707.4).
7. Run the checks: `pnpm format`, then `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Rules: R1 n/a (no data access). R5 n/a. R6 met (labels only in `src/constants/occasions.ts`; keywords are matching data in normalised ASCII form, not UI copy). R7: only the files above. R8: pure logic with unit tests. R9 n/a (no UI). Rough size: about 90 lines of source and 170 lines of tests.

## Specialist input used
No consult files. `docs/ai-stylist-notes.md` (advisory) adopted: §2.4 (rule prefilter, 40 → about 15 to 20, so the cap is 20, the top of the target range). §3 "Make `occasion` optional at first" is a server note for F-707.2. The client mirror here is optional too, which matches it.

## Assumptions
- **Mapping table is a reversible default.** OQ-7 fixes the list and the sources (category and tags) but not the per-occasion keywords or categories. The tables in Approach step 2 are a proposal: Ming can tune them in the PR or in a later solo change without changing the plan. With the current categories, category alone says little about an occasion, so most of the narrowing comes from tags. The `ao_dai` exclusion for `di_choi`/`du_lich` applies only to untagged items and is the least certain choice (people do wear ao dai for Tết outings and travel photos). If Ming disagrees, the fix is a one-line change to `OCCASION_CATEGORIES`.
- "Tagged for another occasion only → excluded" treats the user's tag as intent. The main-role fallback covers wardrobes where this would empty the pool.
- Bikini stays outside the rule roles, even for `du_lich`. Adding it would change outfit building (follow-up, not this ticket).
- No `occasionFallback` flag is returned yet. If F-707.4 wants to say "no item fits this occasion", it adds the flag then.
- Client cap 20 while the server still allows 40 is safe (stricter client). F-707.2 lowers the server limit.
- AC 4: the two cap assertions in "caps at 40" / "round-robin keeps every role under the cap" must change because AC 3 changes the cap. No other existing case is edited.
- Hotspots: no other open ticket (IN_PROGRESS, REVIEW or DONE: T-029, T-030, T-032, BUG-014, BUG-016, F-706.5) lists `suggest.ts`, `suggest.test.ts` or `src/constants/` in its plan. F-707.2 to F-707.4 (BACKLOG) build on this ticket.
- Gate: the ticket says `none`, and no High path is touched. Workspace rule §8 asks for PLAN approval on P1 tickets; the project's loop config uses the `high-paths` policy, so the orchestrator decides whether to show this plan to Ming.

## Blocking questions
None.

## Split proposal
None (about 260 changed lines, one cycle).
