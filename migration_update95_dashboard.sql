-- ===== CLIENT DASHBOARD (Update 95) =====
-- Safe to re-run. Needs nothing from Updates 89-94.

-- The sheet's Client Profile panel.
alter table profiles add column if not exists goal text default '';
alter table profiles add column if not exists age int;
alter table profiles add column if not exists height_in int;
alter table profiles add column if not exists steps_target int;
alter table profiles add column if not exists water_oz int;
alter table profiles add column if not exists limitations text default '';
-- target_weight already exists and is the Goal Weight.

-- The weekly to-do list (one per client) and the daily ticks.
create table if not exists client_todos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  position int not null default 0,
  created_at timestamptz default now()
);
create table if not exists client_todo_ticks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  todo_id uuid not null references client_todos(id) on delete cascade,
  log_date date not null,
  created_at timestamptz default now(),
  unique (todo_id, log_date)
);
alter table client_todos enable row level security;
alter table client_todo_ticks enable row level security;
-- clients run their own list (add, rename, remove, tick); the coach can do the same
drop policy if exists "client manages own todos" on client_todos;
create policy "client manages own todos" on client_todos for all using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "coach manages todos" on client_todos;
create policy "coach manages todos" on client_todos for all using (is_coach()) with check (is_coach());
drop policy if exists "client manages own todo ticks" on client_todo_ticks;
create policy "client manages own todo ticks" on client_todo_ticks for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid() and exists (select 1 from client_todos t where t.id = todo_id and t.client_id = auth.uid()));
drop policy if exists "coach reads todo ticks" on client_todo_ticks;
create policy "coach reads todo ticks" on client_todo_ticks for select using (is_coach());
create index if not exists client_todo_ticks_client_date on client_todo_ticks (client_id, log_date);
