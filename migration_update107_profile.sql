-- ===== CLIENT PROFILE EDITING (Update 107) =====
-- Safe to re-run.

alter table profiles add column if not exists phone text default '';

-- Clients may only change their own personal details. Everything the coach
-- controls (role, macros, phase, check-in day, status, payments, program track,
-- event, targets...) is quietly kept as it was if a client tries to change it.
-- The coach, and server jobs (no signed-in user), can still change anything.
create or replace function public.guard_client_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  editable text[] := array['full_name','phone','age','height_in','sex','goal','limitations','last_seen_at'];
begin
  if auth.uid() is null or is_coach() then return new; end if;
  new := jsonb_populate_record(new, to_jsonb(old) - editable);
  return new;
end $$;

drop trigger if exists guard_client_profile_update on profiles;
create trigger guard_client_profile_update
  before update on profiles
  for each row execute function public.guard_client_profile_update();
