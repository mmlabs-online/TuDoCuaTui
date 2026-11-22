# Frontend developer consult — BUG-013

## Findings
1. In `src/features/outfits/suggest.ts`:
   - `eligibility` calculates `wanted` seasons from the calendar season and weather (`cold` -> adds "Đông", removes "Hạ"; `hot` -> adds "Hạ", removes "Đông").
   - When no items in a category/role match `wanted` (`fit.length === 0`), `pools[role]` silently falls back to `all` (`pools[role] = fit.length ? fit : all`).
   - If the user's wardrobe has 0 items matching the wanted season (e.g. 0 items tagged "Đông" in cold weather, or all items tagged "Hạ"), all roles fall back to `all`.
   - In `suggestOutfits`, `rank(role)` shuffles and ranks strictly by `avoided` and `tier` (stale/never-worn), without checking whether an item fits the weather or has contrary tags like "Hạ". As a result, summer party dresses rank ahead of untagged or transitional clothes simply because they are unworn or stale.
   - The returned `Suggestion` object has `{ season, seasons, outfits }` without any indicator that a fallback occurred.
2. In `src/features/outfits/OutfitsModal.tsx`:
   - The modal renders `<p className="outfit-season">{COPY.heading(season, { cold, hot })}</p>`.
   - Each outfit card renders chips: `{r === "season" ? (cold || hot ? COPY.reasons.seasonFit : COPY.reasons.season(season)) : COPY.reasons[r]}`.
   - There is no message or banner informing the user when the wardrobe lacks items suitable for the season/weather.
3. In `src/features/outfits/copy.ts`:
   - All user-facing text is localized in `OUTFITS_COPY`. We need a dedicated copy function for the fallback notice (e.g., `fallbackNote: (s: string, w: { cold: boolean; hot: boolean }) => string`).

## Recommendations
1. **Extend `Suggestion` type**:
   - Add `fallback: boolean` to `Suggestion` (and optionally `Eligibility`).
   - `fallback` is `true` when no items in the wardrobe fit the wanted season (i.e. `fit.length === 0` across all active items / roles that entered the pool), or when all candidate units in the pool had to use fallback items.
2. **Sort/Preference in fallback pool**:
   - In cold weather (`cold === true`), when falling back, items not tagged "Hạ" must rank before items tagged "Hạ".
   - In `rank(role)`: add a sort penalty for summer items during cold weather fallback:
     `summerPenalty: cold && !inSeason(item) && item.seasons.includes("Hạ") ? 1 : 0`
     Sort order: `a.avoided - b.avoided || a.summerPenalty - b.summerPenalty || a.tier - b.tier || a.key - b.key`.
     This ensures non-summer items (such as items with no season tag or autumn/spring tags) are prioritized over summer party dresses/shorts.
   - Also in `candidatePool` (which feeds AI suggestions): ensure `pools[role]` places non-summer items ahead of summer items in fallback when cold, so AI prompt candidates also receive more season-appropriate items.
3. **UI Notice**:
   - When `fallback === true` and `outfits.length > 0`, display a note below `.outfit-season`:
     `<p className="outfit-fallback-note">{COPY.fallbackNote(season, { cold, hot })}</p>`
   - Vietnamese copy in `OUTFITS_COPY`:
     `fallbackNote: (s: string, w: { cold: boolean; hot: boolean }) => w.hot ? "Tủ đồ chưa có đồ cho trời nóng — gợi ý có thể chưa phù hợp." : w.cold ? "Tủ đồ chưa có đồ cho trời lạnh — gợi ý có thể chưa phù hợp." : \`Tủ đồ chưa có đồ cho mùa \${s} — gợi ý có thể chưa phù hợp.\``
   - Style `.outfit-fallback-note` with `color: var(--muted); font-size: 12.5px; margin: 0;`.

## Risks
1. Existing tests in `OutfitsModal.test.tsx` and `suggest.test.ts`:
   - Existing mock wardrobes in tests may have few items or mock seasons that trigger `fallback: true`.
   - Verify existing snapshot/text assertions; if any test checks `.outfit-season` or queries notes, ensure they remain intact.
2. AI suggestions toggle:
   - When AI is active, does the fallback notice stay visible or does AI note replace it?
   - The fallback note reflects wardrobe deficiency (the user literally doesn't have cold-weather clothes). It should remain visible so the user understands why even AI suggestions might include off-season clothes.

## Open questions
None — ticket scope and root cause are clearly defined.
