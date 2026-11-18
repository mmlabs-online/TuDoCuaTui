Status: READY

# Plan — T-027.3: Polish the bulk photo import UI

## Feature summary
Not a feature-list item: polish of F-603 / F-703 (split of T-027). Sources quoted:

- Ticket scope: "In the edit phase with many files, the file list scrolls inside the modal and is never hidden under
  the footer at 390×844." / "Per-row AI labels update while the batch runs, not only at the end." / "The AI note under
  the checkbox is readable on desktop (not 8px)." / "Errors in the failed list are always Vietnamese (non-API errors
  included)." / "AI settings load only when the Photos tab is shown, not when only CSV or JSON is used." / "Move
  `formatWait` to one shared module used by auth and import-export (respecting `auth/boundary.test.ts`)." / "Remove dead
  code (`if (editing)`, `disabled={!editing}` inside `editing &&`), the duplicate `@/data/photoImport` import, and the
  repeated AI stop-reason code in `photoImport.ts`."
- F-703 review, follow-ups: "Edit phase with 5 files: `.import-content` measures 175–862 (taller than the 844 viewport
  …), so the end of the file list sits under the footer." / "Per-row AI state could show live for the current file."
  Nits: "two import statements from `@/data/photoImport`"; "`ImportModal.tsx` loads AI settings on every modal open,
  even when the user only uses the CSV/JSON tabs (one extra GET)"; "the `...(aiOff ? { aiStopped: aiOff as string } :
  {})` spread is repeated three times". F-703 impl-log: "`.check-row small` uses 8px on desktop (existing rule)".
- F-603 review: "Failed-list messages use `(j.error as Error).message`; a non-API error (e.g. a browser `TypeError` …)
  would show English text." / "`ImportPhotosTab.tsx:49,63,74,86`: `if (editing)` / `disabled={!editing}` are now
  always true/false inside the `editing &&` block" / follow-up "Move `formatWait` to a shared module (outside
  `features/auth`) and use it from both copies."
- T-027.1 review, nits (added to scope by the orchestrator, see Assumptions A1): "`ImportPhotosTab.tsx:187-195`: the
  plan said 'a lookup by `stopped.code`'; the code is a 5-level nested ternary … T-027.3 (polish) can turn it into a
  map." / "The 429 stop message keeps the static wait from the first answer ('thử lại sau 2 phút') while the button
  counts down; … T-027.3 could drop the duplicate wait from the message."
- Rules: R6 (copy in one place), R8 (pure logic tested), R9 (390px and dark mode). D42 (one-off Playwright, outside
  the repo).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | At 390×844 with 10 files picked (edit phase), the whole file list can be reached by scrolling `.import-content` and no row is hidden under the footer; light and dark. | One-off Playwright check (see Approach §9), numbers + screenshots recorded in impl-log; reviewer re-runs it. |
