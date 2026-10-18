alter table public.messages
  add column if not exists dispatch_status text not null default 'not_applicable',
  add column if not exists dispatch_error_code text,
  add column if not exists dispatch_updated_at timestamptz;

alter table public.messages
  drop constraint if exists messages_delivery_status_check;
alter table public.messages
  add constraint messages_delivery_status_check
  check (delivery_status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'undelivered'))
  not valid;
alter table public.messages
  validate constraint messages_delivery_status_check;

alter table public.messages
  drop constraint if exists messages_dispatch_status_check;
alter table public.messages
  add constraint messages_dispatch_status_check
  check (dispatch_status in ('not_applicable', 'dispatching', 'accepted', 'failed', 'unknown'))
  not valid;
alter table public.messages
  validate constraint messages_dispatch_status_check;

alter table public.messages
  drop constraint if exists messages_dispatch_error_code_check;
alter table public.messages
  add constraint messages_dispatch_error_code_check
  check (dispatch_error_code is null or length(dispatch_error_code) <= 32)
  not valid;
alter table public.messages
  validate constraint messages_dispatch_error_code_check;

create index if not exists messages_twilio_unresolved_dispatch_idx
  on public.messages (conversation_id, created_at)
  where direction = 'outbound'
    and sender_type = 'agent'
    and dispatch_status in ('dispatching', 'unknown');

create table if not exists public.twilio_message_status_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  provider_message_id text not null,
  provider_status text not null check (
    provider_status in (
      'accepted', 'scheduled', 'queued', 'sending', 'sent',
      'delivered', 'read', 'failed', 'undelivered', 'canceled'
    )
  ),
  error_code text check (error_code is null or length(error_code) <= 32),
  received_at timestamptz not null default now(),
  unique (provider_message_id, provider_status)
);

create index if not exists twilio_message_status_events_message_idx
  on public.twilio_message_status_events (message_id, received_at);

alter table public.twilio_message_status_events enable row level security;
revoke all on public.twilio_message_status_events from public, anon, authenticated;

