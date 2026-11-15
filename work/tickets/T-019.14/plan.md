Status: READY

# Plan — T-019.14: Per-user photo quotas (Ming's Drive for everyone)

## Feature summary
Not in `docs/feature-list.md`. This is a slice of T-019 (D31, D38), created from the T-019.13 plan *Split proposal* after
Ming approved that plan.

- Ticket goal: "Before strangers can upload, one account cannot fill Ming's Drive or flood it with writes."
- D38 (2026-11-15): "… photos of every user stay in Ming's Drive (D27) with per-user quotas (T-019.14) and a privacy
  notice (T-019.10) before M-22."
- T-019.13 plan A1: "The smallest correct form needs **no migration**. `putPhoto` replaces an item's photos, so a user's
  stored photos equal the rows in `item_photos`. Uploads are capped at 2 MiB (`MAX_BYTES`), so a count cap also bounds
  bytes (cap × 2 MiB)."
- Ticket scope, quoted:
  1. "**Stored-photo cap per user**, counted from `item_photos where user_id = $1` inside the existing `withLockedItem`
     transaction in `putPhoto`. Replacing the photo of an item that already has one does not count as extra. At the cap:
     403/409 `photo_quota_exceeded`, no Drive `createFile` (count before the Drive write). Proposed default **500 photos
     per user**."
  2. "**Daily upload count per user**: in-memory rolling 24 h window (same pattern as `createLimiter`); a restart resets
     it (accepted). At the cap: 429 `rate_limited`, checked before the body is read. Proposed default **50 uploads per
     user per 24 h**."
  3. "**Owner**: default exempt from both (it is Ming's Drive); owner sub from `createApp({ ownerSub })` (T-019.13)."
  4. "**Copy**: Vietnamese copy for the new code in `src/data/apiErrors.ts` (R6)."
  5. "**Docs**: README note."
- Out of scope (ticket): "Item-row caps, tag-photo quotas …, byte accounting. Per-user Drive folders and
  `appProperties.userId`. The privacy notice (T-019.10)."

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "A non-owner at the stored cap gets the quota error and the fake Drive sees no `createFile`; replacing an existing photo at the cap still works." | `server/photoQuota.db.test.ts` › "at the stored cap a PUT to another item → 409 photo_quota_exceeded, no Drive POST, no new row" and › "at the stored cap a replace on an item that has a photo → 200, count unchanged, old Drive file deleted". Race: › "two parallel PUTs to different items at cap-1 → exactly one 200 and one 409; rows = cap; the loser's Drive file was created and deleted". Lock order: › "statements in the putPhoto transaction: items `for update` → advisory lock → quota count → delete/insert". Pure rule: `server/photoQuota.test.ts` › `storedAllows` cases. |
| 2 | "A non-owner over the daily count gets 429 before the body is read." | `server/photoQuota.db.test.ts` › "over the daily count: a PUT that sends only headers (Content-Length 1000, no body) gets `HTTP/1.1 429` `rate_limited` with `Retry-After` and `Connection: close`; the fake Drive sees no request". Window logic: `server/photoQuota.test.ts` › `createUploadCounter` cases (limit, rolling expiry, refund, Retry-After, pruning). |
| 3 | "The owner is not limited (per the chosen default)." | `server/photoQuota.db.test.ts` › "owner (ownerSub) with storedMax 1 / dailyMax 1 uploads to three items → all 200; a non-owner on the same app gets 409 on its second item". `server/photoQuota.test.ts` › "exempt user: reserve always succeeds and records nothing", "storedCap(owner) is null". |
| 4 | "Two users' counts are independent (db test)." | `server/photoQuota.db.test.ts` › "A at the stored cap and over the daily count; B's PUT on its own item → 200" (real Postgres, RLS pool as in `isolation.db.test.ts`). |
| 5 | "The UI shows the Vietnamese copy for the new code." | `src/data/apiErrors.test.ts` › `photo_quota_exceeded` and `rate_limited` in `SERVER_CODES` and each maps to its own string (not `generic`). `src/data/repo.http.test.ts` › "a 409 photo_quota_exceeded photo step → PhotoSaveError whose message contains `API_ERROR_COPY.photo_quota_exceeded`" (same for 429 `rate_limited`). |
| 6 | "All checks pass." | `pnpm typecheck`, `pnpm format:check`, `pnpm test` (with `TEST_DATABASE_URL`, CI `postgres:17`), `pnpm build` green. `server/scoping.test.ts` and `server/isolation.db.test.ts` "every statement … mentions user_id" stay green (see Approach step 3). |

