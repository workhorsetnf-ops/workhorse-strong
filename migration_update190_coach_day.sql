-- ===== COACH DAY VIEW (Update 190) =====
-- Safe to re-run.
--
-- 1. One-off workouts: a program_days row that belongs to ONE client on ONE
--    date instead of to a program. Exercises, logging, comments and swaps all
--    hang off day_id, so they work on one-offs with no other changes.
alter table program_days alter column program_id drop not null;
alter table program_days add column if not exists client_id uuid references profiles(id) on delete cascade;
alter table program_days add column if not exists on_date date;
alter table program_days drop constraint if exists program_days_one_off_check;
alter table program_days add constraint program_days_one_off_check check (
  (client_id is null and on_date is null and program_id is not null)
  or (client_id is not null and on_date is not null)
);
create index if not exists program_days_one_off_idx on program_days (client_id, on_date) where client_id is not null;

drop policy if exists "client reads own one-off days" on program_days;
create policy "client reads own one-off days" on program_days for select using (client_id = auth.uid());
drop policy if exists "client reads own one-off exercises" on program_exercises;
create policy "client reads own one-off exercises" on program_exercises for select using (
  exists (select 1 from program_days d where d.id = program_exercises.day_id and d.client_id = auth.uid())
);

-- 2. Rate Your Effort: 1-5 and minutes. rpe (1-10) is still filled in from the
--    effort so the weekly review and AI check-in keep reading it.
alter table session_feedback add column if not exists effort int check (effort between 1 and 5);
alter table session_feedback add column if not exists minutes int check (minutes between 1 and 600);

-- 3. Missed: the client tapped MISSED on an exercise that day.
create table if not exists exercise_missed (
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references program_exercises(id) on delete cascade,
  missed_date date not null,
  created_at timestamptz not null default now(),
  primary key (client_id, exercise_id, missed_date)
);
create index if not exists exercise_missed_date_idx on exercise_missed (client_id, missed_date desc);
alter table exercise_missed enable row level security;
drop policy if exists "client manages own missed" on exercise_missed;
drop policy if exists "coach reads missed" on exercise_missed;
create policy "client manages own missed" on exercise_missed for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "coach reads missed" on exercise_missed for select using (is_coach());
grant select, insert, update, delete on exercise_missed to authenticated;

-- 4. AM/PM training schedule: weekday "1"-"7" (Mon-Sun) -> 'am' | 'pm' | 'both'.
create or replace function public.valid_train_times(m jsonb) returns boolean
language sql immutable as $$
  select m is null or (
    jsonb_typeof(m) = 'object'
    and not exists (
      select 1 from jsonb_each(m) e
      where e.key !~ '^[1-7]$'
         or jsonb_typeof(e.value) <> 'string'
         or (e.value #>> '{}') not in ('am', 'pm', 'both')
    )
  )
$$;
alter table program_assignments add column if not exists train_times jsonb;
alter table program_assignments drop constraint if exists program_assignments_train_times_check;
alter table program_assignments add constraint program_assignments_train_times_check check (valid_train_times(train_times));
