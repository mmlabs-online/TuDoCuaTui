## Attempt 1 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit`, no errors
- format:check: "All matched files use the correct format." (84 files)
- test: `Tests 355 passed (355)`
- test:coverage: Statements 100% (549/549), Branches 99.28% (415/418), Functions 100%, Lines 100%
- build: `✓ built in 360ms` (CSS 45.06 kB, JS 233.89 kB)

These match impl-log Attempt 1.

### Acceptance criteria (plan.md verification table)
- [x] 1. One camera input (`accept="image/*"`, `capture="environment"`) and a separate gallery input (`accept="image/*"`, no `capture`), neither `multiple`. Evidence: `src/features/items/Editor.tsx:128-135` (camera) and the existing gallery input above it; test `Editor.test.tsx › photo inputs › has one camera input and one gallery input` (line 34) passes.
- [x] 2. "Chụp ảnh" clicks the camera input; "Chọn từ thư viện" and the upload zone click the gallery input. Evidence: `Editor.tsx:106-113`; tests at `Editor.test.tsx:45` and `:53` check `spy.mock.contexts` against the exact input elements. Both pass.
- [x] 3. A file from the camera input becomes the photo through the same `upload` handler. Evidence: `Editor.tsx:134` `onChange={(e) => upload(e.target.files?.[0])}`; test `Editor.test.tsx:63` (`update("photo", "data:image/jpeg…")`) passes.
- [x] 4. Desktop keeps the single upload zone. Evidence: `src/index.css:1938-1948`: the row is `display: none` by default and becomes a grid only under `@media (hover: none) and (pointer: coarse)`. Visual check below.
- [x] 5. Bulk import unchanged. Evidence: `git diff origin/main...HEAD --stat` shows no file under `src/features/import-export/`.
- [x] 6. Copy in `EDITOR_COPY` (R6). Evidence: `src/features/items/copy.ts:4-7`; `Editor.tsx:108,111` use `EDITOR_COPY.photo.*` and add no new inline literals.
- [x] 7. Checks green. See above.

#### Visual check (reviewer, Playwright Chromium, `vite preview` of the build, local mode, deviceScaleFactor 1)
- **390×844, `isMobile` + `hasTouch`** (`matchMedia('(hover: none) and (pointer: coarse)')` = true), new item editor:
  - Light: the row shows as a grid. "Chụp ảnh" and "Chọn từ thư viện" sit side by side under the yellow upload zone, each 172×39 px, and the text fits (`scrollWidth` = `clientWidth` = 170). They have a cream `#fff8eb` text and border on a transparent background over the chocolate column `rgb(59,42,34)`, which reads clearly and matches the "Tự điền từ ảnh" button below. There is no horizontal overflow (`documentElement.scrollWidth` = 390).
  - Dark: same layout. The column is `rgb(38,29,25)` and the buttons are still cream on dark, so they stay readable.
- **1280×900 desktop** (media query false), light and dark: `.photo-source-actions` is `display: none` (0×0). The photo column shows only the upload zone, the caption card and "Tự điền từ ảnh", the same as before.
- Screenshots (session scratchpad): `F-1002-{mobile-light,mobile-dark,desktop-light,desktop-dark}-{new,photo-column}.png`.
- Not verifiable here: whether a real Android Chrome or iOS Safari opens the camera or the gallery. That is in Ming's list below.

### Issues
None.

### Scope
Changed source files are `Editor.tsx`, `copy.ts`, `index.css` and `Editor.test.tsx` (new). All four are in the plan's file list. The rest of the diff is ticket bookkeeping under `work/tickets/F-1002/`. There are no out-of-plan files.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no data access change. The photo still goes through `update("photo", …)`, so local mode is unaffected and it ran fine in the preview.
- R3 and R4: no storage, env or secret changes.
- R6: the new labels live in `copy.ts`.
- R8: there is no new pure logic. The changed UI behaviour is covered by 4 component tests.
- R9: checked at 390px in light and dark mode (see above).
- R10: `vite.config.ts`, `.figma/` and `AGENTS.md` are untouched.

### Nits (do not block)
- `index.css:1949`: `.photo-source-actions .btn` is not scoped under `.photo-column`. That is harmless today because the class is only used there.
- The global `.btn:hover` orange ring can "stick" after a tap on touch devices. This is cosmetic, and the "Tự điền từ ảnh" button already behaves the same way.

### Ming verification after merge
- Android Chrome: open an item editor. "Chụp ảnh" should open the rear camera directly, and a photo you take should show in the editor. "Chọn từ thư viện" should open the gallery or file picker, not only the camera.
- iOS Safari: the same two checks. "Chụp ảnh" should open the rear camera, and "Chọn từ thư viện" should open the photo library or file picker.
- Whether the photo then saves on a real phone (HEIC, size) belongs to F-202.1, not this ticket.

### Follow-ups (out of scope)
- The input value is not reset after a pick, so picking the same file again after "Bỏ ảnh" does not fire `change`. This was already the case before this ticket and now applies to both inputs.
