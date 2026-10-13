-- ===== MEASUREMENTS + PHOTOS (Update 96) =====
-- Safe to re-run. Needs nothing from Updates 89-95.

-- The sheet's full measurement log. Existing "arms" and "thighs" become the
-- right side; left side, shoulders, calf and weight are new.
alter table body_measurements add column if not exists weight numeric;
alter table body_measurements add column if not exists shoulders numeric;
alter table body_measurements add column if not exists arm_l numeric;
alter table body_measurements add column if not exists thigh_l numeric;
alter table body_measurements add column if not exists calf numeric;
alter table body_measurements add column if not exists notes text default '';

-- The body-fat estimate (US Navy tape method) needs height and sex.
alter table profiles add column if not exists height_in int;
alter table profiles add column if not exists sex text default 'male';
do $$ begin
  alter table profiles add constraint profiles_sex_check check (sex in ('male','female'));
exception when duplicate_object then null; end $$;

-- Let the coach enter or fix measurements too (clients already can).
drop policy if exists "coach manages measurements" on body_measurements;
create policy "coach manages measurements" on body_measurements for all using (is_coach()) with check (is_coach());

-- A note per check-in photo set, shown on the Progress Photos page.
alter table checkins add column if not exists photo_note text default '';
