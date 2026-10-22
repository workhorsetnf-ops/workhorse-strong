-- Update 124: saved warm-ups and cool-downs, reusable across programs.
-- Loading one into a workout COPIES it: editing the library later never
-- changes a program that already uses it. Coach-only. Safe to re-run.
create table if not exists routine_library (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'warmup' check (kind in ('warmup', 'cooldown')),
  name text not null,
  body text not null default '',
  video_url text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists routine_library_kind_name on routine_library (kind, lower(name));
alter table routine_library enable row level security;
drop policy if exists "coach manages routines" on routine_library;
create policy "coach manages routines" on routine_library for all using (is_coach()) with check (is_coach());
