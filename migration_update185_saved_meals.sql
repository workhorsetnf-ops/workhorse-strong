-- Update 185: saved meals
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- A client's own named meals ("Usual breakfast") they can log in one tap.
-- items holds the food lines: [{meal_name, protein_g, carbs_g, fat_g, fiber_g, grams, estimated}]
create table if not exists saved_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists saved_meals_client_idx on saved_meals (client_id, created_at desc);
alter table saved_meals enable row level security;

drop policy if exists "client manages own saved meals" on saved_meals;
create policy "client manages own saved meals" on saved_meals for all
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "coach manages saved meals" on saved_meals;
create policy "coach manages saved meals" on saved_meals for all using (is_coach()) with check (is_coach());
grant select, insert, update, delete on saved_meals to authenticated;

-- Speeds up "your recent foods" (one client's logs, newest first).
create index if not exists meal_logs_client_recent_idx on meal_logs (client_id, logged_on desc);
