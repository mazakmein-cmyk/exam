-- Admin analytics: DAU, MAU, and signup trends
create or replace function admin_get_analytics()
returns json
language plpgsql
security definer
as $$
declare
  dau_count int;
  mau_count int;
  monthly_trend json;
  yearly_trend json;
begin
  if auth.jwt() ->> 'email' not in ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') then
    raise exception 'Access Denied: Admin privileges required.';
  end if;

  -- DAU: users who signed in today
  select count(*)
  into dau_count
  from auth.users
  where last_sign_in_at >= date_trunc('day', now());

  -- MAU: users who signed in this month
  select count(*)
  into mau_count
  from auth.users
  where last_sign_in_at >= date_trunc('month', now());

  -- Monthly trend: daily signups for the current month
  select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json)
  into monthly_trend
  from (
    select 
      to_char(date_series, 'DD Mon') as label,
      date_series::date as day,
      count(u.id) as signups
    from generate_series(
      date_trunc('month', now()),
      now(),
      '1 day'::interval
    ) as date_series
    left join auth.users u 
      on u.created_at::date = date_series::date
    group by date_series
  ) d;

  -- Yearly trend: monthly signups for the current year
  select coalesce(json_agg(row_to_json(m) order by m.month), '[]'::json)
  into yearly_trend
  from (
    select 
      to_char(month_series, 'Mon') as label,
      month_series::date as month,
      count(u.id) as signups
    from generate_series(
      date_trunc('year', now()),
      now(),
      '1 month'::interval
    ) as month_series
    left join auth.users u 
      on date_trunc('month', u.created_at) = date_trunc('month', month_series)
    group by month_series
  ) m;

  return json_build_object(
    'dau', dau_count,
    'mau', mau_count,
    'monthly_trend', monthly_trend,
    'yearly_trend', yearly_trend
  );
end;
$$;
