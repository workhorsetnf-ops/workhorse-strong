-- Update 161: AI drafts that sound like Anthony
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- coach_voice: one row holding Anthony's own voice guide (phrases he uses,
--   words he never uses, how he opens and closes). Sent with every draft.
-- ai_replies: every AI draft next to what was actually sent. The changes
--   Anthony makes are the strongest example of his voice, so future drafts
--   learn from them. Drafts sent unedited are recorded too, so they are never
--   mistaken for something he wrote himself.
create table if not exists coach_voice (
  id int primary key default 1 check (id = 1),
  guide text not null default '',
  updated_at timestamptz not null default now()
);
insert into coach_voice (id) values (1) on conflict (id) do nothing;
alter table coach_voice enable row level security;
drop policy if exists "coach manages voice" on coach_voice;
create policy "coach manages voice" on coach_voice for all using (is_coach()) with check (is_coach());
grant select, insert, update on coach_voice to authenticated;

create table if not exists ai_replies (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid references checkins(id) on delete set null,
  client_id uuid not null references profiles(id) on delete cascade,
  draft text not null,
  sent text not null,
  channel text not null default 'feedback' check (channel in ('feedback', 'message')),
  created_at timestamptz not null default now()
);
create index if not exists ai_replies_created_idx on ai_replies (created_at desc);
create index if not exists ai_replies_client_idx on ai_replies (client_id, created_at desc);
alter table ai_replies enable row level security;
drop policy if exists "coach manages ai replies" on ai_replies;
create policy "coach manages ai replies" on ai_replies for all using (is_coach()) with check (is_coach());
grant select, insert on ai_replies to authenticated;
