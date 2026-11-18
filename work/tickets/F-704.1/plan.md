Status: READY

# Plan — F-704.1: "Hôm nay mặc gì?" — rule-based outfit suggestions

## Scope summary
- `docs/feature-list.md` F-704 · Outfit suggestion · P2 · M3 · L:
  > "Hôm nay mặc gì?": suggests 3 outfits from active items using season, weather (optional) and stale items first.
- Ticket split (Ming 2026-11-18, "tạo ticket F-704 và tách nhỏ"): F-704.1 = rules + UI (this plan); weather is
  F-704.2, AI ranking is F-704.3. Saved outfits / "Mặc bộ này hôm nay" are F-801–F-803 and out of scope.
- Ticket scope, quoted: "an outfit is either top (Áo) + bottom (Quần/váy), or one-piece (Đầm, Set đồ, Áo dài), plus
  shoes (Giày/dép) when available; add outer (Khoác) in cold seasons; at most one accessory (Phụ kiện)"; "current
  season from today's date in UTC+7 (month → Xuân/Hạ/Thu/Đông; the mapping is a named constant); items tagged with
  the current season or with no season are eligible"; "stale and never-worn items rank first; ties broken by a seeded
  shuffle so 'Đổi gợi ý' gives a new set"; "the 3 outfits do not reuse the same main piece; categories `bikini` and
  `other` are excluded"; entry point + modal with photo or category icon, name, short reason, "Đổi gợi ý"; tapping an
  item opens the existing editor; Vietnamese empty state; all copy in one place (R6).
- Out of scope (ticket): weather, AI, saving outfits, any server/database/migration change.
- Rules that apply: R1 (data only from `wardrobe.items`, no fetch), R5 (wear stats are read, never stored), R6
  (copy in `src/features/outfits/copy.ts`; category/status/season compared through `CATEGORY_TO_DB` /
  `STATUS_TO_DB` / `SEASON_TO_DB` ids, not scattered literals), R7, R8 (unit tests for the pure module), R9 (390px +
  dark mode). `work/decisions.md`: D42 (one-off Playwright check, no Playwright dependency), D44 (no local/demo mode).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | With enough active items the modal shows 3 outfits, each valid: top+bottom or one-piece (Đầm/Set đồ/Áo dài), plus shoes when available, outer only in Đông, at most one accessory; no main piece reused; Bikini/Loại khác excluded | `suggest.test.ts` › "builds top + bottom outfits", "builds one-piece outfits for Đầm, Set đồ and Áo dài", "adds shoes when available", "keeps an outfit without shoes", "adds Khoác only in Đông", "adds at most one accessory", "never reuses a main piece", "excludes Bikini, Loại khác and unknown categories", "returns at most 3 outfits"; `OutfitsModal.test.tsx` › "shows 3 outfits" |
