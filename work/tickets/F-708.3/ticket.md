# F-708.3: Sticker generate route with cache, credits and idempotency

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture, data |
| Gate | plan-approval |
| Depends on | F-708.1, F-708.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Expose one route that returns an item's sticker from the cache for free or draws it for 10 credits on the user's tap, refunding on failure and never charging twice.

## Scope reference
`docs/feature-list.md` E7 → F-708 ("Sticker generation and storage pipeline") and its AC list; OQ-12 (answered, D54). Decisions D53 (sticker draw 10 credits) and D54 (sticker data handling). Split F-708.3 "Generate route". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Route per item: cache lookup by photo hash + style version + model in the caller's scope; on miss reserve 10 credits and spend estimate, call the adapter, store, commit; refund on failure.
- Source is the item's primary photo (`is_primary`); items without a photo are skipped.
- Explicit redraw: costs 10, the old sticker stays until the new one succeeds.
- Idempotency key on every paid call; per-item result.

## Out of scope
- Serving and cleanup (F-708.4); batch (F-708.5); chibi UI (F-709.3); the one-time AI notice UI (F-709.3).

## Acceptance criteria
- [ ] A cache hit (photo hash + style version + model, inside the caller's own scope) makes no provider call and costs 0.
- [ ] The source is the item's primary photo; an item with no photo is skipped with no charge.
- [ ] The photo is sent to the provider only after a user tap; no background, import or suggestion flow sends it.
- [ ] A failed draw refunds the 10 credits; the same idempotency key never charges or calls the provider twice.
- [ ] Redraw is explicit and costs 10; the old sticker stays until the new one succeeds.
- [ ] A style-version bump does not regenerate existing stickers (D54, OQ-12).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- One request and one reservation per item, low concurrency; an outfit can need 5 stickers (50 credits) (ai-stylist-notes.md:86).
- Never hold a DB transaction across the provider call (`server/db.js:14,17`).
- Dev runs against production (D45): stub the adapter locally.

## Test plan
- Unit/route: cache hit 0, no-photo skip, refund, idempotent replay, redraw keeps old until success, no other caller of the adapter.
- Manual: none.

## Notes / answers from Ming

## Handoff