## Ming verification after merge
- At plan approval: confirm or change the numbers **500 stored photos per user** and **50 uploads per user per 24 h**,
  and **owner exempt from both** (A1). They are constants in `server/photoQuota.js` (`PHOTO_LIMITS`); changing them
  later is a one-line change.
- After the release, nothing is observable for the owner (exempt). Optional: a second test account can upload past 50
  photos in a day and should then see "Bạn đã tải lên nhiều ảnh trong 24 giờ qua, thử lại sau nhé".
- No new Ming item: M-24 already requires production Postgres ≥ 15, which covers `hashtextextended` (PG ≥ 11, A6).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/photoQuota.js` (new) | `PHOTO_LIMITS = { storedMax: 500, dailyMax: 50, windowMs: 24 h }`; pure `storedAllows({ total, onItem, cap })`; `createPhotoQuota({ storedMax, dailyMax, windowMs, now, exempt })` returning `{ storedCap(userId), reserve(userId) }` (in-memory rolling window with sweep, refund, Retry-After) | Scope 1–3; pure logic in its own module with unit tests (planner rule 6, R8) |
| `server/photos.js` | header comment: lock rule step 2; `handlePhoto`: daily `reserve` before the slot acquire, refund unless the Drive create succeeded; `putPhoto`: pre-check folded into the existing `exists` query, advisory lock + authoritative recount inside `withLockedItem`, `over` flag, 409 path deleting the just-created Drive file | Scope 1, 2; AC1, AC2 |
| `server/api.js` | forward `photoQuota` to `handlePhoto` (ctx typedef + destructuring) | wiring |
| `server/app.js` | new dep `photoLimits = PHOTO_LIMITS`; build `photoQuota = createPhotoQuota({ ...photoLimits, now, exempt: ownerSub })` once per app; pass it into `handleApi` | Scope 3 (owner decided in app wiring, not SQL); tests inject small caps |
| `src/data/apiErrors.ts` | add `photo_quota_exceeded` and `rate_limited` Vietnamese strings to `API_ERROR_COPY` | Scope 4, R6, AC5 |
| `server/README.md` | errors paragraph: 409 `photo_quota_exceeded`, 429 `rate_limited` (with `Retry-After`) for photo PUT; Photos paragraph: the two limits, owner exemption, in-memory reset on restart, lock rule step 2 | Scope 5 |
| `server/photoQuota.test.ts` (new) | unit tests below | R8 |
| `server/photoQuota.db.test.ts` (new) | HTTP + real Postgres tests below (RLS app pool, fake Drive, `headerAuth`) | AC1–AC4 |
| `server/isolation.db.test.ts` | extend the `control` regex of "every statement … mentions user_id" to accept exactly the advisory-lock statement (it touches no table) | keeps that guard green (Approach step 3) |
| `src/data/apiErrors.test.ts` | add the two codes to `SERVER_CODES`; assert each is not `generic` | AC5 |
| `src/data/repo.http.test.ts` | one test: 409 `photo_quota_exceeded` / 429 `rate_limited` on the photo step → `PhotoSaveError` with the copy | AC5 |

No migration, no change to `src/` beyond the copy, no change to `server/items.js` (deletes only lower the count).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/photoQuota.test.ts` › `storedAllows`: total 1 / onItem 0 / cap 2 → true; total 2 / onItem 0 / cap 2 → false; total 2 / onItem 1 / cap 2 → true (replace at cap); total 5 / onItem 1 / cap 2 → false (above a lowered cap, new item); total 5 / onItem 1 / cap 5 → true (replace); cap null → true for any total; cap 0 / total 0 → false | Scope 1 rule, net-zero replace |
| `server/photoQuota.test.ts` › `reserve` returns a ticket for the first `dailyMax` calls, then `{ ok: false, retryAfterSec }` with `retryAfterSec` = seconds until the oldest entry leaves the window (≥ 1, rounded up) | Scope 2 |
| `server/photoQuota.test.ts` › rolling window: after `windowMs` (+1 ms) of the oldest entry, one more reserve succeeds | rolling 24 h |
| `server/photoQuota.test.ts` › `refund()` removes exactly that reservation; calling it twice is a no-op; a refunded slot can be reserved again | refund rule (A3) |
| `server/photoQuota.test.ts` › a rejected reserve records nothing (count unchanged after many rejections) | no self-extending lockout |
| `server/photoQuota.test.ts` › two users: A at `dailyMax`, B still reserves | independence (unit level) |
| `server/photoQuota.test.ts` › exempt user: `reserve` always returns a ticket, records nothing (`size()` unchanged); `storedCap(exempt)` is null; `storedCap(other)` is `storedMax`; `exempt: null` → nobody is exempt | Scope 3 |
| `server/photoQuota.test.ts` › idle users are swept: entries older than the window are deleted on sweep (`size()` drops to 0) | memory bound (consult 7) |
| `server/photoQuota.db.test.ts` › at the stored cap a PUT to another item → 409 `photo_quota_exceeded`, no Drive POST, no new row | AC1 (pre-check) |
| `server/photoQuota.db.test.ts` › at the stored cap a replace on an item that has a photo → 200, count unchanged, old Drive file deleted | AC1 (replace) |
| `server/photoQuota.db.test.ts` › two parallel PUTs to different items at cap-1 (a `createFile` barrier releases both once both are pending) → one 200, one 409; rows = cap; fake Drive saw 2 creates and 1 delete; the remaining file is the winner's | AC1 (race, consult 1/4) |
| `server/photoQuota.db.test.ts` › statement order in the putPhoto transaction (recording pool): `for update` → `pg_advisory_xact_lock` → quota count → `delete from item_photos` → `insert` | lock rule (consult 3) |
| `server/photoQuota.db.test.ts` › over the daily count: headers-only PUT (Content-Length 1000, no body) → `HTTP/1.1 429`, `rate_limited`, `Retry-After`, socket closed; no Drive request | AC2 |
| `server/photoQuota.db.test.ts` › a refused upload is refunded: dailyMax 1, at the stored cap → 409; delete a photo; next PUT → 200 (not 429) | A3 refund |
| `server/photoQuota.db.test.ts` › A at the stored cap and over the daily count; B's PUT on its own item → 200 | AC4 |
| `server/photoQuota.db.test.ts` › owner app (`ownerSub: OWNER_A`, storedMax 1, dailyMax 1): A uploads to 3 items → all 200; B → first 200, second item 409 | AC3 |
| `src/data/apiErrors.test.ts` › the two codes map to non-generic Vietnamese strings | AC5 |
| `src/data/repo.http.test.ts` › photo step 409 `photo_quota_exceeded` / 429 `rate_limited` → `PhotoSaveError` containing the copy | AC5 |