| 2 | Season from today's date in UTC+7 with a named month→season constant; empty/null seasons eligible | `suggest.test.ts` › "seasonOf maps every month", "seasonOf uses UTC+7 at month boundaries", "SEASON_BY_MONTH covers 12 months with known labels", "empty seasons are eligible and rank like in-season" |
| 3 | Only "Đang dùng" items are used; out-of-season items are skipped unless nothing else fits | `suggest.test.ts` › "uses only Đang dùng items", "skips out-of-season items when the role has an in-season item", "falls back to out-of-season items when the role has none in season" |
| 4 | Stale and never-worn items appear before recently worn ones | `suggest.test.ts` › "stale and never-worn pieces come before recently worn ones" (checked over several seeds) |
| 5 | "Đổi gợi ý" gives a different set when alternatives exist; same seed gives the same result | `suggest.test.ts` › "is deterministic for a fixed seed", "a different seed reorders ties", "avoid gives a different set when alternatives exist"; `OutfitsModal.test.tsx` › "Đổi gợi ý shows a different set" |
| 6 | Each outfit shows photo or category icon, name and a short reason; tapping a piece opens it in the existing editor | `OutfitsModal.test.tsx` › "shows reasons", "clicking a piece calls onOpenItem with that item"; App wiring is reviewed by reading the ≤10-line App.tsx diff (no App-level test, see Assumptions A9) |
| 7 | Too few items shows a clear Vietnamese empty state | `suggest.test.ts` › "returns no outfits when nothing can be built"; `OutfitsModal.test.tsx` › "shows the empty state" |
| 8 | Entry point "Hôm nay mặc gì?" in the Hero opens the modal | `Hero.test.tsx` › "Hôm nay mặc gì? button calls onOutfits" |
| 9 | All copy in one place (R6) | `copy.test.ts` › outfit copy functions; reviewer greps `src/features/outfits/*.tsx` for Vietnamese string literals (none outside `copy.ts`) |
| 10 | Works at 390px and in dark mode | One-off Playwright check `outfits-verify.cjs` (see Approach step 8), run by implementer and re-run by reviewer; result + screenshots recorded in impl-log and review |
| 11 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- Open "Hôm nay mặc gì?" on her phone with real data (light and dark): 3 sensible outfits, "Đổi gợi ý" changes them,
  tapping a piece opens the editor. Check the season mapping and "Khoác only in Đông" feel right (A1, A2).

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/outfits/suggest.ts` | **Create.** Pure module: `SEASON_BY_MONTH`, `COLD_SEASONS`, `seasonOf(now)`, `mulberry32`, `suggestOutfits(items, { now, seed, avoid })` | Rules, season, ranking, shuffle (R8 pure logic first) | No |
| `src/features/outfits/suggest.test.ts` | **Create.** Unit tests listed below | R8, AC 1–5, 7 | No |
| `src/features/outfits/copy.ts` | **Create.** `OUTFITS_COPY` (entry label, eyebrow, title, season line, outfit label, reasons, shuffle, close, empty state, open-item aria label) | R6 | No |
| `src/features/outfits/copy.test.ts` | **Create.** Copy function outputs | Same pattern as other `copy.test.ts` | No |
| `src/features/outfits/OutfitsModal.tsx` | **Create.** Modal (uses `Modal`, `ItemPhoto`, `categoryIcons`, `Icon`, `Btn`); owns `now`, `seed`, `avoid` | Modal UI | No |
| `src/features/outfits/OutfitsModal.test.tsx` | **Create.** Component tests listed below | AC 1, 5, 6, 7 | No |
| `src/features/layout/Hero.tsx` | **Modify.** Optional prop `onOutfits?: () => void`; render a `Btn kind="primary"` with `OUTFITS_COPY.entry` in `.hero-copy` after the stale line (only when `onOutfits` is given) | Entry point (consult recommendation) | No |
| `src/features/layout/Hero.test.tsx` | **Create.** One test: button calls `onOutfits` | AC 8 | No |
| `src/App.tsx` | **Modify (hotspot, ≤10 lines).** `const [outfitsOpen, setOutfitsOpen] = useState(false)`; `onOutfits={() => setOutfitsOpen(true)}` on `Hero`; `{outfitsOpen && <OutfitsModal items={items} onClose={…} onOpenItem={(item) => { setOutfitsOpen(false); setEditor({ ...item }); setIsNew(false); }} />}` | Wiring only; no suggestion logic in App | No |
| `src/index.css` | **Modify.** (a) `.hero-cta` spacing; (b) the five selectors `.intro > div > p:last-child` (lines ~184, ~1184) and `.intro > .hero-copy > p:last-child` (~1558, ~2285, ~2631) become `…p:last-of-type` so the stale line keeps its style once the button follows it; (c) new `.outfit-*` rules with `var(--surface)` / `var(--border)` / `var(--muted)` tokens only, single column, body padding with `env(safe-area-inset-bottom)` | R9 layout and dark mode | No |

No High path is touched. No server, `src/data/`, `WardrobeRepo`, type or migration change.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `suggest.test.ts` › seasonOf maps every month | Table: mid-month UTC for months 1–12 → Đông, Xuân, Xuân, Xuân, Hạ, Hạ, Hạ, Thu, Thu, Thu, Đông, Đông |
| `suggest.test.ts` › seasonOf uses UTC+7 at month boundaries | `Date.UTC(2026,0,31,16,59)` → Đông, `Date.UTC(2026,0,31,17,0)` → Xuân; `Date.UTC(2026,3,30,17,0)` → Hạ; `Date.UTC(2026,9,31,17,0)` → Đông; `Date.UTC(2026,11,31,17,0)` → Đông (new year) |
| `suggest.test.ts` › SEASON_BY_MONTH covers 12 months with known labels | length 12, every value is a key of `SEASON_TO_DB` |
| `suggest.test.ts` › builds top + bottom outfits | `Áo` + `Quần/váy` pieces, main = [top, bottom] |
| `suggest.test.ts` › builds one-piece outfits for Đầm, Set đồ and Áo dài | each label alone forms a main; `Áo dài` is not treated as `Áo` |
| `suggest.test.ts` › adds shoes when available | one `Giày/dép` per outfit when any eligible shoes exist |
| `suggest.test.ts` › keeps an outfit without shoes | no shoes in wardrobe → outfits still returned |
| `suggest.test.ts` › adds Khoác only in Đông | `now` in January includes outer; in July (Hạ) and September (Thu) it does not |
| `suggest.test.ts` › adds at most one accessory | 3 accessories → each outfit has ≤ 1 |
| `suggest.test.ts` › never reuses a main piece | 6+ units → no main id appears in two outfits; shoes/outer/accessory may repeat |
| `suggest.test.ts` › returns at most 3 outfits | 10 dresses → 3 |
| `suggest.test.ts` › returns fewer outfits when there are fewer main pieces | 2 dresses → 2 outfits; 1 top + 3 bottoms → 1 outfit (no padding) |
| `suggest.test.ts` › returns no outfits when nothing can be built | `[]`; only tops; only bottoms; only shoes/accessories; only non-active items |
| `suggest.test.ts` › excludes Bikini, Loại khác and unknown categories | never appear in any outfit |
| `suggest.test.ts` › uses only Đang dùng items | Cất kho, Đang giặt-sửa, Cho mượn, Muốn thanh lý never appear |
| `suggest.test.ts` › empty seasons are eligible and rank like in-season | in July: a `seasons: []` dress and a `["Hạ"]` dress (same wear state) both appear; across seeds the empty one is sometimes first |
| `suggest.test.ts` › skips out-of-season items when the role has an in-season item | July: `["Đông"]` dress never appears while a `["Hạ"]` dress exists |
| `suggest.test.ts` › falls back to out-of-season items when the role has none in season | July: only `["Đông"]` dresses → they are used |
| `suggest.test.ts` › stale and never-worn pieces come before recently worn ones | 3 recent dresses (`lastWorn` 2 days ago) + 1 never worn + 2 worn 120 days ago → for seeds 1..20 the 3 outfits are exactly the never/stale ones |
| `suggest.test.ts` › is deterministic for a fixed seed | same items/now/seed → deep-equal results |
| `suggest.test.ts` › a different seed reorders ties | 6 equal dresses: the implementer picks two concrete seeds whose first outfit differs and asserts it (fixed seeds, no `Math.random`) |
| `suggest.test.ts` › avoid gives a different set when alternatives exist | 4 equal dresses: second call with `avoid` = first main ids and seed+1 → main id set differs; 6 dresses → disjoint |
| `suggest.test.ts` › reasons | never-worn piece → `"neverWorn"`; worn 120 days ago → `"stale"`; piece tagged with current season → `"season"`; recent, untagged → `[]` |
| `suggest.test.ts` › does not mutate the input | input array and items deep-equal before/after |
| `copy.test.ts` › outfit copy | `season("Đông")`, `outfitLabel(1)`, `reasons.season("Hạ")`, `openItem("Áo dài lụa")` produce the expected Vietnamese strings |
| `OutfitsModal.test.tsx` › shows 3 outfits | fixture with 6 active dresses + shoes → 3 outfit cards, title "Hôm nay mặc gì?" |
| `OutfitsModal.test.tsx` › shows reasons | never-worn dress → "Chưa mặc lần nào" chip |
| `OutfitsModal.test.tsx` › Đổi gợi ý shows a different set | 6 dresses with distinct names: shown names before ≠ after click |
| `OutfitsModal.test.tsx` › clicking a piece calls onOpenItem with that item | `onOpenItem` mock receives the item object |
| `OutfitsModal.test.tsx` › shows the empty state | only tops → empty-state text, no "Đổi gợi ý" button |
| `OutfitsModal.test.tsx` › close button calls onClose | aria-label "Đóng" |
| `Hero.test.tsx` › Hôm nay mặc gì? button calls onOutfits | click → mock called once |

Component tests use items without photos (category-icon fallback); if a test needs a photo, wrap in
`PhotoLoaderContext` as `src/components/ItemPhoto.test.tsx` does. Fake `Date.now` via `vi.setSystemTime` in
modal tests so the season is fixed.

## Approach
1. **`suggest.ts` types and constants.**
   `export const SEASON_BY_MONTH = ["Đông","Xuân","Xuân","Xuân","Hạ","Hạ","Hạ","Thu","Thu","Thu","Đông","Đông"] as const`
   (index = month 0–11; values must be keys of `SEASON_TO_DB`); `export const COLD_SEASONS: readonly string[] = ["Đông"]`;
   `export const VN_OFFSET_MS = 7 * 3600_000`; `seasonOf(now: number) = SEASON_BY_MONTH[new Date(now + VN_OFFSET_MS).getUTCMonth()]`
   (fixed UTC+7, independent of the device timezone).
   `export type OutfitReason = "neverWorn" | "stale" | "season"`;
   `export type Outfit = { main: Item[]; pieces: Item[]; reasons: OutfitReason[] }` (`pieces` = main + shoes? + outer? + accessory?, in that order);
   `export type Suggestion = { season: string; outfits: Outfit[] }`;
   `suggestOutfits(items: readonly Item[], opts: { now: number; seed: number; avoid?: readonly string[]; count?: number }): Suggestion` (`count` default 3).
2. **Roles** via `CATEGORY_TO_DB[item.category]`: `top`, `bottom`; one-piece = `dress | set | ao_dai`; `shoes`;
   `outer`; `accessory`. `bikini`, `other` and labels not in `CATEGORY_TO_DB` are dropped. Active = `STATUS_TO_DB[item.status] === "active"`.
3. **Season eligibility per role.** For each role: in-season = `seasons.length === 0 || seasons.includes(season)`. Pool =
   in-season items if any, else all active items of that role (the "unless nothing else fits" fallback, A5).
4. **Ranking.** Tier 0 = `isStale(i, now) || i.wearCount === 0` (from `src/features/items/filters.ts`; empty `lastWorn`
   is already stale), tier 1 otherwise. Per pool: Fisher–Yates shuffle with `mulberry32(seed)` (no `Math.random`,
   no `Date.now` in the module), then stable sort by `(avoided ? 1 : 0, tier)` where avoided = id in `opts.avoid`.
5. **Units.** One-piece units = each ranked one-piece; pair units = `tops[k] + bottoms[k]` for `k < min(len)`. Each
   unit gets a PRNG tie key; sort units by `(contains an avoided piece, min tier of its pieces, tie key)`; take the first
   `count`. Distinct main pieces follow by construction. Fewer units → fewer outfits; none → `outfits: []`.
6. **Extras** for outfit `k`: `shoes[k % shoes.length]` when any; `outer[k % len]` only when `COLD_SEASONS.includes(season)`;
   `accessory[k % len]` (one at most). Extras may repeat across outfits (only main pieces must be distinct).
   **Reasons** (order neverWorn, stale, season), from `main`: `neverWorn` if any `wearCount === 0`; `stale` if any is
   stale with `wearCount > 0`; `season` if any is explicitly tagged with the current season.
7. **UI.** `OUTFITS_COPY` in `copy.ts` (Vietnamese; e.g. entry/title "Hôm nay mặc gì?", eyebrow "GỢI Ý HÔM NAY",
   `season: (s) => \`Mùa ${s}\``, `outfitLabel: (n) => \`Bộ ${n}\``, reasons "Chưa mặc lần nào" / "Lâu chưa mặc" /
   `(s) => \`Hợp mùa ${s}\``, shuffle "Đổi gợi ý", close "Đóng", empty title/body "Chưa đủ đồ để phối" /
   "Cần ít nhất một áo và một quần/váy, hoặc một đầm, set đồ hay áo dài đang dùng.", `openItem: (name) => \`Mở ${name}\``).
   `OutfitsModal({ items, onClose, onOpenItem })`: `const [now] = useState(() => Date.now())`, `const [seed, setSeed] = useState(() => now)`,
   `const [avoid, setAvoid] = useState<string[]>([])`; `useMemo(() => suggestOutfits(items, { now, seed, avoid }), [items, now, seed, avoid])`.
   "Đổi gợi ý": `setAvoid(current main ids)` and `setSeed((s) => s + 1)`; hidden when there are no outfits. Layout follows
   `ExportModal` (`.modal-header`, `.eyebrow`, `h2`, `icon-btn` close). Each outfit card: label, reason chips, pieces as
   `<button aria-label={openItem(name)}>` with `ItemPhoto` (fallback `<span>{categoryIcons[cat]}</span>`), name
   (`item.name || item.category` for empty names) and category. Hero button and App wiring as in the files table.
   CSS: `.outfit-*` classes with tokens only (dark mode works through the tokens); do not add the modal to any `:has(> …)` rule.
