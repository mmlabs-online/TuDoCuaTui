# F-709.3: "Xem trên chibi" from a suggested outfit

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux, data |
| Gate | none |
| Depends on | F-708.4, F-709.1, F-709.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Let the user tap "Xem trên chibi" on a suggested outfit and see it on their avatar, drawing only the missing stickers and showing the credit cost first.

## Scope reference
`docs/feature-list.md` E7 → F-709 ("Avatar and chibi viewing screen") and its AC list; locked decision "Avatar: preset, choose hair, skin and body. No face photos". Split F-709.3 "Chibi screen". D54 (photo sent only on tap; one-time notice before the first photo is sent). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- "Xem trên chibi" action on each suggested outfit; chibi screen using F-709.1 and F-709.2.
- Requests only missing stickers (one request per item via F-708.3), loads cached ones via F-708.4.
- Cost shown before the tap; per-item failure with retry by tap; one-time AI notice before the user's first photo is sent (D54).

## Out of scope
- Batch preparation (F-708.6); saving outfits (F-801 to F-803).

## Acceptance criteria
- [ ] Only missing stickers are requested; a fully cached outfit opens at 0 credits with no provider call.
- [ ] The credit cost is visible before the tap.
- [ ] If one sticker fails, the others still show, the failed item can be retried by tap, and only successes are charged.
- [ ] A one-time notice is shown before the user's first photo is sent to the provider (D54).
- [ ] No face photo input exists anywhere in the flow.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- OQ-11 (not enough credits for all missing stickers) is still open; default: generate nothing, show the shortfall, let the user pick items. Confirm with Ming before PLAN.
- Hotspot: `OutfitsModal.tsx` (also F-707.4, T-032).

## Test plan
- Unit: missing-only requests, cost display, partial failure and retry, notice shown once (fake clients).
- Manual: one-off Playwright check at 390px/dark; Ming views a real outfit.

## Notes / answers from Ming

## Handoff
