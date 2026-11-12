-- Update 179: Assistant (VA) accounts
-- Run once in the Supabase SQL Editor BEFORE merging. Safe to re-run.
--
-- An assistant gets their own login and can do everything the coach can,
-- EXCEPT create or change programs or the exercise/conditioning/lifestyle/
-- warm-up libraries (they can still view them, and assign programs to clients).
--
-- How it works:
--   * profiles.role gains 'assistant'. is_coach() now also returns true for an
--     ACTIVE assistant, so every existing coach permission carries over.
--   * Program and library tables get a trigger that refuses any insert/update/
--     delete from an assistant. A trigger (not just a policy) so it also holds
--     inside coach-only database functions, which run with elevated rights.
--   * Assistants work the coach's inbox: anything they send to clients
--     (messages, group chat, form-check replies, community posts) goes out
--     from the coach's account so threads stay in one place, and the row
--     records who really sent it (sent_by / sent_by_name).
--   * Only the head coach can change roles, edit the coach's or a team
--     member's account, or change their login email/password.
--   * Deactivating an assistant (status 'exited') cuts access on their very
--     next request.

-- ---- 1. the role ------------------------------------------------------------
do $$ declare c text; begin
  for c in select conname from pg_constraint
            where conrelid = 'public.profiles'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%role%' and pg_get_constraintdef(oid) ilike '%''coach''%'
  loop execute format('alter table public.profiles drop constraint %I', c); end loop;
end $$;
alter table profiles add constraint profiles_role_check check (role in ('coach', 'client', 'assistant'));

-- ---- 2. who is who ---------------------------------------------------------
create or replace function public.is_head_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach');
$$;

create or replace function public.is_assistant()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'assistant' and coalesce(status, 'active') = 'active');
$$;

-- every existing "coach can..." rule now also covers an active assistant
create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()
                  and (role = 'coach' or (role = 'assistant' and coalesce(status, 'active') = 'active')));
$$;

-- the head coach's account (the shared inbox assistants work from)
create or replace function public.coach_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where role = 'coach' order by created_at limit 1;
$$;

revoke all on function public.is_head_coach(), public.is_assistant(), public.coach_id() from public, anon;
grant execute on function public.is_head_coach(), public.is_assistant(), public.coach_id() to authenticated;

