-- ===== MEAL PLAN + SHOPPING LIST (Update 93) =====
-- Safe to re-run. Needs nothing from Updates 89-92.

-- Food library: macros per 100 g, shared by every client's plan.
create table if not exists food_library (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'Other' check (category in ('Protein','Carb','Fruit','Veg','Fat','Dairy','Snack','Other')),
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  fiber numeric not null default 0,
  created_at timestamptz default now()
);
alter table food_library enable row level security;
drop policy if exists "coach manages food library" on food_library;
create policy "coach manages food library" on food_library for all using (is_coach()) with check (is_coach());
drop policy if exists "signed-in users read food library" on food_library;
create policy "signed-in users read food library" on food_library for select using (auth.uid() is not null);

-- Starter foods from the coaching sheet (skips any you already have).
insert into food_library (name, category, protein, carbs, fat, fiber) values
  ('Chicken Breast (cooked)', 'Protein', 31, 0, 3.6, 0),
  ('93/7 Ground Beef (cooked)', 'Protein', 26, 0, 8, 0),
  ('Salmon (cooked)', 'Protein', 22, 0, 12, 0),
  ('Turkey Breast (deli)', 'Protein', 18, 2, 1.5, 0),
  ('Whole Eggs', 'Protein', 12.6, 0.7, 9.5, 0),
  ('Egg Whites', 'Protein', 11, 0.7, 0.2, 0),
  ('Greek Yogurt (nonfat)', 'Protein', 10, 3.6, 0.4, 0),
  ('Cottage Cheese (2%)', 'Protein', 11, 4, 2.3, 0),
  ('Whey Protein', 'Protein', 80, 8, 6, 0),
  ('White Rice (cooked)', 'Carb', 2.7, 28, 0.3, 0.4),
  ('Oats (dry)', 'Carb', 13, 68, 6.5, 10),
  ('Potato (baked)', 'Carb', 2.5, 21, 0.1, 2.2),
  ('Sweet Potato (baked)', 'Carb', 2, 21, 0.2, 3.3),
  ('Pasta (cooked)', 'Carb', 5.8, 31, 0.9, 1.8),
  ('Whole Wheat Bread', 'Carb', 13, 41, 3.4, 6),
  ('Flour Tortilla', 'Carb', 8, 49, 7.6, 3),
  ('Rice Cakes', 'Carb', 8, 80, 3, 4),
  ('Banana', 'Fruit', 1.1, 23, 0.3, 2.6),
  ('Blueberries', 'Fruit', 0.7, 14.5, 0.3, 2.4),
  ('Broccoli', 'Veg', 2.8, 7, 0.4, 2.6),
  ('Mixed Vegetables', 'Veg', 2.8, 7, 0.4, 4),
  ('Avocado', 'Fat', 2, 8.5, 14.7, 6.7),
  ('Olive Oil', 'Fat', 0, 0, 100, 0),
  ('Peanut Butter', 'Fat', 25, 20, 50, 6),
  ('Almonds', 'Fat', 21, 22, 50, 12.5)
on conflict (name) do nothing;

-- One plan per client: the fiber target and a note. Calorie and macro
-- targets come from the client's profile, same as the sheet's Profile tab.
create table if not exists meal_plans (
  client_id uuid primary key references profiles(id) on delete cascade,
  fiber_target int not null default 35,
  notes text default '',
  updated_at timestamptz default now()
);
-- Meals in the plan (Breakfast, Lunch...) with the swap line under each.
create table if not exists meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  label text not null default 'Meal',
  swap text default '',
  position int not null default 0,
  created_at timestamptz default now()
);
-- Foods in each meal. Macros per 100 g are copied from the library when the
-- food is picked, so the plan never changes behind the client's back.
create table if not exists meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meal_plan_meals(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  food_id uuid references food_library(id) on delete set null,
  food_name text not null,
  category text default 'Other',
  grams numeric not null default 100,
  protein100 numeric not null default 0,
  carbs100 numeric not null default 0,
  fat100 numeric not null default 0,
  fiber100 numeric not null default 0,
  note text default '',
  position int not null default 0,
  created_at timestamptz default now()
);
create index if not exists meal_plan_items_client on meal_plan_items (client_id);

alter table meal_plans enable row level security;
alter table meal_plan_meals enable row level security;
alter table meal_plan_items enable row level security;
drop policy if exists "coach manages meal plans" on meal_plans;
create policy "coach manages meal plans" on meal_plans for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own meal plan" on meal_plans;
create policy "client reads own meal plan" on meal_plans for select using (client_id = auth.uid());
drop policy if exists "coach manages plan meals" on meal_plan_meals;
create policy "coach manages plan meals" on meal_plan_meals for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own plan meals" on meal_plan_meals;
create policy "client reads own plan meals" on meal_plan_meals for select using (client_id = auth.uid());
drop policy if exists "coach manages plan items" on meal_plan_items;
create policy "coach manages plan items" on meal_plan_items for all using (is_coach()) with check (is_coach());
drop policy if exists "client reads own plan items" on meal_plan_items;
create policy "client reads own plan items" on meal_plan_items for select using (client_id = auth.uid());

-- Shopping list: built from the plan in the app. This only stores the
-- client's choices: days shopping for, what's in the cart, and extras.
create table if not exists shopping_lists (
  client_id uuid primary key references profiles(id) on delete cascade,
  days int not null default 7 check (days between 1 and 31),
  checked jsonb not null default '[]',
  extras jsonb not null default '[{"name":"Seasonings / hot sauce","got":false},{"name":"Zero-calorie drinks","got":false},{"name":"Cooking spray","got":false},{"name":"Meal prep containers","got":false}]',
  updated_at timestamptz default now()
);
alter table shopping_lists enable row level security;
drop policy if exists "client manages own shopping list" on shopping_lists;
create policy "client manages own shopping list" on shopping_lists for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "coach manages shopping lists" on shopping_lists;
create policy "coach manages shopping lists" on shopping_lists for all using (is_coach()) with check (is_coach());
