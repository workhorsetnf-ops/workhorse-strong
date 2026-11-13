-- Update 182: group members adjust their own macros, by the nutrition guide
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- (Written with named quote tags and no doubled quotes, which the Supabase editor can mis-read.)
--
-- The rules, straight from the guide:
--   * give any change two full weeks (first check three weeks after joining)
--   * at least 6 of 7 days logged, both of the last two weeks
--   * at least 4 weigh-ins in the last 7 days and in the comparison week
--   * cutting and the weekly average dropped less than 0.5 percent in two weeks:
--     30 g of carbs off. Building and it rose less than 0.25 percent: 30 g on.
--   * protein and fat never change, carbs never go under 100 g
-- Everything is worked out here from the member's own logs, never taken from
-- the app, so the change can't be triggered early or sized differently.

-- 1. the member guard lets this one function change this one member's macros
create or replace function public.guard_client_profile_update()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  editable text[] := array['full_name','phone','age','height_in','sex','goal','limitations','last_seen_at','avatar_url'];
begin
  if auth.uid() is null or is_coach() then return new; end if;
  -- set only inside apply_self_adjustment(), for this row, for one transaction
  if current_setting('workhorse.self_adjust', true) = old.id::text then return new; end if;
  new := jsonb_populate_record(new, to_jsonb(old) - editable);
  return new;
end $fn$;

