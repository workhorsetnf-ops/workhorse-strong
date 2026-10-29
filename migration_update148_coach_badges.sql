-- Update 148: highlighted tabs for the coach
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Remembers when you last opened sections that have no "read" flag of their
-- own (Community), so new posts and comments since then light the tab up.
create table if not exists section_seen (
  user_id uuid not null references profiles(id) on delete cascade,
  section text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table section_seen enable row level security;
drop policy if exists "own section seen" on section_seen;
create policy "own section seen" on section_seen for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on section_seen to authenticated;
