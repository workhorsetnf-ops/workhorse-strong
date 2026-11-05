-- Update 169: "How did that feel?" after each workout
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- One answer per client, per session, per day: effort 1-10 and an optional
-- note. The coach sees them on the weekly review and the AI check-in reads them.
create table if not exists session_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  day_id uuid references program_days(id) on delete set null,
  day_label text not null default '',
  session_date date not null,
  rpe int not null check (rpe between 1 and 10),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (client_id, day_id, session_date)
);
create index if not exists session_feedback_client_date_idx on session_feedback (client_id, session_date desc);
alter table session_feedback enable row level security;
drop policy if exists "client manages own session feedback" on session_feedback;
drop policy if exists "coach reads session feedback" on session_feedback;
create policy "client manages own session feedback" on session_feedback for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "coach reads session feedback" on session_feedback for select using (is_coach());
grant select, insert, update, delete on session_feedback to authenticated;
