-- F-706.5 (D53): admin write path for the credit ledger, and narrower user-side credit policies (F-706.1 note 10).
-- Admin (owner-only at the API; the database side is the maintenance value 'credit-admin', withCreditAdmin):
--   - approve a pending welcome grant (the only change to an existing grant row),
--   - add a manual grant (needs grant_key, the idempotency key; unique per user),
--   - update the one credit_settings row.
-- No admin delete, no admin access to credit_ops.
-- User side: owner_only (for all) on credit_grants and credit_ops is replaced by per-command policies, so a user
-- cannot approve their own welcome grant, write a manual grant, or edit or delete their grants or ops.
-- credit_grants_guard makes grant rows immutable for every role except the one pending -> approved transition.
-- A hand correction by the DB owner needs: alter table credit_grants disable trigger credit_grants_guard; (same
-- transaction), then enable it again.
-- Expand-only for the previous image: server/ai/credits.js is not wired to any route yet (F-706.4).
--
-- Manual rollback (never run automatically):
--   drop policy credit_admin_read on credit_grants; drop policy credit_admin_approve on credit_grants;
--   drop policy credit_admin_manual on credit_grants; drop policy credit_admin_settings on credit_settings;
--   drop policy credit_grants_user_read on credit_grants; drop policy credit_grants_user_insert on credit_grants;
--   drop policy credit_ops_user_read on credit_ops; drop policy credit_ops_user_insert on credit_ops;
--   drop policy credit_ops_user_update on credit_ops;
--   create policy owner_only on credit_grants for all using (user_id = (select app_user_id()))
--     with check (user_id = (select app_user_id()));
--   create policy owner_only on credit_ops for all using (user_id = (select app_user_id()))
--     with check (user_id = (select app_user_id()));
--   drop trigger credit_grants_guard on credit_grants; drop function credit_grants_guard();
--   drop index credit_grants_manual_key; alter table credit_grants drop column grant_key;

alter table credit_grants add column grant_key text
  check (grant_key ~ '^[A-Za-z0-9_-]{1,128}$');
alter table credit_grants add constraint credit_grants_key_manual
  check (grant_key is null or bucket = 'manual');
create unique index credit_grants_manual_key on credit_grants (user_id, grant_key)
  where grant_key is not null;

create function credit_grants_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.bucket is distinct from old.bucket
     or new.period is distinct from old.period
     or new.amount is distinct from old.amount
     or new.created_at is distinct from old.created_at
     or new.grant_key is distinct from old.grant_key
     or (old.approved_at is not null and new.approved_at is distinct from old.approved_at) then
    raise exception 'credit_grants rows are immutable' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger credit_grants_guard before update on credit_grants
  for each row execute function credit_grants_guard();

drop policy owner_only on credit_grants;
drop policy owner_only on credit_ops;

create policy credit_grants_user_read on credit_grants for select
  using (user_id = (select app_user_id()));
create policy credit_grants_user_insert on credit_grants for insert
  with check (
    user_id = (select app_user_id()) and grant_key is null
    and ((bucket = 'monthly' and approved_at is not null) or (bucket = 'welcome' and approved_at is null))
  );

create policy credit_ops_user_read on credit_ops for select
  using (user_id = (select app_user_id()));
create policy credit_ops_user_insert on credit_ops for insert
  with check (user_id = (select app_user_id()));
create policy credit_ops_user_update on credit_ops for update
  using (user_id = (select app_user_id()))
  with check (user_id = (select app_user_id()));

create policy credit_admin_read on credit_grants for select
  using (current_setting('tudo.maintenance', true) = 'credit-admin');
create policy credit_admin_approve on credit_grants for update
  using (current_setting('tudo.maintenance', true) = 'credit-admin'
         and bucket = 'welcome' and approved_at is null)
  with check (current_setting('tudo.maintenance', true) = 'credit-admin'
              and bucket = 'welcome' and approved_at is not null);
create policy credit_admin_manual on credit_grants for insert
  with check (current_setting('tudo.maintenance', true) = 'credit-admin'
              and bucket = 'manual' and approved_at is not null and period is null and grant_key is not null);
create policy credit_admin_settings on credit_settings for update
  using (current_setting('tudo.maintenance', true) = 'credit-admin')
  with check (current_setting('tudo.maintenance', true) = 'credit-admin');
