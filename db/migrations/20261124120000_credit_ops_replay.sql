-- F-706.4 (D52, D53, D54): replay storage for paid calls, and the welcome grant for existing accounts.
--   credit_ops.request_hash  sha256 (hex) of the request a committed op served, so the same idempotency key with
--                            another request is refused instead of replaying the wrong result.
--   credit_ops.result        the JSON response body of a committed op; a replay returns it without a provider call.
--   credit_ops.error_code    the error code of a refunded op; a replay of a refunded key answers the same code.
-- Expand-only: nullable columns, the existing owner_only policy covers them; an older image never reads them.
-- Existing accounts (D53, Ming 2026-11-24 "existing accounts must read welcome=approved"): the welcome backfill of
-- 20261122120000_credit_ledger runs again for the same user set (accounts created since then), and a still-pending
-- welcome row of those accounts is approved. An account with no data when this runs gets a pending welcome row the
-- first time the ledger sees it. credit_grants is forced, so FORCE is lifted for the write and restored below.
-- ai_settings is read only and never written: stored BYOK ciphertext stays unchanged (removal is F-706.8).
--
-- Manual rollback (never run automatically):
--   alter table credit_ops drop column request_hash, drop column result, drop column error_code;
--   (the approved welcome grants stay)

alter table credit_ops add column request_hash text check (request_hash ~ '^[0-9a-f]{64}$');
alter table credit_ops add column result jsonb;
alter table credit_ops add column error_code text check (length(error_code) between 1 and 64);

alter table locations no force row level security;
alter table items no force row level security;
alter table item_photos no force row level security;
alter table wear_logs no force row level security;
alter table ai_settings no force row level security;
alter table credit_grants no force row level security;

insert into credit_grants (user_id, bucket, amount, approved_at)
select u, 'welcome', (select welcome_amount from credit_settings), now()
  from (select user_id from locations
        union select user_id from items
        union select user_id from item_photos
        union select user_id from wear_logs
        union select user_id from ai_settings
        union select nullif(current_setting('tudo.owner_sub', true), '')::uuid) s(u)
 where u is not null
on conflict (user_id) where bucket = 'welcome' do nothing;

update credit_grants set approved_at = now()
 where bucket = 'welcome' and approved_at is null
   and user_id in (select user_id from locations
                   union select user_id from items
                   union select user_id from item_photos
                   union select user_id from wear_logs
                   union select user_id from ai_settings
                   union select nullif(current_setting('tudo.owner_sub', true), '')::uuid);

alter table locations force row level security;
alter table items force row level security;
alter table item_photos force row level security;
alter table wear_logs force row level security;
alter table ai_settings force row level security;
alter table credit_grants force row level security;
