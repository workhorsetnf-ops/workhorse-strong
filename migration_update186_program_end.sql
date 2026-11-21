-- Update 186: reminders when a client's program is about to run out
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.

-- Coach notification setting (on by default).
alter table reminder_prefs add column if not exists programs boolean not null default true;

-- Which "program ending" reminders have gone out, so each one sends once.
-- bucket: 14 = two weeks left, 7 = one week left, 0 = the program has ended.
-- end_key: the end date for Auto-week clients; for Manual-week clients the
-- block/week they're on (their end date is only an estimate that slides).
-- A new end (next block added, new program assigned, week moved) starts fresh.
create table if not exists program_end_alerts (
  assignment_id uuid not null references program_assignments(id) on delete cascade,
  end_key text not null,
  bucket int not null check (bucket in (0, 7, 14)),
  coach_id uuid not null references profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (assignment_id, end_key, bucket, coach_id)
);
alter table program_end_alerts enable row level security;
-- No policies on purpose: only the server (service role) reads or writes it.
