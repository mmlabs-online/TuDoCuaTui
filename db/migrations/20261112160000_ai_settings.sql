-- =============================================================
-- TuDo — AI provider settings (T-018, D30). One row: provider, model and the sealed API key.
-- No RLS, no user_id (D25): single user, access is restricted in front of the app.
-- key_ciphertext is "v1:" + base64 of AES-256-GCM output, sealed by the server; the plaintext key is never stored.
-- key_hint is the last 4 characters of the key. When a second user arrives the key becomes user_id plus RLS.
--
-- Manual rollback (never run automatically):
--   drop table ai_settings;   -- destroys the saved key; set_updated_at() is shared and stays
-- =============================================================

create table ai_settings (
  id             boolean primary key default true check (id),
  provider       text not null check (provider in ('claude','gemini')),
  model          text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  key_ciphertext text check (key_ciphertext is null or key_ciphertext ~ '^v[0-9]+:[A-Za-z0-9+/=]+$'),
  key_hint       text check (key_hint is null or key_hint ~ '^[!-~]{4}$'),
  key_updated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ai_settings_key_pair_chk check ((key_ciphertext is null) = (key_hint is null))
);

create trigger ai_settings_updated_at
  before update on ai_settings
  for each row execute function set_updated_at();
