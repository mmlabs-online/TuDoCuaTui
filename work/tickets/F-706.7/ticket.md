# F-706.7: User credit UI and retire the BYOK form

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux, data |
| Gate | none |
| Depends on | F-706.1, F-706.2, F-706.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | claude@2026-11-24T03:59:10Z |
| PR | — |

## Goal
Show every user their AI credit balance and the cost of each AI action, with clear states for waiting for approval, out of credit and AI off, and remove the bring-your-own-key form.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.7 "User credit UI". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Balance display and per-action cost (photo fill 1, new suggestion 1; 0 for cached).
- States: waiting for welcome-credit approval, out of credit, AI off (cap reached), each with Vietnamese copy (R6).
- Retire the BYOK key form; `aiAvailability` no longer returns `no_key` for users without a personal key.
- Map the new error codes in the photo fill, bulk import and outfits flows.

## Out of scope
- Server cutover (F-706.4); admin screen (F-706.6); sticker costs (F-709.3).

## Acceptance criteria
- [ ] A signed-in user without a personal key sees AI actions available when they have credits and the cap is not reached.
- [ ] The balance and the credit cost of each AI action are shown before the user taps.
- [ ] Waiting-for-approval, out-of-credit and AI-off states each show a distinct Vietnamese message and make no AI call.
- [ ] The BYOK key form is no longer reachable.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- **Ships in the same release as F-706.4** (D52); merging order may differ but no release may contain one without the other.
- `aiAvailability` returns `no_key` without a per-user key (`src/features/items/aiFill.ts:107`), which would disable AI for every non-owner unless this ships with the cutover (ai-stylist-notes.md:70).
- Open for the planner: D52 keeps `DELETE /api/ai-settings/key` until F-706.8; decide whether the UI keeps a "delete my old key" action after the form is retired (flag to Ming).
- Hotspot: `src/App.tsx` (`AiSettingsModal` wiring, `src/App.tsx:328-336`).

## Test plan
- Unit: availability logic, state rendering per error code, BYOK form removed.
- Manual: one-off Playwright check at 390px/dark.

## Notes / answers from Ming

## Handoff