-- 2. is a change due? (read-only: the Eat tab card shows this)
create or replace function public.self_adjust_check(p_today date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
  p record;
  today date := current_date;
  g_goal text;
  step int := 30;
  carb_floor int := 100;
  anchor date;
  changed boolean;
  next_check date;
  logged_b int; logged_a int;
  wb int; w0 int; avg_b numeric; avg_0 numeric; pct numeric;
  kcal int;
  newc int;
  r jsonb;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select id, plan, goal, phase, protein_g, carbs_g, fat_g, calories, group_joined_at, created_at
    into p from profiles where id = me;
  if p.id is null or p.plan is distinct from 'group' or group_locked(me) then
    raise exception 'This is for group members.' using errcode = '42501';
  end if;
  -- the phone sends its own date; allow a day either way for time zones, nothing more
  if p_today is not null and abs(p_today - current_date) <= 1 then today := p_today; end if;

  g_goal := case when p.goal in ('cut', 'build', 'maintain') then p.goal
               when p.phase in ('cut', 'build') then p.phase
               else 'maintain' end;
  r := jsonb_build_object('goal', g_goal, 'step', step, 'floor', carb_floor, 'today', today,
         'from', jsonb_build_object('p', p.protein_g, 'c', p.carbs_g, 'f', p.fat_g, 'kcal', p.calories));
  if g_goal = 'maintain' or p.protein_g is null or p.carbs_g is null or p.fat_g is null then
    return r || jsonb_build_object('kind', 'none');
  end if;

  -- two full weeks after a change; three after joining (a week to compare against, then two)
  select max(created_at)::date into anchor from macro_changes where client_id = me;
  changed := anchor is not null;
  if not changed then anchor := coalesce(p.group_joined_at, p.created_at)::date; end if;
  next_check := anchor + case when changed then 14 else 21 end;
  r := r || jsonb_build_object('changed_on', case when changed then anchor end, 'next_check', next_check);
  if today < next_check then return r || jsonb_build_object('kind', 'wait'); end if;

  -- logged days: any food entry with numbers on it (meals, daily totals or synced)
  select count(distinct logged_on) filter (where logged_on between today - 7 and today - 1),
         count(distinct logged_on) filter (where logged_on between today - 14 and today - 8)
    into logged_b, logged_a
    from meal_logs
   where client_id = me and logged_on between today - 14 and today - 1
     and coalesce(protein_g, 0) + coalesce(carbs_g, 0) + coalesce(fat_g, 0) > 0;
  r := r || jsonb_build_object('logged_recent', logged_b, 'logged_prior', logged_a);
  if logged_b < 6 or logged_a < 6 then return r || jsonb_build_object('kind', 'logging'); end if;

  -- weekly averages: the last 7 days against the week two weeks before it
  select count(*) filter (where log_date between today - 7 and today - 1),
         count(*) filter (where log_date between today - 21 and today - 15),
         avg(weight) filter (where log_date between today - 7 and today - 1),
         avg(weight) filter (where log_date between today - 21 and today - 15)
    into wb, w0, avg_b, avg_0
    from daily_logs
   where client_id = me and weight > 0 and log_date between today - 21 and today - 1;
  r := r || jsonb_build_object('weighins_recent', wb, 'weighins_base', w0);
  if wb < 4 or w0 < 4 then return r || jsonb_build_object('kind', 'weighins'); end if;

  pct := (avg_b - avg_0) / avg_0 * 100;
  r := r || jsonb_build_object('avg_base', round(avg_0, 1), 'avg_recent', round(avg_b, 1),
              'change_lb', round(avg_b - avg_0, 1), 'change_pct', round(pct, 2));
  if (g_goal = 'cut' and pct <= -0.5) or (g_goal = 'build' and pct >= 0.25) then
    return r || jsonb_build_object('kind', 'moving');
  end if;
  if g_goal = 'cut' and p.carbs_g - step < carb_floor then return r || jsonb_build_object('kind', 'floor'); end if;

  newc := p.carbs_g + case when g_goal = 'cut' then -step else step end;
  kcal := coalesce(p.calories, p.protein_g * 4 + p.carbs_g * 4 + p.fat_g * 9) + (newc - p.carbs_g) * 4;
  return r || jsonb_build_object('kind', case when g_goal = 'cut' then 'down' else 'up' end,
                'to', jsonb_build_object('p', p.protein_g, 'c', newc, 'f', p.fat_g, 'kcal', kcal));
end $fn$;

-- 3. apply it: new targets, the history line, and the meal plan resized to match
create or replace function public.apply_self_adjustment(p_today date default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
  r jsonb;
  delta int;
  carb_src numeric;
  factor numeric;
  resized int := 0;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  perform 1 from profiles where id = me for update;   -- a double tap waits, then sees the new change and stops
  r := self_adjust_check(p_today);
  if coalesce(r ->> 'kind', 'none') not in ('down', 'up') then
    raise exception 'No change is due right now.' using errcode = 'P0001';
  end if;
  delta := (r -> 'to' ->> 'c')::int - (r -> 'from' ->> 'c')::int;

  perform set_config('workhorse.self_adjust', me::text, true);
  update profiles set carbs_g = (r -> 'to' ->> 'c')::int, calories = (r -> 'to' ->> 'kcal')::int where id = me;
  perform set_config('workhorse.self_adjust', 'off', true);

  insert into macro_changes (client_id, from_macros, to_macros, reason)
  values (me, r -> 'from', r -> 'to',
          format('Self-adjusted from the nutrition guide: weekly average %s lb over two weeks, %s/7 and %s/7 days logged. Carbs %s to %s g.',
                 r ->> 'change_lb', r ->> 'logged_recent', r ->> 'logged_prior', r -> 'from' ->> 'c', r -> 'to' ->> 'c'));

  -- carb-source foods only (mostly-carb foods like rice, oats, potatoes, fruit),
  -- scaled together so the plan moves by the same grams of carbs
  select sum(carbs100 * grams / 100) into carb_src
    from meal_plan_items
   where client_id = me and carbs100 >= 15
     and carbs100 * 4 >= 0.5 * (protein100 * 4 + carbs100 * 4 + fat100 * 9);
  if coalesce(carb_src, 0) >= 30 then
    factor := greatest(0.5, least(1.5, (carb_src + delta) / carb_src));
    update meal_plan_items
       set grams = case when grams * factor >= 50 then round(grams * factor / 5) * 5
                        else greatest(5, round(grams * factor)) end
     where client_id = me and carbs100 >= 15
       and carbs100 * 4 >= 0.5 * (protein100 * 4 + carbs100 * 4 + fat100 * 9);
    get diagnostics resized = row_count;
  end if;

  return r || jsonb_build_object('applied', true, 'plan_items_resized', resized,
                                 'next_check', coalesce((r ->> 'today')::date, current_date) + 14);
end $fn$;

revoke all on function public.self_adjust_check(date), public.apply_self_adjustment(date) from public, anon;
grant execute on function public.self_adjust_check(date), public.apply_self_adjustment(date) to authenticated;
