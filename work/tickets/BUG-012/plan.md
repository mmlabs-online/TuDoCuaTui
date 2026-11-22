Status: READY

# Plan — BUG-012: Outfit suggestion says "Mùa Đông" in hot weather

## Scope summary
Scope reference is the bug report in `work/tickets/BUG-012/ticket.md`.

> **Expected:** "The heading describes what actually drove the suggestion. When weather is on, show the weather kind
> (e.g. "Trời nóng") or the seasons used, not a calendar winter that contradicts the tags."

> **Scope:** "Make the heading match the season/weather actually used (e.g. return the `wanted` seasons or a weather
> label from `eligibility()` and render that)."

> **Out of scope:** "Regional season tables per city, and outfit ranking itself (BUG-013)."

`docs/feature-list.md` F-704: "\"Hôm nay mặc gì?\": suggests 3 outfits from active items using season, weather
(optional) and stale items first." `work/decisions.md` has no entry on outfits, weather or seasons.

**Root cause confirmed, with one addition.**
- `src/features/outfits/suggest.ts:96` takes the calendar season. Lines 99-101 compute the real `wanted` seasons, but
  line 115 returns only the calendar `season`, and line 182 passes it out as `Suggestion.season`.
- `src/features/outfits/OutfitsModal.tsx:235` renders it through `COPY.season` (`copy.ts:7`), giving "Mùa Đông".
- Addition: the same value drives the "season" chip. `suggest.ts:172` tests the item against the calendar season and
  `OutfitsModal.tsx:269` labels it, so a hot November day can show "Hợp mùa Đông" next to "Trời nóng". This is the same
  contradiction from the same cause, so it is fixed here.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "A regression test reproduces the bug: it fails on `main` before the fix and passes after" | T1 and T2 below. `impl-log.md` records their failing output before the fix: T1 fails on the `"season"` reason, T2 receives "Mùa Đông". Both pass after. |
| 2a | Hot weather: the heading is "Trời nóng", never a calendar season | T2 |
| 2b | Cold weather: the heading is "Trời lạnh" | T3 |
| 2c | No weather signal (off, failed, mild, rain only): the heading stays "Mùa {calendar}" | T4, T5, T6 |
| 2d | No "Hợp mùa Đông" chip on a hot day; the chip reflects the seasons actually used | T1, T7, T8, T9 |
| 2e | The AI request is unchanged (calendar season id plus weather flags) | T10 and the existing test "AI on: sends pool ids, season DB id and weather flags" |
| 3 | "All checks pass." | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
On production, open "Hôm nay mặc gì?" and choose a city whose max today is at least 32°C. The heading reads "Trời
nóng". This depends on the real forecast, so it is not a reviewer check.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/outfits/suggest.ts` | Add `seasons: string[]` to `Eligibility` and `Suggestion`, de-duplicated; match the "season" reason against it | Exposes the seasons actually used; fixes the chip | No |
| `src/features/outfits/copy.ts` | Add `heading(season, { cold, hot })` and `reasons.seasonFit: "Hợp mùa"`; share the two weather labels through module constants | R6: copy stays in one place | No |
| `src/features/outfits/OutfitsModal.tsx` | Line 235 uses `COPY.heading`; line 269 uses `seasonFit` when cold or hot | Renders the fix | No |
| `src/features/outfits/suggest.test.ts` | T1, T7, T8, T9 | Regression and pure logic (R8) | No |
| `src/features/outfits/OutfitsModal.test.tsx` | T2-T6, T10 | Modal behaviour | No |
| `src/features/outfits/copy.test.ts` | T11 | New copy helper | No |

Do not change `server/**` (High path), `src/data/aiOutfits.ts`, `src/index.css`, `seasonOf`, `outerWanted`, the pool
logic or ranking.

## Tests to write
Add `const NOV = Date.UTC(2026, 10, 20, 5)` to both test files. Modal tests call `vi.setSystemTime(NOV)` **before**
rendering, and read the heading with `document.querySelector(".outfit-season")?.textContent`, because "Trời nóng" also
appears in every chip and `getByText` would match several elements.

| Test (file › name) | Covers |
|---|---|
| **T1 (regression, first)** `suggest.test.ts` › weather › "hot weather in a winter month does not report Đông" | Only item: `mk("Đầm", { seasons: ["Đông"], lastWorn: iso(NOV, 2) })`, weather `w(34, 84)`, `NOV`. Assert **first** that `outfits[0].reasons` does not contain `"season"` (a behavioural failure on `main`), then `seasons` equals `["Hạ"]`. |
| **T2 (regression)** `OutfitsModal.test.tsx` › "hot weather in November: heading is Trời nóng, not Mùa Đông" | UAT case: `ho-chi-minh`, 25–34°C, rain 84%. Heading equals `OUTFITS_COPY.reasons.hot`. |
| T3 `OutfitsModal.test.tsx` › "cold weather: heading is Trời lạnh" | `maxC: 20`, in NOV |
| T4 `OutfitsModal.test.tsx` › "weather off in November: heading stays Mùa Đông" | No place selected |
| T5 `OutfitsModal.test.tsx` › "weather failed in November: heading stays Mùa Đông" | Client rejects |
| T6 `OutfitsModal.test.tsx` › "mild rainy day in November: heading stays Mùa Đông" | `maxC: 30`, rain 84% (boundary: just below hot) |
| T7 `suggest.test.ts` › weather › "seasons reports the seasons actually used" | No weather and mild → `[calendar]`; hot in NOV → `["Hạ"]`; hot in SEPT → `["Thu", "Hạ"]`; cold in JULY → `["Đông"]`; cold in March → `["Xuân", "Đông"]`; **no duplicates:** hot in JULY → `["Hạ"]`, cold in JAN → `["Đông"]` |
| T8 `suggest.test.ts` › weather › "season reason follows the seasons used" | Hot in NOV with a Hạ item has `"season"`; cold in JULY with a Đông item has `"season"`; cold in JULY with a Hạ-only fallback item does not |
| T9 `OutfitsModal.test.tsx` › "hot weather chip says Hợp mùa, never Hợp mùa Đông" | Hot NOV with a Hạ item: `reasons.seasonFit` is shown, "Hợp mùa Đông" is absent |
| T10 `OutfitsModal.test.tsx` › "AI on, hot in November: still sends the calendar season with hot=true" | `input.season === "winter"`, `input.weather.hot === true` (pins assumption A1) |
| T11 `copy.test.ts` › "heading" | hot → "Trời nóng"; cold → "Trời lạnh"; neither → "Mùa Thu"; `reasons.seasonFit` → "Hợp mùa" |

