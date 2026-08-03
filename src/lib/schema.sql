-- WORKHORSE STRONG — database schema
-- Run this entire file in Supabase > SQL Editor > New query > Run

-- ===== PROFILES =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('coach','client')),
  full_name text not null default '',
  phase text default 'cut' check (phase in ('cut','build','recomp','maintain')),
  protein_g int default 0,
  carbs_g int default 0,
  fat_g int default 0,
  calories int default 0,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== EXERCISE LIBRARY =====
create table exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default '',
  metric text not null default 'reps' check (metric in ('reps','time','distance')),
  kind text not null default 'exercise' check (kind in ('exercise','conditioning')),
  description text default '',
  video_url text default '',
  notes text default '',
  created_at timestamptz default now()
);

-- ===== PROGRAMS =====
create table programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text default '',
  weeks int not null default 4,
  created_at timestamptz default now()
);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  day_label text not null,
  day_number int not null default 1 check (day_number between 1 and 7),
  track text not null default 'exercise' check (track in ('exercise','lifestyle')),
  notes text default '',
  video_note text default '',
  warmup text default '',
  warmup_video text default '',
  cooldown text default '',
  cooldown_video text default '',
  position int not null default 0
);

create table program_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references program_days(id) on delete cascade,
  name text not null,
  sets int not null default 3,
  reps text not null default '8-12',
  rir text default '1-2',
  progression_type text not null default 'rir' check (progression_type in ('rir','rpe','percent')),
  letter text default '',
  rest text default '',
  metric text not null default 'reps' check (metric in ('reps','time','distance')),
  kind text not null default 'exercise' check (kind in ('exercise','conditioning')),
  description text default '',
  video_url text default '',
  based_on_lift text default '',
  week_targets jsonb default '[]',
  notes text default '',
  position int not null default 0
);

create table program_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  current_week int not null default 1,
  start_date date default current_date,
  assigned_at timestamptz default now(),
  unique (client_id)
);

create table client_maxes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  lift_name text not null,
  max_weight numeric not null,
  updated_at timestamptz default now(),
  unique (client_id, lift_name)
);

-- ===== WORKOUT LOGS =====
create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid references program_exercises(id) on delete set null,
  exercise_name text not null,
  set_number int not null default 1,
  weight numeric,
  reps int,
  rir int,
  result_text text,
  logged_at timestamptz default now()
);

-- ===== NUTRITION LOGS =====
create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  meal_name text not null,
  protein_g int default 0,
  carbs_g int default 0,
  fat_g int default 0,
  logged_on date default current_date,
  logged_at timestamptz default now()
);

-- ===== CHECK-INS =====
create table checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  weight numeric,
  waist numeric,
  sleep_avg numeric,
  energy int check (energy between 1 and 10),
  hunger int check (hunger between 1 and 10),
  notes text default '',
  photo_urls text[] default '{}',
  form_responses jsonb default '[]',
  photos jsonb default '[]',
  form_name text default '',
  coach_feedback text,
  submitted_at timestamptz default now()
);

-- ===== MESSAGES =====
create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- ===== STORAGE (check-in photos) =====
insert into storage.buckets (id, name, public) values ('checkin-photos','checkin-photos', false);

-- ===== ROW LEVEL SECURITY =====
alter table profiles enable row level security;
alter table programs enable row level security;
alter table program_days enable row level security;
alter table program_exercises enable row level security;
alter table program_assignments enable row level security;
alter table exercise_library enable row level security;
alter table client_maxes enable row level security;
alter table workout_logs enable row level security;
alter table meal_logs enable row level security;
alter table checkins enable row level security;
alter table messages enable row level security;

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach');
$$;

create policy "read own profile" on profiles for select using (id = auth.uid() or is_coach());
create policy "update own profile" on profiles for update using (id = auth.uid() or is_coach());

