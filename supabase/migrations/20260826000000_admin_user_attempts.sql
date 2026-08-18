-- Admin: list which exams a student has attempted, one row per attempt.
-- Row selection mirrors the exams_attempted count in admin_get_all_users
-- (attempts on the first section of each exam language variant), so the
-- rows in the popup always add up to the number shown in the users table.
create or replace function admin_get_user_attempts(target_user_id uuid)
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_name text,
  attempt_language text,
  attempted_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  return query
  select
    a.id,
    e.id,
    e.name::text,
    coalesce(a.language, 'en')::text,
    a.created_at
  from public.attempts a
  join public.sections s on s.id = a.section_id
  join public.exams e on e.id = s.exam_id
  where a.user_id = target_user_id
    and a.section_id in (
      select distinct on (s2.exam_id, coalesce(s2.language, 'en')) s2.id
      from public.sections s2
      order by s2.exam_id, coalesce(s2.language, 'en'), s2.sort_order asc, s2.created_at asc
    )
  order by a.created_at desc;
end;
$$;
