-- Sign-in error disambiguation: lets the client tell "account not found" apart
-- from "wrong password" after Supabase Auth returns its generic "Invalid login
-- credentials" for both. This function returns ONLY a boolean; password
-- verification stays entirely inside Supabase Auth.
--
-- Abuse / enumeration model:
--   * Account existence is already discoverable through the sign-up flow
--     ("Account already exists"), so returning a boolean here adds no new
--     information CLASS. What we must avoid is making this a dramatically
--     CHEAPER bulk-enumeration oracle than what already exists.
--   * GLOBAL throttle — caps total existence checks per window across ALL
--     callers. It cannot be bypassed by spoofing request headers and is the
--     primary anti-bulk-scanning control. When the budget is exhausted the
--     function RAISES; the client then shows a neutral "incorrect email or
--     password" message. Sign-in itself never depends on this function, so
--     exhaustion degrades safely (worse error copy, never a failed login).
--   * PER-EMAIL throttle — stops repeated probing of a single address.
--   * PER-IP throttle (best effort) — applied ONLY when a trusted client IP is
--     available via cf-connecting-ip, which Cloudflare sets and overwrites on
--     ingress so a client cannot forge it. We deliberately DO NOT fall back to
--     the left-most X-Forwarded-For element (client-controllable) — keying on a
--     spoofable value would both let attackers dodge the limit and, if it
--     collapsed to a shared constant, lock out legitimate users.
--
-- Tuning note: the *_max caps below are sized for this app's scale. Raise them
-- if legitimate failed-login volume ever approaches the global cap; the only
-- effect of hitting a cap is the neutral (less specific) error message.

create table if not exists public.auth_existence_check_throttle (
  key text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);

-- RLS on with no policies: only this SECURITY DEFINER function (running as the
-- table owner, which bypasses RLS) can read or write the table. Clients cannot.
alter table public.auth_existence_check_throttle enable row level security;
revoke all on table public.auth_existence_check_throttle from anon, authenticated;

create index if not exists auth_existence_check_throttle_window_idx
  on public.auth_existence_check_throttle (window_start);

create or replace function public.check_account_exists(check_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  headers json;
  client_ip text;
  window_len   constant interval := interval '15 minutes';
  global_max   constant integer := 2000;  -- total checks / window across everyone
  email_max    constant integer := 10;    -- checks / window per email address
  ip_max       constant integer := 30;    -- checks / window per trusted client IP
  throttle_keys text[];
  throttle_caps integer[];
  idx integer;
  current_attempts integer;
begin
  normalized_email := lower(trim(check_email));

  -- Reject obviously invalid input by RAISING (not returning false): the client
  -- treats an errored RPC as "unknown" and shows a neutral message, so we never
  -- falsely tell a user "account not found" for input we did not actually check.
  -- Note we require only an '@' (not a dotted domain) so addresses like
  -- admin@intranet are checked normally rather than wrongly reported missing.
  if normalized_email is null
     or char_length(normalized_email) < 3
     or char_length(normalized_email) > 255
     or position('@' in normalized_email) = 0 then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  -- request.headers is a per-request GUC set by PostgREST. Guard the empty-string
  -- case ('' is not valid JSON) so the ::json cast can never abort the call.
  headers := nullif(current_setting('request.headers', true), '')::json;
  client_ip := substr(nullif(btrim(coalesce(headers ->> 'cf-connecting-ip', '')), ''), 1, 45);

  -- Occasionally sweep fully-expired rows so the table tracks roughly one active
  -- window's distinct keys instead of accumulating over time.
  if random() < 0.05 then
    delete from public.auth_existence_check_throttle
    where window_start < now() - window_len;
  end if;

  -- Always throttle globally and per-email; add per-IP only when we resolved a
  -- trusted client IP. Keys are length-bounded (email <= 255, ip <= 45, global
  -- constant), so distinct-key growth is bounded by the global cap per window.
  throttle_keys := array['global', 'em:' || normalized_email];
  throttle_caps := array[global_max, email_max];
  if client_ip is not null then
    throttle_keys := throttle_keys || ('ip:' || client_ip);
    throttle_caps := throttle_caps || ip_max;
  end if;

  for idx in 1 .. array_length(throttle_keys, 1) loop
    insert into public.auth_existence_check_throttle as t (key, window_start, attempts)
    values (throttle_keys[idx], now(), 1)
    on conflict (key) do update
      set attempts = case when t.window_start < now() - window_len then 1 else t.attempts + 1 end,
          window_start = case when t.window_start < now() - window_len then now() else t.window_start end
    returning t.attempts into current_attempts;

    -- Exceeding a cap raises, which rolls back this call's increments (so a
    -- blocked call cannot inflate counters or insert rows) and surfaces to the
    -- client as an error -> neutral message.
    if current_attempts > throttle_caps[idx] then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end loop;

  return exists (
    select 1
    from auth.users u
    where lower(u.email) = normalized_email
      and u.deleted_at is null
  );
end;
$$;

revoke all on function public.check_account_exists(text) from public;
grant execute on function public.check_account_exists(text) to anon, authenticated;
