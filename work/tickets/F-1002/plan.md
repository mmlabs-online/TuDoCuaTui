Status: READY

# Plan — F-1002: Camera capture on photo inputs

## Feature summary
`docs/feature-list.md` F-1002:
> #### F-1002 · Camera capture · P0 · M1 · S
> - Photo inputs use `accept="image/*" capture="environment"` on mobile, while keeping the gallery option.

`work/decisions.md` D2 (changes how the feature is built):
> | D2 | 2026-11-07 | Camera capture | Two buttons on mobile ("Chụp ảnh" with `capture="environment"`, "Chọn từ thư viện" without). Desktop keeps one upload zone. | `capture` hides the gallery on Android Chrome | F-1002 |

Ticket scope:
> - Two actions on mobile: "Chụp ảnh" (`accept="image/*" capture="environment"`) and "Chọn từ thư viện"
>   (`accept="image/*"`, no `capture`). Desktop keeps the single upload zone.
> - Apply this to the editor photo. The bulk import tab only uses the gallery input (multiple files).

Out of scope (ticket): in-app camera with `getUserMedia`.

## Acceptance criteria → verification
The ticket's only criterion ("On Android Chrome and iOS Safari, 'Chụp ảnh' opens the rear camera and
'Chọn từ thư viện' opens the gallery") needs real phones, so it is under *Ming verification*. The reviewer
checks the parts that can be observed locally:

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | The editor has a camera input with `accept="image/*"` and `capture="environment"`, and a separate gallery input with `accept="image/*"` and no `capture` (D2). | `src/features/items/Editor.test.tsx › photo inputs › has one camera input and one gallery input` |
| 2 | "Chụp ảnh" triggers the camera input; "Chọn từ thư viện" and the upload zone trigger the gallery input. | `Editor.test.tsx › photo inputs › "Chụp ảnh" clicks the camera input` and `› "Chọn từ thư viện" and the upload zone click the gallery input` |
| 3 | A file chosen through either input becomes the item photo (same `upload` path as today). | `Editor.test.tsx › photo inputs › a file from the camera input sets the photo` |
| 4 | Desktop keeps the single upload zone: the two buttons are hidden unless the device is touch-first. | Code review of the CSS rule (hidden by default, shown only under `@media (hover: none) and (pointer: coarse)`); in `pnpm dev` on desktop the editor shows only the upload zone; in Chrome DevTools device mode (iPhone 12 Pro, 390px, touch emulation, reload) both buttons appear under the zone, in light and dark mode (R9). |
| 5 | Bulk import tab unchanged (gallery only). | `git diff --stat` shows no change under `src/features/import-export/`. |
| 6 | Copy lives in `EDITOR_COPY` (R6). | Code review: the two labels come from `src/features/items/copy.ts`, no new inline literals. |
| 7 | Checks green (R8). | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
- Android Chrome: open an item editor → "Chụp ảnh" opens the rear camera directly; take a photo → it shows
  in the editor. "Chọn từ thư viện" opens the gallery / file picker (not the camera only).
