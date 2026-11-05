-- Update 164: clients train on their own days
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- day_map says which weekday each program Day N runs on for this client,
-- e.g. {"1": 2, "4": 6} = Day 1 on Tuesday, Day 4 on Saturday (1 = Monday …
-- 7 = Sunday). Days not listed keep their default (Day N on weekday N).
-- Null = the program exactly as written.
alter table program_assignments add column if not exists day_map jsonb;

-- Only a JSON object of "1"-"7" → 1-7, so a bad value can't break schedules.
create or replace function public.valid_day_map(m jsonb) returns boolean
language sql immutable as $$
  select m is null or (
    jsonb_typeof(m) = 'object'
    and not exists (
      select 1 from jsonb_each(m) e
      where e.key !~ '^[1-7]$'
         or jsonb_typeof(e.value) <> 'number'
         or (e.value::text)::numeric not in (1, 2, 3, 4, 5, 6, 7)
    )
  )
$$;
alter table program_assignments drop constraint if exists program_assignments_day_map_check;
alter table program_assignments add constraint program_assignments_day_map_check check (valid_day_map(day_map));

-- Clients can't update program_assignments (coach-only), so they change their
-- days through this, which only ever touches their own row and only day_map.
create or replace function public.set_my_training_days(new_map jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if new_map is not null and jsonb_typeof(new_map) = 'object' and new_map = '{}'::jsonb then new_map := null; end if;
  if not valid_day_map(new_map) then raise exception 'Invalid training days'; end if;
  update program_assignments set day_map = new_map where client_id = auth.uid();
  if not found then raise exception 'No program assigned'; end if;
end $$;
revoke all on function public.set_my_training_days(jsonb) from public, anon;
grant execute on function public.set_my_training_days(jsonb) to authenticated;
