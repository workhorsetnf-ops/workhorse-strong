-- Update 181: group nutrition guide
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- The written nutrition guide group members read under Eat. The coach edits it
-- on the Group page; until it is saved once, members see the built-in version.
create table if not exists group_guides (
  id text primary key check (id in ('nutrition')),
  title text not null default 'The Workhorse Nutrition Guide',
  body_md text not null default '',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table group_guides enable row level security;

drop policy if exists "coach manages group guides" on group_guides;
create policy "coach manages group guides" on group_guides for all using (is_coach()) with check (is_coach());
drop policy if exists "paid group members read group guides" on group_guides;
create policy "paid group members read group guides" on group_guides for select
  using (is_group_plan(auth.uid()) and not group_locked(auth.uid()));
grant select, insert, update, delete on group_guides to authenticated;
