-- Secure function to get admin stats
create or replace function get_admin_stats()
returns json
language plpgsql
security definer
as $$
declare
  total_students int;
  total_creators int;
begin
  -- Security Check: Only allow specific admin email
  -- We check the email in the JWT claim.
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  -- Count Students (metadata user_type = 'student')
  select count(*)
  into total_students
  from auth.users
  where raw_user_meta_data->>'user_type' = 'student';

  -- Count Creators (metadata user_type != 'student' or null)
  select count(*)
  into total_creators
  from auth.users
  where raw_user_meta_data->>'user_type' is distinct from 'student';

  return json_build_object(
    'total_students', total_students,
    'total_creators', total_creators
  );
end;
$$;
