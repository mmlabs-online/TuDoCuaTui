# F-704.3: AI-ranked outfit suggestions

| Field | Value |
|---|---|
| State | DONE |
| Priority | P2 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | data, security, architecture |
| Gate | plan-approval |
| Depends on | F-704.1 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-18 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/87 |

## Goal
Optionally let the user's AI provider pick and explain the 3 outfits from the rule-based candidates, so the ideas
look more styled than "top + bottom + shoes". Third slice of F-704; uses the AI settings from T-010/T-018.

## Feature reference
`docs/feature-list.md` F-704 (epic E7 — AI). Split recorded in F-704.1. Related: F-701 (server-side AI calls,
per-user limits, provider adapters for Claude and Gemini), D48 (no EXIF to AI).

## Scope
- A server endpoint (e.g. `POST /api/ai/suggest-outfits`) that sends a compact, text-only list of candidate items
  (ids, category, colours, seasons, material, wear count, last worn; no photos, no names if Ming prefers) to the
  user's configured provider and returns up to 3 outfits as item-id lists plus a short Vietnamese reason each.
- Strict validation: only ids from the sent candidates, valid combinations by the F-704.1 rules; anything else is dropped.
- Counts against the per-user AI limit (new kind or the existing `tag` budget — planner decides with Ming).
- A toggle "✨ Gợi ý bằng AI" in the modal when AI is configured; errors fall back to the rule-based set.

## Out of scope
- Sending photos to the AI; saving outfits (F-801–F-803); weather (F-704.2).

## Acceptance criteria
- [ ] With AI on, the modal shows AI-picked outfits drawn only from the user's own active items (server tests reject foreign or unknown ids).
- [ ] AI errors, `rate_limited` or not-configured fall back to the F-704.1 suggestions with a Vietnamese note.
- [ ] No API key or secret reaches the browser (R3); no photos are sent.
- [ ] Per-user rate limit applies (server test).
- [ ] 390px and dark mode.
- [ ] All checks pass.

## Technical notes
- High path: `server/**` → `Gate: plan-approval`; route to `security-ai-generated-code-auditor` at review.
- Reuse `server/ai/` adapters (claude.js, gemini.js), `rateLimit.js`, and the client `aiSettings` / `useAiLoad`.
- Open questions for Ming: send item names to the AI or only attributes; which rate-limit budget.

## Test plan
- Unit: candidate builder and response validation; server route with a fake provider. Manual: Ming tries it with Claude and Gemini keys.

## Notes / answers from Ming
Plan approved (2026-11-18) — Ming: "duyệt F-704.3" (server slice; client slice is F-704.4; assumptions A1–A7 accepted).
Answers (2026-11-18):
- Send attributes **and item names** to the AI (category, colours, seasons, material, wear count, last worn, name); never photos.
- **Separate rate limit** for AI suggestions (a new limiter kind, e.g. `suggest`, about 30/day per user), not the 100/day `tag` budget.

## Handoff

### 2026-11-18 — claude — BLOCKED
- Done: consult software-architect; Ming's answers recorded (names + attributes, separate `suggest` limit); plan READY (server slice only, ~1,400 lines total → split; client slice proposed as F-704.4).
- In progress / next: waiting for Ming's plan approval (server/** is High); after approval create F-704.4 and implement F-704.3.
- Gotchas: existing tag adapter tests must pass unchanged after the adapter refactor.

### 2026-11-18 — claude — DONE
- Done: server slice — `POST /api/ai/suggest-outfits` (DB-scoped candidates, aliases, strict validator, `suggest` limits and slots, adapter refactor). Review PASS (attempt 1); security review PASS (one 🟡: 408 path leaves the socket open). PR https://github.com/mmlabs-online/TuDoCuaTui/pull/87.
- In progress / next: the DB isolation test only runs on CI — confirm it passes on PR #87; Ming merges; then F-704.4 (client).
- Gotchas: `category = any($3)` against the `item_category` enum is only exercised by the DB test.