-- ---- 3. programs and libraries are view-only for assistants -----------------
create or replace function public.block_assistant_program_edits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_assistant() then
    raise exception 'View only: assistants can''t create or change programs or the library.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['programs', 'program_blocks', 'program_days', 'program_exercises',
                           'program_rotations', 'exercise_library', 'exercise_alternatives',
                           'conditioning_library', 'lifestyle_library', 'routine_library']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists assistant_view_only on public.%I', t);
      execute format('create trigger assistant_view_only before insert or update or delete on public.%I
                      for each row execute function public.block_assistant_program_edits()', t);
    end if;
  end loop;
end $$;

-- ---- 4. the shared inbox ---------------------------------------------------
-- who actually sent it, when it went out from the coach's account
do $$ declare t text; begin
  foreach t in array array['messages', 'group_messages', 'form_check_comments', 'community_posts', 'community_comments']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists sent_by uuid references profiles(id) on delete set null', t);
      execute format('alter table public.%I add column if not exists sent_by_name text', t);
    end if;
  end loop;
end $$;

-- An assistant's message goes out from the coach's account (so the client sees
-- one "Coach" thread) and is stamped with who really wrote it. Works whether the
-- app sends it as the assistant or as the coach. TG_ARGV[0] = the sender column.
create or replace function public.send_as_coach()
returns trigger language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; j jsonb; cid uuid;
begin
  if not is_assistant() then return new; end if;
  cid := coach_id();
  j := to_jsonb(new);
  if cid is not null and (j ->> col)::uuid = auth.uid() then
    j := jsonb_set(j, array[col], to_jsonb(cid));
  end if;
  j := j || jsonb_build_object('sent_by', auth.uid(),
                               'sent_by_name', (select nullif(trim(full_name), '') from profiles where id = auth.uid()));
  new := jsonb_populate_record(new, j);
  return new;
end $$;

do $$ declare t text; c text; begin
  for t, c in select * from (values ('messages', 'sender_id'), ('group_messages', 'sender_id'),
                                    ('form_check_comments', 'sender_id'), ('community_posts', 'author_id'),
                                    ('community_comments', 'author_id')) v(t, c)
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists send_as_coach on public.%I', t);
      execute format('create trigger send_as_coach before insert on public.%I
                      for each row execute function public.send_as_coach(%L)', t, c);
    end if;
  end loop;
end $$;

-- assistants read and send in the coach's 1-on-1 threads
drop policy if exists "assistant reads coach inbox" on messages;
create policy "assistant reads coach inbox" on messages for select
  using (is_assistant() and (sender_id = coach_id() or recipient_id = coach_id()));
drop policy if exists "assistant sends as coach" on messages;
create policy "assistant sends as coach" on messages for insert
  with check (is_assistant() and sender_id = coach_id());

-- marking a thread read marks it read in the coach's inbox
create or replace function mark_messages_read(other_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int; me uuid := case when is_assistant() then coach_id() else auth.uid() end;
begin
  update messages set read_at = now()
   where recipient_id = me and sender_id = other_id and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function mark_messages_read(uuid) from public, anon;
grant execute on function mark_messages_read(uuid) to authenticated;

drop policy if exists "assistant posts to groups as coach" on group_messages;
create policy "assistant posts to groups as coach" on group_messages for insert
  with check (is_assistant() and sender_id = coach_id()
              and exists (select 1 from message_groups g where g.id = group_id and not g.archived));

do $$ begin
  if to_regclass('public.form_check_comments') is not null then
    execute 'drop policy if exists "assistant replies to form checks as coach" on form_check_comments';
    execute 'create policy "assistant replies to form checks as coach" on form_check_comments for insert
             with check (is_assistant() and sender_id = coach_id())';
    execute 'drop policy if exists "assistant reads form check comments" on form_check_comments';
    execute 'create policy "assistant reads form check comments" on form_check_comments for select using (is_assistant())';
    execute 'drop policy if exists "assistant marks form check comments read" on form_check_comments';
    execute 'create policy "assistant marks form check comments read" on form_check_comments for update
             using (is_assistant()) with check (is_assistant())';
  end if;
end $$;

drop policy if exists "assistant posts to community as coach" on community_posts;
create policy "assistant posts to community as coach" on community_posts for insert
  with check (is_assistant() and author_id = coach_id());
drop policy if exists "assistant comments in community as coach" on community_comments;
create policy "assistant comments in community as coach" on community_comments for insert
  with check (is_assistant() and author_id = coach_id());

-- voice notes and attachments an assistant sends are filed under the coach's
-- folder, exactly like ones the coach sends, so clients can always open them
drop policy if exists "assistant uploads coach attachments" on storage.objects;
create policy "assistant uploads coach attachments" on storage.objects for insert
  with check (bucket_id in ('message-files', 'voice-notes')
              and (storage.foldername(name))[1] = public.coach_id()::text and public.is_assistant());
drop policy if exists "assistant reads coach attachments" on storage.objects;
create policy "assistant reads coach attachments" on storage.objects for select
  using (bucket_id in ('message-files', 'voice-notes') and public.is_assistant());

-- ---- 5. only the head coach manages the team --------------------------------
-- Runs after the existing client guard. Nobody but the head coach (or a server
-- job) may change a role, and team accounts can only edit their own details.
create or replace function public.guard_staff_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  editable text[] := array['full_name','phone','age','height_in','sex','goal','limitations','last_seen_at','avatar_url'];
begin
  if auth.uid() is null or is_head_coach() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'Only the head coach can change account roles.' using errcode = '42501';
  end if;
  if old.role in ('coach', 'assistant') then
    if old.id <> auth.uid() then
      raise exception 'Only the head coach can edit team accounts.' using errcode = '42501';
    end if;
    new := jsonb_populate_record(new, to_jsonb(old) - editable);   -- own name/photo only, never status
  end if;
  return new;
end $$;

drop trigger if exists guard_staff_profile_update on profiles;
create trigger guard_staff_profile_update
  before update on profiles
  for each row execute function public.guard_staff_profile_update();

-- An assistant can reset a CLIENT's password or email (Clients page), but never
-- the coach's or a teammate's: that would hand over the account.
create or replace function public.guard_staff_login_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_head_coach() and old.id <> auth.uid()
     and exists (select 1 from public.profiles where id = old.id and role in ('coach', 'assistant')) then
    raise exception 'Only the head coach can change team logins.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists guard_staff_login_change on auth.users;
create trigger guard_staff_login_change
  before update or delete on auth.users
  for each row execute function public.guard_staff_login_change();

-- the same check, up front, in the coach's password/email tools
do $$ begin
  if to_regprocedure('public.admin_reset_password(uuid,text)') is not null
     and to_regprocedure('public.admin_reset_password_core(uuid,text)') is null then
    alter function public.admin_reset_password(uuid, text) rename to admin_reset_password_core;
  end if;
  if to_regprocedure('public.admin_update_email(uuid,text)') is not null
     and to_regprocedure('public.admin_update_email_core(uuid,text)') is null then
    alter function public.admin_update_email(uuid, text) rename to admin_update_email_core;
  end if;
end $$;

create or replace function public.staff_target_ok(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_head_coach()
      or target = auth.uid()
      or not exists (select 1 from profiles where id = target and role in ('coach', 'assistant'));
$$;

do $$ begin
  if to_regprocedure('public.admin_reset_password_core(uuid,text)') is not null then
    revoke all on function public.admin_reset_password_core(uuid, text) from public, anon, authenticated;
    execute $f$
      create or replace function public.admin_reset_password(target_user_id uuid, new_password text)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        if not staff_target_ok(target_user_id) then
          raise exception 'Only the head coach can change team logins.' using errcode = '42501';
        end if;
        perform public.admin_reset_password_core(target_user_id, new_password);
      end $b$ $f$;
    revoke all on function public.admin_reset_password(uuid, text) from public, anon;
    grant execute on function public.admin_reset_password(uuid, text) to authenticated;
  end if;
  if to_regprocedure('public.admin_update_email_core(uuid,text)') is not null then
    revoke all on function public.admin_update_email_core(uuid, text) from public, anon, authenticated;
    execute $f$
      create or replace function public.admin_update_email(target_user_id uuid, new_email text)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        if not staff_target_ok(target_user_id) then
          raise exception 'Only the head coach can change team logins.' using errcode = '42501';
        end if;
        perform public.admin_update_email_core(target_user_id, new_email);
      end $b$ $f$;
    revoke all on function public.admin_update_email(uuid, text) from public, anon;
    grant execute on function public.admin_update_email(uuid, text) to authenticated;
  end if;
end $$;
