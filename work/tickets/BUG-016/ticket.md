# BUG-016: Modals have no dialog semantics or focus handling; new-item name field is not focused

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S3 |
| Priority | P2 |
| Size | S |
| Areas | ui, ux |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | v0.1.0 (F-004.1, commit 5132343) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | — |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-7). No modal (editor, AI settings,
"Hôm nay mặc gì?", Import, Export, confirms) has `role="dialog"` or `aria-modal`. Screen readers do not announce them,
and Tab can move to the page behind. When "Thêm món đồ" opens, "Tên món đồ" is not focused. The filter `<select>`s
(Trạng thái, Mùa, Vị trí lưu trữ, Màu, Sắp xếp) have no accessible name; their first option doubles as the label.

## Environment
- Production v0.3.1, Chrome desktop (DOM inspection).

## Steps to reproduce
1. Open any modal and inspect it, or press Tab repeatedly.
2. Click "Thêm món đồ" and start typing.

## Expected
- `role="dialog"`, `aria-modal="true"` and `aria-labelledby` (the modal title). Focus moves into the modal (the name
  field for a new item), Tab stays inside, and focus returns to the opener on close.
- Each filter select has an `aria-label`.

## Actual
- None of the above. Typing after opening "Thêm món đồ" goes nowhere.

## Root cause
**Confirmed**: `src/components/Modal.tsx:30-32` renders `div.modal-backdrop > div.modal` with no ARIA attributes
and no focus management. The filter selects in the items toolbar have no label.

## Scope
- `Modal.tsx`: dialog semantics, initial focus, focus trap, focus return. Editor: initial focus on the name field for a
  new item. Filter selects: `aria-label`.

## Out of scope
- Visual changes to modals.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `Modal.test.tsx` › "renders an aria-modal dialog and traps focus"; `Editor.test.tsx` › "new item focuses the
      name field").
- [ ] The expected behaviour above holds, including at 390px and in dark mode (R9).
- [ ] All checks pass.

## Technical notes
- Files: `src/components/Modal.tsx`, `src/features/items/Editor.tsx`, the items toolbar component, tests.
- Existing tests may query modals by class; update them to `getByRole("dialog")` where touched.

## Notes / answers from Ming

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)
