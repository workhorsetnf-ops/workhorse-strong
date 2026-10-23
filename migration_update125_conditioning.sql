-- Update 125: conditioning & cardio sessions as their own session type.
-- Run this in the Supabase SQL Editor BEFORE merging the pull request.
-- Safe to re-run.

-- 1. A program day can now be a conditioning session, alongside workouts
--    ('exercise') and lifestyle cards. The old check constraint is found by
--    what it checks rather than by name, so it works whatever it was called.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.program_days'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%track%'
  loop
    execute format('alter table public.program_days drop constraint %I', c.conname);
  end loop;
end $$;
alter table program_days add constraint program_days_track_check
  check (track in ('exercise', 'lifestyle', 'conditioning'));

-- 2. Every logged set says which kind of session it came from, so lifting
--    compliance (alerts, Home, scorecard, reminders) never counts a bike
--    session as a workout. Existing rows are all lifting and default to it.
alter table workout_logs add column if not exists session_track text not null default 'exercise';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_logs_session_track_check') then
    alter table workout_logs add constraint workout_logs_session_track_check
      check (session_track in ('exercise', 'lifestyle', 'conditioning'));
  end if;
end $$;

-- 3. Clients can move a conditioning session to another day of the same week.
--    One row per moved session per week: from_date is where the program put
--    it, to_date is where the client wants it. Deleting the row moves it back.
create table if not exists session_moves (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  day_id uuid not null references program_days(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  created_at timestamptz default now(),
  unique (client_id, day_id, from_date),
  check (to_date between from_date - 6 and from_date + 6)
);
create index if not exists session_moves_client_dates on session_moves (client_id, to_date);
alter table session_moves enable row level security;
drop policy if exists "coach manages session moves" on session_moves;
create policy "coach manages session moves" on session_moves for all using (is_coach()) with check (is_coach());
drop policy if exists "client manages own session moves" on session_moves;
create policy "client manages own session moves" on session_moves for all
  using (client_id = auth.uid()) with check (client_id = auth.uid());
grant select, insert, update, delete on session_moves to authenticated;
