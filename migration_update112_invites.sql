-- ===== CLIENT SIGN-UP LINK (Update 112) =====
-- Safe to re-run.

-- One shared join code. Anyone with /join/<code> can create a client account.
-- Change it any time from the Clients page; the old link stops working.
create table if not exists join_link (
  id int primary key default 1 check (id = 1),
  code text not null,
  enabled boolean not null default true,
  updated_at timestamptz default now()
);
insert into join_link (id, code)
  values (1, 'WH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)))
  on conflict (id) do nothing;
alter table join_link enable row level security;
drop policy if exists "coach manages join link" on join_link;
create policy "coach manages join link" on join_link for all using (is_coach()) with check (is_coach());
