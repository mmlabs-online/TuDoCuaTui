Verdict: PASS

## Attempt 1 — 2026-11-18

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json`, no errors (exit 0)
- format:check: "All matched files use the correct format." (302 files)
- test: Tests 1561 passed | 221 skipped (1782). This matches impl-log.
- build: `✓ built in 359ms`

### Acceptance criteria
- [x] 1. At 390×844 with 10 files, the whole list can be reached and nothing sits under the footer, in light and dark. Evidence: I re-ran the implementer's harness (copy in scratchpad `rev/run.cjs`, `node run.cjs after`). Light and dark gave the same numbers: footerTop 771, `.import-content` 175–771, scrollHeight/clientHeight 842/596, `.photo-files` 309/309 (no nested scroller), document scrollWidth 390, and **10/10 rows reachable**. The 429 note bottom is at 338 and the retry button bottom at 436, both above the footer. In the screenshots, `after-list-light-390-bottom.png` shows IMG_10.jpg above "Huỷ / Nhập 10 ảnh", and `after-list-dark-390-top.png` and `after-429-dark-390.png` look correct.
- [x] 2. The per-row AI label changes during the run. Evidence: `ImportPhotosTab.test.tsx › ImportPhotosTab AI › row AI label changes during the run` and `photoImport.test.ts › runPhotoImport AI › onUpdate reports the AI state before the item is saved` both pass. The code is at `ImportPhotosTab.tsx:228-229` and `usePhotoImport.ts:101-107` (`index: i`).
- [x] 3. The AI note is not 8px on desktop. Evidence: `src/index.css:851` is now `font-size: 10px`. The harness at 1280 reports `check-row small font-size 10px`. The mobile 12px override (`index.css:2611`) is unchanged, and `.check-row` is only used in `ImportPhotosTab.tsx:130`.
- [x] 4. The failed list never shows English text. Evidence: `photoJobErrorText` (`src/data/photoImport.ts:149-155`) has 6 unit tests and passes them. `ImportPhotosTab.test.tsx › a non-API error shows Vietnamese text in the failed list` also passes. I checked that the function always returns Vietnamese:
  - `ApiError.message` comes from `apiErrorMessage` and falls back to `API_ERROR_COPY.generic`.
  - `PhotoPrepError.message` comes from `EDITOR_COPY`.
  - `PhotoSaveError` keeps its message only when the cause is an `ApiError`. Otherwise it returns fixed copy, because its message can embed an English `cause.message`.
  - Anything else, including `WorkerUnavailableError` ("photo worker unavailable"), gets generic copy.
  - In `repo.http.ts:83-106`, prep runs outside the `try`, so a `PhotoSaveError` never wraps a `PhotoPrepError`. No Vietnamese prep message is lost.
- [x] 5. AI settings are not requested while the CSV or JSON tab is shown. Evidence: `ImportModal.test.tsx › photos AI › no AI settings request while the CSV or JSON tab is shown` passes, and the code is at `ImportModal.tsx:50`. In the browser, my own run (`rev/imp.cjs`) counted the AI-settings GETs before and after switching to CSV and then JSON. The count did not change, at 390 and at 1280. I accept the planner's reading A2 of the wording: the modal always opens on the Photos tab.
- [x] 6. `formatWait` exists once and both features use it. Evidence: `grep -rn "function formatWait" src` returns only `src/lib/formatWait.ts:2`. `auth/copy.ts:1` and `ImportPhotosTab.tsx:19` both import it from `@/lib/formatWait`. The body is identical to both deleted copies. The test table in `src/lib/formatWait.test.ts` is verbatim: the same 10 cases in the same order as the block removed from `auth/copy.test.ts`. `auth/boundary.test.ts` is green.
- [x] 7. The dead code, the duplicate import and the repeated spread are gone, and the stop message comes from a lookup. Evidence: `ImportPhotosTab.tsx:7-13` is one import, the `if (editing)` and the three `disabled={!editing}` are removed, and `photoImport.ts:170` holds the `withAiStop` helper used in 3 returns. `STOP_MESSAGE` (`ImportPhotosTab.tsx:24-31`) is a `Record<PhotoStop["code"], …>`, so TypeScript checks it covers every code: rate_limited, photo_quota_exceeded, unauthorized, network and unavailable (`photoImport.ts:77`). The existing stop tests are unchanged and green.
- [x] 8. The 429 message counts down with the button. Evidence: `ImportPhotosTab.test.tsx › stops (T-027.1) › 429 stop message counts down with the button` passes. Message and button both read "2 phút", then "1 phút", then the message says "bấm Thử lại để tiếp tục" with no wait and the button reads "Thử lại (1)". Both get their value from `photos.cooldownSec` (`ImportPhotosTab.tsx:197,212-214`).
- [x] 9. All checks pass (see above).

### Scope
- `src/features/auth/**` has only two changes, and neither changes behaviour:
  - `copy.ts`: an `import { formatWait } from "@/lib/formatWait"` was added and the local function deleted. `authErrorMessage` is unchanged, and `formatWait` is still reachable through the import.
  - `copy.test.ts`: `formatWait` was removed from the import, and the `describe("formatWait")` block was removed (moved verbatim).
- Every other changed file is listed in the plan. `ticket.md` only changes the state, the claim and Ming's approval note. No out-of-plan files.
- The CSS change is scoped to the import modal. The new rules only match `.modal:has(> .import-content)`, and only `ImportModal.tsx:132` renders `.import-content`. I checked the other modals with my own Playwright run (`rev/modals.cjs`: Editor, Confirm "Bỏ thay đổi?" and AI settings, at 390×844 and 1280×800, light and dark):
  - every `.modal` still computes `display: block; overflow-y: auto`;
  - document scrollWidth equals the viewport;
  - the screenshots look as before.

  The CSV and JSON tabs of the import modal at 390 dark also end exactly at the footer top (771/771) and look correct. On desktop at 1280, the photo tab content scrolls between the tabs and the footer (650/650).

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no new fetch; AI settings still go through `useAiLoad`.
- R6: all new copy (`rowTagging`, the second form of `stoppedRateLimited`) is in `import-export/copy.ts`, and the error copy reuses `API_ERROR_COPY`.
- R8: the new pure logic (`photoJobErrorText`, `withAiStop` path, `formatWait`) has tests.
- R9: verified at 390 and in dark mode.
- R2–R5 are not touched.

### Nits (do not block)
- When a 429 comes without Retry-After, the stop message used to say "thử lại sau ít phút" and now says "bấm Thử lại để tiếp tục", while the button is enabled. This is consistent with the button and intended by plan A1/§6. It is a small copy change Ming may notice.
- In `pnpm dev` the import modal makes 2 AI-settings GETs at open. That is the StrictMode double effect, the same as before this change. Switching tabs adds none.

### Ming verification after merge
- On a real phone (about 390 wide, with browser chrome visible), in light and dark: pick about 10 photos on the Photos tab. The file list should scroll inside the modal between the tabs and the footer, and the last file should be reachable above "Huỷ / Nhập 10 ảnh".

### Follow-ups (out of scope)
- None.