| 2 | Per-row AI labels change during the run: the row of the file being tagged shows "Chờ · AI đang xem ảnh"; a row whose tag finished shows its AI label before the batch ends. | `ImportPhotosTab.test.tsx › ImportPhotosTab AI › row AI label changes during the run`; `photoImport.test.ts › onUpdate reports the AI state before the item is saved`. |
| 3 | The AI note under the checkbox is not 8px on desktop. | `src/index.css` `.check-row small` desktop `font-size: 10px` (diff); Playwright desktop step reads computed `font-size` = `10px`. Mobile rule (12px) unchanged. |
| 4 | No English error text in the failed list (non-API error included). | `photoImport.test.ts › photoJobErrorText …` (6 cases); `ImportPhotosTab.test.tsx › a non-API error shows Vietnamese text in the failed list`. |
| 5 | No AI settings request while the CSV or JSON tab is shown; the Photos tab loads them (see A2 on wording). | `ImportModal.test.tsx › photos AI › no AI settings request while the CSV or JSON tab is shown`; existing `photos AI` tests stay green. |
| 6 | `formatWait` is defined once (`src/lib/formatWait.ts`) and both auth and import-export import it. | `grep -rn "function formatWait" src` → exactly one hit; `src/lib/formatWait.test.ts` (cases moved verbatim); `src/features/auth/boundary.test.ts` green. |
| 7 | Dead code, the duplicate import and the repeated `aiStopped` spread are gone; the stop message is picked by a lookup keyed on `stopped.code`. | Diff review of `ImportPhotosTab.tsx` and `photoImport.ts`; all existing stop tests (`stops (T-027.1)`, `429 shows imported count and wait time`) green. |
| 8 | The 429 stop message shows the same wait as the counting-down "Thử lại sau …" button, and no wait once the button is enabled. | `ImportPhotosTab.test.tsx › stops (T-027.1) › 429 stop message counts down with the button`. |
| 9 | All checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
- On a real phone (390-ish width, browser chrome visible), light and dark: pick ~10 photos on the Photos tab; the file
  list scrolls inside the modal between the tabs and the footer and the last file is reachable above "Huỷ / Nhập 10 ảnh".

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/lib/formatWait.ts` (new) | The one `formatWait(seconds)` (body copied from `auth/copy.ts:130`). | Scope: shared module; `src/lib` is outside `features/auth`, and auth already imports from `@/lib` (`@/lib/theme`), so `boundary.test.ts` holds. |
| `src/lib/formatWait.test.ts` (new) | The `describe("formatWait")` `it.each` table moved verbatim from `auth/copy.test.ts`. | R8; keeps the existing cases. |
| `src/features/auth/copy.ts` | Delete the local `formatWait`; `import { formatWait } from "@/lib/formatWait"`. `authErrorMessage` unchanged. | AC 6. |
| `src/features/auth/copy.test.ts` | Remove `formatWait` from the `./copy` import and the moved `describe("formatWait")` block; nothing else. | Cases now live in `src/lib/formatWait.test.ts`; `rate_limited with and without a wait` still covers the auth use. |
| `src/features/import-export/copy.ts` | Delete the local `formatWait`. `photos.stoppedRateLimited(imported, wait?)` (wait omitted → no wait text). Add `photos.ai.rowTagging: "AI đang xem ảnh"`. | AC 6, 8, 2 (R6: copy in one place). |
| `src/features/import-export/ImportPhotosTab.tsx` | One `@/data/photoImport` import; `formatWait` from `@/lib/formatWait`; drop dead `if (editing)` / `disabled={!editing}` (4 spots); `STOP_MESSAGE` lookup; 429 message from `photos.cooldownSec`; failed list via `photoJobErrorText`; row label shows `AI.rowTagging` for the current file while tagging. | AC 2, 4, 6, 7, 8. |
| `src/features/import-export/usePhotoImport.ts` | `current` gains `index: number` (the job index from `onCurrent(i)`). | AC 2: the tab needs to know which row is being tagged. |
| `src/features/import-export/ImportModal.tsx` | `useAiLoad(tab === 0 ? ai?.settings : undefined, ai?.settingsRev)`. | AC 5. |
| `src/data/photoImport.ts` | `withAiStop` helper replacing the 3 repeated spreads; new pure `photoJobErrorText(error)`. | AC 4, 7. |
| `src/data/photoImport.test.ts` | Tests for `photoJobErrorText` and live AI state via `onUpdate`. | R8, AC 2, 4. |
| `src/features/import-export/ImportPhotosTab.test.tsx` | 3 new tests (below). Existing tests unchanged. | AC 2, 4, 8. |
| `src/features/import-export/ImportModal.test.tsx` | 1 new test (below). Existing tests unchanged. | AC 5. |
| `src/index.css` | Import modal as a flex column with `.import-content` as the only scroller; drop the nested 200px scroll on `.photo-files`; `.check-row small` 10px on desktop. | AC 1, 3. |

Not touched: `src/features/items/useAiLoad.ts` (gating by passing `undefined` settings already makes it skip the
request, `useAiLoad.ts:15`), `src/components/Modal.tsx` (the CSS scopes by `:has()`), `src/App.tsx`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/lib/formatWait.test.ts › formatWait › %s → %s` (moved table: 1, 59, 60, 61, 900, 3600, 3601, 0, -5, NaN) | AC 6, no lost coverage |
| `src/data/photoImport.test.ts › photoJobErrorText › ApiError keeps its Vietnamese message` | AC 4 |
| `… › photoJobErrorText › PhotoPrepError keeps its Vietnamese message` | AC 4 |
| `… › photoJobErrorText › PhotoSaveError with an ApiError cause keeps its message` | AC 4 |
| `… › photoJobErrorText › PhotoSaveError with a non-API cause (TypeError) → API_ERROR_COPY.photoNotSaved, no English` | AC 4 |
| `… › photoJobErrorText › TypeError("Failed to fetch") → API_ERROR_COPY.generic` | AC 4 |
| `… › photoJobErrorText › undefined / a string → API_ERROR_COPY.generic` | AC 4 edge |
| `src/data/photoImport.test.ts › onUpdate reports the AI state before the item is saved` (tag resolves; one `onUpdate` call has `jobs[0].ai === "filled"` while `jobs[0].state === "pending"`) | AC 2 (runner side) |
| `ImportPhotosTab.test.tsx › ImportPhotosTab AI › row AI label changes during the run` (pending promise; `onCurrent(0)` + `onTagging(0, true)` → row "Chờ · AI đang xem ảnh"; `onTagging(0, false)` + `onUpdate(jobs with [0].ai = "filled")` → row "Chờ · AI đã điền"; row of file 2 has no AI text; all before release) | AC 2 |
| `ImportPhotosTab.test.tsx › a non-API error shows Vietnamese text in the failed list` (job `failed` with `new TypeError("Failed to fetch")` → `a.jpg: Có lỗi xảy ra, thử lại nhé`; `queryByText(/Failed to fetch/)` null) | AC 4 |
| `ImportPhotosTab.test.tsx › stops (T-027.1) › 429 stop message counts down with the button` (fake timers, `retryAfterSec: 90`: message has "thử lại sau 2 phút" like the button; +30 s → both "1 phút"; +60 s → button "Thử lại (1)" and the message has "bấm Thử lại để tiếp tục" and no "thử lại sau") | AC 8 |
| `ImportModal.test.tsx › photos AI › no AI settings request while the CSV or JSON tab is shown` (mount → `get` ×1; click "CSV / Excel", `rerender(1)`; click "JSON (backup)", `rerender(2)` → still ×1; click "Ảnh hàng loạt" → `waitFor` ×2) | AC 5 |

