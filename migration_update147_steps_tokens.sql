-- Update 147: fix steps links not saving
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- The profile guard (Update 107) quietly undoes client changes to coach-controlled
-- profile columns, which included steps_token, so links were shown but never
-- saved. Links now live in their own table that only this function writes.
create table if not exists steps_tokens (
  user_id uuid primary key references profiles(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table steps_tokens enable row level security;
-- No policies on purpose: only my_steps_token() and the server touch it.

create or replace function my_steps_token(rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select token into tok from steps_tokens where user_id = auth.uid();
  if tok is null or rotate then
    tok := encode(extensions.gen_random_bytes(18), 'hex');
    insert into steps_tokens (user_id, token) values (auth.uid(), tok)
      on conflict (user_id) do update set token = excluded.token, created_at = now();
  end if;
  return tok;
end $$;
revoke all on function my_steps_token(boolean) from public, anon;
grant execute on function my_steps_token(boolean) to authenticated;
