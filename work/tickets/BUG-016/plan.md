Status: READY

# Plan — BUG-016: Modals have no dialog semantics or focus handling; new-item name field is not focused

## Scope summary
Bug ticket: the scope reference is the bug report in `work/tickets/BUG-016/ticket.md`.

> **Expected**
> - `role="dialog"`, `aria-modal="true"` and `aria-labelledby` (the modal title). Focus moves into the modal (the name
>   field for a new item), Tab stays inside, and focus returns to the opener on close.
> - Each filter select has an `aria-label`.

> **Scope**
> - `Modal.tsx`: dialog semantics, initial focus, focus trap, focus return. Editor: initial focus on the name field for a
>   new item. Filter selects: `aria-label`.

> **Out of scope**
> - Visual changes to modals.

> **Technical notes**: "Existing tests may query modals by class; update them to `getByRole("dialog")` where touched."

Rules that apply: R6 (no new UI copy is added; all names come from existing `h2` titles and the existing `label` prop),
R7 (stay inside this plan), R8 (unit tests for the new focus logic), R9 (390px and dark mode).

### Root cause (confirmed, with one correction)
- **Confirmed**: `src/components/Modal.tsx:29-33` renders `div.modal-backdrop > div.modal` with no `role`, no
  `aria-modal`, no label, and no focus code. `Modal.tsx:23-28` only handles Escape for the topmost modal (`stack`).
- **Confirmed**: `src/components/FilterSelect.tsx:17-19` wraps the `<select>` in a `<label>` with no text; the `label`
  prop is only rendered as the first `<option>`. All five toolbar filters (`src/features/items/FilterBar.tsx:55-79`)
  use this component.
