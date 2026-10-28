-- Update 139: announcements
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- An announcement is pinned to the top of every client's Home screen until
-- they tap "Got it" (or it expires, or the coach ends it). The coach sees who
-- has and hasn't seen it.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '',
  link_url text,                       -- optional "Open" button (event page, booking link…)
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,              -- null = stays until ended or everyone has seen it
  ended_at timestamptz                 -- coach took it down early
);
create index if not exists announcements_created_idx on announcements (created_at desc);

create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

alter table announcements enable row level security;
alter table announcement_reads enable row level security;

drop policy if exists "coach manages announcements" on announcements;
drop policy if exists "clients read live announcements" on announcements;
create policy "coach manages announcements" on announcements for all using (is_coach()) with check (is_coach());
create policy "clients read live announcements" on announcements for select
  using (auth.role() = 'authenticated' and ended_at is null and (expires_at is null or expires_at > now()));

drop policy if exists "coach reads all announcement reads" on announcement_reads;
drop policy if exists "read own announcement reads" on announcement_reads;
drop policy if exists "mark live announcement seen" on announcement_reads;
create policy "coach reads all announcement reads" on announcement_reads for select using (is_coach());
create policy "read own announcement reads" on announcement_reads for select using (profile_id = auth.uid());
create policy "mark live announcement seen" on announcement_reads for insert with check (
  profile_id = auth.uid()
  and exists (select 1 from announcements a where a.id = announcement_id
               and a.ended_at is null and (a.expires_at is null or a.expires_at > now()))
);

do $$ begin alter publication supabase_realtime add table announcements;
exception when duplicate_object then null; end $$;
