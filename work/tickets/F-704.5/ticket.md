# F-704.5: "✨ Gợi ý bằng AI" toggle in the outfits modal

| Field | Value |
|---|---|
| State | REWORK |
| Priority | P2 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | ui |
| Gate | none |
| Depends on | F-704.4 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-18 |
| Claimed by | claude@2026-11-19T08:46:44Z |
| PR | — |

## Goal
Ming turns on "✨ Gợi ý bằng AI" in "Hôm nay mặc gì?" and sees up to 3 outfits picked and explained by his own AI
provider, with the rule-based set as the fallback. UI slice split from F-704.4 (see `work/tickets/F-704.4/plan.md`,
`## Split proposal`, which outlines this ticket in detail).

## Feature reference
`docs/feature-list.md` F-704 (epic E7 — AI). Server: F-704.3 (`POST /api/ai/suggest-outfits`). Client data and pure
helpers: F-704.4 (`createHttpAiOutfits`, `candidatePool`, `toAiOutfits`, `cleanReason`). Assumptions approved with
F-704.3: toggle off each time the modal opens (A3); "Đổi gợi ý" sends `avoidIds` (A5); reason Vietnamese ≤120 (A4).
Security: render the reason as plain text only (F-704.3 security review).

## Scope
- `OutfitsModal.tsx` + `copy.ts` + `src/index.css`: the toggle on its own row below the weather row, shown only when
  AI is ready, off on every open; the AI result as an overlay on the rule set (rule set stays the fallback); one effect
  keyed on the joined candidate ids, aborted on close, toggle-off and shuffle; cards stay (dimmed, `aria-busy`) while
  loading; "Đổi gợi ý" disabled while the AI call is in flight; a small "AI" chip and the reason as a plain text node;
  a `role="status"` Vietnamese note per error code, none for an empty result.
- `src/App.tsx`: wire `createHttpAiOutfits` and pass `ai={{settings, settingsRev, outfits}}` (wiring only).

## Out of scope
- Server changes; the client data module and pure helpers (F-704.4); saving outfits (F-801–F-803).

## Acceptance criteria
- [ ] With AI ready and the toggle on, the modal shows the AI-picked outfits and their reasons (modal tests with a fake client).
- [ ] The toggle is hidden when AI is not configured, and off each time the modal opens.
- [ ] AI errors, `rate_limited`, `ai_busy` or an empty result fall back to the rule-based set with a Vietnamese note (none for empty).
- [ ] "Đổi gợi ý" with AI on sends `avoidIds` and shows a different set when the server returns one.
- [ ] Closing the modal aborts an in-flight call.
- [ ] Works at 390px and in dark mode (one-off Playwright check, D42; mock `/healthz`, `/api/items`, `/api/locations`, `/api/weather`, `/api/ai-settings`, `/api/ai/suggest-outfits`).
- [ ] All checks pass.

## Technical notes
- Files: `src/features/outfits/OutfitsModal.tsx` (+ test), `copy.ts` (+ test), `src/index.css`, `src/App.tsx`.
- No App-level tests (BUG-006). `src/App.tsx` is a hotspot: keep it to wiring.
- Follow-up from F-704.4 consult: clear the weather wait timer in the modal (it is never cleared today).
- From the F-704.4 review: convert the season label from `seasonOf()` (e.g. "Đông") to the DB id with `SEASON_TO_DB` before calling `suggest` — the server only accepts ids like `"winter"`.

## Test plan
- Modal tests with fake AI and weather clients. Manual (Ming): real Claude and Gemini keys; check the reasons read naturally.

## Notes / answers from Ming

## Handoff
