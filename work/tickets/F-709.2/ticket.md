# F-709.2: Sticker compositor with fixed layer order

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui |
| Gate | none |
| Depends on | F-705 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Composite item stickers on the preset avatar in a fixed layer order, so an outfit renders consistently on the chibi.

## Scope reference
`docs/feature-list.md` E7 → F-709 ("Avatar and chibi viewing screen") and its AC list; locked decision "Avatar: preset, choose hair, skin and body. No face photos". Split F-709.2 "Compositor". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Pure layer-order logic (main → outer → shoes → accessory) from item categories, and a rendering component.

## Out of scope
- Avatar art (F-709.1); fetching stickers (F-709.3).

## Acceptance criteria
- [ ] Layer order is main → outer → shoes → accessory (unit test).
- [ ] Items with no sticker are left out without breaking the render.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- Transparency handling follows the F-705 result (e.g. key colour removal in the browser, ai-stylist-notes.md:84).

## Test plan
- Unit: layer order per category mix, missing stickers.
- Manual: one-off Playwright check at 390px/dark.

## Notes / answers from Ming

## Handoff
