-- Update 120: check-in frequency (weekly / every 2 weeks / monthly = every 4 weeks).
-- Safe to re-run. Every existing client stays weekly.
alter table profiles add column if not exists checkin_frequency text not null default 'weekly';
do $$ begin
  alter table profiles add constraint profiles_checkin_frequency_check
    check (checkin_frequency in ('weekly', 'biweekly', 'monthly'));
exception when duplicate_object then null; end $$;
