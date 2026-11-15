# Consult — database-optimizer — T-019.14 (2026-11-15)

## Findings
1. **Plain count inside `withLockedItem` is not race-free across items.** Only the `items` row is locked (`for update`), READ COMMITTED: two uploads by one user to different items both see cap-1 and insert → cap+1. Bounded at +1 today by `photoSlots perUser: 2` (`server/app.js:40`), but real and reproducible with two parallel PUTs. Same item is serialized by the row lock.
2. **No index on `item_photos(user_id)`.** Existing: `item_photos_item_idx(item_id)`, partial unique `item_photos_one_primary(item_id)`, partial unique `item_photos_drive_file_uq(drive_file_id)`. `count(*) where user_id = $1` seq-scans the table (grows with total rows, trivial now; `statement_timeout` 5 s). No-migration alternative: join via `items_user_id_id_key (user_id, id)`. Suggest the plain count and accept the scan; an index later is a separate small ticket (check whether `server/migrator.js` wraps files in a transaction before using CONCURRENTLY).
3. **Serialize with a per-user advisory xact lock taken after the items row lock:** `select pg_advisory_xact_lock(hashtextextended('photo-quota:' || $1, 0))` inside the `withLockedItem` callback, before the count. Lock order always items row → advisory; holders never request another items lock; `deleteItem` (`server/items.js:143`) doesn't need it (deletes only lower the count). Existing lock rule intact; document as "rule step 2, only in `putPhoto`". No migration, no per-user row needed. Wait counts against `statement_timeout`; critical section ms-scale, ≤2 waiters/user. Drive `createFile` stays outside the transaction.
4. **"Count before Drive" vs "count under lock" → two checks:** an unlocked pre-check folded into the existing read-only `exists` query (`server/photos.js:192-198`) returns `photo_quota_exceeded` with no `createFile` (AC1); an authoritative recheck inside the lock; on failure the transaction rolls back and the existing catch deletes the just-uploaded Drive file (`deleteDriveFiles`) and maps to the quota response (race loser: createFile + delete). Don't reuse `return false` (means 404 in `withLockedItem`).
5. **Replace:** one query `select count(*)::int total, count(*) filter (where item_id = $2)::int on_item from item_photos where user_id = $1`; allow when `total - on_item < cap` (net zero, works at/above cap and after lowering the cap). Run before the `delete`. Same in the pre-check.
6. **No migration needed:** `user_id`, RLS (`owner_only`, FORCE) and indexes exist; count runs through `withUser`.
7. **Daily window:** in-memory Map needs pruning of idle keys; check before `readBody` and before `photoSlots` acquire; `rejectUnread` + `Retry-After`, 429 `rate_limited`. Decide record-on-attempt vs on-success (success-only lets free failed uploads bypass).

## Recommendations
- Authoritative count under the advisory lock + unlocked pre-check before Drive; document the lock order in `photos.js` header and `server/README.md`.
- Tests: two parallel PUTs to different items at cap-1 → exactly one succeeds, count = cap; loser's Drive file deleted (fake Drive sees create + delete); replace at cap works; two users independent; owner exempt decided in `app.js` (e.g. `quota: null`), not in SQL.
- Cap as a `createApp` option (tests use cap 2). New code through `mapDbError`/`sendError` and `src/data/apiErrors.ts` (R6).

## Risks
- A sentinel thrown inside `withUser` destroys the pooled connection (`client.release(err)`); prefer returning `{ over: true }` through `withLockedItem` (commits an empty tx).
- Per-process in-memory daily counts (accepted).
- Seq scan grows with total rows; revisit past tens of thousands.

## Open questions
- 409 (suggested) vs 403 for `photo_quota_exceeded` (403 may read as auth failure in `src/data/apiErrors.ts`).
- Daily counter on attempt or on success?
- `hashtextextended` needs PG ≥ 11 (M-24 checks the production version).
