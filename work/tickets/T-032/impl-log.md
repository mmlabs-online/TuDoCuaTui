## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| `src/data/aiOutfits.ts` | AC 1: `season: DbSeason` plus type-only import |
| `src/data/aiOutfits.test.ts` | AC 1: `@ts-expect-error` test |
| `src/features/outfits/suggest.ts` | AC 2: U+2028/2029 out of the strip class, `.trimEnd()`, comment |
| `src/features/outfits/suggest.test.ts` | AC 2: adjusted existing test, 2 new tests |
| `src/features/outfits/OutfitsModal.tsx` | AC 1, 3, 5: `seasonId: DbSeason`, toggle hidden when rule set empty, `ai.onOpenSettings` and settings link |
| `src/features/outfits/OutfitsModal.test.tsx` | AC 3, 5: 4 tests, `renderAi` prop type widened |
| `src/features/outfits/copy.ts` | AC 5, R6: `ai.openSettings` |
| `src/features/outfits/copy.test.ts` | AC 5: exact-copy assertion |
| `src/App.tsx` | AC 5: `onOpenSettings: () => setSettingsOpen(true)` (oxfmt put the `ai` object on several lines, so the diff is 6 lines, one of them new logic) |
| `src/index.css` | AC 4: `.dark .outfit-ai-toggle input { accent-color: var(--green-ink); }` |

### Tests added / changed
- `aiOutfits.test.ts` › season only accepts DB ids
- `suggest.test.ts` › "removes bidi, zero-width and controls" (renamed; deliberate expectation change: U+2028 removed from its `dirty` input because U+2028/2029 now become a space, not deleted)
- `suggest.test.ts` › line/paragraph separators collapse to a space
- `suggest.test.ts` › no trailing space when the cut lands on a space (ASCII and Vietnamese)
- `OutfitsModal.test.tsx` › toggle hidden when the rule set is empty; settings error: link calls onOpenSettings; non-settings error: no settings link; no onOpenSettings: note stays text-only
- `copy.test.ts` › ai copy texts (+ `openSettings`)

### One-off Playwright check (D42), not in the repo
- Playwright lives only in the scratchpad (`...\scratchpad\pw`, Edge channel). A throwaway Vite harness (`...\scratchpad\h`, config aliasing `@` to the repo `src`, repo `index.css`) renders the real `OutfitsModal` with a mocked ready AI that rejects `not_configured` (409), or with a single "Áo" item for the empty case. Script: `...\scratchpad\pw\t032.cjs`.
- Viewport 390x844, `colorScheme` dark and light, `.dark` toggled on `<html>`; checks unchecked and checked states.
- Results (computed `accent-color` of `.outfit-ai-toggle input`):
  - dark: `rgb(191, 227, 197)` = `--green-ink` `#bfe3c5` (effective `--green` is `#0b2f24`), both unchecked and checked; `.dark` confirmed on `<html>`.
  - light: `rgb(15, 61, 46)` = `#0f3d2e`; in light `--green` and `--green-ink` are the same value, so no change. Note the plan said light is "`--green`"; the value is identical.
  - horizontal overflow at 390 px: 0 in both themes.
  - "Mở cài đặt" button visible for `not_configured`, status text is only the note, click calls `onOpenSettings` (dark and light).
  - Empty rule set: 0 switches in both themes.
- Screenshots (scratchpad): `t032-dark-unchecked.png`, `t032-dark-checked.png`, `t032-dark-*-toggle.png`, `t032-light-unchecked.png`, `t032-light-checked.png`, `t032-light-*-toggle.png` under `C:\Users\ttnminh\AppData\Local\Temp\claude\ad4729162467ccc8\0a20b6db-21ec-4934-96e5-07b6c81e7baa\scratchpad\`. Dark checked box shows a light fill with a dark check, clearly visible.

### Checks (actual output summary)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test: 7 failed | 2002 passed | 288 skipped. The 7 failures are the known Windows ones that are already failing on main: `server/ai/tagPhoto.test.ts` (3), `server/api.test.ts` (1), `server/index.cli.test.ts` (1), `server/scoping.test.ts` (1), `src/features/auth/boundary.test.ts` (1). Not touched, not fixed. All T-032 tests pass.
- build: built OK (`pnpm build`)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `.check-row input` (`index.css` ~837) uses the same dark `--green` accent; consider the same `--green-ink` override.
- Optionally re-run AI after settings change when the shown note is a settings error (today the error stays until shuffle/toggle).
- The settings link renders centred under the note in the modal (inherits `.ai-fill-link` layout); acceptable, tweak under `.outfit-body .ai-fill-link` if Ming wants it left-aligned.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see `git show --stat` (about +120 / -10 including tests).
