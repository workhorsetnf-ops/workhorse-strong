-- Update 144: AI check-in summaries
-- Run once in the Supabase SQL Editor before merging. Safe to re-run.
-- The summary and drafted reply are saved on the check-in so reopening the
-- review doesn't call the AI again. Only the server (service role) writes them.
alter table checkins add column if not exists ai_summary jsonb;
alter table checkins add column if not exists ai_summary_at timestamptz;