## Approach
1. **`server/photoQuota.js` (pure, `// @ts-check`).**
   - `PHOTO_LIMITS = { storedMax: 500, dailyMax: 50, windowMs: 24 * 60 * 60 * 1000 }`.
   - `storedAllows({ total, onItem, cap })`: `cap === null || total - onItem < cap`. The photos already on the target
     item are replaced, so a replace is net zero. This holds at the cap, above it, and after a cap is lowered
     (consult 5).
   - `createPhotoQuota({ storedMax, dailyMax, windowMs, now = Date.now, exempt = null })`:
     - `storedCap(userId)`: `null` for `exempt`, otherwise `storedMax`.
     - `reserve(userId)`: no `await`, same structure as `createLimiter`. It prunes the user's timestamps and runs a sweep
       every 256 calls or when the map has more than 1024 users. At `dailyMax` it returns
       `{ ok: false, retryAfterSec }` and records nothing. Otherwise it pushes `t` and returns
       `{ ok: true, refund }`, where `refund` is idempotent and removes one entry equal to `t`.
     - The exempt user gets `{ ok: true, refund: noop }` and nothing is recorded. `size()` is for tests.
2. **Wiring.** `createApp({ …, photoLimits = PHOTO_LIMITS })` builds one `photoQuota` per app with
   `exempt: ownerSub` (the owner is decided here, not in SQL, as the consult recommends) and passes it through
   `handleApi` to `handlePhoto`.
