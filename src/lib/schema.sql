-- WORKHORSE STRONG — database schema
-- Run this entire file in Supabase > SQL Editor > New query > Run

-- ===== PROFILES =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('coach','client')),
  full_name text not null default '',
  email text,
  phase text default 'cut' check (phase in ('cut','build','recomp','maintain')),
  checkin_day int check (checkin_day between 0 and 6),
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
  icon_url text,
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
  msg_type text not null default 'text' check (msg_type in ('text','audio','file')),
  audio_path text,
  file_path text,
  file_name text,
  read_at timestamptz,
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
  booking_url text,
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

-- ===== MESSAGE FILE ATTACHMENTS =====
insert into storage.buckets (id, name, public) values ('message-files', 'message-files', false);
create policy "send own message files" on storage.objects for insert
  with check (bucket_id = 'message-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read message files if authenticated" on storage.objects for select
  using (bucket_id = 'message-files' and auth.role() = 'authenticated');

-- ===== EXERCISE ICONS =====
insert into storage.buckets (id, name, public) values ('exercise-icons', 'exercise-icons', true);
create policy "coach uploads exercise icons" on storage.objects for insert
  with check (bucket_id = 'exercise-icons' and public.is_coach());
create policy "anyone reads exercise icons" on storage.objects for select
  using (bucket_id = 'exercise-icons');

-- ===== COACH DAILY TASKS =====
create table coach_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  recurring boolean not null default false,
  due_date date,
  created_at timestamptz default now()
);
create table coach_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references coach_tasks(id) on delete cascade,
  completed_date date not null default current_date,
  unique (task_id, completed_date)
);
alter table coach_tasks enable row level security;
alter table coach_task_completions enable row level security;
create policy "coach manages tasks" on coach_tasks for all using (is_coach());
create policy "coach manages task completions" on coach_task_completions for all using (is_coach());

-- ===== PIPELINE / CRM (Update 73) =====
create table lead_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz default now()
);
insert into lead_stages (name, position, is_won, is_lost) values
  ('New Lead', 1, false, false), ('Contacted', 2, false, false),
  ('Qualified', 3, false, false), ('Call Booked', 4, false, false),
  ('Call Completed', 5, false, false), ('Offer Made', 6, false, false),
  ('Won', 7, true, false), ('Lost', 8, false, true);

create table leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  email text,
  phone text,
  handle text,
  source text default '',
  stage_id uuid references lead_stages(id) on delete set null,
  deal_size numeric,
  call_date date,
  notes text default '',
  stage_changed_at timestamptz default now(),
  last_touch_at timestamptz,
  converted_profile_id uuid references profiles(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz default now()
);
create index leads_stage_idx on leads (stage_id);
create index leads_archived_idx on leads (archived);

create table lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('note','call','dm','email','stage_change')),
  body text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now()
);
create index lead_activity_lead_idx on lead_activity (lead_id, occurred_at desc);

alter table lead_stages enable row level security;
alter table leads enable row level security;
alter table lead_activity enable row level security;
create policy "coach manages lead stages" on lead_stages for all using (is_coach());
create policy "coach manages leads" on leads for all using (is_coach());
create policy "coach manages lead activity" on lead_activity for all using (is_coach());

create or replace function public.log_lead_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_name text;
  new_name text;
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
    select name into old_name from lead_stages where id = old.stage_id;
    select name into new_name from lead_stages where id = new.stage_id;
    insert into lead_activity (lead_id, kind, body)
    values (new.id, 'stage_change',
            coalesce(old_name, 'No stage') || ' → ' || coalesce(new_name, 'No stage'));
  end if;
  return new;
end $$;

create trigger on_lead_stage_change
  before update on leads
  for each row execute function public.log_lead_stage_change();

-- ===== CLIENT STATUS + CONVERSION (Update 74) =====
alter table profiles add column status text not null default 'active'
  check (status in ('active','paused','exited'));
alter table profiles add column status_changed_at timestamptz default now();

create or replace function public.admin_create_client(
  new_email text, new_password text, new_full_name text default ''
) returns uuid language plpgsql security definer
set search_path = public, auth, extensions as $$
declare
  new_id uuid := gen_random_uuid();
  clean_email text := lower(trim(new_email));
