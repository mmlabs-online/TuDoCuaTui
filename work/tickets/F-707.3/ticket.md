# F-707.3: Same-day suggestion cache in Postgres

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, data |
| Gate | plan-approval |
| Depends on | F-707.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | — |

## Goal
Serve a repeat outfit suggestion on the same day from a server cache, so the same wardrobe, occasion and weather never pay for a second provider call.

## Scope reference
`docs/feature-list.md` E7 → F-707 ("Occasion and suggestion token optimization") and its AC list; OQ-7 (answered by Ming 2026-11-22: "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch", mapped from category and tags). D53 (suggestion prices). Split F-707.3 "Same-day cache". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Per-user cache table (RLS in the same migration) keyed by UTC+7 day, wardrobe fingerprint, occasion and weather bucket.
- Fingerprint over item ids and prompt metadata, not wear logs.
- Shuffle ("Đổi gợi ý") bypasses and replaces the cached result.
- Result stored when the provider answers, so a client disconnect after dispatch does not lose it; a retry with the same idempotency key gets it.

## Out of scope
- Credit charging itself (F-706.4); UI (F-707.4).

## Acceptance criteria
- [ ] A repeat request on the same UTC+7 day with the same wardrobe fingerprint, occasion and weather bucket makes no provider call and costs 0 credits.
- [ ] The fingerprint covers item ids and prompt metadata, not wear logs, so logging a wear does not spend a credit.
- [ ] The shuffle action is a new AI suggestion (1 credit) and replaces the cached result.
- [ ] A client disconnect after dispatch does not waste the call: the result is stored and committed, and a retry with the same idempotency key gets it.
- [ ] The cache table has RLS and is covered by the RLS tests; one user's cache is never served to another.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Credits do not exist until F-706.4: before then "0 credits" / "1 credit" are verified as "no provider call" / "one provider call"; F-706.4 adds the charge. Coordinate the idempotency key with the F-706.1 ledger op key.
- Hotspot: `server/rls.db.test.ts:201,223-237` (ai-stylist-notes.md:54).

## Test plan
- Unit/DB: cache hit/miss per key part, wear log does not change fingerprint, shuffle replaces, disconnect then retry returns stored result, RLS.
- Manual: none.

## Notes / answers from Ming

## Handoff
