-- Update 137: group chats
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- A group is a thread the coach creates with chosen clients; every member sees
-- and replies to every message. Broadcast (one message to many clients, replies
-- private) needs no tables: it sends ordinary 1-on-1 messages.

create table if not exists message_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid references profiles(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists message_group_members (
  group_id uuid not null references message_groups(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  -- everything after this is unread for this member
  last_read_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index if not exists message_group_members_profile_idx on message_group_members (profile_id);

create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references message_groups(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null default '',
  msg_type text not null default 'text' check (msg_type in ('text','audio','file')),
  file_path text,     -- in the group-files bucket: <group id>/<sender id>/<file>
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on group_messages (group_id, created_at);

-- Membership check used by every policy below. security definer so the
-- policy on message_group_members can call it without recursing into itself.
create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from message_group_members where group_id = gid and profile_id = auth.uid())
$$;
revoke all on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table message_groups enable row level security;
alter table message_group_members enable row level security;
alter table group_messages enable row level security;

drop policy if exists "coach manages groups" on message_groups;
drop policy if exists "members read their groups" on message_groups;
create policy "coach manages groups" on message_groups for all using (is_coach()) with check (is_coach());
create policy "members read their groups" on message_groups for select using (is_group_member(id));

drop policy if exists "coach manages group members" on message_group_members;
drop policy if exists "members see who is in their groups" on message_group_members;
create policy "coach manages group members" on message_group_members for all using (is_coach()) with check (is_coach());
create policy "members see who is in their groups" on message_group_members for select using (is_group_member(group_id));

drop policy if exists "coach reads all group messages" on group_messages;
drop policy if exists "members read group messages" on group_messages;
drop policy if exists "members post to open groups" on group_messages;
drop policy if exists "sender or coach deletes group messages" on group_messages;
create policy "coach reads all group messages" on group_messages for select using (is_coach());
create policy "members read group messages" on group_messages for select using (is_group_member(group_id));
create policy "members post to open groups" on group_messages for insert with check (
  sender_id = auth.uid()
  and (is_coach() or is_group_member(group_id))
  and exists (select 1 from message_groups g where g.id = group_id and not g.archived)
);
create policy "sender or coach deletes group messages" on group_messages for delete using (sender_id = auth.uid() or is_coach());

-- Names and photos of the people in a group. Clients can't read other clients'
-- profiles, so this hands back just name + photo, and only for groups the
-- caller is in (the coach sees any group).
create or replace function public.group_member_profiles(gid uuid)
returns table (id uuid, full_name text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.role
    from message_group_members m join profiles p on p.id = m.profile_id
   where m.group_id = gid and (is_coach() or is_group_member(gid))
   order by p.role, p.full_name
$$;
revoke all on function public.group_member_profiles(uuid) from public, anon;
grant execute on function public.group_member_profiles(uuid) to authenticated;

-- One row per group the caller belongs to (coach: every group), with unread
-- count and the newest message, for the thread list and the nav badge.
create or replace function public.my_groups()
returns table (id uuid, name text, archived boolean, member_count int, unread int, last_at timestamptz, last_body text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.archived,
         (select count(*)::int from message_group_members mm where mm.group_id = g.id),
         coalesce((select count(*)::int from group_messages gm
                    where gm.group_id = g.id and gm.sender_id <> auth.uid()
                      and me.profile_id is not null and gm.created_at > me.last_read_at), 0),
         last.created_at, last.body
    from message_groups g
    left join message_group_members me on me.group_id = g.id and me.profile_id = auth.uid()
    left join lateral (select gm.created_at, gm.body from group_messages gm
                        where gm.group_id = g.id order by gm.created_at desc limit 1) last on true
   where me.profile_id is not null or is_coach()
   order by coalesce(last.created_at, g.created_at) desc
$$;
revoke all on function public.my_groups() from public, anon;
grant execute on function public.my_groups() to authenticated;

-- Members can't update their membership row (that would let them edit other
-- columns), so reading a group goes through this.
create or replace function public.mark_group_read(gid uuid)
returns void language sql security definer set search_path = public as $$
  update message_group_members set last_read_at = now() where group_id = gid and profile_id = auth.uid()
$$;
revoke all on function public.mark_group_read(uuid) from public, anon;
grant execute on function public.mark_group_read(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table group_messages;
exception when duplicate_object then null; end $$;

-- Voice notes and files sent in a group. Private bucket; the first folder is
-- the group id, the second is the sender. Only members (and the coach) can
-- upload to or open a group's files.
insert into storage.buckets (id, name, public, file_size_limit)
values ('group-files', 'group-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "group members upload group files" on storage.objects;
drop policy if exists "group members read group files" on storage.objects;
create policy "group members upload group files" on storage.objects for insert with check (
  bucket_id = 'group-files'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (public.is_coach() or exists (
    select 1 from public.message_group_members m
     where m.group_id::text = (storage.foldername(name))[1] and m.profile_id = auth.uid()))
);
create policy "group members read group files" on storage.objects for select using (
  bucket_id = 'group-files'
  and (public.is_coach() or exists (
    select 1 from public.message_group_members m
     where m.group_id::text = (storage.foldername(name))[1] and m.profile_id = auth.uid()))
);
