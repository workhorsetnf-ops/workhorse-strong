-- WORKHORSE STRONG — database schema
-- Run this entire file in Supabase > SQL Editor > New query > Run

-- ===== PROFILES =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('coach','client')),
  full_name text not null default '',
  email text,
  phase text default 'cut' check (phase in ('cut','build','recomp','maintain')),
  protein_g int default 0,
  carbs_g int default 0,
  fat_g int default 0,
  calories int default 0,
  target_weight numeric,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email);
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
  tracking_type text default '',
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

create table program_blocks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null default 'Block 1',
  weeks int not null default 4,
  position int not null default 0
);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  block_id uuid references program_blocks(id) on delete cascade,
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
  tracking_type text default '',
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
  current_block_id uuid references program_blocks(id) on delete set null,
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
  msg_type text not null default 'text' check (msg_type in ('text','audio')),
  audio_path text,
  created_at timestamptz default now()
);

-- ===== STORAGE (check-in photos) =====
insert into storage.buckets (id, name, public) values ('checkin-photos','checkin-photos', false);

-- ===== ROW LEVEL SECURITY =====
alter table profiles enable row level security;
alter table programs enable row level security;
alter table program_blocks enable row level security;
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
create policy "clients can see the coach profile" on profiles for select using (role = 'coach');

create policy "coach manages programs" on programs for all using (is_coach());
create policy "client reads assigned program" on programs for select using (
  exists (select 1 from program_assignments a where a.program_id = programs.id and a.client_id = auth.uid())
);
create policy "coach manages blocks" on program_blocks for all using (is_coach());
create policy "client reads assigned blocks" on program_blocks for select using (
  exists (select 1 from program_assignments a where a.program_id = program_blocks.program_id and a.client_id = auth.uid())
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
  tracking_type text not null default 'yesno' check (tracking_type in ('count','time','yesno','scale')),
  reminder_time text default '',
  instructions text default '',
  video_url text default '',
  created_at timestamptz default now()
);
alter table lifestyle_library enable row level security;
create policy "coach manages lifestyle library" on lifestyle_library for all using (is_coach());

-- ===== DAILY LOGS (weight/steps) =====
create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  weight numeric,
  steps int,
  readiness int check (readiness between 1 and 5),
  created_at timestamptz default now(),
  unique (client_id, log_date)
);
alter table daily_logs enable row level security;
create policy "client manages own daily logs" on daily_logs for all using (client_id = auth.uid());
create policy "coach reads daily logs" on daily_logs for select using (is_coach());

-- ===== BODY MEASUREMENTS =====
create table body_measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  waist numeric, chest numeric, arms numeric, thighs numeric, hips numeric, neck numeric,
  created_at timestamptz default now(),
  unique (client_id, log_date)
);
alter table body_measurements enable row level security;
create policy "client manages own measurements" on body_measurements for all using (client_id = auth.uid());
create policy "coach reads measurements" on body_measurements for select using (is_coach());

-- ===== RESOURCE LIBRARY =====
create table resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text default '',
  description text default '',
  file_path text not null,
  created_at timestamptz default now()
);
alter table resources enable row level security;
create policy "coach manages resources" on resources for all using (is_coach());
create policy "clients read resources" on resources for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'client')
);
create policy "coach uploads resource files" on storage.objects for insert
  with check (bucket_id = 'resources' and public.is_coach());
create policy "anyone signed in reads resource files" on storage.objects for select
  using (bucket_id = 'resources' and auth.role() = 'authenticated');

-- ===== YEARLY PHASE ROADMAP =====
create table client_phases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  phase_type text not null default 'build' check (phase_type in ('cut','build','recomp','maintain','peak')),
  start_date date not null,
  end_date date not null,
  protein_g int, carbs_g int, fat_g int, calories int,
  notes text default '',
  position int not null default 0,
  created_at timestamptz default now()
);
alter table client_phases enable row level security;
create policy "coach manages phases" on client_phases for all using (is_coach());
create policy "client reads own phases" on client_phases for select using (client_id = auth.uid());

