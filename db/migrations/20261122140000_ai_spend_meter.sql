-- F-706.2 (D53): app-wide monthly AI spend meter and price table.
-- One row per paid call; spent is computed from rows, never stored (R5):
--   sum(estimate_micro_usd) where period = P and state <> 'released'
-- Expand-only: an older image never reads this table, so a rollback to an older image is safe.
-- The module that uses it (server/ai/spend.js) is not wired to any route yet (F-706.4).
-- Not part of backup and restore.
-- No user data.
-- Policies: narrow access path keyed on current_setting('tudo.maintenance', true) = 'ai-spend' (withSpendMeter).
--
-- Manual rollback (never run automatically):
--   drop table ai_spend_ops;
--   (the policies and index go with the table)

create table ai_spend_ops (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{0,31}$'),
  model text not null check (length(model) between 1 and 100),
  kind text not null check (kind in ('photo_fill', 'suggest', 'sticker')),
  price_version text not null check (price_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  estimate_micro_usd bigint not null check (estimate_micro_usd between 1 and 20000000),
  state text not null check (state in ('reserved', 'charged', 'released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint ai_spend_ops_settled check ((state = 'reserved') = (settled_at is null))
);

create index ai_spend_ops_period on ai_spend_ops (period);

alter table ai_spend_ops enable row level security;
alter table ai_spend_ops force row level security;

create policy ai_spend_read on ai_spend_ops for select
  using (current_setting('tudo.maintenance', true) = 'ai-spend');

create policy ai_spend_reserve on ai_spend_ops for insert
  with check (current_setting('tudo.maintenance', true) = 'ai-spend' and state = 'reserved');

create policy ai_spend_settle on ai_spend_ops for update
  using (current_setting('tudo.maintenance', true) = 'ai-spend' and state = 'reserved')
  with check (current_setting('tudo.maintenance', true) = 'ai-spend' and state in ('charged', 'released'));
-- no delete policy: spend history cannot be deleted through the app.
