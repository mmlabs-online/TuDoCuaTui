# F-708.4: Serve stickers and clean them up with their item or photo

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | F-708.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Let the app load a user's own stickers through an authenticated route and remove stickers when their item or source photo is removed, so no orphan sticker stays in Drive.

## Scope reference
`docs/feature-list.md` E7 → F-708 ("Sticker generation and storage pipeline") and its AC list; OQ-12 (answered, D54). Decisions D53 (sticker draw 10 credits) and D54 (sticker data handling). Split F-708.4 "Serving and lifecycle". D34 (photos behind the Identity bearer). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Owner-scoped `GET /api/stickers/:id` with the bearer + blob flow (D34).
- Collect sticker file ids before deleting in every item/photo removal path and delete them after.
- Orphan pass for `app=tudo-sticker` files, since the photo sweep ignores them.

## Out of scope
- Generating stickers (F-708.3); compositor and chibi screen (F-709).

## Acceptance criteria
- [ ] A user can read their own sticker; another user's sticker id returns not found.
- [ ] Deleting an item deletes its stickers' rows and Drive files.
- [ ] Replacing or deleting the source photo removes the stickers made from it.
- [ ] The photo sweep still leaves sticker files alone (regression test).
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Runnable only if F-705 passes (board `Depends on` lists F-705; the condition is **F-705 pass**). If F-705 fails, this ticket is cancelled and F-710 runs instead.
- Removal paths: `server/photos.js:172`, `server/photos.js:282`, `server/items.js:148-160` (ai-stylist-notes.md:87).
- Validate content type and magic bytes, cap size, never serve SVG (ai-stylist-notes.md:83); responses `private, no-cache` like photos (D34).
- Open for the planner: whether a primary-photo change (without deletion) invalidates stickers; the feature list only says "cleanup when an item or its photo is removed".

## Test plan
- Unit/route: owner-scoped read, cleanup in each removal path, sweep regression.
- Manual: none.

## Notes / answers from Ming

## Handoff
