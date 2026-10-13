-- ===== CARDIO PLAN + HEART-RATE ZONES (Update 90) =====
-- Needs Update 89 first (same Health page). Safe to re-run.

-- One settings row per client: what the zones are built from, and weekly targets.
create table if not exists client_cardio_settings (
  client_id uuid primary key references profiles(id) on delete cascade,
  age int check (age between 10 and 100),
  max_hr int check (max_hr between 120 and 230),     -- known max HR; overrides the age estimate
  zone2_target int not null default 120 check (zone2_target between 0 and 2000),
  hiit_target int not null default 1 check (hiit_target between 0 and 14),
  notes text default '',
  updated_at timestamptz default now()
);
-- The weekly plan: one cardio entry per weekday (0 = Monday … 6 = Sunday).
create table if not exists client_cardio_plan (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  cardio_type text default '',
  modality text default '',
  minutes int check (minutes between 0 and 600),
  zone text check (zone in ('Z1','Z2','Z3','Z4','Z5')),
  notes text default '',
  unique (client_id, weekday)
);
alter table client_cardio_settings enable row level security;
alter table client_cardio_plan enable row level security;
drop policy if exists "coach manages cardio settings" on client_cardio_settings;
create policy "coach manages cardio settings" on client_cardio_settings for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own cardio settings" on client_cardio_settings;
create policy "client reads own cardio settings" on client_cardio_settings for select using (client_id = auth.uid());
drop policy if exists "coach manages cardio plan" on client_cardio_plan;
create policy "coach manages cardio plan" on client_cardio_plan for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own cardio plan" on client_cardio_plan;
create policy "client reads own cardio plan" on client_cardio_plan for select using (client_id = auth.uid());
grant select, insert, update, delete on client_cardio_settings, client_cardio_plan to authenticated;
