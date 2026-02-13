-- Secure function to get exam preview for Admin
create or replace function admin_get_exam_preview(target_exam_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  -- Security Check: Only allow specific admin email
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  select json_agg(
    json_build_object(
      'id', s.id,
      'name', s.name,
      'questions', (
        select coalesce(json_agg(
          json_build_object(
            'id', q.id,
            'question_number', q.q_no,
            'question_text', q.text,
            'options', q.options,
            'correct_answer', q.correct_answer,
            'image_url', q.image_url,
            'image_urls', q.image_urls
          ) order by q.q_no
        ), '[]'::json)
        from public.parsed_questions q
        where q.section_id = s.id
      )
    ) order by s.sort_order
  ) into result
  from public.sections s
  where s.exam_id = target_exam_id;

  return coalesce(result, '[]'::json);
end;
$$;
