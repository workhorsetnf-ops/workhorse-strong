-- Update 150: snap-a-photo food logging
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
alter table meal_logs add column if not exists source text;                     -- 'photo' when estimated from a picture
alter table meal_logs add column if not exists estimated boolean not null default false;

-- Daily cap on AI photo estimates per person (keeps the API bill predictable).
create table if not exists ai_usage (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  day date not null,
  count int not null default 0,
  primary key (user_id, kind, day)
);
alter table ai_usage enable row level security;
-- No policies on purpose: only the server (service role) touches it.
