# Impl log — BUG-017

## Attempt 1 — 2026-11-23

### Regression run (before the fix)
Regression tests were written first and run against unchanged `src/` (`pnpm vitest run` on the five test files). They failed:
- `photoUrls.test.ts › thumb variant: makeThumb gets the fetched blob and createUrl gets its result`
- `ItemPhoto.test.tsx › asks the loader for the thumb variant`
- `ItemCard.test.tsx › ItemCard photo › asks the loader for the thumb variant`
- `cardPaint.test.ts › card badges and wear pills have no backdrop-filter`
- also failing before the fix: `photoUrls.test.ts › thumb variant: a makeThumb failure falls back to the full blob`, `› thumb and full of the same id are separate entries`, `› thumbs use their own keepUnused limit (default 150)`, `usePhotoUrl.test.tsx › default variant is full (editor path)`, `› variant "thumb" is passed to acquire` (9 failed, 35 passed in those files).
After the fix all of them pass.

### Files touched
| File | Required because |
|---|---|
| `src/data/photoThumb.ts` (new) | `thumbWith` / `makeThumb`, 480 px, quality 0.8, off-thread then main fallback |
| `src/data/photoUrls.ts` | `PhotoVariant`, `acquire(src, variant)`, `${id}#thumb` key, `makeThumb` step with fallback to the full blob, per-variant LRU (thumbs 150) |
| `src/data/usePhotoUrl.ts` | `variant` option, default `"full"` |
| `src/components/ItemPhoto.tsx` | asks for `"thumb"` (cards, hero collage, outfit tiles) |
| `src/data/useWardrobe.ts` | injects `makeThumb` into the loader |
| `src/index.css` | removed the one `backdrop-filter: blur(6px)` line from `.badge, .wear-pill` |
| tests (below) | R8 / regression |

### Tests added / changed
- `src/data/photoThumb.test.ts` (new): large image rendered at 480/0.8 and released; small image returned unchanged; render failure releases and rejects; off-thread first / failure to main / no worker to main.
- `src/data/photoUrls.test.ts`: `thumb variant` group (7 tests from the plan).
- `src/data/usePhotoUrl.test.tsx` (new): default full; explicit thumb.
- `src/components/ItemPhoto.test.tsx`: asks the loader for the thumb variant.
- `src/features/items/ItemCard.test.tsx`: asks the loader for the thumb variant.
- `src/test/cardPaint.test.ts` (new): no `backdrop-filter` on `.badge` / `.wear-pill` rules.
- Test note: in the "falls back to the full blob" test the assertion is that the blob given to `createUrl` is the one given to `makeThumb` (jsdom wraps the response blob, so its size is not 1).

### Checks (actual output summary)
- format:check: "All matched files use the correct format."
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- test: 7 failed | 2022 passed | 288 skipped. All 7 failures are the known pre-existing Windows failures on main, none in code touched here: `server/ai/tagPhoto.test.ts` (3), `server/api.test.ts` (1), `server/index.cli.test.ts` (1), `server/scoping.test.ts` (1), `src/features/auth/boundary.test.ts` (1). Not fixed.
- build: green (`built in 671ms`).

### Out-of-plan files
None.

### Profile (Ming's step — agents cannot sign in)
Numbers are not recorded by the agent. Procedure:
1. Before (production v0.3.1 or `main` before merge), foreground Chrome on Windows, not under automation, account with ~70 photo items: DevTools > Performance, record scrolling the grid to the end and back. Note dropped frames/FPS, total Paint + Decode Image + Rasterize time, any long tasks. Optional: Rendering panel > Frame rendering stats.
2. Same on a mid-range phone if available (Android Chrome remote DevTools, or just whether it feels smooth).
3. After the release containing BUG-017, repeat. Expected: >= 50 fps; much less Decode Image/Paint. A card `<img>` should report `$0.naturalWidth` about 480; the editor image about 1200.
4. Look check on phone and desktop, light and dark: card, hero collage, outfit tiles not visibly soft; wear pills and badges look the same.
5. If "before" is already smooth in a foreground window, the fix counts as a cleanup and the `.topbar` follow-up (A4) is dropped.
Paste the numbers here or into the Handoff.

### Follow-ups (noticed, not done)
- A1: server-side thumbnail variant to cut bytes (High path, needs plan approval); debt issue "BUG-017 follow-up: server-side thumbnail variant (bytes)" to be opened by the orchestrator per the plan default.
- A4: `.topbar` blur only if Ming's after-profile still shows heavy paint.

### Scope self-check
- Could the diff be smaller? No.
- No background processes were started (all commands ran in the foreground).
