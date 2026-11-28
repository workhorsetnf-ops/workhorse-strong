-- ===== CLIENT TAGS (Update 191) =====
-- Safe to re-run. Free-text tags on each client for the Clients table
-- ("Add to tag", search by tag). Only the coach edits them: client-side
-- profile updates go through their own policy, which this column doesn't change.
alter table profiles add column if not exists tags text[] not null default '{}';
alter table profiles drop constraint if exists profiles_tags_check;
alter table profiles add constraint profiles_tags_check check (cardinality(tags) <= 20);
create index if not exists profiles_tags_idx on profiles using gin (tags);
