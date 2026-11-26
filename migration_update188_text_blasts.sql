-- Update 188: text blasts (one message texted to many clients, one tap each)
-- Run once in the Supabase SQL Editor BEFORE merging. Safe to re-run.
--
-- text_blasts: the message the coach wrote ({name} becomes each client's first name).
-- text_blast_recipients: who it's going to, in order, and who has been texted
-- or skipped, so a blast can be picked up again after leaving the page and
-- ticks off the same on the phone and the computer.

create table if not exists text_blasts (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(trim(body)) > 0),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table text_blasts enable row level security;
drop policy if exists "coach manages text blasts" on text_blasts;
create policy "coach manages text blasts" on text_blasts for all using (is_coach()) with check (is_coach());
grant select, insert, update, delete on text_blasts to authenticated;
create index if not exists text_blasts_open_idx on text_blasts (created_at desc) where finished_at is null;

create table if not exists text_blast_recipients (
  blast_id uuid not null references text_blasts(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  position int not null default 0,
  sent_at timestamptz,
  skipped_at timestamptz,
  primary key (blast_id, client_id)
);
alter table text_blast_recipients enable row level security;
drop policy if exists "coach manages text blast recipients" on text_blast_recipients;
create policy "coach manages text blast recipients" on text_blast_recipients for all using (is_coach()) with check (is_coach());
grant select, insert, update, delete on text_blast_recipients to authenticated;
