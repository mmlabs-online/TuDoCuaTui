# BUG-001: Confirm button invisible in confirm dialogs

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S2 |
| Priority | P0 |
| Size | XS |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui |
| Gate | none |
| Found in | v0.2.8 (production) |
| Introduced in | unknown (the redesign `.btn` block in `src/index.css`; last touched in T-019.6) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | — |
| PR | — |

## Report
Ming, 2026-11-16, screenshot of the "Bỏ thay đổi?" dialog: "Tiếp tục sửa" is visible, the second button looks empty (no readable label). "ghi nhận lỗi này". (Recorded first as T-023; renamed by D42.)

## Environment
- Mode: API (identity), production · light mode · desktop width

## Steps to reproduce
1. Open an item, change any field.
2. Close the editor → "Bỏ thay đổi?" dialog.

## Expected
- The confirm button "Bỏ thay đổi" has the danger (red) background and readable light text.

## Actual
- The confirm button is transparent with white text on the cream modal: the label cannot be read.

## Root cause
**Suspected (code reading, not yet reproduced in a browser):** `src/components/Confirm.tsx` renders `Btn kind="danger-fill"` → `.btn-danger-fill` (`src/index.css:154`: red background, white text). The redesign rule `.btn { background: transparent; border-color: var(--text) }` at `src/index.css:1412` has the same specificity and comes later, so it wins over the background and border; `color: white` stays. Affects every `Confirm`: Editor discard (`src/features/items/Editor.tsx:373`), delete item (`src/App.tsx:237`), delete AI key (`src/features/settings/AiSettingsModal.tsx:209`).

## Scope
- Make `.btn-danger-fill` keep its danger background, border and light text over the redesign `.btn` rule, light and dark, including hover. Smallest change in `src/index.css`.

## Out of scope
- Other button styles, dialog copy and layout.

## Acceptance criteria
- [ ] Regression check: a one-off Playwright run on the built app asserts the confirm button's computed background is the danger colour; it fails on `main` and passes after the fix; result and screenshots (light/dark, 390px) recorded in impl-log (D42).
- [ ] All three confirm dialogs: danger background and readable text (contrast ≥ 4.5:1), light and dark mode.
- [ ] Cancel buttons and `.btn-primary` look unchanged; 390px: both buttons visible and tappable.
- [ ] All checks pass.

## Technical notes
- Files: `src/index.css`.
- Test level: one-off Playwright check (jsdom does not apply this CSS).

## Notes / answers from Ming
- 2026-11-16 (Ming): screenshot of "Bỏ thay đổi?" with the confirm button unreadable — "ghi nhận lỗi này".

## Handoff
