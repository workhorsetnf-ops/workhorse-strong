-- Update 140: call & task reminders
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- Calls booked on the Calls page and timed tasks on Home get a push
-- notification a set number of minutes before they start, with the call link
-- one tap away. The coach also gets a short "Today" rundown each morning.

-- Tasks can now have a time, a link (Zoom, Meet, a doc...) and a reminder.
alter table coach_tasks add column if not exists due_time time;
alter table coach_tasks add column if not exists link text not null default '';
alter table coach_tasks add column if not exists remind_minutes int;     -- null = no push
do $$ begin
  alter table coach_tasks add constraint coach_tasks_remind_range check (remind_minutes is null or remind_minutes between 0 and 240);
exception when duplicate_object then null; end $$;

-- Per-person call reminder settings (coach and clients each choose).
alter table reminder_prefs add column if not exists calls boolean not null default true;
alter table reminder_prefs add column if not exists call_lead_minutes int not null default 15;
do $$ begin
  alter table reminder_prefs add constraint reminder_prefs_call_lead_range check (call_lead_minutes between 0 and 120);
exception when duplicate_object then null; end $$;

-- What has already been sent, so a reminder fires once even though the job
-- runs every 5 minutes. The server claims a row before sending; if two runs
-- overlap, only one of them gets the row.
create table if not exists agenda_sends (
  kind text not null check (kind in ('call','task','digest')),
  item_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  for_date date not null,
  sent_at timestamptz not null default now(),
  primary key (kind, item_id, user_id, for_date)
);
alter table agenda_sends enable row level security;
-- No policies on purpose: only the server (service role) reads or writes it.
create index if not exists agenda_sends_sent_idx on agenda_sends (sent_at);
