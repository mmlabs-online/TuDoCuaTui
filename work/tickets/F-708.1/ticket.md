# F-708.1: Sticker table and Drive storage

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | F-705, F-706.4 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Store each user's item stickers in their own Drive folder with a per-user database row, so stickers can be cached and served without counting against photo quotas or being deleted by the photo sweep.

## Scope reference
`docs/feature-list.md` E7 → F-708 ("Sticker generation and storage pipeline") and its AC list; OQ-12 (answered, D54). Decisions D53 (sticker draw 10 credits) and D54 (sticker data handling). Split F-708.1 "Storage". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Migration: sticker table (per user, RLS in the same migration) with server-computed photo hash, style version, model and Drive file id.
- Drive helper that writes sticker files in the user's existing folder tagged `app=tudo-sticker`.
- `server/photo-sweep.js` leaves sticker files alone.

## Out of scope
- Generating stickers (F-708.2, F-708.3); serving and cleanup (F-708.4).

## Acceptance criteria
- [ ] Sticker rows are scoped per user under RLS; stickers are never shared across users.
- [ ] Sticker files do not count in `item_photos` quotas.
- [ ] Stickers carry their own Drive tag, and a test proves `server/photo-sweep.js` does not delete them.
- [ ] The table is covered by the RLS tests.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- The sweep deletes any `app=tudo` file without an `item_photos` row (`server/photo-sweep.js:114-124`, ai-stylist-notes.md:50); tag stickers `app=tudo-sticker` (ai-stylist-notes.md:82). Orphan sticker cleanup then needs its own pass (F-708.4).
- Cache key is photo hash + style version + model (D54). Every photo replacement creates a new photo id (`server/photos.js:236,280-289`); keying by `photo_id` instead would need Ming (ai-stylist-notes.md:81). Compute the hash on the server.
- Hotspot: `server/rls.db.test.ts`.

## Test plan
- Unit/DB: RLS isolation, quota unaffected, sweep leaves `app=tudo-sticker` files.
- Manual: none.

## Notes / answers from Ming

## Handoff
