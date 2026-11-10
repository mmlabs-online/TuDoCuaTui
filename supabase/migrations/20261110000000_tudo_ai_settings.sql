-- T-009 (D21, D22): per-user AI provider settings and an encrypted API key.
-- SERVICE-ROLE ONLY. The generated src/types/database.ts row types do NOT mean the browser can read these
-- tables: anon and authenticated have zero privileges, RLS is on with no policies (deny-all), and only the
-- Edge Function `tudo-ai-settings` (service_role) reads or writes them.
-- key_ciphertext is AES-256-GCM output ("v1:" + base64) sealed by the function with the secret TUDO_AI_KEK;
-- the database never sees the plaintext key. Requires public.tudo_set_updated_at() from the init migration.
--
-- Rollback (manual, destroys all saved keys):
--   drop table public.tudo_ai_calls;
--   drop table public.tudo_ai_settings;

create table public.tudo_ai_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  provider       text not null check (provider in ('claude','gemini')),
  model          text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  key_ciphertext text check (key_ciphertext is null or key_ciphertext ~ '^v[0-9]+:[A-Za-z0-9+/=]+$'),
  key_hint       text check (key_hint is null or key_hint ~ '^[!-~]{4}$'),
  key_updated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tudo_ai_settings_key_pair check ((key_ciphertext is null) = (key_hint is null))
);

create trigger tudo_ai_settings_updated_at before update on public.tudo_ai_settings
  for each row execute function public.tudo_set_updated_at();

-- Event log for per-user rate limiting (test / save now, tag later).
create table public.tudo_ai_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind ~ '^[a-z_]{1,32}$'),
  created_at timestamptz not null default now()
);

create index tudo_ai_calls_user_kind_time_idx on public.tudo_ai_calls (user_id, kind, created_at desc);

alter table public.tudo_ai_settings enable row level security;  -- no policies: deny-all
alter table public.tudo_ai_calls    enable row level security;  -- no policies: deny-all

revoke all on public.tudo_ai_settings, public.tudo_ai_calls from public, anon, authenticated;
grant select, insert, update, delete on public.tudo_ai_settings, public.tudo_ai_calls to service_role;
