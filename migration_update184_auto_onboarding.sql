-- Update 184: hands-free onboarding for new 1:1 clients.
-- Run once in the Supabase SQL Editor BEFORE merging. Safe to re-run.
--
-- Someone pays (Newie / Stripe) with an email the app has never seen ->
-- the app makes their account, gives them the contract and onboarding forms,
-- and Kit emails them a setup link. Signing the contract sends the welcome
-- email; finishing the forms asks them to book the onboarding call.

-- ===== SETTINGS (single row) =====
create table if not exists onboarding_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  contract_template_id uuid references contract_templates(id) on delete set null,
  form_ids uuid[] not null default '{}',
  call_type_id uuid references call_types(id) on delete set null,
  kit_setup_sequence_id bigint,      -- "set up your account" email (has the setup link)
  kit_welcome_sequence_id bigint,    -- welcome email, sent once the contract is signed
  updated_at timestamptz not null default now()
);
-- the two Kit sequences made for this (Client onboarding: 1. Set up your account / 2. Welcome)
insert into onboarding_settings (id, kit_setup_sequence_id, kit_welcome_sequence_id) values (1, 2974471, 2974472) on conflict (id) do nothing;
alter table onboarding_settings enable row level security;
drop policy if exists "coach manages onboarding settings" on onboarding_settings;
drop policy if exists "signed in reads onboarding settings" on onboarding_settings;
create policy "coach manages onboarding settings" on onboarding_settings for all using (is_coach()) with check (is_coach());
-- clients read it to know which call type is the onboarding call (nothing secret in here)
create policy "signed in reads onboarding settings" on onboarding_settings for select using (auth.uid() is not null);
grant select, insert, update on onboarding_settings to authenticated;

-- ===== WHERE EACH NEW CLIENT IS =====
alter table profiles add column if not exists onboarding_started_at timestamptz;   -- set when a payment made the account
alter table profiles add column if not exists onboarding_welcome_at timestamptz;   -- welcome email handed to Kit
alter table profiles add column if not exists onboarding_source text;              -- e.g. 'stripe:sub_123'

-- ===== ONE-TIME SETUP LINKS =====
-- Only a hash of the token is stored. No policies: only the server (service
-- role) ever reads or writes these.
create table if not exists onboarding_tokens (
  token_hash text primary key,
  client_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_tokens_client_idx on onboarding_tokens (client_id);
alter table onboarding_tokens enable row level security;

-- ===== OPEN SLOTS FOR CLIENT BOOKING =====
-- Clients can't read other people's bookings, so the free times are worked
-- out here. Same rules book_call checks: weekly hours, blackouts, buffer,
-- notice and how far ahead booking is open. Starts every 30 minutes.
create or replace function public.open_slots(target_call_type_id uuid default null)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  cfg coach_call_settings%rowtype;
  mins int;
  d date;
  today date;
  rule record;
  m int;
  s timestamptz;
begin
  if auth.uid() is null then return; end if;
  select * into cfg from coach_call_settings where id = 1;
  if cfg is null then return; end if;
  if target_call_type_id is not null then
    select duration_minutes into mins from call_types where id = target_call_type_id and active;
  end if;
  mins := coalesce(mins, cfg.slot_minutes);
  today := (now() at time zone cfg.timezone)::date;
  for d in select generate_series(today, today + cfg.max_days_ahead, interval '1 day')::date loop
    for rule in select a.start_minute, a.end_minute from coach_availability a
                where a.active and a.weekday = extract(isodow from d)::int - 1 order by a.start_minute loop
      m := rule.start_minute;
      while m + mins <= rule.end_minute loop
        s := (d::timestamp + make_interval(mins => m)) at time zone cfg.timezone;
        if s >= now() + make_interval(hours => cfg.min_notice_hours)
           and s <= now() + make_interval(days => cfg.max_days_ahead)
           and public.slot_is_open(s, s + make_interval(mins => mins)) then
          starts_at := s; ends_at := s + make_interval(mins => mins);
          return next;
        end if;
        m := m + 30;
      end loop;
    end loop;
  end loop;
end $$;
revoke all on function public.open_slots(uuid) from public;
grant execute on function public.open_slots(uuid) to authenticated;
