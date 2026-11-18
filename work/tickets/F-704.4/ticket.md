# F-704.4: "✨ Gợi ý bằng AI" toggle in "Hôm nay mặc gì?"

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | ui, data |
| Gate | none |
| Depends on | F-704.3 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-18 |
| Claimed by | claude@2026-11-18T14:07:04Z |
| PR | — |

## Goal
In "Hôm nay mặc gì?", Ming can turn on "✨ Gợi ý bằng AI" and get up to 3 outfits picked and explained by his own AI
provider, falling back to the rule-based set whenever AI is off, busy or failing. Client slice of F-704.3 (split in
`work/tickets/F-704.3/plan.md`, `## Split proposal`; approved by Ming 2026-11-18).

## Feature reference
`docs/feature-list.md` F-704 (epic E7 — AI). F-704.3 provides `POST /api/ai/suggest-outfits` (server reloads the
caller's own active items by id, text-only prompt with names + attributes, strict validation, `suggest` limit 30/day
per user). Ming's answers on F-704.3: names + attributes, never photos; separate `suggest` limit. Plan assumptions
accepted with F-704.3: toggle off each time the modal opens (A3); reason Vietnamese ≤120 chars (A4); "Đổi gợi ý"
sends `avoidIds` (A5); candidate cap 40, never-worn then longest-unworn (A2).

## Scope
- `src/data/aiOutfits.ts`: `createHttpAiOutfits(...).suggest({candidateIds, season, weather, avoidIds}, signal)`;
  parses `{outfits}`, maps errors like `aiTagging.ts` (R1: no fetch in components).
- `src/features/outfits/suggest.ts`: pure `candidatePool(items, {now, weather})` (eligible active items after the
  season/weather step, capped at 40) and `toAiOutfits(result, items)` (map ids back to items, drop unknown ones).
  Existing `suggest.test.ts` cases unchanged.
- `OutfitsModal.tsx` + `copy.ts`: the toggle shows only when AI is ready (`hasKey && modelSupported`), off on open;
  calls on toggle-on and on "Đổi gợi ý" (with `avoidIds`), aborted on close; the rule-based set shows while loading
  and after any error, with a Vietnamese note per code (`rate_limited`, `not_configured`, others); an empty result
  falls back silently; the AI reason renders as plain text.
- `src/App.tsx`: wire the `aiOutfits` client (wiring only).

## Out of scope
- Server changes (F-704.3); sending photos; saving outfits (F-801–F-803).

## Acceptance criteria
- [ ] With AI ready and the toggle on, the modal shows the AI-picked outfits and their reasons (modal tests with a fake client).
- [ ] The toggle is hidden when AI is not configured, and off each time the modal opens.
- [ ] AI errors, `rate_limited`, `ai_busy` or an empty result fall back to the rule-based set with a Vietnamese note (none for empty).
- [ ] "Đổi gợi ý" with AI on sends `avoidIds` and shows a different set when the server returns one.
- [ ] Closing the modal aborts an in-flight call.
- [ ] Works at 390px and in dark mode (one-off Playwright check, D42).
- [ ] All checks pass.

## Technical notes
- Files: `src/data/aiOutfits.ts` (+ test), `src/features/outfits/suggest.ts`, `OutfitsModal.tsx`, `copy.ts` (+ tests), `src/App.tsx`, `src/index.css`.
- No App-level tests (BUG-006). `src/App.tsx` is a hotspot: keep it to wiring.

## Test plan
- Unit: `aiOutfits` client, `candidatePool`, `toAiOutfits`; modal states with a fake client.
- Manual (Ming): real Claude and Gemini keys; check the reasons read as natural Vietnamese.

## Notes / answers from Ming

## Handoff
