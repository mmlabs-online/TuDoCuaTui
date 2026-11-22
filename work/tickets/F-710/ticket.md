# F-710: Real-photo outfit collage (fallback)

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux, data |
| Gate | none |
| Depends on | F-705 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Show a suggested outfit as a collage of the user's own item photos in the same layer order, at no AI cost, if the sticker spike fails.

## Scope reference
`docs/feature-list.md` E7 → F-710 ("Real-photo outfit collage (fallback)"); dependency line "F-705 fail → F-710 (F-708 and F-709 cancelled)". D34 (photos behind the Identity bearer). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Collage view from a suggested outfit using the existing authenticated photo path, in layer order main → outer → shoes → accessory.
- Placeholder for items with no photo.

## Out of scope
- Any provider call or credit charge; stickers and avatars (F-708, F-709).

## Acceptance criteria
- [ ] The collage uses the existing authenticated photo path and makes no provider call (0 credits).
- [ ] Items appear in the layer order main → outer → shoes → accessory.
- [ ] An item with no photo shows a placeholder.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- **Runnable only if F-705 fails** (board `Depends on` lists F-705; the condition is **F-705 fail**). If F-705 passes, this ticket is cancelled.
- P2. Hotspot: `OutfitsModal.tsx`.

## Test plan
- Unit: layer order, placeholder, no AI client call.
- Manual: one-off Playwright check at 390px/dark.

## Notes / answers from Ming

## Handoff
