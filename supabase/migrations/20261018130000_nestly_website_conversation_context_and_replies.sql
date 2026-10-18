alter table public.conversations
  add column if not exists nia_context jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_nia_context_object'
  ) then
    alter table public.conversations
      add constraint conversations_nia_context_object
      check (jsonb_typeof(nia_context) = 'object' and octet_length(nia_context::text) <= 8192);
  end if;
end;
$$;

create or replace function public.create_website_conversation(
  p_name text,
  p_email text,
  p_phone text,
  p_initial_message text,
  p_token_hash text,
  p_idempotency_key text
)
returns table (conversation_id uuid, message_id uuid, channel text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_token public.website_conversation_tokens%rowtype;
  customer_id uuid;
  new_conversation public.conversations%rowtype;
  new_message public.messages%rowtype;
  existing_message_id uuid;
  customer_name text := coalesce(nullif(btrim(p_name), ''), 'Website visitor');
begin
  if length(customer_name) > 120
     or p_initial_message is null
     or length(btrim(p_initial_message)) not between 1 and 4000
     or (p_email is not null and length(btrim(p_email)) > 254)
     or (p_phone is not null and length(btrim(p_phone)) > 40)
     or length(coalesce(p_token_hash, '')) not between 32 and 128
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid website conversation details' using errcode = '22023';
  end if;

  select * into existing_token
  from public.website_conversation_tokens t
  where t.idempotency_key = p_idempotency_key;
  if found then
    if existing_token.token_hash is distinct from p_token_hash then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    select m.id into existing_message_id
    from public.messages m
    where m.conversation_id = existing_token.conversation_id
      and m.idempotency_key = p_idempotency_key
    limit 1;
    return query select existing_token.conversation_id, existing_message_id, 'website'::text;
    return;
  end if;

  insert into public.customers (full_name, display_name)
  values (customer_name, customer_name)
  returning id into customer_id;

  insert into public.conversations (customer_id, mode, channel)
  values (customer_id, 'AI_ACTIVE', 'website')
  returning * into new_conversation;

  insert into public.website_conversation_contacts (conversation_id, email, phone)
  values (
    new_conversation.id,
    nullif(lower(btrim(p_email)), ''),
    nullif(btrim(p_phone), '')
  );

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    new_conversation.id, 'inbound', 'customer', btrim(p_initial_message),
    'text', 'received', p_idempotency_key
  ) returning * into new_message;

  insert into public.website_conversation_tokens (
    conversation_id, token_hash, idempotency_key, expires_at
  ) values (
    new_conversation.id, p_token_hash, p_idempotency_key, now() + interval '30 days'
  );

  return query select new_conversation.id, new_message.id, 'website'::text;
end;
$$;

create or replace function public.submit_website_message(
  p_token_hash text,
  p_content text,
  p_idempotency_key text
)
returns table (message_id uuid, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.website_conversation_tokens%rowtype;
  conversation public.conversations%rowtype;
  existing_message public.messages%rowtype;
  new_message public.messages%rowtype;
begin
  if p_content is null
     or length(btrim(p_content)) not between 1 and 4000
     or length(coalesce(p_token_hash, '')) not between 32 and 128
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid website message' using errcode = '22023';
  end if;

  select * into token_row
  from public.website_conversation_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  for update;
  if not found then
    raise exception 'Conversation token is invalid or expired'
      using errcode = '42501';
  end if;

  select * into conversation
  from public.conversations c
  where c.id = token_row.conversation_id
  for update;
  if conversation.mode = 'CLOSED' then
    raise exception 'Closed conversations cannot receive messages'
      using errcode = '22023';
  end if;

  select * into existing_message
  from public.messages m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.conversation_id <> token_row.conversation_id
       or existing_message.sender_type <> 'customer' then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_message.id, existing_message.delivery_status;
    return;
  end if;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    conversation.id, 'inbound', 'customer', btrim(p_content),
    'text', 'received', p_idempotency_key
  ) returning * into new_message;

  return query select new_message.id, new_message.delivery_status;
