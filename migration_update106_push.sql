-- ===== PUSH NOTIFICATIONS (Update 106) =====
-- Safe to re-run.

-- One row per phone/browser that said yes to notifications.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text default '',
  created_at timestamptz default now(),
  last_ok_at timestamptz
);
alter table push_subscriptions enable row level security;
drop policy if exists "users manage own push subscriptions" on push_subscriptions;
create policy "users manage own push subscriptions" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists push_subscriptions_user on push_subscriptions (user_id);

-- What each person wants to be nudged about (clients and coach).
create table if not exists reminder_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  workout boolean not null default true,     -- morning: today's session
  food boolean not null default true,        -- evening: no food logged
  habits boolean not null default true,      -- evening: habits left
  checkin boolean not null default true,     -- check-in due / overdue (coach: new check-ins)
  messages boolean not null default true,    -- new message
  slipping boolean not null default true,    -- coach only: clients going quiet
  updated_at timestamptz default now()
);
alter table reminder_prefs enable row level security;
drop policy if exists "users manage own reminder prefs" on reminder_prefs;
create policy "users manage own reminder prefs" on reminder_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "coach reads reminder prefs" on reminder_prefs;
create policy "coach reads reminder prefs" on reminder_prefs for select using (is_coach());

-- When someone last opened the app (for "going quiet" alerts).
alter table profiles add column if not exists last_seen_at timestamptz;
