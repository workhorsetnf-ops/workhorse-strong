-- ===== FOOD LOG + MACRO CALCULATOR (Update 97) =====
-- Safe to re-run. Run Update 93's SQL first (this builds on the meal plan).

-- Food log lines get the sheet's columns: which meal, grams and fiber.
alter table meal_logs add column if not exists meal text default '';
alter table meal_logs add column if not exists grams numeric;
alter table meal_logs add column if not exists fiber_g numeric default 0;

-- Calculator inputs remembered per client (some may already exist from 95/96).
alter table profiles add column if not exists age int;
alter table profiles add column if not exists height_in int;
alter table profiles add column if not exists sex text default 'male';
alter table profiles add column if not exists activity_level text default 'light-schedule';
alter table profiles add column if not exists body_fat numeric;

-- Let the coach fix a client's food log (clients already can).
drop policy if exists "coach manages meal logs" on meal_logs;
create policy "coach manages meal logs" on meal_logs for all using (is_coach()) with check (is_coach());
