-- Update 166: $50/month group offer (Stripe)
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- Group members sign up themselves at /start, pay through Stripe, and get a
-- self-run program: their track's program, logging, food, steps, the daily
-- quick check-in, Community and member group chats. No weekly check-ins, form
-- checks, calls or direct messages with the coach.

-- ---- who is a group member, and their billing state -----------------------
alter table profiles add column if not exists plan text not null default 'coaching';
alter table profiles drop constraint if exists profiles_plan_check;
alter table profiles add constraint profiles_plan_check check (plan in ('coaching', 'group'));
-- pending = signed up, not paid yet; active; past_due = a payment failed and
-- Stripe is retrying (still has access); canceled = no access
alter table profiles add column if not exists group_status text;
alter table profiles drop constraint if exists profiles_group_status_check;
alter table profiles add constraint profiles_group_status_check check (group_status is null or group_status in ('pending', 'active', 'past_due', 'canceled'));
alter table profiles add column if not exists group_status_at timestamptz;      -- time of the Stripe event it came from
alter table profiles add column if not exists group_track_id uuid references tracks(id) on delete set null;
alter table profiles add column if not exists group_joined_at timestamptz;
alter table profiles add column if not exists group_period_end timestamptz;     -- paid through
alter table profiles add column if not exists group_cancel_at_period_end boolean not null default false;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
create index if not exists profiles_plan_idx on profiles (plan);
create unique index if not exists profiles_stripe_sub_idx on profiles (stripe_subscription_id) where stripe_subscription_id is not null;
-- (clients still can't edit any of these: the profile guard only lets them
-- change their own personal details)

-- ---- which tracks are sold in the group offer ------------------------------
alter table tracks add column if not exists group_offer boolean not null default false;
alter table tracks add column if not exists group_position int not null default 0;
alter table tracks add column if not exists chat_group_id uuid references message_groups(id) on delete set null;

-- ---- helpers for the policies below -----------------------------------------
create or replace function public.is_group_plan(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and plan = 'group')
$$;
-- a group member who isn't paid up (never paid, or canceled)
create or replace function public.group_locked(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and plan = 'group' and coalesce(group_status, 'pending') not in ('active', 'past_due'))
$$;
grant execute on function public.is_group_plan(uuid) to authenticated;
grant execute on function public.group_locked(uuid) to authenticated;

-- ---- enforce it in the database, not just the screens ----------------------
-- RESTRICTIVE policies are ANDed with the existing ones, so these only ever
-- take access away from group members; the coach and 1:1 clients are untouched.

-- 1:1-only features: direct messages, weekly check-ins, form checks, calls
drop policy if exists "group members cannot message coach" on messages;
create policy "group members cannot message coach" on messages as restrictive for insert
  with check (is_coach() or not is_group_plan(auth.uid()));
drop policy if exists "group members no weekly checkins" on checkins;
create policy "group members no weekly checkins" on checkins as restrictive for insert
  with check (is_coach() or not is_group_plan(auth.uid()));
drop policy if exists "group members no form checks" on form_checks;
create policy "group members no form checks" on form_checks as restrictive for insert
  with check (is_coach() or not is_group_plan(auth.uid()));
do $$ begin
  if to_regclass('public.bookings') is not null then
    execute 'drop policy if exists "group members no calls" on bookings';
    execute 'create policy "group members no calls" on bookings as restrictive for insert with check (is_coach() or not is_group_plan(auth.uid()))';
  end if;
end $$;

-- the program itself (and logging) only while paid up
drop policy if exists "paid group members only (days)" on program_days;
create policy "paid group members only (days)" on program_days as restrictive for select
  using (is_coach() or not group_locked(auth.uid()));
drop policy if exists "paid group members only (exercises)" on program_exercises;
create policy "paid group members only (exercises)" on program_exercises as restrictive for select
  using (is_coach() or not group_locked(auth.uid()));
drop policy if exists "paid group members only (logging)" on workout_logs;
create policy "paid group members only (logging)" on workout_logs as restrictive for insert
  with check (is_coach() or not group_locked(auth.uid()));
drop policy if exists "paid group members only (log edits)" on workout_logs;
create policy "paid group members only (log edits)" on workout_logs as restrictive for update
  using (is_coach() or not group_locked(auth.uid()));
