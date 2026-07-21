-- Secure function to get ALL users for Admin dashboard
create or replace function admin_get_all_users()
returns table (
  id uuid,
  email text,
  phone text,
  user_type text,
  username text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  -- Security Check: Only allow specific admin emails
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
    u.created_at
  from auth.users u
  left join public.profiles p on u.id = p.id
  order by u.created_at desc;
end;
$$;