8. **One-off Playwright check (D42, AC 10): `outfits-verify.cjs`, kept in the session scratchpad, not committed.** Model it
   on `scripts/confirm-verify.cjs`: `pnpm dev --port 5199 --strictPort` (devApp view, no sign-in), `page.route` mocks
   `**/healthz` → `{status:"ok"}` (JSON) and `**/api/**` (`/api/items` with ~8 active items in the wire shape that
   `src/data/repo.http.ts` reads — tops, bottoms, a dress, shoes, an accessory, one never worn — `/api/locations` → `[]`).
   Contexts 390×844 (`isMobile`, `hasTouch`) and 1280×800, themes light/dark via `localStorage["tu-do-theme"]`. Steps:
   click "Hôm nay mặc gì?", wait for `.outfit-*` cards. Assert: 3 cards; `document.documentElement.scrollWidth <= innerWidth`
   (no horizontal scroll); modal fully inside the viewport; the Hero button does not overlap `.mobile-import` buttons at 390px
   (bounding boxes); the stale line still has `color` = `--muted`; in dark mode card background ≠ white and text contrast ≥ 4.5;
   "Đổi gợi ý" changes the card names. Screenshots for 4 combos; exit 1 on failure. Record the command, `summary` output and
   screenshot paths in impl-log; the reviewer re-runs it.