-- ===== COMMUNITY =====
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create table community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create table community_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  unique (post_id, author_id)
);
alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_likes enable row level security;
create policy "everyone signed in reads posts" on community_posts for select using (auth.role() = 'authenticated');
create policy "everyone signed in creates own posts" on community_posts for insert with check (author_id = auth.uid());
create policy "author or coach deletes posts" on community_posts for delete using (author_id = auth.uid() or is_coach());
create policy "everyone signed in reads comments" on community_comments for select using (auth.role() = 'authenticated');
create policy "everyone signed in creates own comments" on community_comments for insert with check (author_id = auth.uid());
create policy "author or coach deletes comments" on community_comments for delete using (author_id = auth.uid() or is_coach());
create policy "everyone signed in reads likes" on community_likes for select using (auth.role() = 'authenticated');
create policy "everyone signed in manages own likes" on community_likes for insert with check (author_id = auth.uid());
create policy "everyone signed in removes own likes" on community_likes for delete using (author_id = auth.uid());
alter publication supabase_realtime add table community_posts;
alter publication supabase_realtime add table community_comments;

-- ===== HEALTH POINTS (client_ratings) =====
create table client_ratings (
  client_id uuid primary key references profiles(id) on delete cascade,
  retention text check (retention in ('red','yellow','green')),
  mindset text check (mindset in ('red','yellow','green')),
  notes text default '',
  updated_at timestamptz default now()
);
alter table client_ratings enable row level security;
create policy "coach manages ratings" on client_ratings for all using (is_coach());

-- ===== MESSAGE TEMPLATES =====
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  body text not null,
  created_at timestamptz default now()
);
alter table message_templates enable row level security;
create policy "coach manages templates" on message_templates for all using (is_coach());

-- ===== EXERCISE COMMENT HISTORY =====
create table exercise_comments (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references program_exercises(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
alter table exercise_comments enable row level security;
create policy "coach manages exercise comments" on exercise_comments for all using (is_coach());
create policy "client reads own exercise comments" on exercise_comments for select using (
  exists (
    select 1 from program_exercises ex
    join program_days d on d.id = ex.day_id
    join program_assignments a on a.program_id = d.program_id
    where ex.id = exercise_comments.exercise_id and a.client_id = auth.uid()
  )
);
create policy "client writes own exercise comments" on exercise_comments for insert with check (
  author_id = auth.uid() and exists (
    select 1 from program_exercises ex
    join program_days d on d.id = ex.day_id
    join program_assignments a on a.program_id = d.program_id
    where ex.id = exercise_comments.exercise_id and a.client_id = auth.uid()
  )
);

-- ===== EXERCISE FLAGS (injury/pain) =====
create table exercise_flags (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references program_exercises(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  note text default '',
  resolved boolean not null default false,
  created_at timestamptz default now()
);
alter table exercise_flags enable row level security;
create policy "coach manages flags" on exercise_flags for all using (is_coach());
create policy "client manages own flags" on exercise_flags for all using (client_id = auth.uid());

-- ===== FAQ LIBRARY =====
create table faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text default '',
  position int not null default 0,
  created_at timestamptz default now()
);
alter table faq_items enable row level security;
create policy "coach manages faq" on faq_items for all using (is_coach());
create policy "clients read faq" on faq_items for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'client')
);

-- ===== TESTIMONIALS =====
create table testimonials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  milestone_label text default '',
  created_at timestamptz default now()
);
alter table testimonials enable row level security;
create policy "coach reads testimonials" on testimonials for select using (is_coach());
create policy "client submits own testimonial" on testimonials for insert with check (client_id = auth.uid());
create policy "client reads own testimonials" on testimonials for select using (client_id = auth.uid());

create table milestone_prompts_shown (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  milestone_key text not null,
  shown_at timestamptz default now(),
  unique (client_id, milestone_key)
);
alter table milestone_prompts_shown enable row level security;
create policy "client manages own milestone flags" on milestone_prompts_shown for all using (client_id = auth.uid());

-- ===== CLIENT HUB (single markdown doc) =====
create table client_hub (
  id int primary key default 1,
  title text not null default 'Client Hub',
  subtitle text default '',
  content_md text default '',
  banner_url text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into client_hub (id, title, subtitle, content_md) values (
  1, 'Client Hub', 'Everything you''ll ask in your first 30 days lives here.',
  '## Welcome\n\nThis is your reference doc — read this before you DM me for something that might already be answered here.'
);
alter table client_hub enable row level security;
create policy "coach manages hub" on client_hub for all using (is_coach());
create policy "clients read hub" on client_hub for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'client')
);
