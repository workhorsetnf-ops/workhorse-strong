-- Update 145: macro adjustment helper
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- A log of every macro change approved from the weekly review, so the helper
-- knows when the last change was (and you have a history per client).
create table if not exists macro_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  from_macros jsonb not null,
  to_macros jsonb not null,
  reason text default '',
  created_at timestamptz not null default now()
);
create index if not exists macro_changes_client_idx on macro_changes (client_id, created_at desc);
alter table macro_changes enable row level security;
drop policy if exists "coach manages macro changes" on macro_changes;
create policy "coach manages macro changes" on macro_changes for all using (is_coach()) with check (is_coach());
