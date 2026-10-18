create table if not exists public.api_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_public_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if p_key_hash is null
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_max_requests is null
     or p_max_requests not between 1 and 100
     or p_window_seconds is null
     or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;

  insert into public.api_rate_limits as limits (key_hash, window_started_at, request_count)
  values (p_key_hash, pg_catalog.now(), 1)
  on conflict (key_hash) do update
    set window_started_at = case
          when limits.window_started_at
            <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
            then pg_catalog.now()
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at
            <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
            then 1
          else limits.request_count + 1
        end,
        updated_at = pg_catalog.now()
  returning request_count into current_count;

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer)
  to service_role;

comment on table public.api_rate_limits is
  'Hashed client/scope keys for atomic public API rate limiting; raw IP addresses are not stored.';
