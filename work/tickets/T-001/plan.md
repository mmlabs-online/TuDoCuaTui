Status: READY

# Plan — T-001: Hide mock AI controls until M3

## Feature summary
Not in the feature list. Accepted by decision D9 (`work/decisions.md`, 2026-11-07):

> | D9 | 2026-11-07 | Tickets not in the feature list | Accept T-001 (hide mock AI controls; in Supabase mode only, so the Figma Make preview is unchanged), … |

Origin, `docs/plan-M1.md` §4 row 21:

> | 21 | F-603 | AI is M3 (F-703) | The mock's AI checkbox is checked by default; the editor's "Tự điền từ ảnh" is a hard-coded fake that **overwrites** category/colors/seasons/tags | T-001 |

The controls come back later, with real behaviour, in `docs/feature-list.md`:

> #### F-702 · "✨ Tự điền từ ảnh" in the editor · P1 · M3 · S · depends on F-701
> - Fills empty fields only and never overwrites what the user typed; adds an undo option.
>
> #### F-703 · AI in bulk photo import · P1 · M3 · S · depends on F-701, F-603

Ticket scope: hide the "✨ Tự điền từ ảnh" editor button and the "Dùng AI nhận diện…" bulk import checkbox.
Keep both visible in local mode (D9). The ticket says it "needs Ming's OK". D9 is that OK: Ming delegated
the open decisions on 2026-11-07, as recorded in the ticket notes.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | In Supabase mode, the editor does not show "Tự điền từ ảnh". | `Editor.test.tsx › mock AI › hides "Tự điền từ ảnh" when showMockAi is false`. Also check that `App.tsx` passes `showMockAi={wardrobe.mode === "local"}` (code read). |
| 2 | In Supabase mode, the import Photos tab does not show the "Dùng AI nhận diện loại, màu, mùa" checkbox. | `ImportModal.test.tsx › mock AI › Photos tab hides the AI checkbox when showMockAi is false`. Code read: `App.tsx` passes the same flag to `ImportModal`, and `ImportModal` passes it to `ImportPhotosTab`. |
| 3 | (D9) Local mode is unchanged: both controls still show. | `Editor.test.tsx › mock AI › shows "Tự điền từ ảnh" when showMockAi is true`. `ImportModal.test.tsx › mock AI › Photos tab shows the AI checkbox when showMockAi is true`. `App.test.tsx › App (local mode) › shows the mock AI controls in local mode`: open the editor and see the button, then open the import modal and see the checkbox. In `pnpm dev` without env vars, both are visible. |
| 4 | R1: components do not read Supabase or env to detect the mode. | `grep -n "supabase\|import.meta.env" src/features/items/Editor.tsx src/features/import-export/ImportModal.tsx src/features/import-export/ImportPhotosTab.tsx` returns nothing. The mode comes only from `wardrobe.mode` (`WardrobeRepo.mode`), the same way as `showSignOut` in `App.tsx`. |
| 5 | Checks are green. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
Signed in on the hosted Supabase build:
- Open an item. There is no "Tự điền từ ảnh" button under the photo.
- Open Nhập → "Ảnh". There is no "Dùng AI nhận diện…" row.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/features/items/Editor.tsx` | Add a required prop `showMockAi: boolean`. Wrap the existing `ai-btn` `<Btn>` (lines ~136-147) in `{showMockAi && (…)}`. Leave the button's content and behaviour as they are. | AC 1, 3 |
| `src/features/import-export/ImportPhotosTab.tsx` | Add a prop `showMockAi: boolean`. Render the `<label className="check-row">` AI checkbox only when it is true. | AC 2, 3 |
| `src/features/import-export/ImportModal.tsx` | Add a required prop `showMockAi: boolean`. Pass it to `<ImportPhotosTab showMockAi={…} />`. | AC 2 (pass-through) |
| `src/App.tsx` | Pass `showMockAi={wardrobe.mode === "local"}` to `<Editor>` and `<ImportModal>`. | AC 1–4 (single mode source, R1) |
| `src/features/items/Editor.test.tsx` | Add `showMockAi` to `renderEditor`, default `true` (local behaviour), plus 2 tests. | AC 1, 3; R8 |
| `src/features/import-export/ImportModal.test.tsx` | Add `showMockAi` to `setup` (optional param, default `true`), plus 2 tests. The tests render the modal directly, because `setup` switches to the CSV tab. | AC 2, 3; R8 |
| `src/App.test.tsx` | Add 1 local-mode regression test. | AC 3 |

Out of the list on purpose: `copy.ts` files, `src/index.css` (`.ai-btn` styles stay for F-702), decorative ✦
in `ItemCard`/`Hero`/`ImportModal` header/constants (decoration, not controls), and `Icon` `sparkle`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `Editor.test.tsx › mock AI › hides "Tự điền từ ảnh" when showMockAi is false` | `queryByRole("button", { name: /Tự điền từ ảnh/ })` is null (AC 1) |
| `Editor.test.tsx › mock AI › shows "Tự điền từ ảnh" when showMockAi is true` | The button exists (AC 3) |
| `ImportModal.test.tsx › mock AI › Photos tab hides the AI checkbox when showMockAi is false` | Photos tab is the default tab 0, so no tab click is needed. `queryByText(IMPORT_EXPORT_COPY.import.photos.aiTitle)` is null (AC 2) |
| `ImportModal.test.tsx › mock AI › Photos tab shows the AI checkbox when showMockAi is true` | The text is present (AC 3) |
| `App.test.tsx › App (local mode) › shows the mock AI controls in local mode` | Click a card. "Tự điền từ ảnh" is present. Close the editor and open import: the `aiTitle` text is present (AC 3, D9) |

Supabase mode is not tested through `App` itself. The prop tests cover the hidden branch, and the
`mode === "local"` wiring is checked by reading the code. The existing `useWardrobe` tests already cover
`mode === "supabase"`.

## Approach
1. `Editor.tsx`: add `showMockAi` to the props type and destructuring, then wrap the AI `<Btn>` in
   `{showMockAi && …}`. Do not change the onClick body (F-702 replaces it). Do not move the copy (R7).
2. `ImportPhotosTab.tsx`: change it to `ImportPhotosTab({ showMockAi }: { showMockAi: boolean })` and render the
   `check-row` label conditionally. Leave the rest of the tab (still disabled since F-601.3) as it is.
3. `ImportModal.tsx`: add the prop and pass it through.
4. `App.tsx`: pass `showMockAi={wardrobe.mode === "local"}` in both places. Inline it the same way as
   `showSignOut={wardrobe.mode === "supabase"}`.
5. Update the test helpers and add the tests listed above. Run Checks.

Rules:
- R1: the mode comes from `WardrobeRepo.mode` through `useWardrobe`. No component imports `supabase` or reads env.
- R6: no new copy. The tests reference existing copy constants or the existing label.
- R7: only the files listed above.
- R8: tests are listed above.
- R9: removing an element does not hurt the 390px layout or dark mode. The reviewer checks that the photo
  column still looks right on mobile (`.photo-source-actions` sits directly above the removed button).
- R10: not touched.

## Specialist input used
None (no consults).

## Assumptions
- "Supabase mode" means `wardrobe.mode === "supabase"`, i.e. env vars are set. This includes the moment before
  login, but the editor and import are behind `AuthGate` anyway.
- A required prop (not optional) is chosen so the compiler catches every caller. Test helpers default to `true`.
- Prop name `showMockAi`. It is removed or renamed when F-702/F-703 land.
- Hotspots: `ImportModal.tsx` / `ImportPhotosTab.tsx` are also touched by F-602 (JSON tab) and F-603 (Photos
  tab). `docs/plan-M1.md` says to merge F-602 before F-603. This change is a few lines, so whoever lands later
  rebases. `Editor.tsx` is shared with F-202.1 (BACKLOG).
- Expected diff: about 40–60 lines including tests.

## Blocking questions
None.

## Split proposal
None.
