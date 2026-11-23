**Findings**
- There is a single modal primitive, `src/components/Modal.tsx` (35 lines). It renders `div.modal-backdrop > div.modal` with no ARIA. It already has a module-level stack so only the topmost modal handles Escape, and backdrop mouseDown closes. There is no focus handling.
- Every modal and overlay goes through `Modal`. There are no other `fixed inset-0` overlays and no portals.
  - `src/components/Confirm.tsx`: `h2` title. Used for delete and other confirms.
  - `src/features/items/Editor.tsx:134`: `<Modal wide>`, `h2` at line 138 (the title is "Món đồ mới" or the item name). It can open a nested Confirm.
  - `src/features/settings/AiSettingsModal.tsx:128`: `h2`. It has an `autoFocus` input at line 189.
  - `src/features/outfits/OutfitsModal.tsx:173` ("Hôm nay mặc gì?"): `h2`.
  - `src/features/import-export/ExportModal.tsx:17`: `h2`.
  - `src/features/import-export/ImportModal.tsx:107`: `h2` containing an `<em>`.
- Every modal has an `h2`, so `aria-labelledby` can be wired without any per-modal copy changes.
- Editor.tsx:343 already has `autoFocus` on the name input. It is inside the form section at line 341, so confirm in a test or in the browser whether it really fails for a new item. React `autoFocus` calls `.focus()` on mount, so UAT-7 may come from a different cause. Examples: the input mounts in a collapsed or later section, or an earlier-mounted element takes focus. If a modal-level "focus first focusable" runs after mount, it must not steal focus from an element that already has it.
- Filter selects: `src/components/FilterSelect.tsx:18` renders `<select>` with the `label` prop only as the first `<option>`. One edit, `aria-label={label}`, covers all five toolbar filters. Other unlabeled selects exist in the modals (`AiSettingsModal.tsx:149,168`, `OutfitsModal.tsx:188`, `ImportPhotosTab.tsx:119`, `Editor.tsx:351,364`). Some may be wrapped in labels or a `Field`, so check. This is outside the BUG-016 scope, so list them as follow-ups (R7).
- Existing tests: `src/App.test.tsx:304` uses `.modal-backdrop`, and other tests use `fireEvent.keyDown(window, {key:"Escape"})`. Both still work if the markup and the window listener are kept. `src/components/` has no `Modal.test.tsx` yet.

**Recommendations**
1. Keep the custom `Modal` and extend it. Do not switch to native `<dialog>`: the stacking and Escape behaviour is already tested, jsdom support for `showModal` is partial, and the CSS would change (the ticket says no visual changes).
2. In `Modal.tsx` only, no consumer edits. The unmerged branches (BUG-014/015, T-032, T-029) touch none of this file, so the diff stays clear of their hunks.
   - Put `role="dialog"`, `aria-modal="true"` and `aria-labelledby={titleId}` on `div.modal`, and give the element a `ref`.
   - Find the title without touching consumers: `useId()` for the id, then in a layout effect `ref.current.querySelector("h2")`. If the heading has no id, set one with `setAttribute("id", ...)`, which only mutates an attribute. Fall back to `aria-label` if there is no h2. The alternative is an optional `titleId` prop, which forces edits in six files and would conflict with the T-032 and BUG-014/015 hunks, so avoid it.
   - Initial focus: on mount, record `document.activeElement` as the opener. If focus is not already inside the modal (so `autoFocus` wins), focus the first focusable descendant. Otherwise focus `div.modal` itself, with `tabIndex={-1}`.
   - Focus trap: a `keydown` handler on `div.modal`. On Tab, wrap between the first and last focusable elements. Shift+Tab on the first element goes to the last, and Tab on the last goes to the first. Only the topmost modal in the stack traps, so a nested Confirm cannot be bypassed. As a backup, a `focusin` listener on `document` pulls focus back into the top modal.
   - Focus restore: in the cleanup of the mount effect, call `opener.focus()` if it is still connected. Run it after the stack splice.
   - Background: do not use `inert` on siblings. Where it is enough, `aria-modal` plus the trap is the smallest fix.
