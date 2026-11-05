-- Update 167: see when the app breaks for someone
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Phones report crashes and script errors here; the coach sees them grouped on
-- the Problems page. Nothing personal beyond who it happened to and on which
-- screen.
create table if not exists app_errors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  message text not null,
  stack text not null default '',
  path text not null default '',
  device text not null default '',
  kind text not null default 'error' check (kind in ('error', 'crash', 'promise')),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_created_idx on app_errors (created_at desc);
create index if not exists app_errors_open_idx on app_errors (message) where not resolved;
alter table app_errors enable row level security;
drop policy if exists "coach manages app errors" on app_errors;
create policy "coach manages app errors" on app_errors for all using (is_coach()) with check (is_coach());
grant select, update, delete on app_errors to authenticated;

-- Anyone signed in (or on the login page) can report, but only through this,
-- which trims everything and caps how many one phone can send in an hour.
create or replace function public.log_app_error(p_message text, p_stack text default '', p_path text default '', p_device text default '', p_kind text default 'error')
returns void language plpgsql security definer set search_path = public as $$
declare recent int; cap int;
begin
  if coalesce(trim(p_message), '') = '' then return; end if;
  select count(*) into recent from app_errors
   where created_at > now() - interval '1 hour'
     and (profile_id = auth.uid() or (auth.uid() is null and profile_id is null));
  cap := 30;
  if auth.uid() is null then cap := 200; end if;
  if recent >= cap then return; end if;
  insert into app_errors (profile_id, message, stack, path, device, kind)
  values (auth.uid(), left(p_message, 500), left(coalesce(p_stack, ''), 4000), left(coalesce(p_path, ''), 200), left(coalesce(p_device, ''), 300),
          (case when p_kind in ('error', 'crash', 'promise') then p_kind else 'error' end));
end $$;
revoke all on function public.log_app_error(text, text, text, text, text) from public;
grant execute on function public.log_app_error(text, text, text, text, text) to anon, authenticated;
