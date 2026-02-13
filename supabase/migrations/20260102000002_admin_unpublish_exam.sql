-- Secure function for Admin to unpublish any exam
create or replace function admin_unpublish_exam(target_exam_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Security Check: Only allow specific admin email
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  -- Update the exam status
  update public.exams
  set is_published = false
  where id = target_exam_id;
end;
$$;
