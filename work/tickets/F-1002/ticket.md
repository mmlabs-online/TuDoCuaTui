# F-1002: Camera capture on photo inputs

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E10 — PWA & Mobile |
| Areas | ui |
| Gate | none |
| Depends on | F-004.2 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-09T09:44:14Z |
| PR | — |

## Goal
On a phone, adding a photo can open the camera directly while the gallery stays available.

## Feature reference
`docs/feature-list.md` F-1002. Decisions: `work/decisions.md`.

## Scope
- Two actions on mobile: "Chụp ảnh" (`accept="image/*" capture="environment"`) and "Chọn từ thư viện"
  (`accept="image/*"`, no `capture`). Desktop keeps the single upload zone.
- Apply this to the editor photo. The bulk import tab only uses the gallery input (multiple files).

## Out of scope
- In-app camera with `getUserMedia`.

## Acceptance criteria
- [ ] On Android Chrome and iOS Safari, "Chụp ảnh" opens the rear camera and "Chọn từ thư viện" opens the gallery.

## Technical notes
- Files: `src/features/items/Editor.tsx`.
- Mismatch: the feature list asks for `capture="environment"` *while keeping the gallery option* on the same
  input. On Android Chrome, `capture` opens the camera only, with no gallery. That is why this ticket uses
  two inputs (decision D2).
- Expected tier: Low (UI) / Medium.

## Test plan
- Manual: both phones, both buttons.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