3. **`handlePhoto` (PUT only).** The order is: content-type/length checks → `!drive`/`!pool` 503 → **daily reserve**
   → slot acquire. There is no `await` between the reserve and the acquire.
   - Reserve fails: `rejectUnread(req, res, 429, "rate_limited", { "Retry-After": String(retryAfterSec) })`. The body is
     never read (AC2).
   - Slot is busy: `refund()`, then the existing 503.
   - A local `let charged = false` is set through a ctx callback `onDriveStored()`, which `putPhoto` calls right after
     `drive.createFile` resolves. The existing `finally` gets `if (!charged) ticket.refund()` (A3).
4. **`putPhoto` pre-check (no Drive call when over).** Replace the `exists` query with one read-only query that
   still returns 0 rows for a missing item, so the 404 path and the fake-pool tests keep working:
   `select (select count(*)::int from item_photos where user_id = $2) as total, (select count(*)::int from item_photos where user_id = $2 and item_id = $1) as on_item from items where id = $1 and user_id = $2`.
   If `!storedAllows({ ...row, cap: photoQuota.storedCap(userId) })`, return
   `sendError(res, 409, "photo_quota_exceeded")` before `createFile` (AC1). The body has already been read, so there
   is no `rejectUnread`.
5. **Authoritative recount under lock (race-free).** Inside the existing `withLockedItem` callback, before the
   `delete`, and only when `cap !== null`:
   - `select pg_advisory_xact_lock(hashtextextended('photo-quota:' || $1::text, 0))` with `[userId]`. The `::text`
     cast is required: without it Postgres cannot infer the type of `$1` next to an `unknown` literal.
   - Re-run the same quota SQL. If it is over, set the closure flag `over = true` and `return` without the delete or
     insert. The transaction commits empty, and no exception is thrown. A thrown sentinel would make `inTx` call
     `client.release(err)` and destroy the pooled connection (consult risk 1). `withLockedItem`'s `false` keeps meaning
     404 and its signature does not change; this follows the existing `old` closure pattern.
   - After the call: `if (found && over)` → `deleteDriveFiles(drive, [{ id: photoId, drive_file_id: file.id }], log)`,
     then 409 `photo_quota_exceeded`. The race loser pays one create plus one delete.
   - Lock order is items row (`for update`) → per-user advisory xact lock. Holders never request another items lock.
     `deleteItem` and the photo DELETE do not take it (deletes only lower the count). Document this in the `photos.js`
     header ("Lock rule step 2, only in `putPhoto`") and in the README.
   - The advisory statement touches no table. `scoping.test.ts` (literal check) is unaffected. The runtime recorder test
     in `isolation.db.test.ts` needs its `control` regex extended to
     `/^\s*(begin( read only)?|commit|rollback|select pg_advisory_xact_lock\(hashtextextended\('photo-quota:' \|\| \$1::text, 0\)\))\s*$/i`.
     That is an exact-statement allowance, not a loosening.
