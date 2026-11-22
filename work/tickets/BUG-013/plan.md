# Plan: BUG-013 — Cold weather suggests an off-shoulder party dress and heels with no warning

Status: READY
Tier: Standard (touches client UI and pure logic only; Gate: none)

## 1. Goal
When a user's wardrobe has no items suitable for the current season or weather (e.g. cold weather with 0 "Đông" items), `suggestOutfits` clearly flags that a fallback occurred (`fallback: true`), the suggestion modal informs the user ("Tủ đồ chưa có đồ cho trời lạnh — gợi ý có thể chưa phù hợp."), and when it is cold, items not tagged "Hạ" rank before summer items in the fallback pool.

## 2. Root Cause
In `src/features/outfits/suggest.ts:111-114`:
- When no items in a role match the wanted seasons (`fit.length === 0`), `pools[role]` falls back to `all` silently.
- In `suggestOutfits`, `rank(role)` shuffles and ranks strictly by `avoided` and `tier` (stale/never-worn), ignoring the fact that an unworn item might be an off-shoulder summer party dress.
- `Suggestion` has no indicator that all or any items in the pool fell back to unseasonal items.
- The UI displays weather-driven chips ("Trời lạnh") on the fallback outfit without any note explaining that the wardrobe lacks cold-weather clothes.

## 3. Scope
- `src/features/outfits/suggest.ts`:
  - Determine `fallback: boolean`: `true` when no active items in the wardrobe fit the wanted season (`items.length > 0 && !hasInSeason`).
  - Add `fallback: boolean` to `Suggestion` type and return it in `suggestOutfits`.
  - In `rank(role)`: when `cold === true`, assign a penalty to items tagged `"Hạ"` (`summerPenalty: cold && item.seasons.includes("Hạ") ? 1 : 0`), sorting by `a.avoided - b.avoided || a.summerPenalty - b.summerPenalty || a.tier - b.tier || a.key - b.key`.
  - In `candidatePool`: when `cold === true`, sort candidates within each role by non-summer first before applying `byUnworn`.
- `src/features/outfits/copy.ts`:
  - Add `fallbackNote: (s: string, w: { cold: boolean; hot: boolean }) => string` to `OUTFITS_COPY`.
    - `w.hot` -> `"Tủ đồ chưa có đồ cho trời nóng — gợi ý có thể chưa phù hợp."`
    - `w.cold` -> `"Tủ đồ chưa có đồ cho trời lạnh — gợi ý có thể chưa phù hợp."`
    - otherwise -> `\`Tủ đồ chưa có đồ cho mùa \${s} — gợi ý có thể chưa phù hợp.\``
- `src/features/outfits/OutfitsModal.tsx`:
  - Destructure `fallback` from `useMemo(() => suggestOutfits(...))`.
  - When `fallback && outfits.length > 0`, render `<p className="outfit-fallback-note">{COPY.fallbackNote(season, { cold, hot })}</p>` under `.outfit-season`.
- `src/index.css`:
  - Style `.outfit-fallback-note` with `margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.4;`.
- Tests:
  - Regression test in `src/features/outfits/suggest.test.ts`: "cold weather with no Đông items flags the fallback" (and non-summer items rank before summer items).
  - UI test in `src/features/outfits/OutfitsModal.test.tsx`: "cold weather with no cold items displays fallback note".
  - Unit test in `src/features/outfits/copy.test.ts`: test `fallbackNote`.

## 4. Out of Scope
- Rain-specific restrictions (shoes/fabrics) and server AI prompt updates (deferred to F-707).
- Changing `outfit.reasons` logic.

## 5. Acceptance Criteria Mapping
- [x] AC 1: Regression test reproduces the bug: fails before the fix and passes after (`suggest.test.ts › "cold weather with no Đông items flags the fallback"`).
- [x] AC 2: Modal displays the fallback note when no item fits the wanted seasons (`OutfitsModal.test.tsx`).
- [x] AC 3: Items not tagged "Hạ" rank before summer items in cold weather fallback (`suggest.test.ts`).
- [x] AC 4: All checks pass (`format:check`, `typecheck`, `test`, `build`).

## 6. Verification
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test src/features/outfits/`
- `pnpm build`
