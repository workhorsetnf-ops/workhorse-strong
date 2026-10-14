-- ===== EVENT COUNTDOWN + PEAK WEEK (Update 104) =====
-- Safe to re-run. Needs Update 91's SQL (peak / reverse / diet break phases).
alter table profiles add column if not exists event_name text default '';
alter table profiles add column if not exists event_date date;