- iOS Safari: same two checks ("Chụp ảnh" → rear camera; "Chọn từ thư viện" → photo library / file picker).
- Note: whether the photo then **saves** to Supabase/Drive on a real phone (HEIC, size) belongs to F-202.1,
  not this ticket.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/items/Editor.tsx` | Add a second hidden `<input type="file" accept="image/*" capture="environment">` with its own ref; add a `photo-source-actions` row with two `Btn`s ("Chụp ảnh" → camera input, "Chọn từ thư viện" → existing gallery input). Both inputs use the existing `upload` handler. | The ticket's only code file (ticket Technical notes); D2. |
| `src/features/items/copy.ts` | Add `EDITOR_COPY.photo = { takePhoto: "Chụp ảnh", pickFromLibrary: "Chọn từ thư viện" }`. | R6: UI copy in one place per feature. |
| `src/index.css` | Add `.photo-source-actions` (hidden by default; under `@media (hover: none) and (pointer: coarse)`: two-column grid, gap, margin-top), plus button colours that read on the dark `--chocolate` photo column in both themes (follow the `.photo-column .ai-btn` pattern). | "Desktop keeps the single upload zone" (D2); R9. |
| `src/features/items/Editor.test.tsx` (new) | Component tests listed below. | R8 (changed UI behaviour; no pure-logic module needed). |

No other file. `src/features/import-export/ImportPhotosTab.tsx` is **not** touched: it has no file input
yet (the "pick photos" button is a placeholder); the real multi-file gallery input arrives with F-603.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `Editor.test.tsx › photo inputs › has one camera input and one gallery input` | Exactly two `input[type=file]` in the editor; both `accept="image/*"`; exactly one has `capture="environment"`; the other has no `capture` attribute; neither has `multiple`. |
| `Editor.test.tsx › photo inputs › "Chụp ảnh" clicks the camera input` | Spy `HTMLInputElement.prototype.click`; clicking the button calls it with the camera input as `this` (`spy.mock.contexts`). |
| `Editor.test.tsx › photo inputs › "Chọn từ thư viện" and the upload zone click the gallery input` | Both triggers call `click` on the input without `capture`. |
| `Editor.test.tsx › photo inputs › a file from the camera input sets the photo` | `fireEvent.change` on the camera input with a small `File` (`image/jpeg`) → `update` mock called with `("photo", <string starting "data:image/jpeg">)` (use `waitFor`, FileReader is async in jsdom). |

Render helper: `Editor` with a blank `Item` (reuse `blankItem` from `src/features/items/blankItem.ts` if its
signature fits, else an inline `makeItem` like `ItemCard.test.tsx`), `isNew`, `saving=false`, `vi.fn()`
callbacks, `locations=[]`. Query inputs via `document.querySelectorAll` (Modal may portal). Buttons by
role/name using `EDITOR_COPY.photo.*`. `afterEach(cleanup)` and `vi.restoreAllMocks()`.

## Approach
1. `copy.ts`: add the `photo` group.
2. `Editor.tsx`:
   - `const camera = useRef<HTMLInputElement>(null);` next to the existing `file` ref.
   - After the existing hidden gallery input, add the camera input:
     `<input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files?.[0])} />`
     (React types `capture` as `boolean | "user" | "environment"`, so this typechecks.)
   - Directly under the upload zone (before `.photo-caption`), add
     `<div className="photo-source-actions">` with `<Btn type="button" onClick={() => camera.current?.click()}>{EDITOR_COPY.photo.takePhoto}</Btn>`
     and `<Btn type="button" onClick={() => file.current?.click()}>{EDITOR_COPY.photo.pickFromLibrary}</Btn>`.
   - The upload zone keeps its current behaviour (click → gallery input, drag-and-drop) on every device.
   - Do not change `upload`, the existing strings, the AI button or anything else in the file (R7).
3. `index.css`: add the rules next to the other `.photo-column` rules in the active (second) stylesheet
   block (~line 1930). Default `display: none`; inside `@media (hover: none) and (pointer: coarse)` →
   `display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;`. Button colours: reuse the
   light-on-chocolate treatment of `.photo-column .ai-btn` so they read in light and dark mode.
4. Write `Editor.test.tsx`; run all checks; `pnpm format`.

Rules: R1 — no data access change (local mode unaffected; the photo still goes through `update("photo", …)`).
R3/R4 — no storage or secret change. R6 — copy in `copy.ts`. R7 — only the files above. R8 — tests above.
R9 — 390px + dark mode verified in DevTools (criterion 4). R10 — `vite.config.ts`, `.figma/`, `AGENTS.md` untouched.

## Specialist input used
None (no consult files).

## Assumptions
- "Mobile" = touch-first device, detected in CSS with `@media (hover: none) and (pointer: coarse)` rather
  than viewport width, so a narrow desktop window still shows only the upload zone and a phone in landscape
  still gets both buttons. No JS user-agent sniffing.
- On mobile the upload zone stays tappable (opens the gallery input) and remains the photo preview; the two
  buttons are added below it rather than replacing it. D2 asks for two actions, not for removing the zone.
- No camera icon exists in `src/components/Icon.tsx`; buttons are text-only to avoid widening the diff.
- Not resetting `input.value` after a pick (re-picking the identical file after "Bỏ ảnh" won't fire
  `change`) — existing behaviour, left as a follow-up rather than changed here (R7).
- The existing size hint "JPG, PNG · tối đa 10MB" and any HEIC/size handling belong to F-202.1; untouched.
- Hotspots: `src/features/items/Editor.tsx` is also listed by F-202.1 (BACKLOG, after T-005.3) and edited by
  T-001 (BACKLOG, hides the "Tự điền từ ảnh" button). Neither is open now; whoever lands later rebases.
  `src/index.css` is a shared file — expect trivial rebases. `src/App.tsx` is not touched.

## Blocking questions
None.

## Split proposal
None (estimated ~120 changed lines including tests).