begin
  if not public.is_coach() then raise exception 'Only the coach can create client accounts.'; end if;
  if clean_email is null or clean_email = '' or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    then raise exception 'That does not look like a valid email address.'; end if;
  if new_password is null or length(new_password) < 6
    then raise exception 'Password must be at least 6 characters.'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = clean_email)
    then raise exception 'An account already exists for %', clean_email; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone_change, phone_change_token, email_change_token_current,
    reauthentication_token, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    clean_email, extensions.crypt(new_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(new_full_name, '')), now(), now(),
    '', '', '', '', '', '', '', '', false, false
  );
  -- GoTrue will not authenticate a password user with no identity row.
  insert into auth.identities (provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', clean_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());
  return new_id;
end $$;
revoke all on function public.admin_create_client(text, text, text) from public;
grant execute on function public.admin_create_client(text, text, text) to authenticated;

create or replace function public.convert_lead(target_lead_id uuid, target_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare won_stage uuid;
begin
  if not public.is_coach() then raise exception 'Only the coach can convert leads.'; end if;
  select id into won_stage from lead_stages where is_won = true order by position limit 1;
  update leads set converted_profile_id = target_profile_id, archived = true,
                   stage_id = coalesce(won_stage, stage_id)
   where id = target_lead_id;
  insert into lead_activity (lead_id, kind, body)
  values (target_lead_id, 'note', 'Converted to a client.');
end $$;
revoke all on function public.convert_lead(uuid, uuid) from public;
grant execute on function public.convert_lead(uuid, uuid) to authenticated;

create index leads_converted_idx on leads (converted_profile_id);

-- ===== NEXT ACTION + DUE DATE (Update 75) =====
alter table leads add column next_action text default '';
alter table leads add column next_action_date date;
create index leads_next_action_date_idx on leads (next_action_date)
  where next_action_date is not null and archived = false;

create or replace function public.complete_next_action(
  target_lead_id uuid, outcome text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare prior_action text;
begin
  if not public.is_coach() then raise exception 'Only the coach can update leads.'; end if;
  select next_action into prior_action from leads where id = target_lead_id;
  update leads set next_action = '', next_action_date = null, last_touch_at = now()
   where id = target_lead_id;
  insert into lead_activity (lead_id, kind, body)
  values (target_lead_id, 'note',
    case when coalesce(outcome,'') <> '' then outcome
         when coalesce(prior_action,'') <> '' then 'Done: ' || prior_action
         else 'Followed up.' end);
end $$;
revoke all on function public.complete_next_action(uuid, text) from public;
grant execute on function public.complete_next_action(uuid, text) to authenticated;

-- ===== CALL SCHEDULING (Update 76) =====

-- Needed for the overlap-prevention constraint further down. Lets a GiST
-- index mix a range type with a plain equality column.
create extension if not exists btree_gist with schema extensions;

-- ===== SETTINGS (single row, same pattern as client_hub) =====
create table coach_call_settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'America/New_York',
  slot_minutes int not null default 30 check (slot_minutes between 10 and 240),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120),
  min_notice_hours int not null default 12 check (min_notice_hours between 0 and 336),
  max_days_ahead int not null default 21 check (max_days_ahead between 1 and 120),
  booking_enabled boolean not null default false,
  video_base text not null default 'https://meet.jit.si/',
  intro text default ''
);

insert into coach_call_settings (id) values (1) on conflict (id) do nothing;

-- ===== WEEKLY AVAILABILITY =====
-- Stored as local time-of-day in the coach's timezone, NOT as UTC. Storing
-- UTC would silently shift every window by an hour at each DST changeover.
-- weekday 0 = Monday, matching the checkin_day convention already in profiles.
create table coach_availability (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1439),
  end_minute int not null check (end_minute between 1 and 1440),
  active boolean not null default true,
  created_at timestamptz default now(),
  constraint availability_sane_range check (end_minute > start_minute)
);

create index coach_availability_weekday_idx on coach_availability (weekday) where active;

