-- Update 146: shows & travel calendar
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Clients add their bookings (shows, TV tapings) and travel. The Train page
-- adapts its advice around them and lets them move a session off a show day;
-- the coach sees everyone's upcoming shows and travel on Home.
create table if not exists client_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'show' check (kind in ('show','tv','travel','other')),
  title text not null default '' check (length(title) <= 120),
  location text not null default '' check (length(location) <= 120),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint client_events_range check (end_date >= start_date and end_date <= start_date + 30)
);
create index if not exists client_events_client_idx on client_events (client_id, start_date);
create index if not exists client_events_dates_idx on client_events (start_date, end_date);
alter table client_events enable row level security;
drop policy if exists "client manages own events" on client_events;
drop policy if exists "coach manages client events" on client_events;
create policy "client manages own events" on client_events for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "coach manages client events" on client_events for all using (is_coach()) with check (is_coach());
grant select, insert, update, delete on client_events to authenticated;