create policy "coach manages programs" on programs for all using (is_coach());
create policy "client reads assigned program" on programs for select using (
  exists (select 1 from program_assignments a where a.program_id = programs.id and a.client_id = auth.uid())
);
create policy "coach manages days" on program_days for all using (is_coach());
create policy "client reads assigned days" on program_days for select using (
  exists (select 1 from program_assignments a where a.program_id = program_days.program_id and a.client_id = auth.uid())
);
create policy "coach manages exercises" on program_exercises for all using (is_coach());
create policy "client reads assigned exercises" on program_exercises for select using (
  exists (
    select 1 from program_days d
    join program_assignments a on a.program_id = d.program_id
    where d.id = program_exercises.day_id and a.client_id = auth.uid()
  )
);
create policy "coach manages assignments" on program_assignments for all using (is_coach());
create policy "client reads own assignment" on program_assignments for select using (client_id = auth.uid());

create policy "coach manages library" on exercise_library for all using (is_coach());

create policy "client reads own maxes" on client_maxes for select using (client_id = auth.uid());
create policy "coach manages maxes" on client_maxes for all using (is_coach());

create policy "client manages own workout logs" on workout_logs for all using (client_id = auth.uid());
create policy "coach reads workout logs" on workout_logs for select using (is_coach());
create policy "client manages own meal logs" on meal_logs for all using (client_id = auth.uid());
create policy "coach reads meal logs" on meal_logs for select using (is_coach());

create policy "client manages own checkins" on checkins for all using (client_id = auth.uid());
create policy "coach reads checkins" on checkins for select using (is_coach());
create policy "coach updates checkins" on checkins for update using (is_coach());

create policy "read own messages" on messages for select using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "send messages" on messages for insert with check (sender_id = auth.uid());

create policy "clients upload own photos" on storage.objects for insert
  with check (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own or coach reads photos" on storage.objects for select
  using (bucket_id = 'checkin-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));

alter publication supabase_realtime add table messages;

-- ===== CONDITIONING LIBRARY =====
create table conditioning_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text default '',
  instructions text default '',
  video_url text default '',
  created_at timestamptz default now()
);
alter table conditioning_library enable row level security;
create policy "coach manages conditioning library" on conditioning_library for all using (is_coach());

insert into conditioning_library (name, format, instructions) values
  ('10 Minute AirBike', '10 min AirBike', '10 minutes max calories on AirBike'),
  ('10 second AirBike', 'For max wattage', '10 second AirBike @ 100% -rest 2 min- x3 sets *record your best max wattage'),
  ('2k Row Time Trial', '2k row time trial', '2k row for best time'),
  ('500m Time Trial', '500m row time trial', '500m row for best time'),
  ('5k Row Time Trial', '5k row time trial', '5k row for best time');

-- ===== CHECK-IN FORMS =====
create table checkin_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
create table checkin_form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references checkin_forms(id) on delete cascade,
  label text not null,
  qtype text not null default 'text' check (qtype in ('text','number','scale','choice')),
  options jsonb default '[]',
  position int not null default 0
);
create table checkin_form_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  form_id uuid not null references checkin_forms(id) on delete cascade,
  unique (client_id)
);
alter table checkin_forms enable row level security;
alter table checkin_form_questions enable row level security;
alter table checkin_form_assignments enable row level security;
create policy "coach manages forms" on checkin_forms for all using (is_coach());
create policy "client reads assigned form" on checkin_forms for select using (
  exists (select 1 from checkin_form_assignments a where a.form_id = checkin_forms.id and a.client_id = auth.uid())
);
create policy "coach manages questions" on checkin_form_questions for all using (is_coach());
create policy "client reads assigned questions" on checkin_form_questions for select using (
  exists (select 1 from checkin_form_assignments a where a.form_id = checkin_form_questions.form_id and a.client_id = auth.uid())
);
create policy "coach manages form assignments" on checkin_form_assignments for all using (is_coach());
create policy "client reads own form assignment" on checkin_form_assignments for select using (client_id = auth.uid());

-- ===== LIFESTYLE LIBRARY =====
create table lifestyle_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default '',
  instructions text default '',
  video_url text default '',
  created_at timestamptz default now()
);
alter table lifestyle_library enable row level security;
create policy "coach manages lifestyle library" on lifestyle_library for all using (is_coach());
