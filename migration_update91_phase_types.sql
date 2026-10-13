-- ===== PHASE PLANNER: reverse + diet break phases (Update 91) =====
-- Safe to re-run.
alter table client_phases drop constraint if exists client_phases_phase_type_check;
alter table client_phases add constraint client_phases_phase_type_check
  check (phase_type in ('cut','build','recomp','maintain','peak','reverse','diet_break'));
