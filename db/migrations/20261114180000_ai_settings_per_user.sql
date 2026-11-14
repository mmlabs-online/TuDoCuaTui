-- =============================================================
-- TuDo — ai_settings per user (T-019.3; D33). NOT image-rollback-safe: an older app image reads and
-- writes ai_settings with "where id", which fails (42703) once the id column is gone.
--
-- Owner contract (same as the contract migration): when an ai_settings row exists, tudo.owner_sub
-- (from TUDO_OWNER_SUB, set by server/migrate.js) must be set and any non-null user_id must equal it;
-- a null user_id is backfilled. Empty table: no owner needed. Messages are constant.
-- The stored key is CLEARED: every stored value is v1 (AAD without the user), which D33 retires.
-- The owner enters the key again in Settings. Provider and model are kept.
-- RLS comes in its own migration (T-019.4, D32).
--
-- Manual rollback (never run automatically; the cleared key cannot be restored):
--   alter table ai_settings drop constraint ai_settings_pkey;
--   alter table ai_settings add column id boolean not null default true check (id);  -- only with <= 1 row
--   alter table ai_settings add constraint ai_settings_pkey primary key (id);
--   alter table ai_settings alter column user_id drop not null;
-- =============================================================

lock table ai_settings in access exclusive mode;

do $$
declare
  raw text := nullif(btrim(current_setting('tudo.owner_sub', true)), '');
  owners int;
  only_owner uuid;
begin
  if exists (select 1 from ai_settings) then
    if raw is null then
      raise exception 'rows exist but TUDO_OWNER_SUB is not set';
    end if;
    -- Check the format before any uuid cast so the value cannot appear in a cast error.
    if raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or raw = '00000000-0000-0000-0000-000000000000' then
      raise exception 'TUDO_OWNER_SUB is not a valid uuid';
    end if;

    select count(distinct user_id), min(user_id::text)::uuid into owners, only_owner
      from ai_settings where user_id is not null;
    if owners > 1 then
      raise exception 'rows belong to more than one owner';
    end if;
    if owners = 1 and only_owner <> raw::uuid then
      raise exception 'existing owner differs from TUDO_OWNER_SUB';
    end if;

    update ai_settings set user_id = raw::uuid where user_id is null;
  end if;
end $$;

update ai_settings set key_ciphertext = null, key_hint = null, key_updated_at = null
  where key_ciphertext is not null;

alter table ai_settings drop constraint ai_settings_pkey;
alter table ai_settings drop column id;
alter table ai_settings alter column user_id set not null;
alter table ai_settings add constraint ai_settings_pkey primary key (user_id);
