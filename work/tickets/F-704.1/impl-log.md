## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| src/features/outfits/suggest.ts (new, 125) | Pure rules, season constant, seeded ranking (R8) |
| src/features/outfits/suggest.test.ts (new, 254) | AC 1–5, 7 |
| src/features/outfits/copy.ts (new, 19) / copy.test.ts (new, 12) | R6 |
| src/features/outfits/OutfitsModal.tsx (new, 94) / OutfitsModal.test.tsx (new, 91) | Modal UI, AC 1, 5, 6, 7 |
| src/features/layout/Hero.tsx (+8) / Hero.test.tsx (new, 13) | Entry point, AC 8 |
| src/App.tsx (+14) | Wiring only (state, prop, one modal) |
| src/index.css (+96 / -5) | `.outfit-*`, `.hero-cta`, five `p:last-child` selectors → `p:last-of-type` |

### Tests added / changed
- suggest.test.ts: every test named in the plan (season, rules, eligibility, ranking/shuffle, reasons, purity).
- copy.test.ts › outfit copy; Hero.test.tsx › Hôm nay mặc gì? button calls onOutfits.
- OutfitsModal.test.tsx: the six planned tests, plus "shows the category icon when an item has no photo" (added after the Playwright check showed empty thumbs, see below).
- No App-level test (BUG-006).

### Playwright check (D42, one-off, not committed)
- Script: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-1/outfits-verify.cjs (mocks /healthz and /api/items with 9 items; run against `pnpm dev --port 5199 --strictPort`).
- Command: `NODE_PATH=$(npm root -g) node outfits-verify.cjs` → exit 0, `failures: []`; summary: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-1/summary.json
- Covers 390x844 (mobile) and 1280x800, light and dark: 3 cards; no horizontal scroll; modal inside viewport (after the 0.25s rise animation); Hero button does not overlap .mobile-import; stale line still 12px and --muted; card text contrast 17.12 (light) / 14.14 (dark), dark card bg rgb(28,42,36); Đổi gợi ý changes names; tapping a piece closes the modal.
- Screenshots: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-704-1/outfits-light-390.png, outfits-dark-390.png, outfits-light-1280.png, outfits-dark-1280.png, hero-light-390.png, hero-dark-390.png, hero-light-1280.png, hero-dark-1280.png
- Looked at outfits-dark-390, outfits-light-1280, hero-light-390: layout is single column at 390 (3 piece tiles per row), icons visible, button sits above Import/Export without overlap.
- Findings fixed during the run: (1) first measure was taken mid-animation (modal offset 10px) → script now waits 500ms; (2) items without photo rendered empty tiles because `ItemPhoto` with `src=""` renders an empty img → modal now uses the category icon when `item.photo` is empty, like `ItemCard`. The production preview build does not render the dev app view, so the check runs against `pnpm dev`.
- Note: the season line shows "Mùa Đông" (today is Nov 18) so the outer piece appears in every outfit; the "Hợp mùa" chip only shows for items explicitly tagged with the season.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` no errors
- format:check: All matched files use the correct format (oxfmt --check)
- test: Test Files 125 passed | 11 skipped (136); Tests 1619 passed | 221 skipped (1840)
- build: ✓ built in 420ms

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `ItemPhoto` with an empty `src` renders an empty `<img>`; callers must guard (as ItemCard does). A guard inside ItemPhoto would be safer.
- Season line is shown even when no item is tagged with it; fine for now, revisit with F-704.2 (weather).

### Scope self-check
- Could the diff be smaller? No; production ~330 lines as planned.
- Diff size: +117 / -5 tracked, plus 8 new files (~608 lines incl. tests).
