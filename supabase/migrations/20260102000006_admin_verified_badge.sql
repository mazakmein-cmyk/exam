-- Add is_verified column to profiles table for blue tick feature
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

-- Secure function to toggle verified status for a creator
create or replace function admin_toggle_verified(target_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  new_status boolean;
begin
  -- Security Check: Only allow specific admin emails
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  -- Toggle the verified status
  update public.profiles
  set is_verified = NOT coalesce(is_verified, false)
  where id = target_user_id
  returning is_verified into new_status;

  return new_status;
end;
$$;

-- Update admin_get_all_users to include is_verified
-- Must drop first because return type changed (added is_verified column)
DROP FUNCTION IF EXISTS admin_get_all_users();
create or replace function admin_get_all_users()
returns table (
  id uuid,
  email text,
  phone text,
  user_type text,
  username text,
  created_at timestamptz,
  is_verified boolean
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
    coalesce(p.is_verified, false) as is_verified
  from auth.users u
  left join public.profiles p on u.id = p.id
  order by u.created_at desc;
end;
$$;