end;
$$;

create or replace function public.get_website_conversation_v2(p_token_hash text)
returns table (
  conversation_id uuid,
  mode text,
  nia_context jsonb,
  message_id uuid,
  sender_type text,
  content text,
  delivery_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select c.id, c.mode, c.nia_context
    from public.website_conversation_tokens t
    join public.conversations c on c.id = t.conversation_id
    where t.token_hash = p_token_hash
      and t.revoked_at is null
      and t.expires_at > now()
  ),
  recent_messages as (
    select m.id, m.conversation_id, m.sender_type, m.content, m.delivery_status, m.created_at
    from public.messages m
    join authorized a on a.id = m.conversation_id
    order by m.created_at desc, m.id desc
    limit 100
  )
  select
    a.id,
    a.mode,
    a.nia_context,
    m.id,
    m.sender_type,
    m.content,
    m.delivery_status,
    m.created_at
  from authorized a
  left join recent_messages m on m.conversation_id = a.id
  order by m.created_at nulls first, m.id nulls first
$$;

create or replace function public.append_website_nia_reply(
  p_token_hash text,
  p_content text,
  p_idempotency_key text,
  p_context jsonb
)
returns table (message_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.website_conversation_tokens%rowtype;
  conversation public.conversations%rowtype;
  existing_message public.messages%rowtype;
  new_message public.messages%rowtype;
begin
  if p_content is null
     or length(btrim(p_content)) not between 1 and 4000
     or length(coalesce(p_token_hash, '')) not between 32 and 128
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or p_context is null
     or jsonb_typeof(p_context) <> 'object'
     or octet_length(p_context::text) > 8192 then
    raise exception 'Invalid website assistant reply' using errcode = '22023';
  end if;

  select * into token_row
  from public.website_conversation_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  for update;
  if not found then
    raise exception 'Conversation token is invalid or expired'
      using errcode = '42501';
  end if;

  select * into conversation
  from public.conversations c
  where c.id = token_row.conversation_id
  for update;
  if conversation.mode <> 'AI_ACTIVE' then
    raise exception 'Nia cannot reply while a human owns the conversation'
      using errcode = '42501';
  end if;

  select * into existing_message
  from public.messages m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.conversation_id <> conversation.id
       or existing_message.sender_type <> 'nia' then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_message.id, existing_message.created_at;
    return;
  end if;

  update public.conversations
  set nia_context = p_context
  where id = conversation.id;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    conversation.id, 'outbound', 'nia', btrim(p_content),
    'text', 'sent', p_idempotency_key
  ) returning * into new_message;

  return query select new_message.id, new_message.created_at;
end;
$$;

create or replace function public.nestly_handoff_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.mode is not distinct from new.mode then
    return new;
  end if;
  if auth.uid() is null then
    if current_setting('nestly.website_handoff_conversation', true) is distinct from new.id::text then
      raise exception 'Not authorized to update conversation handoff notifications'
        using errcode = '42501';
    end if;
  elsif not (
    public.can_manage_conversation(new.id)
    or (
      old.assigned_staff_id = (select auth.uid())
      and public.can_access_conversation(new.id)
      and public.caller_role() in ('Operations Lead', 'Field Vetting Agent')
    )
  ) then
    raise exception 'Not authorized to update conversation handoff notifications'
      using errcode = '42501';
  end if;
  if new.mode = 'HUMAN_ACTIVE' then
    insert into public.notifications
      (conversation_id, channel, recipient, template_key, idempotency_key, status)
    select new.id, 'dashboard', s.id::text, 'human_handoff_requested',
      'handoff:' || new.id::text || ':' || new.updated_at::text || ':' || s.id::text,
      'queued'
    from public.profiles s
    where s.role in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care')
      and (new.assigned_staff_id is null or s.id = new.assigned_staff_id)
    on conflict (idempotency_key) do nothing;
  elsif old.mode = 'HUMAN_ACTIVE' and new.mode in ('AI_ACTIVE', 'CLOSED') then
    update public.notifications
    set status = 'cancelled'
    where conversation_id = new.id
      and channel = 'dashboard'
      and template_key = 'human_handoff_requested'
      and status = 'queued';
  end if;
  return new;
