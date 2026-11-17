# Consult — database-optimizer — F-602 (2026-11-17)

## Findings

Basis: db/migrations (init, item_photos_drive, user_ownership_contract, row_level_security), server/db.js, server/items.js, server/validate.js. Read-only; nothing was run.

1. **Constraints as they stand after the contract migration.**
   - `locations`: PK(id), `unique(user_id,name)`, `unique(user_id,id)`, `check(parent_id<>id)`, name 1..80. `sort_order` and `parent_id` exist. `parent_id` is a composite FK `(user_id,parent_id)`.
   - `items`: PK(id), `unique(user_id,id)`, composite FK `(user_id,location_id)` with `on delete set null (location_id)`.
   - `wear_logs`: PK(id), `unique(item_id,worn_on)`, composite FK `(user_id,item_id)` cascade.
   - `item_photos`: cascade FK from items, partial unique index on one primary per item.
   - `items.id`, `locations.id` and `wear_logs.id` are global PKs. Indexes ignore RLS, so a foreign-owned id conflicts even though the row is invisible.
   - The composite FKs mean a child row can only reference a parent owned by the same user. A cross-user reference is impossible even if the restore code has a bug.

2. **How ownership detection behaves under RLS.**
   - `INSERT ... ON CONFLICT DO NOTHING` (no conflict target) does not raise an RLS error on an invisible conflicting row. It returns 0 rows.
   - `ON CONFLICT (id) DO UPDATE` on a foreign row raises 42501. `saveItem` handles that by catching the error and rolling back, which is fine for a single statement but fatal inside a restore transaction. A caught error aborts the whole transaction unless savepoints are used.
   - So the restore should never use DO UPDATE on a foreign id. Use a plain two-step instead.

3. **Idempotency gap for the cross-account case (important).** If a foreign-owned id simply gets a random new id, a second restore of the same file into the same account sees the old id as foreign again and creates a second set of duplicate items. That violates "restoring twice changes nothing" for the different-account case. Random remapping is not idempotent without a stored mapping.

4. **Photos.**
   - There is no `primary_photo_id` column on `items`. It is derived in the view `items_with_stats` from `item_photos`, ordered by `is_primary desc, created_at, id`.
   - Restore therefore only has to never write `item_photos`.
   - Two things would silently destroy photos: `delete` + `insert` (replace semantics), because the cascade deletes photos and wear logs; and `insert ... on conflict (id) do update` setting columns other than the explicit item columns. Neither is needed.

5. **`items_with_stats` parity.**
   - The view derives `wear_count` and `last_worn` from `wear_logs`. They match after restore if and only if the (item, worn_on) set is restored exactly.
   - `unique(item_id,worn_on)` guarantees one log per item per day, so the file must not contain duplicates.
   - The `items_updated_at` trigger is BEFORE UPDATE only. An insert with an explicit `updated_at` keeps it, so after export, wipe and restore, `created_at` and `updated_at` can be identical too. Only `exportedAt` differs.
   - But a no-op UPDATE on an existing row still bumps `updated_at` through the trigger. A second restore would change `updated_at`, which breaks "changes nothing".
   - `toItemRow` truncates timestamps to ms. Round-trip is stable at ms, because the first restore stores ms and every later export returns ms.

6. **Existing validation to reuse.** `parseItemInput` in `server/validate.js` already covers category/status enums, season subset, price safe integer and < 1e14, calendar date, array sizes (≤50), string limits and NUL checks. `isUuid` and `isCalendarDate` are exported. `saveItem` NFC-normalizes location names. `readJson` defaults to 256 KiB, which is too small for a real backup. A bigger per-route `limit` is needed.

7. **statement_timeout is 5000 ms per statement.** The pool max is 5. Row-by-row loops are too slow and one huge statement can time out, so use batched set-based statements.

## Recommendations

All of these keep to the ticket: no migration, no new table.

