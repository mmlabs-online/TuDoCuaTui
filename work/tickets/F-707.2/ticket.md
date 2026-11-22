# F-707.2: Suggest route accepts the occasion and enforces 20 candidates

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, data |
| Gate | plan-approval |
| Depends on | F-707.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Make the server's suggestion route accept a validated occasion and refuse more than 20 candidates, so token use is bounded on the server and not only in the client.

## Scope reference
`docs/feature-list.md` E7 → F-707 ("Occasion and suggestion token optimization") and its AC list; OQ-7 (answered by Ming 2026-11-22: "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch", mapped from category and tags). D53 (suggestion prices). Split F-707.2 "Server contract". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- `parseSuggestBody` accepts `occasion` from the enum (optional at first, so old bundles keep working).
- Server cap: at most 20 candidate ids.
- Occasion added to the text prompt; no image data in the suggestion request.

## Out of scope
- Cache (F-707.3); credits (F-706.4); UI (F-707.4).

## Acceptance criteria
- [ ] Occasion is validated against the enum; free text is rejected with 400.
- [ ] At most 20 candidates reach the provider, enforced on the server.
- [ ] The suggestion request contains no image data (test on the outgoing provider payload).
- [ ] A request without `occasion` from an older bundle is still accepted.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- `parseSuggestBody` requires exact keys (`server/ai/outfitSuggest.js:63-72`), so a required field would return 400 to open old bundles; make `occasion` optional at first (ai-stylist-notes.md:76).
- Can run in parallel with F-706; hotspot `server/ai/suggestOutfits.js` is also changed by F-706.4.

## Test plan
- Unit/route: enum validation, free text 400, cap 20, payload has no image data, missing occasion accepted.
- Manual: none.

## Notes / answers from Ming

## Handoff
