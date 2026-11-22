# F-708.6: Batch UI: cost preview, confirmation and progress

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Size | S |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux, data |
| Gate | none |
| Depends on | F-708.5 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Show the user what preparing the whole wardrobe will cost, ask for confirmation, and show progress, so a bulk sticker run never surprises them.

## Scope reference
`docs/feature-list.md` E7 → F-708 ("Sticker generation and storage pipeline") and its AC list; OQ-12 (answered, D54). Decisions D53 (sticker draw 10 credits) and D54 (sticker data handling). Split F-708.6 "Batch UI (P2)". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Entry point for "prepare whole wardrobe", cost preview (missing stickers × 10 credits vs balance), confirmation, progress view.
- Client through `src/data/` (R1).

## Out of scope
- Server job (F-708.5).

## Acceptance criteria
- [ ] The credit cost and the number of missing stickers are shown before the user confirms.
- [ ] Nothing is sent until the user confirms.
- [ ] Progress shows done, failed and pending items until the batch ends.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- P2. Depends on OQ-11's answer for the not-enough-credits case.

## Test plan
- Unit: preview math, no call before confirm, progress states.
- Manual: one-off Playwright check at 390px/dark.

## Notes / answers from Ming

## Handoff
