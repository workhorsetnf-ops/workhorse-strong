-- Update 171: merge duplicate Library exercises
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- Merges several Library entries into one, all at once or not at all:
--   * the kept entry picks up a video / icon / notes / category it was missing
--   * hotel-gym swap links and clients' swap history move to the kept entry
--   * the duplicates are deleted, and the kept entry can be renamed
-- Programs are not touched: program exercises keep their own names and videos.
create or replace function public.merge_library_exercises(p_keep uuid, p_drop uuid[], p_name text default null)
returns int language plpgsql security definer set search_path = public as $$
declare d uuid[]; n int;
begin
  if not is_coach() then raise exception 'Coach only'; end if;
  if not exists (select 1 from exercise_library where id = p_keep) then raise exception 'Exercise to keep not found'; end if;
  select array_agg(x) into d from unnest(coalesce(p_drop, '{}')) x where x is not null and x <> p_keep;
  if d is null then return 0; end if;

  -- fill in what the kept entry is missing, from the first duplicate that has it
  update exercise_library k set
    video_url = coalesce(nullif(k.video_url, ''), (select video_url from exercise_library where id = any(d) and coalesce(video_url, '') <> '' order by created_at limit 1), k.video_url),
    icon_url  = coalesce(nullif(k.icon_url, ''),  (select icon_url  from exercise_library where id = any(d) and coalesce(icon_url, '')  <> '' order by created_at limit 1), k.icon_url),
    notes     = coalesce(nullif(k.notes, ''),     (select notes     from exercise_library where id = any(d) and coalesce(notes, '')     <> '' order by created_at limit 1), k.notes),
    category  = coalesce(nullif(k.category, ''),  (select category  from exercise_library where id = any(d) and coalesce(category, '')  <> '' order by created_at limit 1), k.category)
  where k.id = p_keep;

  -- swap links: point them at the kept entry, skip ones it already has and self-links
  insert into exercise_alternatives (library_id, alt_id, position)
    select distinct on (lib, alt) lib, alt, pos from (
      select case when library_id = any(d) then p_keep else library_id end lib,
             case when alt_id = any(d) then p_keep else alt_id end alt, position pos
      from exercise_alternatives where library_id = any(d) or alt_id = any(d)) s
    where lib <> alt
  on conflict (library_id, alt_id) do nothing;
  delete from exercise_alternatives where library_id = any(d) or alt_id = any(d);

  -- clients' swap history keeps pointing at a real Library entry
  update exercise_swaps set alt_library_id = p_keep where alt_library_id = any(d);

  delete from exercise_library where id = any(d);
  get diagnostics n = row_count;
  if coalesce(trim(p_name), '') <> '' then update exercise_library set name = trim(p_name) where id = p_keep; end if;
  return n;
end $$;
revoke all on function public.merge_library_exercises(uuid, uuid[], text) from public, anon;
grant execute on function public.merge_library_exercises(uuid, uuid[], text) to authenticated;
