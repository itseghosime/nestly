create or replace function public.record_twilio_reconciliation_attempt(
  p_actor_id uuid,
  p_message_id uuid,
  p_provider_message_id text,
  p_result text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  message_conversation_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required'
      using errcode = '42501';
  end if;

  if p_result is null
     or p_result not in (
       'not_stale', 'sid_required', 'provider_unavailable',
       'evidence_mismatch', 'reconciliation_conflict'
     )
     or (p_provider_message_id is not null and p_provider_message_id !~ '^SM[0-9A-Fa-f]{32}$')
     or (p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_-]{1,32}$') then
    raise exception 'Invalid Twilio reconciliation attempt'
      using errcode = '22023';
  end if;

  select p.role
  into actor_role
  from public.profiles as p
  where p.id = p_actor_id;

  if actor_role is null
     or actor_role not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care') then
    raise exception 'Staff authority is required'
      using errcode = '42501';
  end if;

  select m.conversation_id
  into message_conversation_id
  from public.messages as m
  join public.conversations as c on c.id = m.conversation_id
  where m.id = p_message_id
    and m.direction = 'outbound'
    and m.sender_type = 'agent'
    and c.channel = 'whatsapp';

  if not found then
    raise exception 'Twilio staff reply not found'
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    actor_id, actor_type, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    case when actor_role = 'Platform Admin' then 'admin' else 'agent' end,
    'twilio.dispatch.reconciliation_attempt',
    'message',
    p_message_id,
    jsonb_build_object(
      'conversation_id', message_conversation_id,
      'result', p_result,
      'provider_message_id', p_provider_message_id,
      'error_code', p_error_code
    )
  );
end;
$$;

create or replace function public.reconcile_twilio_staff_reply(
  p_actor_id uuid,
  p_message_id uuid,
  p_provider_message_id text,
  p_provider_status text,
  p_provider_created_at timestamptz,
  p_error_code text default null
)
returns table (
  message_id uuid,
  dispatch_status text,
  delivery_status text,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  message_row public.messages%rowtype;
  conversation_channel text;
  prior_dispatch_status text;
  prior_delivery_status text;
  applied_row record;
  result_disposition text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required'
      using errcode = '42501';
  end if;

  if p_provider_message_id is null
     or p_provider_message_id !~ '^SM[0-9A-Fa-f]{32}$'
     or lower(coalesce(p_provider_status, '')) not in (
       'accepted', 'scheduled', 'queued', 'sending', 'sent',
       'delivered', 'read', 'failed', 'undelivered', 'canceled'
     )
     or p_provider_created_at is null
     or (p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_-]{1,32}$') then
    raise exception 'Invalid verified Twilio evidence'
      using errcode = '22023';
  end if;

  select p.role
  into actor_role
  from public.profiles as p
  where p.id = p_actor_id;

  if actor_role is null
     or actor_role not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care') then
    raise exception 'Staff authority is required'
      using errcode = '42501';
  end if;

  select m.*
  into message_row
  from public.messages as m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception 'Twilio staff reply not found'
      using errcode = 'P0002';
  end if;

  select c.channel
  into conversation_channel
  from public.conversations as c
  where c.id = message_row.conversation_id;

  if conversation_channel is distinct from 'whatsapp'
     or message_row.direction <> 'outbound'
     or message_row.sender_type <> 'agent' then
    raise exception 'Message is not a Twilio WhatsApp staff reply'
      using errcode = '22023';
  end if;

  if p_provider_created_at < message_row.created_at - interval '2 minutes'
     or p_provider_created_at > message_row.created_at + interval '15 minutes' then
    raise exception 'Twilio message timestamp does not match the claimed reply'
      using errcode = '22023';
  end if;

  if message_row.provider_message_id is not null
     and message_row.provider_message_id <> p_provider_message_id then
    raise exception 'Provider message is already associated'
      using errcode = '23505';
  end if;

  if message_row.dispatch_status in ('dispatching', 'unknown')
     and coalesce(message_row.dispatch_updated_at, message_row.created_at) > now() - interval '15 minutes' then
    raise exception 'Twilio dispatch is not stale yet'
      using errcode = '55000';
  end if;

  if message_row.dispatch_status not in ('dispatching', 'unknown', 'accepted', 'failed')
     or (message_row.provider_message_id is null and message_row.dispatch_status not in ('dispatching', 'unknown')) then
    raise exception 'Message is not eligible for Twilio reconciliation'
      using errcode = '55000';
  end if;

  prior_dispatch_status := message_row.dispatch_status;
  prior_delivery_status := message_row.delivery_status;

  select applied.*
  into applied_row
  from public.apply_twilio_message_status(
    p_message_id,
    p_provider_message_id,
    lower(p_provider_status),
    p_error_code
  ) as applied;

  if not found then
    raise exception 'Twilio status reconciliation returned no message'
      using errcode = 'P0002';
  end if;

  result_disposition := case
    when prior_dispatch_status in ('dispatching', 'unknown') then 'reconciled'
    when prior_dispatch_status is distinct from applied_row.dispatch_status
      or prior_delivery_status is distinct from applied_row.delivery_status then 'status_refreshed'
    else 'already_current'
  end;

  insert into public.audit_logs (
    actor_id, actor_type, action, entity_type, entity_id, metadata
  ) values (
    p_actor_id,
    case when actor_role = 'Platform Admin' then 'admin' else 'agent' end,
    'twilio.dispatch.reconciled',
    'message',
    p_message_id,
    jsonb_build_object(
      'conversation_id', message_row.conversation_id,
      'provider_message_id', p_provider_message_id,
      'provider_status', lower(p_provider_status),
      'provider_created_at', p_provider_created_at,
      'from_dispatch_status', prior_dispatch_status,
      'to_dispatch_status', applied_row.dispatch_status,
      'from_delivery_status', prior_delivery_status,
      'to_delivery_status', applied_row.delivery_status,
      'disposition', result_disposition,
      'evidence_source', 'twilio_message_resource'
    )
  );

  return query
    select applied_row.message_id, applied_row.dispatch_status,
           applied_row.delivery_status, result_disposition;
end;
$$;

revoke all on function public.record_twilio_reconciliation_attempt(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_twilio_staff_reply(uuid, uuid, text, text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.record_twilio_reconciliation_attempt(uuid, uuid, text, text, text) to service_role;
grant execute on function public.reconcile_twilio_staff_reply(uuid, uuid, text, text, timestamptz, text) to service_role;
