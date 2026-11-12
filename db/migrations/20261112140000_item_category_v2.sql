-- =============================================================
-- TuDo — item category list v2 (D29, T-017). Expand-only: old enum values stay in the type.
-- New ids: set (Set đồ), ao_dai (Áo dài), bikini (Bikini). Retired: bag -> accessory, sport/home -> other.
-- The new values are NOT used in this file (ALTER TYPE ADD VALUE in a transaction, 55P04).
--
-- Manual rollback (never run automatically):
--   The UPDATEs below are not reversible; restore the backup taken before migrate.
--   The added enum values can stay (Postgres cannot drop enum values).
-- =============================================================

alter type item_category add value if not exists 'set';
alter type item_category add value if not exists 'ao_dai';
alter type item_category add value if not exists 'bikini';

update items set category = 'accessory' where category = 'bag';
update items set category = 'other' where category in ('sport', 'home');