3. Add `aria-label={label}` to the select in `FilterSelect.tsx`.
4. Editor: only add a change if the new-item name field fails to focus in the test below. In that case the fix is a ref plus a focus effect when `isNew`, kept to the `Field` input hunk at lines 341-345 to avoid conflicts with BUG-014/015.
5. Tests (Vitest + jsdom + Testing Library + `userEvent`). They must fail on `main`.
   - New `src/components/Modal.test.tsx`:
     - `renders an aria-modal dialog`: `getByRole("dialog")` has `aria-modal="true"`, and `toHaveAccessibleName("Title")` from the `h2`. It fails now because there is no dialog role.
     - `moves focus in on open`: an opener button is focused first, the modal contains a button and an input, and after render `dialog.contains(document.activeElement)` is true.
     - `traps Tab`: `userEvent.tab()` repeatedly never leaves the dialog, and Shift+Tab from the first element lands on the last.
     - `restores focus`: unmount the modal and expect `opener` to be `document.activeElement`.
     - `nested modal`: Escape closes only the topmost, focus returns to the Editor control that opened the Confirm, and Tab is trapped in the Confirm.
   - `FilterSelect.test.tsx`: `getByRole("combobox", {name: "Màu"})`.
   - `Editor.test.tsx` › "new item focuses the name field": `expect(getByLabelText("Tên món đồ")).toHaveFocus()`. This is the ticket's own test name. Add it only to a hunk away from the BUG-014/015 changes, or put it in a new describe block at the end of the file to limit merge conflicts.
   - Where `App.test.tsx` is touched, switch queries to `getByRole("dialog")`. Keep the `.modal-backdrop` query on line 304 unless it is being edited.
   - Note: jsdom `userEvent.tab()` honours `tabindex` and the DOM order, so the trap logic is testable. Provide the wrap-around yourself via the keydown handler, since jsdom has no real tab cycle out of the document.

**What jsdom cannot verify (one-off Playwright check)**
- Real Tab order across the browser chrome and the page behind (the trap works with the real browser focus ring).
- Visible focus ring at 390px and in dark mode (R9).
- Screen reader announcement of the dialog name and `aria-modal` behaviour (the ticket mentions VoiceOver and NVDA).
- Focus when the soft keyboard opens on mobile, and focus restore when the opener has been re-rendered or removed.
- Elements hidden by CSS (`display:none`, `visibility`) are treated as focusable by a jsdom selector-based filter. In the real browser, check that the trap skips them, for example the hidden file input in ImportPhotosTab and the Editor photo input.

**Risks**
- Focus-in logic can conflict with the existing `autoFocus` inputs, for example AiSettings and the Editor. Only move focus when focus is not already inside the dialog.
- A `querySelector("h2")` title lookup is fragile if a modal's first h2 changes (BUG-015 or T-032 may restructure `OutfitsModal` or `Editor` headers). Fallback to `aria-label` keeps that safe.
- Opener restore: after delete, the opener (an `ItemCard` button) may be unmounted. Guard with `isConnected`, and fall back to doing nothing.
- The Escape handler listens on `window` and can fire while an input has a composition in progress (IME, Vietnamese input). This is existing behaviour and outside the ticket. Consider a follow-up.
- A `focusin` document listener fires for other portals or toasts. Toasts currently sit outside the modal, so check that they are not focusable.
- Mutating the heading's `id` via the DOM bypasses React. It is safe here because React does not manage that attribute, but a re-render of the `h2` could drop it. Re-run the effect on each render without dependency, or accept an explicit `titleId` prop as the cleaner option (costing the extra conflict risk).

**Open questions**
1. Is the new-item name field really unfocused in production? The code has `autoFocus` at Editor.tsx:343. Reproduce with a test first, because the fix depends on it. Default: write the Editor test first and make a code change only if it fails.
2. Should the unlabeled selects inside the modals (AI settings, outfits, import photos, Editor category and status) be in scope? Default: no, open a `debt` follow-up (R7).
3. Title lookup: default is the `querySelector("h2")` approach with the `aria-label` fallback, over an explicit `titleId` prop. Ming, say if you prefer the prop.

Relevant files, all under D:\Projects\SAF\spaceM\projects\tudocuatui: `src\components\Modal.tsx`, `src\components\Confirm.tsx`, `src\components\FilterSelect.tsx`, `src\features\items\Editor.tsx`, `src\features\settings\AiSettingsModal.tsx`, `src\features\outfits\OutfitsModal.tsx`, `src\features\import-export\ExportModal.tsx`, `src\features\import-export\ImportModal.tsx`, `src\App.test.tsx`.
