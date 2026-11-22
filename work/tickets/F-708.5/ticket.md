# F-708.5: Server batch job to prepare the whole wardrobe

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture, data |
| Gate | plan-approval |
| Depends on | F-708.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Let a user explicitly prepare stickers for their whole wardrobe through the provider Batch API on the server, at lower cost, without sending any photo they did not ask for.

## Scope reference
`docs/feature-list.md` E7 → F-708 ("Sticker generation and storage pipeline") and its AC list; OQ-12 (answered, D54). Decisions D53 (sticker draw 10 credits) and D54 (sticker data handling). Split F-708.5 "Batch job (P2)". Non-goal: Batch outside this explicit action. Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Server job started only by an explicit "prepare whole wardrobe" request: collects items missing a sticker (primary photo only), reserves credits per item, submits a provider Batch, stores results, commits/refunds per item.
- Status read for progress.

## Out of scope
- Batch UI (F-708.6); Batch from any other flow.

## Acceptance criteria
- [ ] Batch runs only from the explicit "prepare whole wardrobe" action; no other flow sends photos in bulk.
- [ ] Items already cached and items without a photo are skipped with no charge.
- [ ] Each item is charged 10 credits only on success; failed items are refunded, with no automatic retry.
- [ ] Progress (done, failed, pending) can be read while the batch runs.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- P2. OQ-11 (not enough credits for all missing stickers) is still open; default: generate nothing, show the shortfall, let the user pick items. Confirm with Ming before PLAN.
- There is no scheduler on the server (ai-stylist-notes.md:62); the plan must say how batch results are collected.

## Test plan
- Unit/route: explicit start only, skips, per-item charge/refund, progress.
- Manual: none.

## Notes / answers from Ming

## Handoff