end;
$$;
revoke all on function public.nestly_handoff_notifications() from public, anon, authenticated;

create or replace function public.request_website_handoff(
  p_token_hash text,
  p_idempotency_key text
)
returns table (conversation_id uuid, mode text, message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.website_conversation_tokens%rowtype;
  conversation public.conversations%rowtype;
  new_message public.messages%rowtype;
begin
  if length(coalesce(p_token_hash, '')) not between 32 and 128
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid website handoff request' using errcode = '22023';
  end if;

  select * into token_row
  from public.website_conversation_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  for update;
  if not found then
    raise exception 'Conversation token is invalid or expired'
      using errcode = '42501';
  end if;

  select * into conversation
  from public.conversations c
  where c.id = token_row.conversation_id
  for update;
  if conversation.mode = 'CLOSED' then
    raise exception 'Closed conversations cannot be handed off'
      using errcode = '22023';
  end if;

  select m.* into new_message
  from public.messages m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if new_message.conversation_id <> conversation.id
       or new_message.sender_type <> 'system' then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select conversation.id, conversation.mode, new_message.id;
    return;
  end if;

  if conversation.mode = 'AI_ACTIVE' then
    perform set_config('nestly.website_handoff_conversation', conversation.id::text, true);
    update public.conversations
    set mode = 'HUMAN_ACTIVE', assigned_staff_id = null
    where id = conversation.id
    returning * into conversation;
  end if;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    conversation.id, 'outbound', 'system',
    'I have sent your request to the Nestly team. Your messages are saved here for a staff reply. This does not confirm an inspection or booking.',
    'text', 'sent', p_idempotency_key
  ) returning * into new_message;

  return query select conversation.id, conversation.mode, new_message.id;
end;
$$;

create or replace function public.send_website_staff_reply(
  p_conversation_id uuid,
  p_content text,
  p_idempotency_key text
)
returns table (message_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.conversations%rowtype;
  existing_message public.messages%rowtype;
  new_message public.messages%rowtype;
begin
  if auth.uid() is null
     or not public.can_manage_conversation(p_conversation_id) then
    raise exception 'Not authorized to reply to this conversation'
      using errcode = '42501';
  end if;
  if p_content is null
     or length(btrim(p_content)) not between 1 and 4000
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid staff reply' using errcode = '22023';
  end if;

  select * into conversation
  from public.conversations c
  where c.id = p_conversation_id
  for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if conversation.channel <> 'website' or conversation.mode <> 'HUMAN_ACTIVE' then
    raise exception 'Replies require a human-owned website conversation'
      using errcode = '22023';
  end if;

  select * into existing_message
  from public.messages m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.conversation_id <> conversation.id
       or existing_message.sender_type <> 'agent' then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_message.id, existing_message.created_at;
    return;
  end if;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    conversation.id, 'outbound', 'agent', btrim(p_content),
    'text', 'sent', p_idempotency_key
  ) returning * into new_message;

  return query select new_message.id, new_message.created_at;
end;
$$;

revoke all on function public.get_website_conversation_v2(text) from public;
revoke all on function public.append_website_nia_reply(text, text, text, jsonb) from public;
revoke all on function public.request_website_handoff(text, text) from public;
revoke all on function public.send_website_staff_reply(uuid, text, text) from public, anon;

grant execute on function public.get_website_conversation_v2(text) to anon, authenticated;
grant execute on function public.append_website_nia_reply(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.request_website_handoff(text, text) to anon, authenticated;
grant execute on function public.send_website_staff_reply(uuid, text, text) to authenticated;