Existing tests that must stay green without edits (besides the `auth/copy.test.ts` move): all of
`ImportPhotosTab.test.tsx` (incl. `429 shows imported count and wait time`: `retryAfterSec 7200` → `cooldownSec` 7200 →
"thử lại sau 2 giờ nhé", same as today), `ImportModal.test.tsx`, `photoImport.test.ts`, `auth/*.test.ts*`,
`auth/boundary.test.ts`, `shared/ai/boundary.test.ts`.

## Approach
1. **Shared `formatWait`** (R6). Create `src/lib/formatWait.ts`:
   `/** "2 giờ" / "5 phút" from a Retry-After in seconds; unknown → "ít phút". */ export function formatWait(seconds: number): string`
   with the existing body. Delete both local copies; `auth/copy.ts` and `ImportPhotosTab.tsx` import from
   `@/lib/formatWait`. Move the `it.each` table to `src/lib/formatWait.test.ts`. No file outside `features/auth`
   mentions `features/auth`, so `boundary.test.ts` (line 59–67) stays green; the new file has none of the `NOWHERE`
   tokens.
2. **`photoImport.ts` cleanup.** Inside `runPhotoImport` add
   `const withAiStop = <T extends object>(r: T) => (aiOff ? { ...r, aiStopped: aiOff } : r);` and use it in the three
   returns: `return withAiStop({ jobs: cur, stopped: stop })`, `return withAiStop({ jobs: cur })` (abort after wait),
   and the final `return withAiStop({ jobs: cur })`. Drop the `as string` casts (`aiOff` is narrowed). Return type
   unchanged.