-- ===== BLACKOUTS (travel, match days, anything else) =====
create table coach_blackouts (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text default '',
  created_at timestamptz default now(),
  constraint blackout_sane_range check (ends_at > starts_at)
);

create index coach_blackouts_range_idx on coach_blackouts (starts_at, ends_at);

-- ===== BOOKINGS =====
create table bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','cancelled','completed')),
  video_url text default '',
  client_note text default '',
  coach_note text default '',
  cancelled_by text check (cancelled_by in ('coach','client')),
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  constraint booking_sane_range check (ends_at > starts_at)
);

create index bookings_starts_idx on bookings (starts_at) where status = 'booked';
create index bookings_client_idx on bookings (client_id, starts_at desc);

-- THE IMPORTANT ONE. Two clients hitting "book" on the same slot at the same
-- moment is a race no amount of app-side checking can close. This makes an
-- overlapping live booking physically impossible to insert; the loser of the
-- race gets an error and re-picks. Cancelled rows are excluded so a freed
-- slot can be rebooked.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_no_overlap') then
    alter table bookings add constraint bookings_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at) with &&)
      where (status = 'booked');
  end if;
end $$;

-- ===== RLS =====
alter table coach_call_settings enable row level security;
alter table coach_availability  enable row level security;
alter table coach_blackouts     enable row level security;
alter table bookings            enable row level security;

drop policy if exists "everyone reads call settings" on coach_call_settings;
drop policy if exists "everyone reads availability" on coach_availability;
drop policy if exists "everyone reads blackouts" on coach_blackouts;
drop policy if exists "clients read own bookings" on bookings;

-- Clients need to READ availability to see open slots, but never write it.
create policy "coach manages call settings"  on coach_call_settings for all    using (is_coach());
create policy "everyone reads call settings" on coach_call_settings for select using (auth.uid() is not null);
create policy "coach manages availability"   on coach_availability  for all    using (is_coach());
create policy "everyone reads availability"  on coach_availability  for select using (auth.uid() is not null);
create policy "coach manages blackouts"      on coach_blackouts     for all    using (is_coach());
create policy "everyone reads blackouts"     on coach_blackouts     for select using (auth.uid() is not null);

create policy "coach manages bookings"       on bookings for all    using (is_coach());
create policy "clients read own bookings"    on bookings for select using (client_id = auth.uid());
-- Clients may only change their OWN row, and booking_guard below stops them
-- editing anything except cancelling it.
create policy "clients cancel own bookings"  on bookings for update using (client_id = auth.uid());

-- ===== GUARD: clients can cancel, not reschedule themselves into a slot =====
create or replace function public.booking_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_coach() then
    return new;
  end if;
  -- Non-coach: the only permitted transition is booked -> cancelled.
  if new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.client_id is distinct from old.client_id
     or new.coach_note is distinct from old.coach_note
     or (new.status is distinct from old.status and new.status <> 'cancelled') then
    raise exception 'You can cancel this call, but not change it. Book a new time instead.';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_by := 'client';
    new.cancelled_at := now();
  end if;
  return new;
end $$;

create trigger on_booking_update
  before update on bookings
  for each row execute function public.booking_guard();

