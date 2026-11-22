# F-706.6: Owner admin screen for the shared key, grants and approvals

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | ui, ux, security |
| Gate | plan-approval |
| Depends on | F-706.3, F-706.5 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Give the owner one screen to manage the shared AI key, grant settings, manual credits, welcome-credit approvals and the monthly spend, from the app itself.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.6 "Admin screen". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Owner-only admin screen: shared key set/replace/test per provider (hint only), grant settings, manual credit add, list of accounts waiting for welcome-credit approval with approve action, monthly spend.
- Client wiring for the owner role (e.g. from `GET /api/auth/me`) so the entry point shows only to the owner; the server still enforces access.
- Data access through `WardrobeRepo`/`src/data/` clients only (R1).

## Out of scope
- Server routes (F-706.3, F-706.5); user-facing credit UI (F-706.7).

## Acceptance criteria
- [ ] The admin screen and its entry point show only for the owner; a non-owner never sees them.
- [ ] The owner can set, replace and test the shared key; the key is never displayed after saving, only its hint.
- [ ] The owner can change grants, add credits and approve accounts waiting for welcome credits from the screen.
- [ ] The monthly spend against $20 is shown.
- [ ] Works at 390px and in dark mode (R9; one-off Playwright check, D42); Vietnamese copy stays in one place per feature (R6).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- Gate `plan-approval`: the SPA does not read `/api/auth/me` or a role today and `AiSettingsModal` is open to everyone (`src/App.tsx:328-336`, ai-stylist-notes.md:71); the owner-role wiring is likely to touch `src/features/auth/**`, High per CLAUDE.md risk tiers.
- Hotspot: `src/App.tsx` (keep to wiring); F-706.7 also edits the AI settings area.

## Test plan
- Unit: admin screen states with a fake client; owner vs non-owner visibility.
- Manual (Ming): set and test the real shared key on production.

## Notes / answers from Ming

## Handoff