3. **`photoJobErrorText(error: unknown): string`** in `photoImport.ts` (pure, R6 copy reused from `API_ERROR_COPY`):
   `ApiError` or `PhotoPrepError` → `error.message` (both are built from Vietnamese copy, `apiErrors.ts:68`,
   `photoPrep.ts:56`); `PhotoSaveError` → `error.cause instanceof ApiError ? error.message : API_ERROR_COPY.photoNotSaved`
   (its message embeds `cause.message`, English for a non-API cause, `apiErrors.ts:83`); anything else →
   `API_ERROR_COPY.generic`. Import `PhotoPrepError` from `./photoPrep` and `API_ERROR_COPY` from `./apiErrors`.
4. **Live per-row AI label.** `usePhotoImport.ts`: `current` type gets `index: number`; `onCurrent: (i) =>
   setCurrent({ index: i, k: …, n: …, name: jobs[i].name, tagging: false })`. `ImportPhotosTab.tsx` list:
   `jobs.map((j, i) => …)`, AI text = `current?.tagging && current.index === i ? AI.rowTagging : j.ai && AI.state[j.ai]`,
   rendered as `` ` · ${text}` `` when set. Finished-tag labels already arrive live through `onUpdate: setJobs`
   (`photoImport.ts` `patch` → `opts.onUpdate`); the new runner test pins that.
5. **`ImportPhotosTab.tsx` tidy-up.** One import line `import { AI_BATCH_OFF, exceedsDailyLimit, PHOTO_DAILY_LIMIT,
   photoJobErrorText, type PhotoStop } from "@/data/photoImport"`. Inside `editing && (…)`: `onDragOver` calls
   `setDragging(true)` unconditionally; remove `disabled={!editing}` from the "Chọn ảnh từ máy" `Btn`, the location
   `input` and the status `select`. Failed list: `{j.file.name}: {photoJobErrorText(j.error)}`.
6. **Stop message lookup** (T-027.1 nit). Module-level, exhaustive by type:
   ```ts
   const STOP_MESSAGE: Record<PhotoStop["code"], (done: number, waitSec: number) => string> = {
     rate_limited: (done, sec) => PHOTOS.stoppedRateLimited(done, sec > 0 ? formatWait(sec) : undefined),
     photo_quota_exceeded: (done) => PHOTOS.stoppedQuota(done),
     unauthorized: (done) => PHOTOS.stoppedUnauthorized(done),
     network: (done) => PHOTOS.stoppedNetwork(done),
     unavailable: (done) => PHOTOS.stoppedUnavailable(done),
   };
   ```
   Render `{STOP_MESSAGE[stopped.code](done, photos.cooldownSec)}`. The 429 wait now comes from the same
   `cooldownSec` the button uses, so both count down together; when `cooldownSec` is 0 (no Retry-After, or elapsed) the
   message carries no wait.
