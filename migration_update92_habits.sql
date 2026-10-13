-- ===== HABIT TRACKER (Update 92) =====
-- Safe to re-run. Needs nothing from Updates 89-91.

-- Each client's daily habits, set by the coach.
create table if not exists client_habits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  target text default '',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table client_habits enable row level security;
drop policy if exists "coach manages habits" on client_habits;
create policy "coach manages habits" on client_habits for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own habits" on client_habits;
create policy "client reads own habits" on client_habits for select using (client_id = auth.uid());

-- One row per habit per day the client ticks it off.
create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  habit_id uuid not null references client_habits(id) on delete cascade,
  log_date date not null,
  created_at timestamptz default now(),
  unique (habit_id, log_date)
);
alter table habit_logs enable row level security;
drop policy if exists "client manages own habit logs" on habit_logs;
-- a client can only tick habits that are actually theirs
create policy "client manages own habit logs" on habit_logs for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid() and exists (select 1 from client_habits h where h.id = habit_id and h.client_id = auth.uid()));
drop policy if exists "coach reads habit logs" on habit_logs;
create policy "coach reads habit logs" on habit_logs for select using (is_coach());
create index if not exists habit_logs_client_date on habit_logs (client_id, log_date);
