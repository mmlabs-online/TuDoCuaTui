# T-019.14: Per-user photo quotas (Ming's Drive for everyone)

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, db |
| Gate | plan-approval |
| Depends on | T-019.5 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-15 |
| Claimed by | — |
| PR | — |

## Goal
Before strangers can upload, one account cannot fill Ming's Drive or flood it with writes.

## Feature reference
Slice of T-019 (D31, D38). Umbrella plan A7; T-019.13 plan A1 and *Split proposal*; Ming 2026-11-15 answer 1 on T-019.13 ("Drive của mình cho mọi người": every user's photos stay in Ming's Drive, D27). Can run in parallel with T-019.13; both touch `server/photos.js` and `server/app.js`, so whichever merges second rebases. Gates T-019.9 and so M-22.

## Scope
1. **Stored-photo cap per user**, counted from `item_photos where user_id = $1` inside the existing `withLockedItem` transaction in `putPhoto`. Replacing the photo of an item that already has one does not count as extra. At the cap: 403/409 `photo_quota_exceeded`, no Drive `createFile` (count before the Drive write). Proposed default **500 photos per user** (~1 GiB worst case, ~200 MB typical).
2. **Daily upload count per user**: in-memory rolling 24 h window (same pattern as `createLimiter`); a restart resets it (accepted). At the cap: 429 `rate_limited`, checked before the body is read. Proposed default **50 uploads per user per 24 h**.
3. **Owner**: default exempt from both (it is Ming's Drive); owner sub from `createApp({ ownerSub })` (T-019.13).
4. **Copy**: Vietnamese copy for the new code in `src/data/apiErrors.ts` (R6).
5. **Docs**: README note.

## Out of scope
- Item-row caps, tag-photo quotas (they store nothing, caller's key), byte accounting.
- Per-user Drive folders and `appProperties.userId`.
- The privacy notice (T-019.10).

## Acceptance criteria
- [ ] A non-owner at the stored cap gets the quota error and the fake Drive sees no `createFile`; replacing an existing photo at the cap still works.
- [ ] A non-owner over the daily count gets 429 before the body is read.
- [ ] The owner is not limited (per the chosen default).
- [ ] Two users' counts are independent (db test).
- [ ] The UI shows the Vietnamese copy for the new code.
- [ ] All checks pass.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-15: created by the orchestrator from the T-019.13 plan *Split proposal* after Ming approved that plan. The numbers (500 / 50, owner exempt) are proposed defaults; Ming confirms or changes them at this ticket's plan approval.

## Handoff

### 2026-11-15 — claude — BLOCKED
- Done: database-optimizer consult; plan.md READY: new `server/photoQuota.js` (limits, `storedAllows`, in-memory 24 h counter with refund), daily count before slot/body (429 `rate_limited`), stored cap pre-check before Drive + authoritative recount under a per-user advisory lock after the items row lock (409 `photo_quota_exceeded`), replace = net zero, owner exempt via `createApp`, no migration.
- In progress / next: Ming approves the plan and confirms A1 (500 / 50, owner exempt) and the two Vietnamese strings; then implement.
- Gotchas: the advisory-lock statement has no `user_id`; `isolation.db.test.ts` control regex is extended for exactly that statement.