7. **Copy (`import-export/copy.ts`, R6).**
   `stoppedRateLimited: (imported: number, wait?: string) => wait ? "Đã dừng: đã nhập ${imported} ảnh. Bạn đã đạt giới
   hạn tải ảnh trong 24 giờ, thử lại sau ${wait} nhé. Các ảnh còn lại vẫn nằm trong danh sách." : "Đã dừng: đã nhập
   ${imported} ảnh. Bạn đã đạt giới hạn tải ảnh trong 24 giờ — bấm Thử lại để tiếp tục. Các ảnh còn lại vẫn nằm trong
   danh sách."` (the first form is today's text, so the existing test regex still matches).
   `photos.ai.rowTagging: "AI đang xem ảnh"`.
8. **AI settings only on the Photos tab.** `ImportModal.tsx`: `const aiLoad = useAiLoad(tab === 0 ? ai?.settings :
   undefined, ai?.settingsRev);`. While CSV/JSON is shown the effect sees `settings === undefined` and returns
   (`useAiLoad.ts:15`), so neither the tab switch nor a `settingsRev` bump fetches; switching back to Photos re-runs the
   effect once (fresh availability). `load` keeps its last value meanwhile, so the AI row does not flash "loading".
   Tabs are disabled while a photo run is in progress (`ImportModal.tsx` `disabled={… photosBusy …}`), so `tab` stays 0
   during a run and `tagger` gating is unaffected.
9. **CSS (`src/index.css`), R9.** Exact change:
   - Delete from `.photo-files` (line ~2436) the two declarations `max-height: 200px;` and `overflow-y: auto;` (the
     rule keeps nothing else; delete the empty rule). The list then flows and is scrolled with the rest of the content,
     no nested scroller.
   - Add, right after the `.import-content { padding: 22px 24px; min-height: 400px; }` rule (line ~777), not inside a
     media query:
     ```css
     /* Import modal: header, tabs and footer stay put; only the content scrolls (T-027.3). */
     .modal:has(> .import-content) {
       display: flex;
       flex-direction: column;
     }
     .modal:has(> .import-content) > .modal-header,
     .modal:has(> .import-content) > .tabs,
     .modal:has(> .import-content) > .modal-footer {
       flex: none;
     }
     .modal:has(> .import-content) > .import-content {
       flex: 1 1 auto;
       overflow-y: auto;
       overscroll-behavior: contain;
     }
     ```
     Why it works: `.modal` already has `max-height: 95dvh` (mobile, line ~1267) / `calc(100dvh - 40px)` (desktop), so
     the column's height is clamped and `.import-content` (the only shrinkable item; `flex: none` stops the
     `overflow: hidden` import header and the `overflow: auto` mobile tabs from collapsing) shrinks to the space
     between tabs and footer and scrolls its own overflow. The footer is a separate flex item after it, so nothing can
     be painted under it. `min-height: 400px` still applies as the floor; at 844 px the space is about
     802 − 126 (header) − ~45 (tabs) − ~70 (footer) ≈ 560 px. `.modal` keeps `overflow: auto` and the footer keeps
     `position: sticky`, so on a viewport too short for the 400 px floor the old whole-modal scroll is the fallback.
     Only `ImportModal` renders `.import-content` (grep), so no other modal changes; the CSV and JSON tabs get the same
     inner scroll. `:has()` avoids touching the shared `Modal.tsx`.
   - `.check-row small` (line ~833): `font-size: 8px` → `font-size: 10px` (matches `.bulk-drop p`, `.csv-error` on
     desktop). The `@media (max-width: 650px)` override to 12px (line ~2601) is unchanged. No colours change, so dark
     mode tokens stay as they are.
