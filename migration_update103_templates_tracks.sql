-- ===== TEMPLATES + TRACKS (Update 103) =====
-- Safe to re-run. Needs Updates 89, 90, 92 and 93's SQL (already run).

-- A saved meal plan / habit set / supplement stack / cardio plan.
create table if not exists plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('meal_plan','habits','supplements','cardio')),
  data jsonb not null default '{}',
  notes text default '',
  created_at timestamptz default now()
);
alter table plan_templates enable row level security;
drop policy if exists "coach manages templates" on plan_templates;
create policy "coach manages templates" on plan_templates for all using (is_coach()) with check (is_coach());

-- A group track: one program plus templates, given to many clients at once.
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  price text default '',
  program_id uuid references programs(id) on delete set null,
  meal_template_id uuid references plan_templates(id) on delete set null,
  habits_template_id uuid references plan_templates(id) on delete set null,
  supps_template_id uuid references plan_templates(id) on delete set null,
  cardio_template_id uuid references plan_templates(id) on delete set null,
  scale_meals boolean not null default true,
  created_at timestamptz default now()
);
alter table tracks enable row level security;
drop policy if exists "coach manages tracks" on tracks;
create policy "coach manages tracks" on tracks for all using (is_coach()) with check (is_coach());
-- Which track a client is on (blank = 1:1 coaching).
alter table profiles add column if not exists track_id uuid references tracks(id) on delete set null;
drop policy if exists "client reads own track" on tracks;
create policy "client reads own track" on tracks for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.track_id = tracks.id));
