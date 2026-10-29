-- Update 152: one-tap exercise swaps
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.

-- Coach-approved alternatives for each library exercise.
create table if not exists exercise_alternatives (
  library_id uuid not null references exercise_library(id) on delete cascade,
  alt_id uuid not null references exercise_library(id) on delete cascade,
  position int not null default 0,
  primary key (library_id, alt_id),
  check (library_id <> alt_id)
);
alter table exercise_alternatives enable row level security;
drop policy if exists "coach manages alternatives" on exercise_alternatives;
drop policy if exists "signed in reads alternatives" on exercise_alternatives;
create policy "coach manages alternatives" on exercise_alternatives for all using (is_coach()) with check (is_coach());
create policy "signed in reads alternatives" on exercise_alternatives for select using (auth.uid() is not null);
grant select, insert, update, delete on exercise_alternatives to authenticated;

-- Clients need to read the library (names, icons, videos) to show swaps.
drop policy if exists "signed in reads library" on exercise_library;
create policy "signed in reads library" on exercise_library for select using (auth.uid() is not null);

-- Each swap a client makes, for that day only.
create table if not exists exercise_swaps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references program_exercises(id) on delete cascade,
  swap_date date not null,
  from_name text not null,
  alt_library_id uuid references exercise_library(id) on delete set null,
  alt_name text not null,
  reason text not null default '' check (reason in ('', 'taken', 'hurts', 'equipment', 'other')),
  created_at timestamptz not null default now(),
  unique (client_id, exercise_id, swap_date)
);
create index if not exists exercise_swaps_date_idx on exercise_swaps (swap_date desc);
alter table exercise_swaps enable row level security;
drop policy if exists "client manages own swaps" on exercise_swaps;
drop policy if exists "coach reads swaps" on exercise_swaps;
create policy "client manages own swaps" on exercise_swaps for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "coach reads swaps" on exercise_swaps for select using (is_coach());
grant select, insert, update, delete on exercise_swaps to authenticated;