10. **One-off Playwright check (D42; script in the session scratchpad, not in the repo).** Same harness style as
    T-027.1 (`pnpm dev` with Playwright `page.route` mocking `/healthz`, `/api/**` and the AI settings GET as "ready",
    so the AI row is shown). Viewport 390×844, run twice: `colorScheme: "light"` and `"dark"` (plus the app's dark
    theme switch if the harness used it). Open the import modal, stay on "Ảnh hàng loạt", `setInputFiles` on
    `input[type=file]` with 10 small JPEGs (`IMG_01.jpg` … `IMG_10.jpg`). Record in impl-log:
    - `footerTop = .modal-footer.getBoundingClientRect().top`; `content = .import-content` rect: `content.bottom ≤
      footerTop + 0.5` (content never under the footer) and `content.scrollHeight > content.clientHeight` (it scrolls).
    - `.photo-files` `scrollHeight === clientHeight` (no nested scroller); `document.scrollingElement.scrollWidth ===
      390`.
    - For each of the 10 `.photo-files li`: `li.scrollIntoView({ block: "nearest" })`, then its rect lies within
      `[content.top, footerTop]` and `document.elementFromPoint(centre of li)` is the li or inside it (not the
      footer). Screenshot after scrolling `.import-content` to the bottom (`IMG_10.jpg` visible above "Huỷ / Nhập 10
      ảnh") and at the top.
    - Regression of F-603/T-027.1 layout: click "Nhập 10 ảnh" with the first photo PUT answering 429 (Retry-After 90):
      the stop note and "Thử lại sau 2 phút" are above `footerTop` at `scrollTop` 0.
    - Desktop 1280×800: computed `font-size` of `.check-row small` is `10px`.

Rules: R1 unchanged (no new fetch; AI settings still through `useAiLoad` → the existing client). R6: all new text in
`import-export/copy.ts` or reused `API_ERROR_COPY`; `formatWait` is shared wait copy in one module. R7: only the items
above. R8: `photoJobErrorText`, `withAiStop` path and `formatWait` covered by unit tests. R9: §10. R2–R5 not touched.

## Specialist input used
None (no consult files; areas `ui` only).

## Assumptions
- A1 (in scope by the orchestrator, from the T-027.1 review nits): the stop message is picked by a lookup keyed on
  `stopped.code` (Approach §6), and the 429 stop message shows the same counting-down wait as the "Thử lại sau …"
  button, with no wait once the button is enabled (Approach §6–7). Chosen over dropping the wait from the message so the
  existing `429 shows imported count and wait time` test stays green unchanged.
- A2 (scope wording conflict, flagged): the modal always opens on the Photos tab (`ImportModal.tsx` `useState(0)`; all
  three `setImportOpen(true)` callers in `App.tsx` pass no tab), so the AC text "Opening the import modal on the CSV or
  JSON tab makes no AI settings request" cannot happen as written. Planned meaning: the request is tied to the Photos
  tab being shown — none while CSV or JSON is shown (switching there, or a `settingsRev` bump there, fetches nothing),
  one when Photos is shown again. The one GET at open remains because Photos is the opening tab. Rejected alternative:
  defer the GET until a file is picked — it changes the F-703 AI row (it is shown before any pick) and would break the
  existing `photos AI` tests. Changing the default tab is out of scope. Ming can override; it does not block.
- A3: `src/features/auth/copy.ts` and `copy.test.ts` match the High risk-tier glob `src/features/auth/**`, but the
  change is a behaviour-free import swap of a pure text helper (no auth flow, token, cookie or network code), and the
  ticket's Gate is `none`. Reviewer confirms the diff there is only the import and the moved test block.
- A4: "Per-row AI labels only appear after the run" (F-703 impl-log) is only true for the file being tagged: finished
  tags already reach the list through `onUpdate`. The plan adds the live "AI đang xem ảnh" label for that row and pins
  the existing live update with a runner test, rather than changing the runner.
- A5: `formatWait` lives in `src/lib/` (shared helpers, already imported by auth via `@/lib/theme`) rather than
  `src/constants/`; it returns Vietnamese text, which R6 allows in one shared place.
- A6: `:has()` is supported by the app's target browsers (Safari ≥ 15.4, Chrome ≥ 105, Firefox ≥ 121). Without it the
  rules simply do not apply and the modal behaves as today (whole-modal scroll).
- Hotspots: no other open ticket (`IN_PROGRESS` / `REVIEW` / `DONE`) edits these files; T-027.2 (`BACKLOG`) is about the
  photo worker. `src/App.tsx` is not edited.

## Blocking questions
None.

## Split proposal
None (about 150 changed lines including tests).
