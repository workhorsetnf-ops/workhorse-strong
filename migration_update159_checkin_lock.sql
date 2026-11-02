-- Update 159: check-in lock
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- When switched on for a client, a check-in that's a day or more late pauses
-- their Train, Eat and Log screens until it's submitted. Off for everyone by
-- default. Clients can't switch it off themselves: the profile guard
-- (Update 107/109) only lets them change their own personal details.
alter table profiles add column if not exists checkin_lock boolean not null default false;
