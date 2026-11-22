Findings
- Root cause confirmed. `eligibility()` computes `wanted` (suggest.ts:99-101) but returns only the calendar `season` (suggest.ts:96,115). `suggestOutfits` passes that through as `Suggestion.season` (suggest.ts:59,134,182).
- Same calendar season leaks in three more places:
  - The "season" reason: `main.some(i => i.seasons.includes(season))` (suggest.ts:172) renders "Hợp mùa Đông" via `COPY.reasons.season(season)` (OutfitsModal.tsx:269, copy.ts:12). It is wrong on a hot November day.
  - The AI request: `seasonId = SEASON_TO_DB[season]` (OutfitsModal.tsx:112) is sent to the AI at :140 and is part of the cache key at :115. On a hot day in November the AI is told "winter".
  - `outerWanted` (suggest.ts:119) already handles hot correctly. Leave it.
- The only non-test consumers of `Suggestion.season` are OutfitsModal.tsx:99 (destructure), :112, :235 (heading) and :269. No other file imports `Suggestion`. `copy.ts:7` is the heading formatter, and `copy.test.ts:8,10` pin its current strings.
- `weatherKind` (suggest.ts:48-55): cold is maxC<=24, hot is maxC>=32, rain is chance>=60. Mild is neither cold nor hot. Cold and hot are mutually exclusive in practice. Rain is independent, so the HCM case is hot+rain.
- Cold-only handling is also odd. In a Hạ month, cold gives wanted = ["Đông"] (the "Hạ" filter drops the calendar season). In a Xuân month, cold gives ["Xuân","Đông"], i.e. several seasons.

Recommendations
1. Smallest fix: add `seasons: string[]` (the `wanted` array) to `Eligibility` and return it from `suggestOutfits`. Keep `season` (the calendar season) on `Suggestion` so BUG-013 and T-032 don't churn, but stop the heading from using it. Alternatively, add a derived `effectiveSeason` (see Open questions). A new field is additive and does not conflict with T-032.
2. Heading (OutfitsModal.tsx:235, copy.ts:7):
   - Weather off or loading or failed, or mild: "Mùa {calendar}". Same as today.
   - Hot: "Trời nóng". Do not show "Mùa Hạ", because hot in Xuân would otherwise read as "Hạ".
   - Cold: "Trời lạnh".
   - Rain is secondary. Optionally append "· Có mưa", though the tags already show it. Leave it out for XS.
   - Several seasons (cold in Xuân, ["Xuân","Đông"]): when cold or hot drives it, the weather label wins, so no joined list is needed. Joined seasons would only appear if the heading ever lists `wanted` directly. That is not recommended.
3. Reason chip: use the same `wanted` for the match (`i.seasons.some(s => wanted.includes(s))`), and label it with a neutral "Hợp mùa" or the weather label. Otherwise "Hợp mùa Đông" still contradicts the page. This is the same root cause, so it belongs in the diff.
4. AI season id: decide between keeping the calendar season (the AI already receives the cold/hot flags) and sending the effective season. Either is defensible. Do not widen the fix silently. See the Open questions.
5. Tests:
   - suggest.test.ts: hot weather in a November (winter) month reports hot and does not report Đông in `seasons` (fails on main).
   - suggest.test.ts: cold in a Hạ month gives `seasons` ["Đông"]. Cold in Xuân gives ["Xuân","Đông"]. Weather off gives [calendar season].
   - suggest.test.ts: a "season" reason is not added for a Đông-only item when hot in November.
   - OutfitsModal.test.tsx: heading reads "Trời nóng" and not "Mùa Đông" with hot weather in November. Add one case for weather off ("Mùa Đông") and one for cold.
   - copy.test.ts: new heading helper strings.
   - Keep the existing test at OutfitsModal.test.tsx:264 passing ("summer").

Risks
- T-032 and BUG-013 both touch suggest.ts and OutfitsModal.tsx. Keep the diff to the return shape and the heading line so merges stay trivial, and land BUG-012 first (BUG-013 depends on it).
- Changing the `Suggestion` shape breaks any BUG-013 or T-032 code that destructures `season`. This is another reason to keep `season`.
- Rain-only or mild days must not change today's output.

Open questions
1. Should the AI request keep the calendar season (smallest, default) or the effective season?
2. Should the heading include rain? Default: no.
3. Should hot in a non-winter month still say "Trời nóng" (default, consistent) or "Mùa Hạ"?