- **Correction / unproven part**: the new-item name field is not unfocused for lack of code: `Editor.tsx:343` already
  has React `autoFocus`, and the opener ("Thêm món đồ", `Header.tsx:56`, `Empty.tsx:26`) uses `onClick`, so no later
  mousedown default steals focus. No code path in `src/` calls `.focus()` inside a modal. The production symptom
  cannot be explained from the code and probably does not reproduce in jsdom. The fix therefore does not depend on
  React `autoFocus`: `Modal` itself moves focus on mount, to an element the consumer marks with `data-autofocus`.
  The one-off Playwright check (below) records the symptom on `main` and its absence after the fix.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: fails on `main`, passes after | `Modal.test.tsx` › "renders an aria-modal dialog and traps focus" and `FilterBar.test.tsx` › "each filter select has an aria-label" fail on `main` (no `role="dialog"`, no `aria-label`) and pass on the branch. impl-log records the failing run on `main` (stash the fix or run the new test files against `main`'s `src/`), including whether the focus half of `Editor.focus.test.tsx` › "new item focuses the name field" already passed on `main`. |
| 2 | Every modal has `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its title | `Modal.test.tsx` › "renders an aria-modal dialog and traps focus" (name from the `h2`), › "keeps an existing heading id"; `Editor.focus.test.tsx` › "new item focuses the name field" (`getByRole("dialog", { name: "Món đồ mới" })`). All six consumers (Editor, Confirm, AiSettingsModal, OutfitsModal, ImportModal, ExportModal) render an `h2` (frontend consult), so `pnpm test` with the existing suites stays green. |
| 3 | Focus moves into the modal on open; the name field for a new item | `Modal.test.tsx` › "focuses the data-autofocus element on open", › "focuses the dialog when nothing is marked", › "keeps focus that a child already moved inside"; `Editor.focus.test.tsx` › "new item focuses the name field", › "existing item focuses the dialog, not the name field". |
| 4 | Tab stays inside the modal (topmost only when stacked) | `Modal.test.tsx` › "renders an aria-modal dialog and traps focus", › "Shift+Tab on the first element goes to the last", › "Tab with focus outside pulls focus into the topmost dialog", › "only the topmost of two stacked modals traps"; `focusTrap.test.ts` (all cases). |
| 5 | Focus returns to the opener on close | `Modal.test.tsx` › "restores focus to the opener on close", › "does not throw or move focus when the opener is gone", › "a stacked modal returns focus to the control in the modal below". |
| 6 | Each filter select has an `aria-label` | `FilterBar.test.tsx` › "each filter select has an aria-label" (`getByRole("combobox", { name })` for Trạng thái, Mùa, Vị trí lưu trữ, Màu, Sắp xếp, and `getAttribute("aria-label")`). |
| 7 | No visual change; works at 390px and in dark mode (R9) | Diff review: no `index.css` change; the only class added is `outline-none` on the `div.modal` container (no ring on a non-interactive container that receives programmatic focus). One-off Playwright check (below) screenshots at 390px light and dark with a modal open, and checks interactive controls still show their focus ring. |
| 8 | Existing behaviour kept: Escape closes only the topmost, backdrop mousedown closes, Editor dirty check | Existing tests stay green unchanged (`App.test.tsx` close paths at 299-305, the stacked Escape test, `ImportModal.test.tsx` Escape abort). |
| 9 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green. |

### One-off Playwright check (what jsdom cannot see; recorded in impl-log, not committed)
Playwright is not a repo dependency (D42): run it from the scratchpad with `npx playwright` against a local build.
Reach the app either with `pnpm build && pnpm preview` plus `page.route` stubs for `/healthz`, `/readyz` and the
`/api/**` calls the item list needs (and the auth check, if `AuthGate` needs one), or, if the stubs cannot get past
sign-in, with `pnpm dev` and the dev token proxy started through `scripts/with-secrets.sh <NAME> -- pnpm dev`
(secret names only). If neither reaches the item list, record that in impl-log and move these steps to Ming
verification. Steps, each run on `main` first (record the result) and then on the branch:
1. Click "Thêm món đồ", type `Áo test` with `page.keyboard.type`; assert the name input value is `Áo test`
   (the UAT-7 symptom).
2. With the editor open, press Tab 40 times; after each press assert `document.activeElement` is inside
   `[role=dialog]`, and that it never lands on the hidden file inputs. Repeat with Shift+Tab.
3. Press Escape; assert focus is back on the "Thêm món đồ" button.
4. Open an existing item, click "Xoá" (opens Confirm), Tab 10 times inside the Confirm (focus stays in the Confirm),
   Escape, assert focus is on the Editor's delete button.
5. Open "Hôm nay mặc gì?", Import, Export and AI settings once each; assert `role=dialog`, `aria-modal=true`, and a
   non-empty accessible name (`page.getByRole("dialog", { name: ... })` with each modal's title).
6. Screenshots at 390x844, light and dark (`html.dark`), with the editor open after a keyboard open (Tab to
   "Thêm món đồ", Enter): no focus ring around the whole modal; the name input shows its normal focus style.

## Ming verification after merge
- Screen reader on a real device (VoiceOver on iPhone or macOS, or NVDA): opening a modal announces it as a dialog
  with its title; swiping does not leave the dialog.
- On the phone at 390px: opening "Thêm món đồ" focuses the name field (the soft keyboard may or may not open; iOS
  does not open it for programmatic focus without a tap, which is acceptable); opening an existing item does not
  open the keyboard.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/components/focusTrap.ts` (new) | `tabbables(root)`: attribute-based list of tabbable descendants (`a[href]`, `button`, `input`, `select`, `textarea`, `[tabindex]`, excluding `disabled`, `tabindex="-1"`, `input[type=hidden]`, and anything inside `[hidden]` or `[inert]`). `nextTrapFocus(list, active, shift)`: pure; returns the element to focus, or `null` to let the browser move focus. | Pure logic first (planner rule 6, R8); keeps `Modal.tsx` small and testable. | No |
| `src/components/focusTrap.test.ts` (new) | Unit tests for both functions. | R8. | No |
| `src/components/Modal.tsx` | `role="dialog"`, `aria-modal="true"`, `tabIndex={-1}`, `ref`, `outline-none` on `div.modal`; `aria-labelledby` wired to the first `h2`; opener recorded at render; initial focus in a mount effect; Tab trap in the existing window keydown listener (topmost only); focus restore on unmount. | Ticket scope, root cause. | No |
| `src/components/Modal.test.tsx` (new) | Regression and behaviour tests for the dialog. | AC 1-5. | No |
| `src/components/FilterSelect.tsx` | `aria-label={label}` on the `<select>` (one attribute). | Ticket scope ("Filter selects: `aria-label`"). | No |
| `src/features/items/FilterBar.test.tsx` | Add one test: "each filter select has an aria-label". The existing test is unchanged. | AC 1, 6. FilterBar is the "items toolbar component" named in the ticket. | No |
| `src/features/items/Editor.tsx` | Line 343 only: replace `autoFocus` with `data-autofocus={isNew || undefined}` on the name input. | Ticket scope ("Editor: initial focus on the name field for a new item"); one source of truth for initial focus (UX consult risk). | No |
| `src/features/items/Editor.focus.test.tsx` (new) | The ticket's "new item focuses the name field" test plus the existing-item case, in a new file. | AC 1-3. A new file keeps clear of `Editor.test.tsx`, which BUG-014/015 edit. | No |

Not touched (deliberately): `index.css`, `App.tsx`, `App.test.tsx`, `Confirm.tsx`, `OutfitsModal.tsx`,
`ImportModal.tsx`, `ExportModal.tsx`, `AiSettingsModal.tsx`, `ItemCard.tsx`, `items/copy.ts`, `src/features/auth/**`.
`App.test.tsx:304` keeps `.modal-backdrop`: the markup and the backdrop handler are unchanged, and the ticket asks to
switch to `getByRole("dialog")` only "where touched".

## Tests to write
All in Vitest + jsdom with `@testing-library/react` and `fireEvent` (no `user-event` and no `jest-dom` in the repo:
use `expect(document.activeElement).toBe(el)` and `getAttribute`, as the auth tests do). jsdom does not move focus
on Tab, so trap tests fire `keyDown` with `key: "Tab"` on the focused element and assert the focus the handler set,
or that `defaultPrevented` is false in the middle of the list.

| Test (file › name) | Covers |
|---|---|
| `src/components/Modal.test.tsx` › "renders an aria-modal dialog and traps focus" (**regression test, first; fails on `main`**) | Render a focused opener button, then `<Modal><h2>Tiêu đề</h2><button>A</button><input aria-label="B"/></Modal>`. `getByRole("dialog", { name: "Tiêu đề" })` exists with `aria-modal="true"`; focus is inside the dialog; Tab on the last tabbable focuses the first. Fails on `main` at `getByRole("dialog")`. |
| `src/components/Modal.test.tsx` › "keeps an existing heading id" | An `h2` with its own `id` keeps it and `aria-labelledby` points at it. |
| `src/components/Modal.test.tsx` › "focuses the data-autofocus element on open" | A `data-autofocus` input that is not the first tabbable gets focus. |
| `src/components/Modal.test.tsx` › "focuses the dialog when nothing is marked" | No marker: `document.activeElement` is the dialog element (not the first button, so a destructive button is never pre-focused). |
| `src/components/Modal.test.tsx` › "keeps focus that a child already moved inside" | A child with React `autoFocus` (as AiSettingsModal's key input) keeps focus; Modal does not override it. |
| `src/components/Modal.test.tsx` › "Shift+Tab on the first element goes to the last" | Wrap backwards; Tab in the middle of the list is not prevented. |
| `src/components/Modal.test.tsx` › "Tab with focus outside pulls focus into the topmost dialog" | Focus moved to a button behind the modal (`.focus()`), Tab on `window` focuses the dialog's first tabbable. |
| `src/components/Modal.test.tsx` › "only the topmost of two stacked modals traps" | Two nested modals: Tab on the lower one's last element is pulled into the upper one; Escape still closes only the upper one (existing behaviour). |
| `src/components/Modal.test.tsx` › "restores focus to the opener on close" | Unmount the modal; `document.activeElement` is the opener. |
| `src/components/Modal.test.tsx` › "does not throw or move focus when the opener is gone" | Remove the opener before closing; unmount does not throw (`isConnected` guard). |
| `src/components/Modal.test.tsx` › "a stacked modal returns focus to the control in the modal below" | A button inside modal 1 opens modal 2; closing modal 2 focuses that button. |
| `src/components/focusTrap.test.ts` › "tabbables skips disabled, tabindex -1, hidden and inert elements" | Includes `<input type="file" hidden>` (the Editor photo inputs) and a `[hidden]` wrapper. |
| `src/components/focusTrap.test.ts` › "tabbables keeps DOM order and includes tabindex 0" | Order. |
| `src/components/focusTrap.test.ts` › "nextTrapFocus wraps at both ends and returns null in the middle" | Tab on last → first, Shift+Tab on first → last, middle → `null`. |
| `src/components/focusTrap.test.ts` › "nextTrapFocus with focus outside or on the container goes to the first (last with Shift)" | Active element not in the list. |
| `src/components/focusTrap.test.ts` › "nextTrapFocus with an empty list returns null" | Edge case: nothing tabbable; the handler then keeps focus on the container (`preventDefault`). |
| `src/features/items/FilterBar.test.tsx` › "each filter select has an aria-label" (**regression; fails on `main`**) | For Trạng thái, Mùa, Vị trí lưu trữ, Màu, Sắp xếp: `getByRole("combobox", { name })` and `getAttribute("aria-label") === name`. The attribute assertion is what fails on `main` (the wrapping label may already give a computed name through the selected option). |
| `src/features/items/Editor.focus.test.tsx` › "new item focuses the name field" | Render `Editor` with `blankItem()`, `isNew`: `getByRole("dialog", { name: "Món đồ mới" })` exists and `document.activeElement` is `getByLabelText("Tên món đồ")`. Fails on `main` at the dialog query; impl-log records whether the focus assertion alone passes on `main`. |
| `src/features/items/Editor.focus.test.tsx` › "existing item focuses the dialog, not the name field" | `isNew={false}` with a named item: the dialog is named after the item, and focus is on the dialog. |

## Approach
1. **Write the failing tests first** (`Modal.test.tsx` regression test, `FilterBar.test.tsx`, `Editor.focus.test.tsx`)
   and run them on the current code; record the failures in impl-log. Then implement.
2. **`focusTrap.ts`**: implement `tabbables(root: HTMLElement): HTMLElement[]` (attribute-based; jsdom has no layout,
   so CSS-hidden elements are left to the Playwright check) and
   `nextTrapFocus(list: HTMLElement[], active: Element | null, shift: boolean): HTMLElement | null`.
3. **`Modal.tsx`** (keep the existing `stack`, Escape behaviour and backdrop `onMouseDown` exactly as they are):
   - Opener: `const [opener] = useState(() => document.activeElement as HTMLElement | null)`. Read at render, before
     the commit, because React applies child `autoFocus` during the commit, before Modal's effects run.
   - `div.modal` gets `ref`, `role="dialog"`, `aria-modal="true"`, `tabIndex={-1}` and the extra class `outline-none`
     (Tailwind v4 utility; no `index.css` edit).
   - Title: `useId()` for a fallback id; a `useLayoutEffect` with no dependency array finds the first `h2` in the
     dialog, gives it the fallback id if it has none, and sets `aria-labelledby` on the dialog to the heading's id
     (removes the attribute if there is no `h2`). It runs every render, so a re-rendered or replaced heading stays
     wired. React does not manage either attribute, so it does not overwrite them. No consumer changes.
   - Initial focus, in a mount `useEffect`: if focus is already inside the dialog, do nothing; else focus the first
     `[data-autofocus]` descendant; else focus the dialog element. Call `focus({ preventScroll: true })` only for the
     dialog element itself, so a long Import or Export body does not jump.
   - Tab trap: in the existing `window` `keydown` listener, which already checks `stack[stack.length - 1] === id`, on
     `Tab` call `nextTrapFocus(tabbables(dialog), document.activeElement, e.shiftKey)`; if it returns an element,
     `preventDefault()` and focus it; if the list is empty, `preventDefault()` and keep focus on the dialog. Only the
     topmost modal reacts, which also covers a nested Confirm over the Editor.
   - Focus restore: in the cleanup of the mount effect, after the stack splice, `if (opener?.isConnected)
     opener.focus()`. No fallback landmark (follow-up).
4. **`FilterSelect.tsx`**: add `aria-label={label}` to the `<select>`. The first option text stays as it is.
5. **`Editor.tsx:343`**: replace `autoFocus` with `data-autofocus={isNew || undefined}`. Change nothing else in the file.
6. Run every check; then the one-off Playwright check; record both in impl-log.

Size estimate: about 60 lines in source, about 200 in tests. Fits one cycle.

## Specialist input used
Adopted (both consults agree):
- Extend the single `Modal.tsx`; no native `<dialog>`, no consumer edits (frontend 1-2, UX 1).
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` from the title (both).
- Initial focus that does not override focus already inside the dialog, so `autoFocus` children win (frontend 2, risks;
  UX risk "autoFocus plus an explicit focus effect can fight").
- Topmost-only Tab trap using the existing `stack` (both).
- Focus restore with an `isConnected` guard (both).
- `aria-label={label}` in `FilterSelect.tsx`, one edit for all five filters (both).
- No `inert` / `aria-hidden` on the app root: the trap plus `aria-modal` is the required part, and `App.tsx` is a
  T-032 hotspot (both).
- Trap ignores disabled, `hidden` and `tabindex="-1"` elements (UX risk; the Editor's hidden file inputs).

Where they differ, chosen option and reason:
- **Title lookup**: frontend's `querySelector("h2")` in a layout effect (not UX's `titleId` prop). A prop forces edits
  in six consumer files, including `OutfitsModal.tsx` (T-032) and the Editor header near BUG-014/015 hunks. The
  frontend risk "a re-render of the `h2` could drop it" is handled by running the effect on every render and setting
  `aria-labelledby` from the DOM too.
- **Fallback initial focus**: the dialog container (UX 2c), not the first focusable (frontend 2). The first focusable
  in Editor, AiSettings and Import is the close button and in Confirm would be "Giữ lại" only by DOM order; container
  focus is safe for every modal, announces the title, and avoids scrolling long modals.
- **Editor new-item focus**: an explicit `data-autofocus` on the name input for a new item (UX 2, risk "remove one
  source of truth") rather than "change the Editor only if the test fails" (frontend 4). The production symptom has no
  code explanation and may not reproduce in jsdom, so a test-gated change could ship nothing for UAT-7. The edit is one
  attribute on line 343, outside the BUG-014/015 hunk at ~322-330.
- **Focus trap placement**: inside the existing `window` keydown listener rather than a `keydown` on `div.modal` plus a
  `focusin` backup (frontend 2). The window listener also catches Tab when focus has escaped the dialog, so no
  `focusin` listener (and no toast interaction risk) is needed.
- **Confirm as `alertdialog` with focus on cancel** (UX 1, 2b): rejected for this ticket. The Expected text says
  `role="dialog"`, and it needs a `Confirm.tsx` change. With container fallback focus the destructive button is never
  pre-focused, so the safety concern is met. Follow-up.
- **Scroll lock** (UX 6): rejected. It is not in the ticket's Expected or Scope. Follow-up.
- **Backdrop mousedown + mouseup** (UX 3): rejected. This is a pre-existing behaviour change outside the ticket, and
  `App.test.tsx:304` tests `mouseDown` on the backdrop. Follow-up.
- **New copy in `src/constants/` (`MODAL_COPY`)** (UX 8): not needed; no new strings are added.
- **Fallback landmark when the opener is gone** (UX 5): not adopted; do nothing (frontend risk default). Follow-up.

## Assumptions
- **Hotspots** (expect a rebase, no overlapping hunks planned):
  - `src/features/items/Editor.tsx`: BUG-014 and BUG-015 (`origin/ticket/BUG-014`, `origin/ticket/BUG-015`) edit
    ~322-330; this plan edits only line 343. Git should merge cleanly; if a rebase conflicts, keep both.
  - `src/features/items/Editor.test.tsx` (BUG-014/015): not touched; the Editor tests go in the new
    `Editor.focus.test.tsx`.
  - `src/App.tsx`, `src/index.css`, `src/features/outfits/OutfitsModal.tsx` (T-032), `src/features/items/ItemCard.tsx`
    and `src/features/items/copy.ts` (BUG-014/015), `src/features/auth/**` (T-029): not touched.
  - `src/components/Modal.tsx` and `FilterSelect.tsx` are on no other open branch (frontend consult). If T-032 adds a
    modal or changes `OutfitsModal`'s heading, the `h2` lookup still applies as long as the title is the first `h2`.
- **Existing item, initial focus** (default: the dialog, not the name field): the ticket only requires the name field
  for a new item; this also stops the keyboard opening on a phone when viewing an item (UX question 2). It changes
  today's behaviour (the unconditional `autoFocus`). If Ming prefers the name field for existing items too, the change
  is `data-autofocus` without the `isNew` condition.
- **Duplicate** ("Nhân bản") turns an open Editor into a new item without remounting the Modal, so focus does not move
  to the name field then. Default: accepted, out of scope; follow-up.
- `outline-none` on the non-interactive dialog container is not a "visual change to modals": it only prevents a new
  focus ring that this ticket's programmatic focus would otherwise introduce. Interactive controls keep their focus
  styles.
- Selects inside modals keep their current labels. Most are wrapped in `Field` (`AiSettingsModal.tsx:148-178`,
  `Editor.tsx:350-372`) and are already labelled. `OutfitsModal.tsx:188` and `ImportPhotosTab.tsx:119` still need to
  be checked. Default: follow-up, not in this diff (R7).
- Follow-ups for the implementer to list in impl-log (the orchestrator files them as `debt` issues):
  1. Confirm as `alertdialog` with `aria-describedby` and initial focus on the cancel button.
  2. Body scroll lock while a modal is open (plus `overscroll-behavior: contain`).
  3. Backdrop close only when both mousedown and mouseup are on the backdrop (text-selection drag).
  4. Focus fallback when the opener has been removed (for example after a delete).
  5. Duplicate: move focus to the name field when the Editor turns into a new item.
  6. Check and label the selects at `OutfitsModal.tsx:188` and `ImportPhotosTab.tsx:119` if they are unlabeled.
  7. The window Escape listener can fire during IME composition (Vietnamese input) or with an open `<select>`.
  8. Optional `inert` on the app root while a modal is open.

## Blocking questions
None.

## Split proposal
None.
