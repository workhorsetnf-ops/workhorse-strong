-- Update 122: Accountability Operating System, part 1:
-- adherence tiers + quick check-in. Safe to re-run.
--
-- Existing clients stay OFF the tier system (no new prompts) until you turn a
-- tier on for them on the Scorecard page. Clients created from now on start
-- on Tier 3 (daily quick check-in) automatically, as the doc says.
alter table profiles add column if not exists adherence_tier int;
alter table profiles add column if not exists tier_since date;
do $$ begin
  alter table profiles add constraint profiles_adherence_tier_check check (adherence_tier in (1, 2, 3));
exception when duplicate_object then null; end $$;
alter table profiles alter column adherence_tier set default 3;
alter table profiles alter column tier_since set default current_date;

-- Quick check-in rides on the existing daily log row for the day.
alter table daily_logs add column if not exists quick_checkin_at timestamptz;
alter table daily_logs add column if not exists note text;