6. **Copy (R6).** In `API_ERROR_COPY`, Ming may edit both strings:
   - `photo_quota_exceeded: "Bạn đã lưu đủ số ảnh tối đa — xoá bớt ảnh của món khác để thêm ảnh mới"`
   - `rate_limited: "Bạn đã tải lên nhiều ảnh trong 24 giờ qua, thử lại sau nhé"`

   `repo.http.ts` already turns any `{error:{code}}` into an `ApiError` with this copy. `save()` wraps it in
   `PhotoSaveError` ("Đã lưu món đồ nhưng chưa lưu được ảnh — …"). No component changes.
7. **README.** Add the errors and limits text and the lock rule step 2.

Rules:
- R1: server-only plus copy. Local mode and the local repo are untouched.
- R2: no migration and no schema change. The count runs through `withUser`, so RLS applies.
- R3: no new env or secret.
- R4 (D27 form): Drive paths and file naming are unchanged. The race loser's file is deleted through the existing
  `deleteDriveFiles`.
- R5: nothing derived is stored, because the count is computed on each request.
- R6: copy goes only in `apiErrors.ts`.
- R7: per-user folders, an index on `item_photos(user_id)` and quota logging are left out (follow-ups below).
- R8: unit tests plus db tests.
- R9 and R10: not applicable.

Size: about 70 lines in `photoQuota.js`, about 40 in `photos.js`, about 10 for wiring and copy and about 8 for the
README, plus about 250 lines of tests. That is within one cycle.

## Specialist input used
`consult-database-optimizer.md`:
- **Adopted:**
  - Finding 1 and finding 3: the race analysis, and a per-user `pg_advisory_xact_lock(hashtextextended(…))` taken after
    the items row lock, inside `withLockedItem`, before the count. Lock order is documented.
  - Finding 4: two checks. An unlocked pre-check folded into the existing read-only `exists` query covers AC1 (no
    `createFile`). The authoritative recount runs under the lock, and the race loser's Drive file is deleted.
  - Finding 5: one count query with `total` and `on_item`, and the net-zero rule `total - on_item < cap`.
  - Finding 6: no migration.
  - Finding 7: an in-memory window with idle-key pruning, checked before `readBody` and before the slot acquire, using
    `rejectUnread` with `Retry-After`.
  - Recommendations:
    - Caps are a `createApp` option, and tests use small caps.
    - The owner exemption is decided in `app.js`.
    - The suggested tests are used: parallel PUTs at cap-1, replace at cap, two users, owner exempt.
  - Risk 1: a result flag instead of a thrown sentinel.
- **Adapted:**
  - Finding 4's `{ over: true }` return through `withLockedItem` becomes a closure flag. This gives the same effect
    (empty commit, no thrown error) without changing `withLockedItem`'s return type, and it matches the existing `old`
    closure.
  - The pre-check uses two scalar subqueries over `items` instead of `count(*) filter`, so it still returns 0 rows for
    a missing item (404).
- **Deferred:** finding 2, the index on `item_photos(user_id)`, becomes a follow-up (seq scan accepted, consult risk 3).
- **Open questions resolved:** A2 (409), A3 (counting), A6 (PG version).

## Assumptions
- **A1. Numbers and owner (Ming confirms at plan approval).** 500 stored photos per user (about 1 GiB worst case at
  2 MiB, about 200 MB typical); 50 uploads per user per rolling 24 h; the owner (`TUDO_OWNER_SUB`) exempt from both. If
  Ming changes them, only `PHOTO_LIMITS` (and the README sentence) change. If Ming wants the owner subject to the daily
  count, `createPhotoQuota` takes a separate `dailyExempt` (one line); not planned by default.
- **A2. Status 409, not 403, for `photo_quota_exceeded`.** The client does not branch on 403 for items and photos:
  `repo.http.ts` builds `ApiError(status, code)` and the copy comes from the code. So both would display correctly.
  409 is still chosen for these reasons:
  - In this API, 403 already means `forbidden_origin`. In front of the app, Cloudflare Access and auth layers use 403
    for "not allowed", so a 403 in logs or monitoring would read as an auth failure.
  - The AI routes already use 409 for state-based refusals the user can fix (`not_configured`, `key_unreadable`,
    `src/shared/ai/errors.ts`).
  - The refusal depends on the user's current state (photos stored), which they can change by deleting photos.

  The client's existing 409 copy (`conflict`) is keyed by code, not status, so it is not shown for this code.