create or replace function public.merge_twilio_delivery_status(
  p_current_status text,
  p_incoming_status text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  current_status text := lower(coalesce(p_current_status, 'queued'));
  incoming_status text := lower(coalesce(p_incoming_status, ''));
begin
  if current_status in ('read', 'delivered', 'failed', 'undelivered') then
    return current_status;
  end if;

  if incoming_status in ('failed', 'canceled') then
    return 'failed';
  elsif incoming_status = 'undelivered' then
    return 'undelivered';
  elsif incoming_status = 'read' then
    return 'read';
  elsif incoming_status = 'delivered' then
    return 'delivered';
  elsif incoming_status = 'sent' then
    return 'sent';
  elsif incoming_status in ('accepted', 'scheduled', 'queued', 'sending') then
    return coalesce(nullif(current_status, 'received'), 'queued');
  end if;

  raise exception 'Unsupported Twilio message status'
    using errcode = '22023';
end;
$$;

create or replace function public.claim_twilio_staff_reply(
  p_conversation_id uuid,
  p_content text,
  p_idempotency_key text
)
returns table (
  message_id uuid,
  recipient text,
  dispatch_status text,
  delivery_status text,
  created_at timestamptz,
  should_dispatch boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_row public.conversations%rowtype;
  existing_message public.messages%rowtype;
  new_message public.messages%rowtype;
  recipient_phone text;
begin
  if auth.uid() is null or not public.can_manage_conversation(p_conversation_id) then
    raise exception 'Conversation is not accessible'
      using errcode = '42501';
  end if;

  if p_content is null
     or length(btrim(p_content)) not between 1 and 4000
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid Twilio staff reply'
      using errcode = '22023';
  end if;

  select c.*
  into conversation_row
  from public.conversations as c
  where c.id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found'
      using errcode = 'P0002';
  end if;

  select m.*
  into existing_message
  from public.messages as m
  where m.idempotency_key = p_idempotency_key;

  if found then
    if existing_message.conversation_id <> p_conversation_id
       or existing_message.sender_type <> 'agent'
       or existing_message.direction <> 'outbound'
       or existing_message.content is distinct from btrim(p_content) then
      raise exception 'Idempotency key was reused'
        using errcode = '23505';
    end if;
    return query
      select existing_message.id, null::text, existing_message.dispatch_status,
             existing_message.delivery_status, existing_message.created_at, false;
    return;
  end if;

  if conversation_row.channel <> 'whatsapp' then
    raise exception 'Twilio replies require a WhatsApp conversation'
      using errcode = '22023';
  end if;
  if conversation_row.mode <> 'HUMAN_ACTIVE' then
    raise exception 'A staff takeover is required before replying'
      using errcode = '22023';
  end if;
  if conversation_row.assigned_staff_id is distinct from auth.uid() then
    raise exception 'The conversation is assigned to another staff member'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.messages as pending
    where pending.conversation_id = p_conversation_id
      and pending.direction = 'outbound'
      and pending.sender_type = 'agent'
      and pending.dispatch_status in ('dispatching', 'unknown')
  ) then
    raise exception 'A previous Twilio send has an unresolved outcome'
      using errcode = '55000';
  end if;

  select c.whatsapp_phone
  into recipient_phone
  from public.customers as c
  where c.id = conversation_row.customer_id;

  if recipient_phone is null or length(btrim(recipient_phone)) > 40 then
    raise exception 'Customer WhatsApp address is unavailable'
      using errcode = '22023';
  end if;

  insert into public.messages (
    conversation_id,
    direction,
    sender_type,
    content,
    message_type,
    delivery_status,
    idempotency_key,
    dispatch_status,
    dispatch_updated_at
  ) values (
    p_conversation_id,
    'outbound',
    'agent',
    btrim(p_content),
    'text',
    'queued',
    p_idempotency_key,
    'dispatching',
    now()
  )
  returning * into new_message;

  return query
    select new_message.id, recipient_phone, new_message.dispatch_status,
           new_message.delivery_status, new_message.created_at, true;
end;
$$;

create or replace function public.finish_twilio_staff_reply(
  p_message_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_provider_status text default null,
  p_error_code text default null
)
returns table (message_id uuid, dispatch_status text, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.messages%rowtype;
  normalized_status text := lower(coalesce(p_provider_status, ''));
  next_dispatch_status text;
  next_delivery_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required'
      using errcode = '42501';
  end if;

  if p_outcome is null
     or p_outcome not in ('accepted', 'rejected', 'unknown')
     or (p_error_code is not null and length(p_error_code) > 32) then
    raise exception 'Invalid Twilio dispatch result'
      using errcode = '22023';
  end if;

  if p_outcome = 'accepted'
     and (
       p_provider_message_id is null
       or p_provider_message_id !~ '^SM[0-9A-Fa-f]{32}$'
       or normalized_status not in (
         'accepted', 'scheduled', 'queued', 'sending', 'sent',
         'delivered', 'read', 'failed', 'undelivered', 'canceled'
       )
     ) then
    raise exception 'Invalid accepted Twilio result'
      using errcode = '22023';
  end if;

  select m.*
  into message_row
  from public.messages as m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found'
      using errcode = 'P0002';
  end if;
  if message_row.direction <> 'outbound'
     or message_row.sender_type <> 'agent'
     or not exists (
       select 1
       from public.conversations as c
       where c.id = message_row.conversation_id
         and c.channel = 'whatsapp'
     ) then
    raise exception 'Message is not a Twilio WhatsApp staff reply'
      using errcode = '22023';
  end if;

  next_dispatch_status := message_row.dispatch_status;
  next_delivery_status := message_row.delivery_status;

  if p_outcome = 'accepted' then
    if message_row.provider_message_id is not null
       and message_row.provider_message_id <> p_provider_message_id then
      raise exception 'Provider message is already associated'
        using errcode = '23505';
    end if;
    next_delivery_status := public.merge_twilio_delivery_status(
      message_row.delivery_status, normalized_status
    );
    if message_row.dispatch_status <> 'failed' then
      next_dispatch_status := case
        when next_delivery_status in ('failed', 'undelivered') then 'failed'
        else 'accepted'
      end;
    end if;
    update public.messages as m
    set provider_message_id = p_provider_message_id,
        dispatch_status = next_dispatch_status,
        delivery_status = next_delivery_status,
        dispatch_error_code = case
          when next_dispatch_status = 'failed' then coalesce(p_error_code, m.dispatch_error_code)
          else null
        end,
        dispatch_updated_at = now()
    where m.id = p_message_id
    returning * into message_row;
  elsif p_outcome = 'rejected' then
    if message_row.provider_message_id is null
       and message_row.dispatch_status in ('dispatching', 'unknown') then
      next_dispatch_status := 'failed';
      next_delivery_status := public.merge_twilio_delivery_status(
        message_row.delivery_status, 'failed'
      );
      update public.messages as m
      set dispatch_status = next_dispatch_status,
          delivery_status = next_delivery_status,
          dispatch_error_code = p_error_code,
          dispatch_updated_at = now()
      where m.id = p_message_id
      returning * into message_row;
    end if;
  elsif message_row.provider_message_id is null
        and message_row.dispatch_status = 'dispatching' then
    update public.messages as m
    set dispatch_status = 'unknown',
        dispatch_error_code = p_error_code,
        dispatch_updated_at = now()
    where m.id = p_message_id
    returning * into message_row;
  end if;

  return query
    select message_row.id, message_row.dispatch_status, message_row.delivery_status;
end;
$$;

create or replace function public.apply_twilio_message_status(
  p_message_id uuid,
  p_provider_message_id text,
  p_provider_status text,
  p_error_code text default null
)
returns table (message_id uuid, dispatch_status text, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.messages%rowtype;
  normalized_status text := lower(coalesce(p_provider_status, ''));
  next_dispatch_status text;
  next_delivery_status text;
  inserted_event_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required'
      using errcode = '42501';
  end if;

  if p_provider_message_id is null
     or p_provider_message_id !~ '^SM[0-9A-Fa-f]{32}$'
     or normalized_status not in (
       'accepted', 'scheduled', 'queued', 'sending', 'sent',
       'delivered', 'read', 'failed', 'undelivered', 'canceled'
     )
     or (p_error_code is not null and length(p_error_code) > 32) then
    raise exception 'Invalid Twilio status callback'
      using errcode = '22023';
  end if;

  select m.*
  into message_row
  from public.messages as m
  where m.id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found'
      using errcode = 'P0002';
  end if;
  if message_row.direction <> 'outbound'
     or message_row.sender_type <> 'agent'
     or not exists (
       select 1
       from public.conversations as c
       where c.id = message_row.conversation_id
         and c.channel = 'whatsapp'
     ) then
    raise exception 'Message is not a Twilio WhatsApp staff reply'
      using errcode = '22023';
  end if;
  if message_row.provider_message_id is not null
     and message_row.provider_message_id <> p_provider_message_id then
    raise exception 'Provider message does not match this message'
      using errcode = '23505';
  end if;
  if message_row.provider_message_id is null
     and message_row.dispatch_status not in ('dispatching', 'unknown') then
    raise exception 'Message is not awaiting a provider result'
      using errcode = '55000';
  end if;

  insert into public.twilio_message_status_events (
    message_id, provider_message_id, provider_status, error_code
  ) values (
    p_message_id, p_provider_message_id, normalized_status, p_error_code
  )
  on conflict (provider_message_id, provider_status) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is not null then
    next_delivery_status := public.merge_twilio_delivery_status(
      message_row.delivery_status, normalized_status
    );
    next_dispatch_status := case
      when next_delivery_status in ('failed', 'undelivered') then 'failed'
      else 'accepted'
    end;
    update public.messages as m
    set provider_message_id = p_provider_message_id,
        dispatch_status = next_dispatch_status,
        delivery_status = next_delivery_status,
        dispatch_error_code = case
          when next_dispatch_status = 'failed' then coalesce(p_error_code, m.dispatch_error_code)
          else null
        end,
        dispatch_updated_at = now()
    where m.id = p_message_id
    returning * into message_row;
  end if;

  return query
    select message_row.id, message_row.dispatch_status, message_row.delivery_status;
end;
$$;

revoke all on function public.merge_twilio_delivery_status(text, text) from public, anon, authenticated, service_role;
revoke all on function public.claim_twilio_staff_reply(uuid, text, text) from public, anon, service_role;
revoke all on function public.finish_twilio_staff_reply(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_twilio_message_status(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.claim_twilio_staff_reply(uuid, text, text) to authenticated;
grant execute on function public.finish_twilio_staff_reply(uuid, text, text, text, text) to service_role;
grant execute on function public.apply_twilio_message_status(uuid, text, text, text) to service_role;
