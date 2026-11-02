-- Update 158: one-tap check-in texts
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- checkin_text_settings: the coach's three reminder texts (one row).
-- checkin_texts: which clients the coach tapped "Text" for, per day and slot,
-- so the list ticks off the same on his phone and his computer.

create table if not exists checkin_text_settings (
  id int primary key default 1 check (id = 1),
  morning_text text not null default '',
  evening_text text not null default '',
  late_text text not null default '',
  updated_at timestamptz not null default now()
);
insert into checkin_text_settings (id) values (1) on conflict (id) do nothing;
alter table checkin_text_settings enable row level security;
drop policy if exists "coach manages text settings" on checkin_text_settings;
create policy "coach manages text settings" on checkin_text_settings for all using (is_coach()) with check (is_coach());
grant select, insert, update on checkin_text_settings to authenticated;

create table if not exists checkin_texts (
  client_id uuid not null references profiles(id) on delete cascade,
  for_date date not null,
  slot text not null check (slot in ('morning', 'evening')),
  texted_at timestamptz not null default now(),
  primary key (client_id, for_date, slot)
);
alter table checkin_texts enable row level security;
drop policy if exists "coach manages check-in texts" on checkin_texts;
create policy "coach manages check-in texts" on checkin_texts for all using (is_coach()) with check (is_coach());
grant select, insert, update, delete on checkin_texts to authenticated;
create index if not exists checkin_texts_date_idx on checkin_texts (for_date);