- **A3. Daily count: reserved on admission, kept only when Drive stored a file.**
  - The reservation is made before the body is read, atomically with the check. This lets two parallel uploads by one
    user (2 slots) not overshoot.
  - It is refunded when the request ends without a successful `drive.createFile`: 400 `invalid_photo`, 404, 408
    `request_timeout`, 413, the pre-check 409, a client disconnect, 502 `photo_upload_failed`, 503
    `photos_unavailable`.
  - It stays counted when Drive stored a file, including the race-loser 409 (file created, then deleted) and a DB
    failure after the create (file deleted). Each of these cost a real Drive write.

  Reasons:
  - The limit protects Drive writes, and exactly those are counted. Free failures cannot bypass it because they never
    reach Drive.
  - Slow senders (408) and Drive or server faults (502/503) do not use up an honest user's day.
  - Requests that never reach Drive are already bounded by the in-flight slots (2 per user, 3 shared) and the 15 s / 5 s
    body deadlines (D38).
  - A Drive create that times out after Google stored the file (502, orphan) is refunded. That is accepted: the user
    cannot trigger it on purpose, and the photo sweep removes the orphan.
- **A4. Pre-check after the body.** The ticket requires the stored cap to be checked before the Drive write, not before
  the body. The pre-check reuses the existing post-body `exists` query, so it adds no DB round trip. Checking before
  the body would need an extra transaction while holding a slot.
- **A5. In-memory daily window per process.** A restart resets it (ticket: accepted). One app instance in production,
  so there is no cross-instance gap today.
- **A6. Postgres version.** `hashtextextended` needs PG ≥ 11. M-24 already requires production PG ≥ 15 before the
  first release with T-019.2, and CI runs `postgres:17`, so no new Ming item is needed. The key is a single bigint
  derived from `'photo-quota:' || user_id`. A collision with the migrator's fixed session lock key (`7410512012`) has
  probability about 2⁻⁶⁴, and the only effect would be a brief wait.
- **A7. Existing test suites keep the default limits.** `api.db.test.ts` (about 35 photo PUTs, non-owner,
  `fixedAuth(OWNER_A)`) stays under 50 counted uploads per app instance. If the implementer finds a suite crossing 50
  counted uploads, that suite passes a larger `photoLimits` to `createApp` and records it in impl-log. Do not change
  the defaults.
- **A8. Advisory wait and `statement_timeout`.** Waiting for the lock counts against the 5 s `statement_timeout`. The
  critical section is milliseconds long, and there are at most 2 waiters per user because of the slots. A timeout
  would surface as the existing mapped DB error path, and the new Drive file is deleted by the existing catch.
- **A9. Hotspots.**
  - `server/photos.js`, `server/app.js`, `server/api.js` and `server/README.md`: T-019.13 is merged, and no ticket in
    `IN_PROGRESS`, `REVIEW` or `DONE` (other than the T-019 umbrella) touches them.
  - T-019.9 (BACKLOG, depends on this ticket) will edit `server/README.md` later.
  - `src/App.tsx` is not touched.
- **A10. Follow-ups (not in this diff, R7).**
  - An index on `item_photos(user_id)` when the table reaches tens of thousands of rows (consult 2). Check whether
    `server/migrator.js` wraps files in a transaction before using `CONCURRENTLY`.
  - A structured log event for quota refusals if Ming wants to tune the numbers from logs. The per-request log line
    already carries the 409/429 status.

## Blocking questions
None. The numbers and the owner exemption are proposed defaults that Ming confirms at plan approval (A1). This ticket
has `Gate: plan-approval`.

## Split proposal
None.