-- ===== SLOT VALIDATION =====
-- True when the given window sits inside a live availability window for that
-- weekday, in the coach's own timezone, and isn't blacked out or taken.
create or replace function public.slot_is_open(
  slot_start timestamptz,
  slot_end timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text;
  buffer_min int;
  local_start timestamp;
  local_end timestamp;
  dow int;
  start_min int;
  end_min int;
begin
  select timezone, buffer_minutes into tz, buffer_min from coach_call_settings where id = 1;
  tz := coalesce(tz, 'America/New_York');
  buffer_min := coalesce(buffer_min, 0);

  -- Convert to wall-clock time in the coach's zone before comparing to the
  -- weekly rules, which are themselves stored as local time-of-day.
  local_start := slot_start at time zone tz;
  local_end   := slot_end   at time zone tz;

  -- isodow gives 1=Monday..7=Sunday; our weekday column is 0=Monday..6=Sunday.
  dow := extract(isodow from local_start)::int - 1;
  start_min := extract(hour from local_start)::int * 60 + extract(minute from local_start)::int;
  end_min   := extract(hour from local_end)::int * 60 + extract(minute from local_end)::int;

  -- A window that crosses local midnight can't sit inside a single day's rule.
  if local_end::date <> local_start::date then
    return false;
  end if;

  if not exists (
    select 1 from coach_availability a
    where a.active
      and a.weekday = dow
      and a.start_minute <= start_min
      and a.end_minute   >= end_min
  ) then
    return false;
  end if;

  if exists (
    select 1 from coach_blackouts b
    where b.starts_at < slot_end and b.ends_at > slot_start
  ) then
    return false;
  end if;

  -- Buffer is applied around existing bookings, not around this one, so a
  -- 15-minute buffer keeps back-to-back calls off each other.
  if exists (
    select 1 from bookings bk
    where bk.status = 'booked'
      and bk.starts_at - make_interval(mins => buffer_min) < slot_end
      and bk.ends_at   + make_interval(mins => buffer_min) > slot_start
  ) then
    return false;
  end if;

  return true;
end $$;

-- ===== BOOK =====
-- Callable by a client for themselves, or by the coach for anyone.
grant execute on function public.slot_is_open(timestamptz, timestamptz) to authenticated;

-- ===== CANCEL =====
create or replace function public.cancel_booking(booking_id uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select client_id into owner from bookings where id = booking_id;
  if owner is null then
    raise exception 'That booking no longer exists.';
  end if;
  if not public.is_coach() and owner <> auth.uid() then
    raise exception 'That is not your booking.';
  end if;

  update bookings
     set status = 'cancelled',
         cancelled_by = case when public.is_coach() then 'coach' else 'client' end,
         cancelled_at = now(),
         coach_note = case
           when public.is_coach() and coalesce(reason,'') <> ''
           then trim(both from coalesce(coach_note,'') || ' ' || reason)
           else coach_note end
   where id = booking_id;
end $$;

revoke all on function public.cancel_booking(uuid, text) from public;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ===== BLACKOUT HELPER =====
-- Takes plain dates and resolves them to real instants using the coach's
-- timezone, server-side. Doing this in the browser would use whatever zone
-- the laptop is in — wrong the moment he blacks out travel days from a hotel
-- in a different zone. end_date is inclusive: Sep 3-7 blocks all of the 7th.
create or replace function public.add_blackout(
  start_date date,
  end_date date,
  reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  new_id uuid := gen_random_uuid();
begin
  if not public.is_coach() then
    raise exception 'Only the coach can set blackout dates.';
  end if;
  if end_date < start_date then
    raise exception 'The end date is before the start date.';
  end if;

  select timezone into tz from coach_call_settings where id = 1;
  tz := coalesce(tz, 'America/New_York');

  insert into coach_blackouts (id, starts_at, ends_at, reason)
  values (
    new_id,
    (start_date::timestamp) at time zone tz,
    ((end_date + 1)::timestamp) at time zone tz,
    coalesce(reason, '')
  );
  return new_id;
end $$;

revoke all on function public.add_blackout(date, date, text) from public;
grant execute on function public.add_blackout(date, date, text) to authenticated;

-- ===== CALL TYPES (Update 77) =====

-- Editable in the app rather than fixed in a CHECK constraint, so changing
-- your offer never needs another migration.
create table call_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_minutes int not null default 30 check (duration_minutes between 5 and 240),
  description text default '',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Placeholders only — rename these in Calls → Call types to match what you
-- actually run. Seeded only when the table is empty.
insert into call_types (name, duration_minutes, description, position)
select * from (values
  ('Quick check-in',   15, 'Short catch-up between check-ins.', 1),
  ('Coaching call',    30, 'Standard one-to-one.',              2),
  ('Deep dive review', 60, 'Full program and nutrition review.',3)
) as seed(name, duration_minutes, description, position)
where not exists (select 1 from call_types);

alter table bookings add column call_type_id uuid references call_types(id) on delete set null;
create index bookings_call_type_idx on bookings (call_type_id);

alter table call_types enable row level security;
drop policy if exists "everyone reads call types" on call_types;
create policy "coach manages call types"  on call_types for all    using (is_coach());
-- Clients need to read these to pick one when booking.
create policy "everyone reads call types" on call_types for select using (auth.uid() is not null);

-- Supabase's default privileges normally cover new tables, but stating it
-- outright means this doesn't depend on that default still being in place.
grant select, insert, update, delete on call_types to authenticated;

-- ===== BOOK, NOW TYPE-AWARE =====
-- Dropped rather than replaced: the argument list is changing, and leaving the
-- old 3-arg version in place would make the RPC call ambiguous.

create or replace function public.book_call(
  slot_start timestamptz,
  note text default '',
  target_client_id uuid default null,
  target_call_type_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg coach_call_settings%rowtype;
  ct call_types%rowtype;
  who uuid;
  mins int;
  slot_end timestamptz;
  new_id uuid := gen_random_uuid();
  room text;
begin
  select * into cfg from coach_call_settings where id = 1;
  if cfg is null then
    raise exception 'Call settings are not set up yet.';
  end if;

  who := coalesce(target_client_id, auth.uid());
  if who is null then
    raise exception 'You must be signed in to book a call.';
  end if;
  if target_client_id is not null and target_client_id <> auth.uid() and not public.is_coach() then
    raise exception 'You can only book calls for yourself.';
  end if;
  if not public.is_coach() and not cfg.booking_enabled then
    raise exception 'Booking is closed right now.';
  end if;

  -- Length comes from the chosen type; the global setting is only a fallback
  -- for bookings made without one.
  if target_call_type_id is not null then
    select * into ct from call_types where id = target_call_type_id;
    if ct is null then
      raise exception 'That call type no longer exists.';
    end if;
    if not ct.active and not public.is_coach() then
      raise exception 'That call type is not available to book.';
    end if;
    mins := ct.duration_minutes;
  else
    mins := cfg.slot_minutes;
  end if;

  slot_end := slot_start + make_interval(mins => mins);

  if not public.is_coach() then
    if slot_start < now() + make_interval(hours => cfg.min_notice_hours) then
      raise exception 'That is too soon — calls need at least % hours notice.', cfg.min_notice_hours;
    end if;
    if slot_start > now() + make_interval(days => cfg.max_days_ahead) then
      raise exception 'That is further ahead than bookings are open for.';
    end if;
    if not public.slot_is_open(slot_start, slot_end) then
      raise exception 'That time is not available any more. Pick another slot.';
    end if;
  end if;

  room := 'workhorse-' || encode(extensions.gen_random_bytes(9), 'hex');

  insert into bookings (id, client_id, starts_at, ends_at, client_note, video_url, call_type_id)
  values (new_id, who, slot_start, slot_end, coalesce(note, ''),
          rtrim(cfg.video_base, '/') || '/' || room, target_call_type_id);

  return new_id;
exception
  when exclusion_violation then
    raise exception 'Someone just took that slot. Pick another time.';
end $$;

revoke all on function public.book_call(timestamptz, text, uuid, uuid) from public;
grant execute on function public.book_call(timestamptz, text, uuid, uuid) to authenticated;

-- ===== CHECK-IN NOTES + BILLING FIELDS (Update 78) =====
-- Recreates the coach's Asana check-in board inside the app: a per-check-in
-- snapshot (status/macros/program/cardio) with four separate note fields, and
-- persistent billing fields on the client's profile.
alter table checkins add column status text not null default 'pending'
  check (status in ('pending','done'));
alter table checkins add column current_macros text;
alter table checkins add column training_program text;
alter table checkins add column cardio text;
alter table checkins add column coach_notes text default '';
alter table checkins add column training_notes text default '';
alter table checkins add column nutrition_notes text default '';
alter table checkins add column other_notes text default '';

alter table profiles add column payment_plan text;
alter table profiles add column contract_ends date;
alter table profiles add column split_ends date;

-- ===== CHECK-IN STEPS/BIOFEEDBACK + CLIENT START DATE (Update 79) =====
alter table checkins add column steps numeric;
alter table checkins add column biofeedback text;
alter table profiles add column start_date date;