**A. Transaction.** One `withUser(pool, userId, fn)` call (non-readOnly). Take `select pg_advisory_xact_lock(hashtextextended('restore:'||$1,0))` first, so two concurrent restores by the same user serialize. This removes the 23505 race windows. The per-user rate limit (as in `server/ai/rateLimit.js`, `createLimiter`) is still needed.

**B. Locations.** Resolve each file location in this order:
1. If the id is owned by the caller (`select id from locations where id = any($1)`, RLS-filtered and so safe): target = that id.
2. Otherwise, if the caller has a location with the same name: target = that row (merge by name, consistent with `saveItem`'s get-or-create). Do not change that row.
3. Otherwise `insert (id,user_id,name,sort_order,created_at) ... on conflict do nothing returning id`. If it returns no row, the id is foreign. Retry with a derived id (see D) and `on conflict (user_id,name) do nothing`.
- For owned rows (case 1), update name, `sort_order` and `parent_id` only `where ... is distinct from`, and only if no other caller-owned row already holds that name.
- Build the file-id → target-id map from the results.
- Do `parent_id` in a second pass through the map, after all locations exist.
- Validate that file location names are unique after trim and NFC, that `parentId` exists in the file, that there are no cycles, and that `parentId` is not the same id.

**C. Items.** After the location map exists:
1. Insert all rows with `insert ... select from unnest/jsonb_to_recordset ... on conflict (id) do nothing returning id`, passing `created_at` and `updated_at` from the file. `location_id` comes through the map.
2. For ids not returned, run `update items set <explicit columns, never photo or timestamps> where id = any and user_id = $caller and (cols) is distinct from (...) returning id`. RLS plus the `user_id` clause means this touches only own rows. The `is distinct from` guard stops the trigger bumping `updated_at` on identical data (finding 5).
3. Ids that are neither inserted nor visible as owned are foreign. Re-insert them under a derived id (see D) and put them in the remap.
- Never delete.

**D. Deterministic remap (fixes finding 3).** Derive the replacement id from `(callerUserId, originalId, attempt)`, a UUIDv5-style SHA-1 or SHA-256 in Node. Do not use `gen_random_uuid()`. A second restore then finds the derived id owned by the caller and takes the update path, so it is a no-op. If attempt 0 is also taken by another user (squatting is possible because `PUT /api/items/:id` accepts client ids), bump `attempt` up to a small cap (e.g. 5), then fail the restore with a generic error. Apply the same approach to items and, if needed, to wear-log ids.

**E. Wear logs.**
- Resolve `item_id` through the item map. A log whose item is not in the file is rejected at validation (preferred), or dropped and counted.
- Insert with `on conflict do nothing returning item_id, worn_on` (no target, so it covers both the (item_id,worn_on) unique key and a PK collision).
- For rows not returned, query `select item_id, worn_on from wear_logs where item_id = any(...)` (RLS-safe). If the (item_id, worn_on) pair exists, it is already restored. If it does not exist, the id was foreign-owned, so re-insert with a derived or fresh id.
- A wear log id has no references, so remapping it is harmless.
- Reject duplicate (itemId, wornOn) in the file at validation.
- Do not apply the 1-day "today" window from `parseWearInput`. A restore has to accept historical dates. Do check `isCalendarDate`.

**F. Photos.** `restore` must not reference `item_photos` at all. Compute the summary `itemsWithoutPhoto` as a count of restored target ids where `primary_photo_id is null` in `items_with_stats`. For an existing item that keeps its photo, restore leaves it untouched, so it is not counted. Ignore any photo field in the file beyond shape-checking it.

**G. Export.**
- `exportAll` should read in one `readOnly` `withUser` transaction (a consistent snapshot) from `items_with_stats` (items, including `primary_photo_id` for information only), `locations`, and `wear_logs`.
- Use deterministic order: items by `created_at,id`; locations by `sort_order,name,id`; wear logs by `item_id,worn_on`.
- Do not export `wear_count`, `last_worn` or `location_name`, because they are derived (R5) and recomputed.
- Include in locations: `id,name,parentId,sortOrder,createdAt`.

**H. Validation and limits.** Server-side checks, reusing `parseItemInput`-style checks (the file shape uses camelCase, so map before calling it):
- `version === 1` and `exportedAt` is a string.
- Hard caps on array lengths, e.g. items ≤ ~5000, wear logs ≤ ~100000, locations ≤ ~500. Pick them with the body limit (about 10 MiB).
- Unique ids within each array, and UUID-valid ids.
- Every `locationId` references a file location, or is null.
- Reject unknown top-level keys.
- Run the chunked statements in batches of ~500 rows to stay under `statement_timeout`.
- Error messages must be constant and must not echo file data. The Vietnamese messages come from the client or a mapper.

**I. Summary response.** Return only counts (`inserted`, `updated`, `unchanged`, `remappedItems`, `remappedLocations`, `wearLogsAdded`, `itemsWithoutPhoto`) and no ids. Counts of "remapped" reveal at most that an id collided, which is not sensitive.

**J. Migration.** None needed. The existing PK, unique constraints and composite FKs are enough. Only if a migration seems necessary (it should not) does the ticket become High tier and need plan-approval.

**K. Tests (`*.db.test.ts`).**
- Round trip.
- Second restore: row counts and `updated_at` unchanged.
- Cross-user: seed user B with the same ids; restore as A. A's rows get derived ids, B's rows are byte-identical, and a second restore creates no duplicates.
- Foreign wear log id collision.
- Invalid file leaves 0 rows written.
- An existing item with a photo keeps its `primary_photo_id`.
- A concurrent double restore.
- Squatted derived id (attempt bump).

## Risks

- Random remap duplicates items on repeat restore into another account (finding 3). The fix is D.
- 42501 from DO UPDATE aborts the transaction (finding 2). Use the two-step update instead, or savepoints.
- `updated_at` bump on a no-op update breaks idempotency and export parity unless guarded with `is distinct from`.
- Restore with replace semantics (delete and insert) destroys photos and Drive files' DB rows (the cascade). The deleted Drive files would not be recoverable.
- A name collision on `(user_id,name)` for locations aborts with 23505 if not resolved by merge-by-name first. Same-name locations in the file and renamed-swap cases are the edge cases.
- Large files hit `statement_timeout` (5 s) or the pool (max 5) if run as one statement or looped row by row.
- The Postgres version floor is 15, set by the contract migration, so the composite-FK behaviour is present.
- Items with a stale `location_id` after merge-by-name point to the merged location. This is intended, but the summary should say so.

## Open questions

1. Should file locations merge by name into the caller's existing locations (recommended, matches `saveItem`'s get-or-create), or fail on a name conflict?
2. Are `parent_id` and `sort_order` really used by the app? `listLocations` only returns names. If unused, exporting `parentId` and `sortOrder` is still harmless but could be dropped to shrink validation.
3. Wear-log ids: keep them in the export (matching the ticket's "DB ids") or export only `{itemId, wornOn, createdAt}` and key on (item_id, worn_on)? The second option is simpler and removes the PK-collision step, at the cost of not preserving ids.
4. Size caps: what are the real maxima? The proposals above (5000 items, 100000 wear logs, ~10 MiB) are guesses. The default `readJson` limit is 256 KiB.
5. Should restore update an existing owned item's data from the file (as the ticket says, overwrite items with the same id), including the case where the file is older than the DB? The ticket says yes, so the copy must warn about overwriting.

Files consulted: work/tickets/F-602/ticket.md, db/migrations/20261110120000_init.sql, db/migrations/20261112120000_item_photos_drive.sql, db/migrations/20261114120000_user_ownership_contract.sql, db/migrations/20261114200000_row_level_security.sql, server/db.js, server/items.js, server/validate.js, server/http.js.
