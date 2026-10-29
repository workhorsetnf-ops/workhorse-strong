-- Update 149: "Get set up" checklist
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Things only the client's phone can know (app added to Home Screen,
-- notifications on, which kind of phone), saved so the coach can see who
-- hasn't finished setting up. The rest is worked out from data already there.
create table if not exists client_setup (
  client_id uuid primary key references profiles(id) on delete cascade,
  platform text,                    -- 'ios' | 'android' | 'other'
  installed_at timestamptz,         -- opened from the Home Screen icon
  push_on_at timestamptz,           -- notifications switched on
  dismissed_at timestamptz,         -- hid the checklist
  updated_at timestamptz not null default now()
);
alter table client_setup enable row level security;
drop policy if exists "client manages own setup" on client_setup;
drop policy if exists "coach reads setup" on client_setup;
create policy "client manages own setup" on client_setup for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "coach reads setup" on client_setup for select using (is_coach());
grant select, insert, update on client_setup to authenticated;
