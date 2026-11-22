# F-709.1: Avatar presets: hair, skin and body picker

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux |
| Gate | none |
| Depends on | F-705 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Let the user pick a preset chibi avatar by hair, skin and body, so outfits can be shown on a body without any face photo.

## Scope reference
`docs/feature-list.md` E7 → F-709 ("Avatar and chibi viewing screen") and its AC list; locked decision "Avatar: preset, choose hair, skin and body. No face photos". Split F-709.1 "Avatar presets"; OQ-9 (composite noted in F-705). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Preset avatar art (layered) and a picker for hair, skin and body.
- The choice is remembered (per OQ-13's answer).

## Out of scope
- Compositing stickers (F-709.2); chibi screen (F-709.3); face photos (non-goal).

## Acceptance criteria
- [ ] The user can choose hair, skin and body from presets and see the avatar update.
- [ ] No face photo input exists anywhere in the flow.
- [ ] The choice is kept the next time the screen opens.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- OQ-13 is still open (who supplies the preset art and its license, how many options, where the choice is saved). Default: one commissioned or hand-made layered set, saved per device, no migration. Confirm with Ming before PLAN.

## Test plan
- Unit: picker state, persistence.
- Manual: one-off Playwright check at 390px/dark.

## Notes / answers from Ming

## Handoff
