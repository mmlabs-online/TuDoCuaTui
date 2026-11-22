# F-705: Sticker spike on 10 hard items

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | architecture, security |
| Gate | none |
| Depends on | — |
| Needs Ming | M-41 |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Find out, before any production work, whether Gemini or OpenAI can draw a recognizable sticker of a real wardrobe item, so Ming can lock the image provider (pass) or switch to the real-photo collage (fail).

## Scope reference
`docs/feature-list.md` E7 → "AI stylist (F-705 to F-710)" overview and F-705; open questions OQ-8 and OQ-9 (answered by Ming 2026-11-22). Decision D54 (sticker data handling). Dependency line: "F-705 pass → F-708/F-709; F-705 fail → F-710". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- A throwaway spike script (outside `server/` and outside the production bundle, e.g. under `spikes/` or the session scratchpad) that sends each of the 10 items Ming picks to Gemini and to OpenAI image generation.
- Input downscaled before sending (default: long edge 768 px); output requested/downscaled to 512×512.
- One sticker per item per provider; no automatic retry (D54).
- Blind scoring sheet: stickers shown without the source photo; Ming scores each one recognizable yes/no (OQ-8).
- A non-gating composite of the stickers on one preset avatar, recorded as a note (OQ-9).
- Result write-up in the ticket folder (`result.md`): score per provider, cost per image from the live pricing pages, chosen transparency approach, downscale limits used, recommended provider, pass/fail.

## Out of scope
- Any code in `server/`, `src/`, `db/migrations/` or the production image.
- Avatar preset art (F-709.1), sticker storage (F-708.1), shared key and credits (F-706).
- Locking the provider in `work/decisions.md` (Ming records the spike result as a new decision).

## Acceptance criteria
- [ ] The same 10 hard items (including patterned, áo dài and dark items) are run with both Gemini and OpenAI.
- [ ] Each output is scored without the source photo in view (Ming, blind, OQ-8).
- [ ] The result records the score per provider, the cost per image taken from the live pricing page, and the recommended provider.
- [ ] Gate recorded: pass if at least 8/10 are recognizable without the source photo; pass unlocks F-708 and F-709, fail cancels them and activates F-710.
- [ ] The result records the transparency approach and the input/output size limits that F-708.2 will use.
- [ ] No spike code or test key lands in `server/`, `src/` or any committed file.

## Technical notes
- Spike code stays outside `server/` and production (feature list F-705). Gate `none` because no High path is touched; if the plan needs a High path, stop and re-gate.
- M-41 inputs (Ming): pick the 10 hard items (patterned, áo dài, dark) and provide Gemini and OpenAI **test** keys through the environment's secure credential form, never in chat, tickets or files; Ming scores the stickers blind.
- Transparency (ai-stylist-notes.md:84): the photo pipeline is JPEG-only and D48 avoids a server image dependency. The spike compares (a) native alpha from the provider, (b) a flat key colour removed in the browser, (c) a new image dependency. Option (c) needs Ming's decision.
- Downscale defaults from Ming's 2026-11-22 answers: input long edge 768 px, output 512×512. The spike may recommend other limits; F-708.2 enforces whatever the result records.
- Prices in the feature list are search snapshots; take the cost per image from the live pricing pages (ai-stylist-notes.md:42-44).
- Existing Gemini adapter caps responses at 64 KB and expects JSON text (ai-stylist-notes.md:85, `server/ai/gemini.js:10,116,134`), so the spike calls the image APIs directly.
- Photos of real items go to the providers: use only the 10 items Ming picks, on accounts whose terms exclude training where possible (D54).

## Test plan
- Unit: none required (throwaway spike).
- Manual: Ming scores the blind sheet; the agent records results in `result.md`.

## Notes / answers from Ming

## Handoff
