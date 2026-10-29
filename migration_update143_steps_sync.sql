-- Update 143: steps from Apple Health via an iPhone Shortcut
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
--
-- Each client gets a private link. Their Shortcut sends today's step count to
-- it every evening; the server writes it into daily_logs.steps for that day.

alter table profiles add column if not exists steps_token text;
create unique index if not exists profiles_steps_token_idx on profiles (steps_token) where steps_token is not null;

alter table daily_logs add column if not exists steps_source text;          -- 'shortcut' when synced, null when typed
alter table daily_logs add column if not exists steps_synced_at timestamptz;

-- Coach's shared Shortcut (iCloud link) shown on the setup page.
alter table client_hub add column if not exists steps_shortcut_url text;

-- The signed-in client's own link token: made on first ask, replaced on rotate.
create or replace function my_steps_token(rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select steps_token into tok from profiles where id = auth.uid();
  if tok is null or rotate then
    tok := encode(extensions.gen_random_bytes(18), 'hex');
    update profiles set steps_token = tok where id = auth.uid();
  end if;
  return tok;
end $$;
revoke all on function my_steps_token(boolean) from public, anon;
grant execute on function my_steps_token(boolean) to authenticated;
