-- Update 123: a default weekly check-in form for every client without their
-- own form, seeded with the Workhorse weekly check-in. Safe to re-run: the
-- form is only created if there's no default form yet.

alter table checkin_forms add column if not exists is_default boolean not null default false;
create unique index if not exists checkin_forms_one_default on checkin_forms (is_default) where is_default;

-- Two pre-filled question types: weight & waist last week / this week.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'checkin_form_questions'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%qtype%'
  loop
    execute format('alter table checkin_form_questions drop constraint %I', c.conname);
  end loop;
end $$;
alter table checkin_form_questions add constraint checkin_form_questions_qtype_check
  check (qtype in ('text', 'number', 'scale', 'choice', 'body_prev', 'body_now'));

-- Clients can read the default form and its questions (they already read an assigned one).
drop policy if exists "client reads default form" on checkin_forms;
create policy "client reads default form" on checkin_forms for select using (is_default);
drop policy if exists "client reads default questions" on checkin_form_questions;
create policy "client reads default questions" on checkin_form_questions for select using (
  exists (select 1 from checkin_forms f where f.id = checkin_form_questions.form_id and f.is_default)
);

do $$
declare fid uuid;
begin
  if exists (select 1 from checkin_forms where is_default) then return; end if;
  insert into checkin_forms (name, is_default) values ('Weekly Check-in', true) returning id into fid;
  insert into checkin_form_questions (form_id, position, qtype, label, options) values
    (fid, 0,  'text',      'Is there anything you want to bring up or discuss with me right away?', '[]'),
    (fid, 1,  'scale',     'On a scale of 1–10, rate your compliance with your meal plan last week. (1 = not at all, 10 = nothing missed)', '[]'),
    (fid, 2,  'text',      'Did you miss any workouts?', '[]'),
    (fid, 3,  'text',      'Tell me something you are PROUD of this week!', '[]'),
    (fid, 4,  'text',      'What is something you want to improve on this week?', '[]'),
    (fid, 5,  'scale',     'On a scale of 1–10, rate your stress levels this week. (1 = none, 10 = the worst)', '[]'),
    (fid, 6,  'text',      'What were your favorite foods from this week?', '[]'),
    (fid, 7,  'text',      'Any food you''d like substitutes for?', '[]'),
    (fid, 8,  'text',      'How much water did you drink on average per day?', '[]'),
    (fid, 9,  'number',    'How many hours of sleep per night did you average?', '{"prefill": "sleep_avg"}'),
    (fid, 10, 'body_prev', 'What was your previous week''s weight and waist measurement?', '[]'),
    (fid, 11, 'body_now',  'What is your current weight and waist measurement?', '[]'),
    (fid, 12, 'text',      'What was your goal last week? Did you hit it?', '[]'),
    (fid, 13, 'text',      'What is your goal for this week? What are you doing to ensure you hit it?', '[]'),
    (fid, 14, 'text',      'Is there anything I can do to serve you better as your coach this week?', '[]');
end $$;
