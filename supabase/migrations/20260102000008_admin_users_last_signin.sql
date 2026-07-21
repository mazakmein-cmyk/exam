-- Update admin_get_all_users to include last_sign_in_at so frontend can filter DAU/MAU
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
  last_sign_in_at timestamptz
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
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on u.id = p.id
  order by u.created_at desc;
end;
$$;
