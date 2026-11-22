# F-708.2: Image provider adapter with input and output downscaling

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | F-705, F-706.4 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Add a server adapter that turns one item photo into one sticker image with the provider chosen in F-705, within fixed size limits and without automatic retries.

## Scope reference
`docs/feature-list.md` E7 → F-708 ("Sticker generation and storage pipeline") and its AC list; OQ-12 (answered, D54). Decisions D53 (sticker draw 10 credits) and D54 (sticker data handling). Split F-708.2 "Provider adapter"; OQ-10 (one shared key per provider, D52). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Image-generation adapter for the F-705 provider, separate from the JSON-text Gemini path.
- Input downscaled and output limited to the sizes recorded in the F-705 result; transparency handled as F-705 chose.
- One provider call per attempt; output validated (content type, magic bytes, size cap, never SVG).
- Uses the shared key for that provider (F-706.3) and the price table entry (F-706.2).

## Out of scope
- Credits, cache and routes (F-708.3); Batch API (F-708.5).

## Acceptance criteria
- [ ] Input and output images are downscaled to the limits fixed by the spike; a test asserts the outgoing size.
- [ ] No automatic image retry: one provider call per attempt, verified by test.
- [ ] Output that is not an allowed image type, fails the magic-byte check, exceeds the size cap or is SVG is rejected.
- [ ] The model has a price entry; an unpriced model is refused (D53).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- Existing Gemini path caps responses at 64 KB and requires JSON text (`server/ai/gemini.js:10,116,134`), so image generation needs its own path (ai-stylist-notes.md:85).
- Defaults if the spike keeps them (Ming 2026-11-22): input long edge 768 px, output 512×512.
- D48 avoids a server image dependency; a new dependency for downscaling or alpha needs Ming (ai-stylist-notes.md:84).
- If F-705 picks OpenAI, `ai_settings.provider` cannot hold it; the key lives in the F-706.3 table (ai-stylist-notes.md:74).

## Test plan
- Unit: outgoing size, single call on failure, output validation, unpriced model refused (fake provider).
- Manual: none.

## Notes / answers from Ming

## Handoff
