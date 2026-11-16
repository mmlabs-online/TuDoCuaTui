# T-023: Fix the invisible confirm button in confirm dialogs

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | XS |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | — |
| PR | — |

## Goal
The confirm button in every confirm dialog ("Bỏ thay đổi", "Xoá món đồ", AI key delete) is readable again, so users can see what they are confirming.

## Feature reference
Bug report, Ming 2026-11-16 (screenshot): the "Bỏ thay đổi?" dialog shows "Tiếp tục sửa" and an empty-looking second button.
Cause: `src/components/Confirm.tsx` uses `Btn kind="danger-fill"` → `.btn-danger-fill` (`src/index.css:154`: red background, white text). The later redesign rule `.btn { background: transparent; border-color: var(--text) }` (`src/index.css:1412`) has the same specificity and comes later, so it removes the red background: white text on the cream modal. Affects every `Confirm` (Editor discard, App delete item, AiSettingsModal delete key).

## Scope
- Make `.btn-danger-fill` win over the redesign `.btn` rule (red background, light text, red border), in light and dark mode, including hover.
- Smallest CSS change in `src/index.css`; no component API change.

## Out of scope
- Other button styles, dialog copy, dialog layout.

## Acceptance criteria
- [ ] In all three confirm dialogs the confirm button has the danger background and readable text (contrast ≥ 4.5:1) in light and dark mode.
- [ ] Cancel buttons and `.btn-primary` look unchanged.
- [ ] 390px viewport: both buttons visible and tappable.
- [ ] All checks pass.

## Technical notes
- Files: `src/index.css`.
- jsdom does not apply this CSS; verify with a Playwright screenshot (light + dark, 390px) of the discard dialog.

## Test plan
- Manual / Playwright: open an item, change a field, close → "Bỏ thay đổi?" dialog; delete item dialog; screenshots light/dark.

## Notes / answers from Ming
- 2026-11-16 (Ming): screenshot of "Bỏ thay đổi?" with the confirm button unreadable — "ghi nhận lỗi này".

## Handoff
