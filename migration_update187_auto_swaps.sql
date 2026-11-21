-- Update 187: swaps for every exercise (filled in by Claude) + swaps that last the whole block
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.

-- Where each alternative came from: 'coach' (you added it) or 'auto' (Claude filled it in).
-- Refilling only ever replaces 'auto' ones; yours are never touched.
alter table exercise_alternatives add column if not exists source text not null default 'coach';
alter table exercise_alternatives drop constraint if exists exercise_alternatives_source_check;
alter table exercise_alternatives add constraint exercise_alternatives_source_check check (source in ('coach', 'auto'));

-- Library exercises Claude has already been asked about, so it isn't asked twice
-- (some exercises honestly have no good swap in your library).
alter table exercise_library add column if not exists swaps_filled_at timestamptz;

-- A swap the client keeps for the rest of the block. Program exercises belong to
-- one block, so it ends by itself when the next block starts.
create table if not exists exercise_block_swaps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references program_exercises(id) on delete cascade,
  from_name text not null,
  alt_library_id uuid references exercise_library(id) on delete set null,
  alt_name text not null,
  reason text not null default '' check (reason in ('', 'taken', 'hurts', 'equipment', 'other')),
  created_at timestamptz not null default now(),
  unique (client_id, exercise_id)
);
alter table exercise_block_swaps enable row level security;
drop policy if exists "client manages own block swaps" on exercise_block_swaps;
drop policy if exists "coach manages block swaps" on exercise_block_swaps;
create policy "client manages own block swaps" on exercise_block_swaps for all using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "coach manages block swaps" on exercise_block_swaps for all using (is_coach()) with check (is_coach());
grant select, insert, update, delete on exercise_block_swaps to authenticated;
