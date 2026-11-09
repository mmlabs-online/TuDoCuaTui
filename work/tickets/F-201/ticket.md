# F-201: Harden the item editor

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui |
| Gate | none |
| Depends on | F-004.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-09T08:28:08Z |
| PR | — |

## Goal
Saving is safe and predictable: no double submits, no silently dropped values, no lost edits.

## Feature reference
`docs/feature-list.md` F-201. Decisions: `work/decisions.md`.

## Scope
- The save button shows "Đang lưu…" and is disabled while saving. (`App.save` already ignores a second call,
  but the button gives no feedback.)
- Validation with inline messages: name required and at most 120 characters (DB check); price ≥ 0; purchase
  date not in the future.
- Unsaved-changes guard on every close path: X button, "Huỷ", Escape and a backdrop click
  (`Modal` handles the last two).

## Out of scope
- Photo handling (F-202.x).
- Back-dated wear (F-501, M2).

## Acceptance criteria
- [ ] No double submits.
- [ ] Error toasts use `useWardrobe.message()`.
- [ ] Closing with unsaved changes asks for confirmation on all four close paths.
- [ ] A negative price cannot be submitted.

## Technical notes
- Files: `src/features/items/Editor.tsx`, `src/components/Modal.tsx`, a new `src/features/items/validate.ts`.
- Mismatch: `itemToRow` stores `price > 0 ? price : null`, so a negative price is silently saved as "no price"
  today, and so is a price of 0. Keep 0 → null (it means "unknown"), and block negative values in the form.
- Expected tier: Medium.

## Test plan
- Unit: `validate.ts` (boundaries: 120/121 characters, today/tomorrow, −1/0).
- Manual: double-click save on a slow connection (DevTools throttling); each close path with edits.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
