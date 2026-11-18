## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| src/lib/formatWait.ts (new) | The one shared `formatWait` (AC 6). |
| src/lib/formatWait.test.ts (new) | Moved `it.each` table, verbatim. |
| src/features/auth/copy.ts | Local `formatWait` deleted, import from `@/lib/formatWait` (Ming approved the swap). |
| src/features/auth/copy.test.ts | Moved `describe("formatWait")` block removed, import trimmed. |
| src/features/import-export/copy.ts | Local `formatWait` deleted; `stoppedRateLimited(imported, wait?)`; `ai.rowTagging`. |
| src/features/import-export/ImportPhotosTab.tsx | One data import, shared `formatWait`, dead code removed, `STOP_MESSAGE` lookup, `photoJobErrorText`, live row label. |
| src/features/import-export/usePhotoImport.ts | `current.index`. |
| src/features/import-export/ImportModal.tsx | AI settings load only while the Photos tab is shown. |
| src/data/photoImport.ts | `withAiStop` helper, `photoJobErrorText`. |
| src/index.css | Import modal flex column with `.import-content` as the only scroller; no nested scroller on `.photo-files`; `.check-row small` 10px on desktop. |
| tests: photoImport.test.ts, ImportPhotosTab.test.tsx, ImportModal.test.tsx | See below. |

### Tests added / changed
- src/lib/formatWait.test.ts › formatWait › 10 moved cases
- src/data/photoImport.test.ts › photoJobErrorText › 6 cases (ApiError, PhotoPrepError, PhotoSaveError with ApiError cause, PhotoSaveError with TypeError cause, TypeError, undefined/string)
- src/data/photoImport.test.ts › runPhotoImport AI › onUpdate reports the AI state before the item is saved
- ImportPhotosTab.test.tsx › a non-API error shows Vietnamese text in the failed list
- ImportPhotosTab.test.tsx › stops (T-027.1) › 429 stop message counts down with the button
- ImportPhotosTab.test.tsx › ImportPhotosTab AI › row AI label changes during the run
- ImportModal.test.tsx › photos AI › no AI settings request while the CSV or JSON tab is shown

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` no errors
- format:check: "All matched files use the correct format."
- test: Test Files 120 passed | 11 skipped (131); Tests 1561 passed | 221 skipped (1782)
- build: `✓ built in 388ms`

### One-off Playwright check (D42, harness outside the repo)
Harness: /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/t-027-3/run.cjs (run as `node run.cjs before|after`, `pnpm dev`, API mocked with page.route, AI settings "ready", 10 JPEGs). 390x844, light and dark. Screenshots in /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/t-027-3/.

| Metric (390x844) | Before (pre-change code) | After |
|---|---|---|
| footer top | 771 | 771 |
| `.import-content` bottom | 906 (135 px under the footer) | 771 (at the footer top) |
| `.import-content` scrollHeight / clientHeight | 731 / 731 (does not scroll) | 842 / 596 (scrolls) |
| `.photo-files` scrollHeight / clientHeight | 309 / 198 (nested scroller) | 309 / 309 (none) |
| rows reachable (inside content..footer and elementFromPoint hits the row) | 2 / 10 (IMG_03 partly, IMG_04..10 at 781-843, under the footer) | 10 / 10 |
| document scrollWidth | 390 | 390 |
| 429 stop note bottom / retry button bottom vs footer top 771 | 408 / 506 | 338 / 436, both above |

Same numbers in light and dark. After-screenshots: after-list-light-390-bottom.png (IMG_10.jpg visible above "Huỷ / Nhập 10 ảnh"), after-list-dark-390-top.png, after-list-{light,dark}-390-{top,bottom}.png, after-429-{light,dark}-390.png. Before: before-list-{light,dark}-390-{top,bottom}.png, before-429-*.png (the before bottom shot shows the list cut by the footer).
Desktop 1280x800: `.check-row small` computed font-size before 8px, after 10px.

### Out-of-plan files
None. (`src/features/auth/copy.ts` and `copy.test.ts` are in the plan; the change there is the import swap and the moved test block only.)

### Follow-ups (noticed, not done)
- None.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: see git diff --stat (about +330 / -90 lines incl. tests and this log).
