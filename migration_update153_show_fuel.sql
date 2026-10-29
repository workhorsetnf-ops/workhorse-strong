-- Update 153: show-day fueling plan
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Optional bell / match time on a show, so the fuel plan can be timed to it.
alter table client_events add column if not exists start_time time;
