-- Update 183: 3-day option for the group tracks.
-- Run once in the Supabase SQL Editor BEFORE merging. Safe to re-run.
--
-- Each group track can now have a second, 3-day program alongside its normal
-- (4-day) one. Members pick 3 or 4 days a week at sign-up; the app gives them
-- the matching program when they pay.

-- the track's 3-day version (blank = the track only comes in its normal version)
alter table tracks add column if not exists program_3day_id uuid references programs(id) on delete set null;

-- what the member picked at sign-up: 3 or 4 training days a week
alter table profiles add column if not exists group_days smallint not null default 4;
alter table profiles drop constraint if exists profiles_group_days_check;
alter table profiles add constraint profiles_group_days_check check (group_days in (3, 4));
