-- ===== SUPPLEMENTS + BLOODWORK (Update 89) =====
-- Safe to re-run.

-- Each client's supplement stack, set by the coach.
create table if not exists client_supplements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  dose text default '',
  timing text default '',
  purpose text default '',
  monthly_cost numeric,
  notes text default '',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table client_supplements enable row level security;
drop policy if exists "coach manages supplements" on client_supplements;
create policy "coach manages supplements" on client_supplements for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own supplements" on client_supplements;
create policy "client reads own supplements" on client_supplements for select using (client_id = auth.uid());

-- One row per supplement per day the client ticks it off.
create table if not exists supplement_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  supplement_id uuid not null references client_supplements(id) on delete cascade,
  log_date date not null,
  created_at timestamptz default now(),
  unique (supplement_id, log_date)
);
alter table supplement_logs enable row level security;
drop policy if exists "client manages own supplement logs" on supplement_logs;
-- a client can only tick supplements that are actually in THEIR stack
create policy "client manages own supplement logs" on supplement_logs for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid() and exists (select 1 from client_supplements s where s.id = supplement_id and s.client_id = auth.uid()));
drop policy if exists "coach reads supplement logs" on supplement_logs;
create policy "coach reads supplement logs" on supplement_logs for select using (is_coach());
create index if not exists supplement_logs_client_date on supplement_logs (client_id, log_date);

-- Blood tests (one per lab draw) and the results on each.
create table if not exists blood_tests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  test_date date not null,
  lab text default '',
  notes text default '',
  created_at timestamptz default now()
);
create table if not exists blood_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references blood_tests(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  marker text not null,
  value numeric not null,
  created_at timestamptz default now(),
  unique (test_id, marker)
);
-- Per-client reference ranges, only when they differ from the defaults
-- (labs differ — the coach copies the range off the client's report).
create table if not exists client_blood_ranges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  marker text not null,
  ref_low numeric,
  ref_high numeric,
  unique (client_id, marker)
);
alter table blood_tests enable row level security;
alter table blood_results enable row level security;
alter table client_blood_ranges enable row level security;
drop policy if exists "coach manages blood tests" on blood_tests;
create policy "coach manages blood tests" on blood_tests for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own blood tests" on blood_tests;
create policy "client reads own blood tests" on blood_tests for select using (client_id = auth.uid());
drop policy if exists "coach manages blood results" on blood_results;
create policy "coach manages blood results" on blood_results for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own blood results" on blood_results;
create policy "client reads own blood results" on blood_results for select using (client_id = auth.uid());
drop policy if exists "coach manages blood ranges" on client_blood_ranges;
create policy "coach manages blood ranges" on client_blood_ranges for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own blood ranges" on client_blood_ranges;
create policy "client reads own blood ranges" on client_blood_ranges for select using (client_id = auth.uid());

grant select, insert, update, delete on client_supplements, supplement_logs, blood_tests, blood_results, client_blood_ranges to authenticated;
