Verdict: PASS

## Attempt 1 — 2026-11-18
Verdict: PASS

Reviewed commit 1d53aee (`git diff origin/main...HEAD`) against plan.md (A1–A11), ticket.md and CLAUDE.md.

### Checks (run by reviewer)
- `pnpm typecheck` — `tsc --noEmit && tsc -p tsconfig.server.json`, no errors.
- `pnpm format:check` — "All matched files use the correct format." (311 files).
- `pnpm test` — Test Files 125 passed | 11 skipped (136); Tests 1619 passed | 221 skipped (1840). Matches impl-log.
  Targeted run (`vitest run src/features/outfits src/features/layout/Hero.test.tsx`): 33/33 passed.
- `pnpm build` — ✓ built in 432ms.
- Playwright one-off (D42), re-run by reviewer: `NODE_PATH=$(npm root -g) node outfits-verify.cjs` against
  `pnpm dev --port 5199 --strictPort` → exit 0, `failures: []`. 390×844 and 1280×800, light and dark: 3 cards each,
  no horizontal scroll, no overlap of the Hero button with `.mobile-import`, stale line keeps `--muted`
  (rgb(111,106,98) light / rgb(193,185,173) dark), card contrast 17.12 / 14.14, dark card bg rgb(28,42,36),
  "Đổi gợi ý" changes the shown names in all four runs.
- Extra reviewer check (scratchpad `rev-widths.cjs`, hero at 490/650/800): stale line 12px, `--muted`, `max-width`
  210px at 490/650 and `none` at 800 (unchanged rules still apply), no overlap, button inside `.intro`, no h-scroll.
- Screenshots viewed: outfits-light-390, outfits-dark-390, outfits-light-1280, outfits-dark-1280, hero-light-390,
  hero-dark-1280, rev-hero-490, rev-hero-650 (all under
  /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-1/). Single column at 390 with
  3 tiles per row, tokens render correctly in dark mode, category icons visible, Hero button sits above Import/Export.

### Acceptance criteria
- [x] 3 valid outfits (top+bottom or one-piece, shoes when available, Khoác only in Đông, ≤1 accessory, no main piece
  reused, Bikini/Loại khác excluded) — `suggest.test.ts` › outfit rules (11 tests, incl. "never reuses a main piece"
  over seeds 1–10, "Áo dài" not treated as "Áo"); `OutfitsModal.test.tsx` › "shows 3 outfits"; code:
  `suggest.ts:70-75` (active + role filter), `:92-95` (units), `:107-110` (extras, outer gated by `COLD_SEASONS`).
- [x] Season from UTC+7 with a named constant; empty/null seasons eligible — `SEASON_BY_MONTH`/`seasonOf`
  `suggest.ts:6-27` (`now + 7h`, `getUTCMonth`, device-TZ independent); tests "seasonOf maps every month",
  "seasonOf uses UTC+7 at month boundaries" (Jan 31 16:59Z → Đông, 17:00Z → Xuân; Oct 31 17:00Z → Đông; Dec 31 → Đông),
  "SEASON_BY_MONTH covers 12 months with known labels", "empty seasons are eligible and rank like in-season".
- [x] Only "Đang dùng"; out-of-season skipped unless nothing else fits — `suggest.ts:71` (`STATUS_TO_DB … "active"`),
  `:78-82` (per-role fallback, A5); tests "uses only Đang dùng items", "skips out-of-season items…",
  "falls back to out-of-season items…".
- [x] Stale and never-worn before recent — `suggest.ts:83-89` (tier via `isStale || wearCount === 0`) and unit sort
  `:99-102`; test "stale and never-worn pieces come before recently worn ones" (seeds 1–20).
- [x] "Đổi gợi ý" gives a different set when alternatives exist — `avoid` + seed+1 (`OutfitsModal.tsx:29-32`);
  tests "is deterministic for a fixed seed", "a different seed reorders ties", "avoid gives a different set when
  alternatives exist" (4 dresses → set differs, 6 → disjoint); `OutfitsModal.test.tsx` › "Đổi gợi ý shows a different
  set"; Playwright before/after differ.
