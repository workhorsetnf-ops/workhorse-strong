-- Update 138: Community voice notes, photos/GIFs, short videos, and polls
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.

-- Posts can now carry media and be a poll. media is a list of
-- { path, kind: 'image'|'video'|'audio', name } in the community-media bucket.
alter table community_posts alter column body set default '';
alter table community_posts add column if not exists media jsonb not null default '[]';
alter table community_posts add column if not exists post_type text not null default 'post';
alter table community_posts add column if not exists poll_closed boolean not null default false;
do $$ begin
  alter table community_posts add constraint community_posts_type_chk check (post_type in ('post','poll'));
exception when duplicate_object then null; end $$;

alter table community_comments alter column body set default '';
alter table community_comments add column if not exists media jsonb not null default '[]';

-- Only the coach posts polls; anyone signed in posts everything else.
drop policy if exists "everyone signed in creates own posts" on community_posts;
create policy "everyone signed in creates own posts" on community_posts for insert
  with check (author_id = auth.uid() and (post_type = 'post' or is_coach()));
-- The coach can close/reopen a poll (and edit any post).
drop policy if exists "coach updates posts" on community_posts;
create policy "coach updates posts" on community_posts for update using (is_coach()) with check (is_coach());

create table if not exists community_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  position int not null default 0
);
create index if not exists community_poll_options_post_idx on community_poll_options (post_id, position);

-- One vote per person per poll; changing your vote replaces it.
create table if not exists community_poll_votes (
  post_id uuid not null references community_posts(id) on delete cascade,
  option_id uuid not null references community_poll_options(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

alter table community_poll_options enable row level security;
alter table community_poll_votes enable row level security;

drop policy if exists "signed in reads poll options" on community_poll_options;
drop policy if exists "coach manages poll options" on community_poll_options;
create policy "signed in reads poll options" on community_poll_options for select using (auth.role() = 'authenticated');
create policy "coach manages poll options" on community_poll_options for all using (is_coach()) with check (is_coach());

drop policy if exists "signed in reads poll votes" on community_poll_votes;
drop policy if exists "vote on open polls" on community_poll_votes;
drop policy if exists "remove own vote" on community_poll_votes;
create policy "signed in reads poll votes" on community_poll_votes for select using (auth.role() = 'authenticated');
create policy "vote on open polls" on community_poll_votes for insert with check (
  voter_id = auth.uid()
  and exists (select 1 from community_poll_options o join community_posts p on p.id = o.post_id
               where o.id = option_id and o.post_id = community_poll_votes.post_id
                 and p.post_type = 'poll' and not p.poll_closed)
);
create policy "remove own vote" on community_poll_votes for delete using (voter_id = auth.uid());

-- Changing a vote in one step (delete old + insert new), so it can't leave
-- someone with no vote halfway through.
create or replace function public.cast_poll_vote(pid uuid, oid uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from community_poll_votes where post_id = pid and voter_id = auth.uid();
  insert into community_poll_votes (post_id, option_id, voter_id) values (pid, oid, auth.uid());
end $$;
revoke all on function public.cast_poll_vote(uuid, uuid) from public, anon;
grant execute on function public.cast_poll_vote(uuid, uuid) to authenticated;

-- Names and photos for the feed. Clients can't read other clients' profiles,
-- which is why posts showed "Athlete"; this returns only name + photo, and
-- only for people who aren't archived.
create or replace function public.community_profiles()
returns table (id uuid, full_name text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.role from profiles p
   where auth.role() = 'authenticated' and coalesce(p.status, 'active') <> 'exited'
$$;
revoke all on function public.community_profiles() from public, anon;
grant execute on function public.community_profiles() to authenticated;

do $$ begin alter publication supabase_realtime add table community_poll_votes;
exception when duplicate_object then null; end $$;

-- Photos, GIFs, short videos and voice notes. Private bucket: signed-in members
-- can view; you upload only into your own folder; the author or coach deletes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 52428800, array['image/*','video/*','audio/*'])
on conflict (id) do nothing;

drop policy if exists "upload own community media" on storage.objects;
drop policy if exists "signed in views community media" on storage.objects;
drop policy if exists "author or coach deletes community media" on storage.objects;
create policy "upload own community media" on storage.objects for insert
  with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "signed in views community media" on storage.objects for select
  using (bucket_id = 'community-media' and auth.role() = 'authenticated');
create policy "author or coach deletes community media" on storage.objects for delete
  using (bucket_id = 'community-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
