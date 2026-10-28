-- Update 134: unread messages for the coach's Messages page. Safe to re-run.
--
-- Marks messages as read for whoever is signed in. A function rather than an
-- UPDATE policy, so a recipient can stamp read_at but can't change a message's text.
create or replace function mark_messages_read(other_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update messages set read_at = now()
   where recipient_id = auth.uid() and sender_id = other_id and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function mark_messages_read(uuid) from public, anon;
grant execute on function mark_messages_read(uuid) to authenticated;

-- Fast "what's unread for me" lookups.
create index if not exists messages_unread_idx on messages (recipient_id, sender_id) where read_at is null;