- [x] Photo or icon, name, reason; tap opens the editor — `OutfitsModal.test.tsx` › "shows reasons", "clicking a piece
  calls onOpenItem with that item", "shows the category icon when an item has no photo"; App wiring
  (`src/App.tsx` +14 lines: state, `onOutfits` prop, one `<OutfitsModal>` whose `onOpenItem` closes it and calls
  `setEditor({ ...item }); setIsNew(false)`) read in the diff; Playwright "tapping a piece closes the modal".
- [x] Vietnamese empty state — test "returns no outfits when nothing can be built"; `OutfitsModal.test.tsx` › "shows the
  empty state" (no "Đổi gợi ý" button).
- [x] Hero entry point — `Hero.test.tsx` › "Hôm nay mặc gì? button calls onOutfits"; `Hero.tsx:30-34`.
- [x] Copy in one place (R6) — all new strings in `src/features/outfits/copy.ts`; `OutfitsModal.tsx` has no Vietnamese
  literals (only `COPY.*`, item data and `categoryIcons`); `copy.test.ts` › "outfit copy".
- [x] 390px + dark mode (R9) — Playwright check above.
- [x] All checks pass — above.

Purity: `suggest.ts` has no `Date.now` / `Math.random`; `now` and `seed` are injected (`SuggestOptions`), PRNG is
`mulberry32` with Fisher–Yates; `now` is captured once in the modal (`OutfitsModal.tsx:22`). "does not mutate the
input" test passes.

CSS `p:last-child` → `p:last-of-type` (5 selectors): `.hero-copy` has exactly two `<p>` children (eyebrow, stale line)
and the other `.intro > div` children (`.hero-collage`, `.mobile-import`) have no `<p>` children, so before the change
`p:last-child` and after it `p:last-of-type` select the same element. No other `.intro` exists in `src/`. Measured
styles at 390/490/650/800/1280 confirm the stale line keeps its size, colour and max-width.

Scope: every changed file is in the plan's file list; no High path, no `src/data/`, server or migration change; no
App-level test added (A9).

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R1: data comes only from `items` passed down from `useWardrobe`, no `fetch`. R5: wear stats only
read. R6: copy in `copy.ts`; category/status mapped through `CATEGORY_TO_DB` / `STATUS_TO_DB`; season labels
validated against `SEASON_TO_DB` keys in a test. R7: within plan. R8: pure logic unit-tested. R9: verified.

### Blockers from review agents
None (no review trigger applies: areas ui, data; no trigger path changed).

### Nits (do not block)
- `src/App.tsx`: +14 lines vs the plan's "≤10 lines"; the extra lines are formatter line breaks of the planned wiring, no logic.
- `suggest.test.ts` › "a different seed reorders ties" asserts that some seed in 2–8 differs instead of two named seeds
  as the plan wrote; still deterministic (no `Math.random`).
- `.outfit-body` top padding is 4px, so "Mùa Đông" sits tight under the header border (visible in the screenshots);
  6–8px would read better.
- With exactly 4 main units (Playwright fixture), "Đổi gợi ý" can only swap one outfit; behaviour matches A8 (soft avoid).

### Ming verification after merge
- Open "Hôm nay mặc gì?" on her phone with real data (light and dark): 3 sensible outfits, "Đổi gợi ý" changes them,
  tapping a piece opens the editor. Check the season mapping (A1: Xuân 2–4, Hạ 5–7, Thu 8–10, Đông 11–1) and
  "Khoác only in Đông" (A2) feel right.

### Follow-ups (out of scope)
- Guard empty `src` inside `ItemPhoto` (impl-log follow-up) so callers do not each need the `item.photo ?` check.
- Season line is shown even when no item is tagged with it; revisit with F-704.2 (weather).
- Optionally move `outfits-verify.cjs` to `scripts/` if Ming wants it durable (A11).
