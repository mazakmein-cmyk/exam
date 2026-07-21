-- Fix exams_attempted to count total unique exam attempts (by counting attempts of the first section of each exam variant)
DROP FUNCTION IF EXISTS admin_get_all_users();
create or replace function admin_get_all_users()
returns table (
  id uuid,
  email text,
  phone text,
  user_type text,
  username text,
  created_at timestamptz,
  is_verified boolean,
  last_sign_in_at timestamptz,
  exams_created int,
  exams_attempted int
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
    u.id,
    u.email::text,
    u.phone::text,
    (u.raw_user_meta_data->>'user_type')::text as user_type,
    p.username::text,
    u.created_at,
    coalesce(p.is_verified, false) as is_verified,
    u.last_sign_in_at,
    (select count(*)::int from public.exams e where e.user_id = u.id) as exams_created,
    (
      select count(*)::int 
      from public.attempts a
      where a.user_id = u.id
        and a.section_id in (
          select distinct on (s.exam_id, coalesce(s.language, 'en')) s.id 
          from public.sections s
          order by s.exam_id, coalesce(s.language, 'en'), s.sort_order asc, s.created_at asc
        )
    ) as exams_attempted
  from auth.users u
  left join public.profiles p on u.id = p.id
  order by u.created_at desc;
end;
$$;