9. Run checks: `pnpm format`, then `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Specialist input used
From `consult-frontend-developer.md`:
- Adopted: entry point as the main button in Hero's `hero-copy`, no Header icon (Header is full at 390px).
- Adopted: App.tsx limited to `outfitsOpen` state, one `onOutfits` prop, one `<OutfitsModal>`; no logic in App.
- Adopted: folder layout `src/features/outfits/{suggest,copy,OutfitsModal}` + tests; no hook.
- Adopted: pure `suggestOutfits` with injected `now`/`seed`, `seasonOf` via `now + 7h` + `getUTCMonth`, mulberry32 +
  Fisher–Yates, reasons as keys mapped in copy, ids via `CATEGORY_TO_DB` / `STATUS_TO_DB`.
- Adapted: returns `{ season, outfits }` instead of `Outfit[]` so the modal shows the season without recomputing; adds
  `avoid` so "Đổi gợi ý" reliably changes the set even when the top tier is fixed (a seed change alone can repeat the set).
- Adopted: `onOpenItem` closes the outfits modal then opens the editor (no stacked modals).
- Adopted: `.outfit-*` classes with tokens, single column at 390px, `env(safe-area-inset-bottom)` padding.
- Added (found while planning): the Hero button after the stale `<p>` breaks five `p:last-child` selectors; switch them to
  `p:last-of-type`. Also `.mobile-import` is absolutely positioned at the bottom-left of the hero at ≤650px, so the
  Playwright check asserts no overlap with the new button.
- Open questions: answered as assumptions A1–A4 below.

## Assumptions
- **A1 Season mapping** (Ming may override): Xuân = Feb–Apr, Hạ = May–Jul, Thu = Aug–Oct, Đông = Nov–Jan, computed in
  fixed UTC+7 (`SEASON_BY_MONTH`). Stale-day counting keeps using the existing device-local `isStale`; a ±1 day difference
  for a device outside UTC+7 is acceptable.
- **A2 Outer only in Đông** (`COLD_SEASONS = ["Đông"]`). Reason: with Thu = Aug–Oct, most of Thu is still hot in Vietnam
  (Hà Nội cools from November; the south has no cold season), so a jacket in Thu would mostly be wrong. One constant to change.
- **A3 No shoes → outfit still shown** (ticket: "plus shoes … when available").
- **A4 Fewer than 3 units → fewer outfits, no padding**; zero → empty state.
- **A5 Empty seasons = all-season**, eligible and ranked equal to in-season items. Out-of-season fallback is per role
  (e.g. if no bottom is in season, out-of-season bottoms are used), which is the simplest reading of "skipped unless nothing else fits".
- **A6 Ranking** is two tiers only (stale-or-never-worn vs recent), with a seeded shuffle inside a tier, as the ticket says;
  no finer ordering by age.
- **A7 Extras may repeat** across outfits (shoes, outer, accessory); only main pieces are distinct. One accessory is added
  whenever any eligible accessory exists.
- **A8 "Đổi gợi ý"** avoids the previously shown main pieces (soft: they rank last, still used when nothing else exists)
  and advances the seed; `now` is captured once when the modal opens.
- **A9 No App-level test** (`src/App.test.tsx` is slow on CI, BUG-006): the App wiring is ≤10 lines and verified by the
  Playwright check plus reading the diff. Existing App tests use exact button names ("Mặc hôm nay") that do not match
  "Hôm nay mặc gì?", so they are unaffected.
- **A10 Hotspot**: `src/App.tsx` and `src/index.css` are shared hotspots. No other ticket is `IN_PROGRESS`/`REVIEW`/`DONE`
  on the board; F-704.2 and F-704.3 (BACKLOG) will touch `suggest.ts`/`OutfitsModal.tsx` later and depend on this ticket.
- **A11** The Playwright script stays in the scratchpad (one-off, D42); if Ming wants it durable, it can move to
  `scripts/outfits-verify.cjs` without other changes.

## Blocking questions
None.

## Split proposal
None. Estimate: ~330 production lines (`suggest.ts` ~140, `OutfitsModal.tsx` ~90, `copy.ts` ~30, CSS ~60, Hero/App ~20)
plus ~350 test lines. The production diff fits one implement/review cycle; tests are the bulk and are pure-module tests.
If the implementer finds it growing well beyond this, the natural cut is: slice 1 = `suggest.ts` + tests + copy; slice 2 = modal, Hero, App, CSS, Playwright check.
