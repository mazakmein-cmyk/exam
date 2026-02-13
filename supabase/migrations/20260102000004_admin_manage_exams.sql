-- Secure function to get ALL exams (published and unpublished) for Admin
create or replace function admin_get_all_exams()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  is_published boolean,
  user_id uuid,
  username text
)
language plpgsql
security definer
as $$
begin
  -- Security Check: Only allow specific admin email
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  return query
  select 
    e.id,
    e.name,
    e.created_at,
    coalesce(e.is_published, false) as is_published,
    e.user_id,
    p.username
  from public.exams e
  left join public.profiles p on e.user_id = p.id
  order by e.created_at desc;
end;
$$;


-- Secure function to update exam status (Publish/Unpublish)
create or replace function admin_update_exam_status(target_exam_id uuid, new_status boolean)
returns void
language plpgsql
security definer
as $$
begin
  -- Security Check
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  update public.exams
  set is_published = new_status,
      updated_at = now()
  where id = target_exam_id;
end;
$$;
