# Security review — F-602 (slice F-602.1)

## Attempt 1 (2026-11-17, security-ai-generated-code-auditor)

**Verdict: no blockers. One should-fix (a data-integrity bug that only affects the caller's own account, not other users). Everything else is a note.**

Scope: `server/backup.js`, `server/validate.js` (parseBackup), `server/http.js` (readJson), `server/api.js:84-102`, `server/app.js:40-138`, `server/ai/rateLimit.js`, `server/inflight.js`, `server/db.js`, `server/errors.js`, `server/photos.js` rejectUnread, the RLS and ownership migrations, and the start of `server/backup.db.test.ts`. Nothing was run.

### Findings

**🟡 S1: Uppercase UUIDs pass validation, but restore compares ids case-sensitively, so it can create duplicate rows (CWE-178).**
- `server/validate.js:42` accepts ids in any case (`/i`). `reqId` (`validate.js:243`) keeps the original case.
- Postgres stores and returns ids in lowercase. `restoreBackup` compares them against the file's string in JS Sets and Maps: `backup.js:181` (`byId.get(f.id)`), `:287-293` (`inserted` / `ownedIds`), `:303`, `:333`, `:345`.
- Effect (own account only): a free uppercase id is inserted (stored lowercase), not recognised as owned, and inserted again under `derivedId(...,0)` → two copies, one without wear logs. Owned uppercase ids create derived copies instead of updates. Mixed-case pairs pass the `duplicateId` check. Summary counts are wrong.
- Not a cross-user hole; our exports are lowercase, so only hand-edited/third-party files trigger it. Still breaks D1 and AC2/AC3 on the first run.
- Fix: lowercase ids in `reqId` (`validate.js:243`) before the duplicate and reference checks; one `validate.test.ts` case and one DB test (uppercase-id file → 1 item, id kept).

**🟢 N1: Cross-user isolation holds.** Every query filters `user_id = $1` (server `userId`); RLS ENABLE + FORCE (`20261114200000_row_level_security.sql:18-40`); DB tests run as the NOSUPERUSER app role (`backup.db.test.ts:2,23`). Composite FKs `(user_id, location_id)`, `(user_id, parent_id)`, `(user_id, item_id)` (`20261114120000_user_ownership_contract.sql:99-105`). `locMap` / `itemMap` only yield caller-owned ids (`backup.js:180-250, 269, 323`). `ON CONFLICT DO NOTHING` on a foreign id is a silent no-op; UPDATEs scoped by `user_id` (`:138, :190, :243`).

**🟢 N2: File ids never trusted for ownership.** `parseBackup` builds output from known keys only (`validate.js:274-280, 319-326, 348-352`); `user_id` in the file is dropped; `photo_id` only counts `photosMissing`.

**🟢 N3: `item_photos` is never written** — read only via `items_with_stats` (`backup.js:69-71`, `:364`).

**🟢 N4: Id-existence oracle and squatting are accepted risks.** `remapped` counts (`backup.js:207, 232, 308`) reveal whether a UUID exists elsewhere; bounded by 10 restores/h × 3000 ids against random v4 ids, and `PUT /api/items/:id` already exposes the same oracle. A targeted 409 needs the victim's `sub` plus item ids. Low; no change.

**🟢 N5: Errors and logs carry no file data.** 400 returns `{field, reason}` with index paths and constant reasons (`validate.js:250-346`, `backup.js:434`); DB errors via `mapDbError`; `dbLogFields` logs code/constraint/routine only (`errors.js:35-43`); restore log has code, ms, counts (`backup.js:407-408`).

**🟢 N6: Auth and Sec-Fetch-Site applied.** Auth before `handleApi` (`app.js:114-118`); write guard before the backup branch (`api.js:95-102`), tested (`backup.test.ts:96`). Bearer-only auth (`auth.js:2`).

**🟢 N7: DoS limits in place.** Content-type, declared length, streamed count (`backup.js:415-419`, `http.js:71,100-104`); body timeouts 60 s / 10 s (`backup.js:19`); slot before limiter, released in `finally` (`:421-452`); caps checked before rows (`validate.js:235-237`); `statement_timeout` 5 s (`db.js:17`). Remaining: global `total: 1` slot + 60 s slow-body window + 60/h global quota lets a few slow senders block restore for all non-owner users — fine for a small invite-only user base; revisit if sign-up opens.

**🟢 N8: `GET /api/backup` has no limiter/slot** (same exposure as `GET /api/items`). Functional: export is not bounded by `BACKUP_CAPS`, so an account over 3000 items exports a file restore rejects (`tooMany`) — cover in F-602.2 copy or a debt issue.

**🟢 N9: Location parent cycles with existing DB rows are possible** (acknowledged in plan); future tree walkers must cap depth.

**🟢 N10: Minor, pre-existing.** On stream `error`, `readJson` parses the partial body (`http.js:107`) — harmless, socket already aborted. `createLimiter` would 500 if a kind were missing from `globalLimits`; restore config is consistent.

### Recommendations
1. Fix S1 in this ticket (AC2/AC3, D1, R8).
2. No other code changes for this slice.

### Risks
- Restore availability across tenants (N7) if users grow.
- Export not restorable past the caps (N8).

### Open questions
- Is TuDoCuaTui sign-in limited to a known set of Identity users? If not, N7 becomes 🟡 (raise `total` or shorten `totalMs`).
