-- Update 121: payment schedule — Paid in full / Monthly / Bi-weekly + amount.
-- payment_date stays: the PIF date, or any one payment on the schedule.
-- payment_plan (free text) stays as payment notes. Safe to re-run.
alter table profiles add column if not exists payment_type text;
alter table profiles add column if not exists payment_amount numeric;
do $$ begin
  alter table profiles add constraint profiles_payment_type_check
    check (payment_type in ('pif', 'monthly', 'biweekly'));
exception when duplicate_object then null; end $$;

-- Best guess for existing clients from what's typed in the old payment plan
-- box. Only fills clients with no type yet; anything unclear stays blank.
update profiles set payment_type = case
    when payment_plan ~* '(\mpif\M|paid in full|pay in full|in full)' then 'pif'
    when payment_plan ~* '(bi-?week|every (2|two) weeks|fortnight)' then 'biweekly'
    when payment_plan ~* '(/ ?mo\M|month)' then 'monthly'
  end
where payment_type is null and payment_plan is not null
  and payment_plan ~* '(\mpif\M|paid in full|pay in full|in full|bi-?week|every (2|two) weeks|fortnight|/ ?mo\M|month)';
