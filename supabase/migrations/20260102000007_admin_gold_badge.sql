-- Gold (official) badge — reserved for the single official MockSetu admin account.
-- Distinct from is_verified (blue tick for verified creators).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin_gold boolean DEFAULT false;

-- Grant the gold badge to the official admin account and to no one else.
UPDATE public.profiles p
SET is_admin_gold = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = 'admin@mocksetu.in';

-- Belt-and-suspenders: make sure nobody else carries it.
UPDATE public.profiles p
SET is_admin_gold = false
WHERE p.is_admin_gold = true
  AND p.id NOT IN (
    SELECT u.id FROM auth.users u WHERE lower(u.email) = 'admin@mocksetu.in'
  );

-- Expose is_admin_gold through the admin users listing.
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
  is_admin_gold boolean
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
    coalesce(p.is_admin_gold, false) as is_admin_gold
  from auth.users u
  left join public.profiles p on u.id = p.id
  order by u.created_at desc;
end;
$$;
