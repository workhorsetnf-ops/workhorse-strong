-- Update 180: Workhorse 90 (90-day group with a monthly group call)
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Same group programming as the 50 dollar monthly group. Paid in full (495)
-- or in 2 payments of 249 six weeks apart. Access lasts 90 days per purchase.

-- which group offer each member is on, and how long it lasts
alter table profiles add column if not exists group_tier text not null default 'monthly';
alter table profiles drop constraint if exists profiles_group_tier_check;
alter table profiles add constraint profiles_group_tier_check check (group_tier in ('monthly', 'w90'));
alter table profiles add column if not exists group_option text;
alter table profiles drop constraint if exists profiles_group_option_check;
alter table profiles add constraint profiles_group_option_check check (group_option is null or group_option in ('full', 'split'));
alter table profiles add column if not exists group_access_until timestamptz;   -- end of the 90 days (null = runs until cancelled)
alter table profiles add column if not exists group_last_checkout text;        -- so one payment never adds 90 days twice

-- a group member is locked when not paid up, or when their 90 days are over
create or replace function public.group_locked(uid uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from profiles where id = uid and plan = 'group'
                  and (coalesce(group_status, 'pending') not in ('active', 'past_due')
                       or (group_access_until is not null and group_access_until <= now())));
$fn$;
grant execute on function public.group_locked(uuid) to authenticated;

-- the monthly group call
create table if not exists group_calls (
  id uuid primary key default gen_random_uuid(),
  tier text not null default 'w90' check (tier in ('w90')),
  title text not null default 'Workhorse 90 group call' check (length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 10 and 240),
  link_url text not null check (link_url ~* '^https?://'),
  notes text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists group_calls_starts_idx on group_calls (starts_at);
alter table group_calls enable row level security;

create or replace function public.is_w90_member(uid uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from profiles where id = uid and plan = 'group' and group_tier = 'w90')
     and not group_locked(uid);
$fn$;
grant execute on function public.is_w90_member(uuid) to authenticated;

drop policy if exists "coach manages group calls" on group_calls;
create policy "coach manages group calls" on group_calls for all using (is_coach()) with check (is_coach());
drop policy if exists "workhorse 90 members read group calls" on group_calls;
create policy "workhorse 90 members read group calls" on group_calls for select using (is_w90_member(auth.uid()));
grant select, insert, update, delete on group_calls to authenticated;

-- reminders before the call go out through the existing reminder job
do $fn$ begin
  if to_regclass('public.agenda_sends') is not null then
    alter table agenda_sends drop constraint if exists agenda_sends_kind_check;
    alter table agenda_sends add constraint agenda_sends_kind_check check (kind in ('call', 'task', 'digest', 'group_call'));
  end if;
end $fn$;
