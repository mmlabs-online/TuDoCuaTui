-- F-706.3 (D52): owner-only storage, replacement and test of one shared AI key per provider.
-- One row per provider: claude, gemini, openai.
-- Sealed with AES-256-GCM (server/ai/crypto.js, sealAppKey, AAD tudocuatui-app-key|v1|<provider>).
-- Expand-only: older images never read this table, so rollback to an older image is safe.
-- Inactive until F-706.4: no AI route reads from this table yet.
-- Not part of backup and restore.
-- No user data.
-- Policies: narrow access path keyed on current_setting('tudo.maintenance', true) = 'app-keys' (withAppKeys).
--
-- Manual rollback (never run automatically):
--   drop table ai_app_keys;
--   (policies go with the table)

create table ai_app_keys (
  provider text primary key check (provider in ('claude', 'gemini', 'openai')),
  key_ciphertext text not null,
  key_hint text not null check (length(key_hint) between 1 and 32),
  updated_at timestamptz not null default now()
);

alter table ai_app_keys enable row level security;
alter table ai_app_keys force row level security;

create policy ai_app_keys_select on ai_app_keys for select
  using (current_setting('tudo.maintenance', true) = 'app-keys');

create policy ai_app_keys_insert on ai_app_keys for insert
  with check (current_setting('tudo.maintenance', true) = 'app-keys');

create policy ai_app_keys_update on ai_app_keys for update
  using (current_setting('tudo.maintenance', true) = 'app-keys')
  with check (current_setting('tudo.maintenance', true) = 'app-keys');

create policy ai_app_keys_delete on ai_app_keys for delete
  using (current_setting('tudo.maintenance', true) = 'app-keys');
