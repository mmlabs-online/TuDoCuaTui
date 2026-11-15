# Security review — T-019.14

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor)

Read-only; nothing run. **No 🔴.** Neither quota can be exceeded by any path in the diff; users can't touch each other's counters; RLS/scoping not weakened.

### 🟢 Verified
- **Stored cap:** pre-check before `drive.createFile` (`server/photos.js:225-232`, AC1); authoritative recount under the per-user `pg_advisory_xact_lock` inside `withLockedItem`, before delete/insert (`photos.js:260-271`) — exactly one of concurrent uploads wins. Replace net zero (`server/photoQuota.js:15-17`; delete-then-insert in one tx, `photos.js:272-281`). Only insert into `item_photos` is `photos.js:279`. Lock order items row → advisory; no cycle with `deleteItem`/photo DELETE. Lock never held across Drive IO.
- **Daily count:** synchronous check-and-record `reserve` (`photoQuota.js:53-67`) before slot acquire with no await between (`photos.js:150-160`). Kept once `createFile` resolves (`photos.js:244`), even on race-loser 409 / 404 / DB error; refunded only with no Drive write (`photos.js:200`). Client abort after/during `createFile` still charged. Accepted gap (A3): Drive timeout after Google stored the file → refunded orphan, cleaned by `photo-sweep.js`. 429 via `rejectUnread` before body, `Connection: close`; a rejected reserve records nothing.
- **Isolation:** Map key = authenticated canonical `userId` (`server/user.js:14-18`); advisory hash collisions only serialize (count still `user_id = $2` + RLS); no long lock holds.
- **Owner exemption:** config `ownerSub` only (`server/app.js:45`), `===` (`photoQuota.js:34`); null → nobody exempt; access mode → quotas effectively off (existing design).
- **RLS/scoping:** `control` regex anchored `^…$`, allows exactly the advisory statement (`server/isolation.db.test.ts:276-277`); second guard unchanged (`:439`); parameterised SQL (`$1::text`, `$1/$2`), `userId` validated in `withUser` (`server/db.js:81`), `itemId` via `isUuid` (`server/api.js:99`).
- **Race-loser orphan:** deleted at `photos.js:287-289`; failures swept by `photo-sweep.js`.
- **Errors leak nothing:** 409 no counts/cap; `Retry-After` only the caller's own window; lock-wait 57014 → existing unavailable path.

### 🟡
- **Y1 sweep CPU:** above 1024 active users (`SWEEP_SIZE`), `sweep()` runs on every `reserve` incl. rejected calls (`photoQuota.js:56`), O(users × 50). Memory bounded. Negligible at current scale; follow-up: rate-limit the sweep or run it after the limit check.
- **Y2 free failures stay free** (pre-existing, plan A3/A4): a user at the cap can keep sending 2 MiB bodies (pre-check 409, refunded), bounded by slots and 15 s / 5 s deadlines.

### 🟢 notes
- `dailyMax: 0` → `Retry-After: "NaN"` (`photoQuota.js:63`); config-only; optional guard.
- `API_ERROR_COPY.rate_limited` (`src/data/apiErrors.ts:23`) is photo-worded; a future items route returning `rate_limited` would show the wrong text → give it its own code then.

### Recommendations
1. Optional: throttle the sweep / move after the limit check (follow-up). 2. Optional: reject `dailyMax < 1`. 3. Follow-up: own code if another route returns 429. 4. Reviewer: confirm the race test asserts the winner's file remains and exactly one delete.

### Risks
Restart resets the daily count (A5; stored cap still bounds); multiple instances multiply the daily limit (stored cap stays correct in DB); `hashtextextended` needs PG ≥ 11 (M-24 requires ≥ 15); lock waits count against the 5 s `statement_timeout`.

### Open questions
Owner exempt from the daily count too (approved A1) means a stolen owner session has no write limit. Photo-sweep minimum age vs orphan build-up.
