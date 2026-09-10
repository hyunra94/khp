-- Existing course_types RLS restricts writes to administrators.
alter table public.course_types
  add column if not exists certificate_course_name text,
  add column if not exists certificate_part_a_name text,
  add column if not exists certificate_part_b_name text;