Existing assertions must stay unchanged, including `copy.test.ts:8,10` and `OutfitsModal.test.tsx:274` (`"summer"`).

## Approach
1. Write T1 and T2. Run them on the unchanged code and record the failures in `impl-log.md`.
2. `suggest.ts`: in `eligibility()`, return `seasons: [...new Set(wanted)]`. The set is required: line 101 yields
   `["Hạ", "Hạ"]` when hot in a Hạ month, and line 100 yields `["Đông", "Đông"]` when cold in a Đông month.
3. `suggest.ts`: keep `season` on `Suggestion`, add `seasons`, and change line 172 to
   `main.some((i) => i.seasons.some((s) => seasons.includes(s)))`.
4. `copy.ts`: add module constants for "Trời lạnh" and "Trời nóng", used by both `reasons` and `heading`. Do not
   reference `OUTFITS_COPY` inside its own initializer, which risks a circular type error under `as const`.
   `heading` returns hot label, else cold label, else `Mùa ${season}`.
5. `OutfitsModal.tsx`: line 235 becomes `COPY.heading(season, { cold, hot })`, using the flags from line 111. Line 269
   uses `COPY.reasons.seasonFit` when `cold || hot`, otherwise `COPY.reasons.season(season)`.
6. Add the remaining tests and run all checks.

Rules:
- **R1:** no data access changes.
- **R5:** nothing is stored.
- **R6:** all new Vietnamese copy is in `copy.ts`.
- **R7:** the diff stays inside the file list.
- **R8:** pure logic has unit tests.
- **R9:** same element and class, with a shorter or equal text length, so 390px and dark mode are unaffected.

Expected size: about 15 production lines and 100 test lines.

## Specialist input used
From `consult-frontend-developer.md`:
- **Adopted:** rec 1 (additive `seasons`, keep `season`), rec 2 (heading rules), rec 3 (chip uses `wanted`, neutral
  "Hợp mùa"), rec 5 (test set), and the risk note that rain-only and mild days must not change.
- **Adopted as defaults:** open questions 1-3, see A1-A3.
- **Corrected:** the consult treats `wanted` as ready to return. It can contain duplicates, so the plan de-duplicates it
  and T7 pins this.
- **Rejected:** optional "· Có mưa" in the heading (consult default is no; the chip already shows rain).

## Assumptions
**For Ming to confirm in the PR:**
- **A1 (consult Q1): the AI request keeps the calendar season.** The AI already receives the `hot`/`cold` flags and a
  weather-filtered pool, and the effective season can be two values while the API accepts one. Residual risk: the
  prompt can read "season winter … hot=true", so a free-text AI reason could still mention winter. Changing this is a
  separate ticket.
- **A2 (consult Q2): the heading does not include rain.** The "Có thể mưa" chip already covers it.
- **A3 (consult Q3): hot always reads "Trời nóng"**, in every month, including Hạ months where it used to read
  "Mùa Hạ". Cold likewise always reads "Trời lạnh", including Đông months.
- **A4: chip wording.** On hot or cold days the chip reads "Hợp mùa", without a season name.
- **A5: a warm day under 32°C in November still reads "Mùa Đông".** For example, TP. Hồ Chí Minh at 30°C. The heading
  is accurate about what drove the suggestion, since the calendar season is used and Khoác is still added
  (`suggest.ts:119`), and no tag contradicts it. The UAT's "Southern cities have no winter" needs regional seasons,
  which the ticket puts out of scope. Proposed follow-up: a `debt` issue.
- **A6: with weather "Tắt" the heading stays "Mùa {calendar}".** The ticket's Expected covers "when weather is on", and
  with no city selected there is no better signal.

**Other:**
- **A7: hotspots.** No ticket in `IN_PROGRESS`, `REVIEW` or `DONE` edits these files. T-032 (BACKLOG) edits
  `suggest.ts` and `OutfitsModal.tsx`; BUG-013 (BACKLOG, depends on this ticket) edits `suggest.ts`, `copy.ts` and the
  modal. Keeping `season` limits their rebase.
- **A8: tracking mismatches, not changed here.** The ticket says S2/P1, the UAT report says S3/P2. The ticket has
  `Gate: none` and `loop.config.md` uses the `high-paths` policy, and this plan touches no High path, but workspace
  `CLAUDE.md` §8 lists "PLAN approval for P1 tickets" as a human gate. The orchestrator should resolve this before
  implementation.

## Blocking questions
None

## Split proposal
None
