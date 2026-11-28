-- ===== CLIENT EQUIPMENT (Update 192) =====
-- Safe to re-run. What the client has to train with, ticked on their Profile
-- (CoachRx's "Equipment"). The coach sees it on the client's Day view.
alter table profiles add column if not exists equipment text[] not null default '{}';
alter table profiles drop constraint if exists profiles_equipment_check;
alter table profiles add constraint profiles_equipment_check check (cardinality(equipment) <= 40);

-- Let clients edit it themselves: same guard as Update 177's, with 'equipment'
-- added to the list of fields a client may change on their own row.
create or replace function public.guard_client_profile_update()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  editable text[] := array['full_name','phone','age','height_in','sex','goal','limitations','last_seen_at','avatar_url','equipment'];
begin
  if auth.uid() is null or is_coach() then return new; end if;
  -- set only inside apply_self_adjustment(), for this row, for one transaction
  if current_setting('workhorse.self_adjust', true) = old.id::text then return new; end if;
  new := jsonb_populate_record(new, to_jsonb(old) - editable);
  return new;
end $fn$;
