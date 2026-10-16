-- ===== PROFILE PHOTOS (Update 109) =====
-- Safe to re-run.

alter table profiles add column if not exists avatar_url text;

-- Photos live in an "avatars" bucket, one folder per person. Each file name is
-- random, so links can't be guessed; only the owner (or the coach) can add,
-- replace or delete.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
drop policy if exists "replace own avatar" on storage.objects;
create policy "replace own avatar" on storage.objects for update
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
drop policy if exists "read avatars" on storage.objects;
create policy "read avatars" on storage.objects for select
  using (bucket_id = 'avatars');

-- Let clients save their own photo (adds avatar_url to the fields a client may change).
create or replace function public.guard_client_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  editable text[] := array['full_name','phone','age','height_in','sex','goal','limitations','last_seen_at','avatar_url'];
begin
  if auth.uid() is null or is_coach() then return new; end if;
  new := jsonb_populate_record(new, to_jsonb(old) - editable);
  return new;
end $$;
