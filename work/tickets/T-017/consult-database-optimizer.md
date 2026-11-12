# Consult — database-optimizer (T-017)

## Findings
1. **Migration transaction.** `server/migrator.js:158-178` runs each file as one `begin … commit` with a single `client.query(file.sql)`. `ALTER TYPE … ADD VALUE` is allowed in a transaction on PG 12+, but the new value cannot be used until commit (55P04 "unsafe use of new value"). The data move only targets existing values (`bag`→`accessory`, `sport`/`home`→`other`), so one file works: `ADD VALUE` ×3 then `UPDATE`. Do not use the new values in that file (no default, CHECK, index predicate or seed rows). Enum additions roll back with the transaction. Existing `statement_timeout`/`lock_timeout` are fine; the UPDATE takes ROW EXCLUSIVE on a small `items`.
2. **Enum order and drift test.** `ADD VALUE` appends; leave it (display order is client-side). `server/api.db.test.ts:261` asserts `CATEGORIES` equals `pg_enum` labels in order — it breaks deliberately. `server/validate.js:5-16` `CATEGORIES` must be the 10 new ids (enum will have 13 labels). New test: every `CATEGORIES` value is in `pg_enum`, and `pg_enum − CATEGORIES = {bag, sport, home}` (optionally a `DEPRECATED_CATEGORIES` constant, shared or test-only). Update the "Copied from … init.sql" comment.
3. **View dependencies.** `items_with_stats` selects `i.category`; `ADD VALUE` and the UPDATE don't affect it. `server/items.js` needs no change. Do not use `ALTER COLUMN TYPE` / rename-and-recreate type (view rebuild, breaks rollback, contradicts expand-only in `db/migrations/README.md`).
4. **Default** stays `'other'` (kept value).
5. **Supabase path.** `src/data/mappers.ts:11-23` maps label → `Enums["tudo_item_category"]` (generated, `src/types/database.ts:318-327, 449-458`). `CATEGORY_FROM_DB = invert(CATEGORY_TO_DB)` becomes ambiguous with aliases: split into a canonical map (10↔10), a separate alias table (old label/old id → new id) and an explicit `CATEGORY_FROM_DB`. Supabase has no `set`/`ao_dai`/`bikini`; no Supabase migration (out of scope), so the Supabase write path would fail on them. Recommend leaving the Supabase path as-is beyond typechecking and noting the limitation (alternative: fall back to `other`). Do NOT regenerate `src/types/database.ts`. `mappers.ts:66` label fallback "Khác" → "Loại khác"; `:96` falls back to `"other"`.

## Recommendations
- **Migration** `db/migrations/20261112140000_item_category_v2.sql` (with a manual-rollback comment block like the others):
  ```sql
  alter type item_category add value if not exists 'set';
  alter type item_category add value if not exists 'ao_dai';
  alter type item_category add value if not exists 'bikini';
  update items set category = 'accessory' where category = 'bag';
  update items set category = 'other' where category in ('sport','home');
  ```
  Idempotent; keep old enum values (expand-only). Ids `set`, `ao_dai`, `bikini` (label is Bikini) — confirm with Ming. `bag`→Phụ kiện sound; `sport`/`home`→Loại khác acceptable (cosmetic loss). Optionally record moved row counts in PR notes.
- **Validation:** `CATEGORIES` = 10 new ids; `invalidValue` then fires for `bag`/`sport`/`home`. Update `server/validate.test.ts` accordingly.
- **Server write path:** no change in `server/items.js`; the migration runs before the app starts.
- **Local mode and CSV:** alias old ids and labels on read (localStorage items with old labels/ids); CSV import accepts old labels (`Túi`→Phụ kiện, `Váy/Đầm`→Đầm, `Khác`→Loại khác, …); template lists only new labels.
- **Tests on real Postgres** (pattern `server/schema.db.test.ts:228-250`): apply init + photo migrations in a temp dir, insert `bag`/`sport`/`home`/`top`/`other` items, run the full dir; assert moves, other rows unchanged, row count unchanged; insert each of the 10 new ids after migration (guards 55P04); second `runMigrations` is a no-op; `items_with_stats` still returns rows; fix the enum test; `'nope'` still 22P02 (`schema.db.test.ts:177`). API test: PUT each of the 10 ids → 200 round-trip; PUT `bag` → 400 `invalidValue`.

## Risks
- Removed ids can never be dropped in place (full type rebuild needed to reuse).
- Using a new value in the same migration fails at deploy, not review — the real-Postgres test guards it.
- Skirts stay tagged Đầm until Ming re-tags.
- Rolling back to the previous image: reads work; items saved as `set`/`ao_dai`/`bikini` show as "Khác" in the old image.
- Supabase path breaks silently for the 3 new ids until T-016 lands or it is fenced.

## Open questions
- Confirm `bag`→Phụ kiện, `sport`/`home`→Loại khác.
- Confirm ids `set`, `ao_dai`, `bikini`.
- Supabase repo: write `other` for new ids, or leave as-is (recommended)?
- Is a pre-migration backup needed? The UPDATEs are not reversible. (Orchestrator note: the deploy workflow takes a backup before migrate.)

Files read: work/tickets/T-017/ticket.md, server/migrator.js, server/validate.js, server/api.db.test.ts, server/schema.db.test.ts, db/migrations/20261110120000_init.sql, db/migrations/20261112120000_item_photos_drive.sql, db/migrations/README.md, src/data/mappers.ts, src/types/database.ts (server/items.js only via grep).
