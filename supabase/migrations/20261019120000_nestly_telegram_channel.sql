alter table public.conversations
  drop constraint if exists conversations_channel_check;

alter table public.conversations
  add constraint conversations_channel_check
  check (channel in ('website', 'whatsapp', 'telegram'));

alter table public.conversations
  add column if not exists telegram_identity_id uuid;

create table public.telegram_identities (
  id uuid primary key default gen_random_uuid(),
  bot_id bigint not null check (bot_id > 0),
  telegram_user_id bigint not null check (telegram_user_id > 0),
  chat_id bigint not null check (chat_id > 0),
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  username text check (username is null or length(username) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bot_id, telegram_user_id, chat_id),
  unique (id, bot_id, chat_id)
);

alter table public.conversations
  add constraint conversations_telegram_identity_id_fkey
  foreign key (telegram_identity_id) references public.telegram_identities(id) on delete restrict;

alter table public.conversations
  add constraint conversations_telegram_identity_channel_check
  check ((channel = 'telegram') = (telegram_identity_id is not null));

drop index if exists public.one_open_conversation_per_customer;
create unique index one_open_conversation_per_customer
  on public.conversations(customer_id, channel)
  where mode <> 'CLOSED';

create unique index one_open_telegram_conversation_per_identity
  on public.conversations(telegram_identity_id)
  where channel = 'telegram' and mode <> 'CLOSED';

create table public.telegram_updates (
  bot_id bigint not null check (bot_id > 0),
  update_id bigint not null check (update_id >= 0),
  telegram_user_id bigint check (telegram_user_id is null or telegram_user_id > 0),
  chat_id bigint check (chat_id is null or chat_id > 0),
  identity_id uuid references public.telegram_identities(id) on delete restrict,
  conversation_id uuid references public.conversations(id) on delete restrict,
  inbound_message_id uuid references public.messages(id) on delete restrict,
  reply_message_id uuid references public.messages(id) on delete restrict,
  state text not null check (
    state in ('processing', 'failed', 'dispatching', 'completed', 'human_owned', 'ignored', 'rejected', 'unknown')
  ),
  attempt_count smallint not null default 1 check (attempt_count between 1 and 12),
  lease_expires_at timestamptz,
  error_code text check (error_code is null or length(error_code) <= 32),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bot_id, update_id),
  check ((telegram_user_id is null) = (chat_id is null))
);

create table public.telegram_message_dispatches (
  message_id uuid primary key references public.messages(id) on delete restrict,
  bot_id bigint not null check (bot_id > 0),
  chat_id bigint not null check (chat_id > 0),
  update_id bigint,
  telegram_message_id bigint check (telegram_message_id is null or telegram_message_id > 0),
  state text not null check (state in ('dispatching', 'accepted', 'rejected', 'unknown')),
  attempt_count smallint not null default 1 check (attempt_count between 1 and 12),
  lease_expires_at timestamptz,
  error_code text check (error_code is null or length(error_code) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bot_id, update_id) references public.telegram_updates(bot_id, update_id) on delete restrict
);

create unique index telegram_message_dispatch_provider_id
  on public.telegram_message_dispatches(bot_id, chat_id, telegram_message_id)
  where telegram_message_id is not null;

create index telegram_updates_recovery_queue
  on public.telegram_updates(state, lease_expires_at)
  where state in ('processing', 'failed', 'dispatching');

alter table public.telegram_identities enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.telegram_message_dispatches enable row level security;

create policy telegram_identities_staff_read
  on public.telegram_identities
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.telegram_identity_id = telegram_identities.id
        and public.can_access_conversation(c.id)
    )
  );

revoke all on public.telegram_identities, public.telegram_updates, public.telegram_message_dispatches
  from public, anon, authenticated, service_role;
grant select on public.telegram_identities to authenticated;

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
    if current_setting('nestly.website_handoff_conversation', true) is distinct from new.id::text
       and current_setting('nestly.telegram_handoff_conversation', true) is distinct from new.id::text then
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

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        public.caller_role() in ('Platform Admin', 'Customer Care', 'Legal & Compliance')
        or (
          c.channel = 'telegram'
          and public.caller_role() in ('Operations Lead', 'Field Vetting Agent')
        )
        or (
          public.caller_role() in ('Operations Lead', 'Field Vetting Agent')
          and c.current_property_id is not null
          and public.can_access_property(c.current_property_id)
        )
        or (
          c.assigned_staff_id = (select auth.uid())
          and c.current_property_id is not null
          and public.can_access_property(c.current_property_id)
        )
      )
  )
$$;

create or replace function public.can_manage_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        public.caller_role() in ('Platform Admin', 'Customer Care')
        or (
          public.caller_role() in ('Operations Lead', 'Field Vetting Agent')
          and public.can_access_conversation(c.id)
          and (
            public.caller_role() = 'Operations Lead'
            or c.channel = 'telegram'
            or c.assigned_staff_id = (select auth.uid())
          )
        )
      )
  )
$$;

comment on function public.can_access_conversation(uuid) is
  'Telegram has no property or zone identity. Existing conversation staff roles can access its queue; staff dispatch still requires self-assignment.';

create or replace function public.claim_telegram_update(
  p_bot_id bigint,
  p_update_id bigint,
  p_telegram_user_id bigint,
  p_chat_id bigint
)
returns table (should_process boolean, state text, attempt_count smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_row public.telegram_updates%rowtype;
  inserted boolean := false;
begin
  if p_bot_id is null or p_bot_id <= 0
     or p_update_id is null or p_update_id < 0
     or ((p_telegram_user_id is null) <> (p_chat_id is null))
     or (p_telegram_user_id is not null and (p_telegram_user_id <= 0 or p_chat_id <= 0)) then
    raise exception 'Invalid Telegram update identity' using errcode = '22023';
  end if;

  insert into public.telegram_updates (
    bot_id, update_id, telegram_user_id, chat_id, state, attempt_count, lease_expires_at
  ) values (
    p_bot_id, p_update_id, p_telegram_user_id, p_chat_id,
    'processing', 1, now() + interval '2 minutes'
  ) on conflict (bot_id, update_id) do nothing
  returning true into inserted;

  if inserted then
    return query select true, 'processing'::text, 1::smallint;
    return;
  end if;

  select u.* into update_row
  from public.telegram_updates u
  where u.bot_id = p_bot_id and u.update_id = p_update_id
  for update;

  if update_row.telegram_user_id is distinct from p_telegram_user_id
     or update_row.chat_id is distinct from p_chat_id then
    raise exception 'Telegram update identity was reused' using errcode = '23505';
  end if;

  if update_row.state = 'dispatching'
     and coalesce(update_row.lease_expires_at, '-infinity'::timestamptz) <= now() then
    update public.telegram_message_dispatches d
    set state = 'unknown',
        error_code = 'DISPATCH_LEASE_EXPIRED',
        lease_expires_at = null,
        updated_at = now()
    where d.message_id = update_row.reply_message_id
      and d.state = 'dispatching';
    update public.messages m
    set dispatch_status = 'unknown',
        dispatch_error_code = 'DISPATCH_LEASE_EXPIRED',
        dispatch_updated_at = now()
    where m.id = update_row.reply_message_id
      and m.dispatch_status = 'dispatching';
    update public.telegram_updates u
    set state = 'unknown', error_code = 'DISPATCH_LEASE_EXPIRED',
        lease_expires_at = null, updated_at = now()
    where u.bot_id = p_bot_id and u.update_id = p_update_id
    returning * into update_row;
    return query select false, update_row.state, update_row.attempt_count;
    return;
  end if;

  if update_row.state in ('processing', 'dispatching')
     and coalesce(update_row.lease_expires_at, now() + interval '1 second') > now() then
    return query select false, update_row.state, update_row.attempt_count;
    return;
  end if;

  if update_row.state in ('failed', 'processing') then
    if update_row.attempt_count >= 12 then
      update public.telegram_updates u
      set state = 'failed', error_code = 'ATTEMPT_LIMIT',
          lease_expires_at = null, updated_at = now()
      where u.bot_id = p_bot_id and u.update_id = p_update_id
      returning * into update_row;
      return query select false, update_row.state, update_row.attempt_count;
      return;
    end if;
    update public.telegram_updates u
    set state = 'processing', attempt_count = u.attempt_count + 1,
        lease_expires_at = now() + interval '2 minutes',
        error_code = null, updated_at = now()
    where u.bot_id = p_bot_id and u.update_id = p_update_id
    returning * into update_row;
    return query select true, update_row.state, update_row.attempt_count;
    return;
  end if;

  return query select false, update_row.state, update_row.attempt_count;
end;
$$;

create or replace function public.complete_telegram_update(
  p_bot_id bigint,
  p_update_id bigint,
  p_state text,
  p_error_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_state text;
begin
  if p_state not in ('failed', 'human_owned', 'ignored')
     or (p_error_code is not null and length(p_error_code) > 32) then
    raise exception 'Invalid Telegram update completion' using errcode = '22023';
  end if;
  update public.telegram_updates u
  set state = p_state, error_code = p_error_code, lease_expires_at = null, updated_at = now()
  where u.bot_id = p_bot_id and u.update_id = p_update_id and u.state = 'processing'
  returning u.state into next_state;
  if next_state is null then
    select u.state into next_state
    from public.telegram_updates u
    where u.bot_id = p_bot_id and u.update_id = p_update_id;
  end if;
  if next_state is null then
    raise exception 'Telegram update not found' using errcode = 'P0002';
  end if;
  return next_state;
end;
$$;

create or replace function public.persist_telegram_inbound(
  p_bot_id bigint,
  p_update_id bigint,
  p_telegram_user_id bigint,
  p_chat_id bigint,
  p_display_name text,
  p_username text,
  p_content text
)
returns table (conversation_id uuid, mode text, nia_context jsonb, message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_row public.telegram_updates%rowtype;
  identity_row public.telegram_identities%rowtype;
  conversation_row public.conversations%rowtype;
  customer_id uuid;
  message_row public.messages%rowtype;
  identity_display_name text := nullif(btrim(p_display_name), '');
  inbound_key text := 'telegram:' || p_bot_id::text || ':' || p_update_id::text;
begin
  if p_bot_id is null or p_bot_id <= 0
     or p_update_id is null or p_update_id < 0
     or p_telegram_user_id is null or p_telegram_user_id <= 0
     or p_chat_id is null or p_chat_id <= 0 or p_chat_id <> p_telegram_user_id
     or identity_display_name is null or length(identity_display_name) > 120
     or (p_username is not null and length(p_username) > 64)
     or p_content is null or length(btrim(p_content)) not between 1 and 4000 then
    raise exception 'Invalid Telegram message' using errcode = '22023';
  end if;

  select u.* into update_row
  from public.telegram_updates u
  where u.bot_id = p_bot_id and u.update_id = p_update_id
  for update;
  if not found or update_row.state <> 'processing'
     or update_row.telegram_user_id is distinct from p_telegram_user_id
     or update_row.chat_id is distinct from p_chat_id then
    raise exception 'Telegram update is not currently owned' using errcode = '42501';
  end if;

  if update_row.inbound_message_id is not null then
    select c.* into conversation_row
    from public.conversations c
    where c.id = update_row.conversation_id;
    return query select conversation_row.id, conversation_row.mode,
      conversation_row.nia_context, update_row.inbound_message_id;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_bot_id::text || ':' || p_telegram_user_id::text || ':' || p_chat_id::text, 0)
  );

  select i.* into identity_row
  from public.telegram_identities i
  where i.bot_id = p_bot_id
    and i.telegram_user_id = p_telegram_user_id
    and i.chat_id = p_chat_id
  for update;
  if found then
    update public.telegram_identities i
    set display_name = identity_display_name, username = nullif(btrim(p_username), ''),
        updated_at = now()
    where i.id = identity_row.id
    returning * into identity_row;
  else
    insert into public.customers (full_name, display_name, email, phone, whatsapp_phone)
    values (identity_display_name, identity_display_name, null, null, null)
    returning id into customer_id;
    insert into public.telegram_identities (
      bot_id, telegram_user_id, chat_id, customer_id, display_name, username
    ) values (
      p_bot_id, p_telegram_user_id, p_chat_id, customer_id,
      identity_display_name, nullif(btrim(p_username), '')
    ) returning * into identity_row;
  end if;

  select c.* into conversation_row
  from public.conversations c
  where c.telegram_identity_id = identity_row.id and c.mode <> 'CLOSED'
  for update;
  if not found then
    insert into public.conversations (customer_id, mode, channel, telegram_identity_id)
    values (identity_row.customer_id, 'AI_ACTIVE', 'telegram', identity_row.id)
    returning * into conversation_row;
  end if;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    conversation_row.id, 'inbound', 'customer', btrim(p_content), 'text',
    'received', inbound_key
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into message_row;

  if message_row.id is null then
    select m.* into message_row
    from public.messages m
    where m.idempotency_key = inbound_key;
    if message_row.conversation_id <> conversation_row.id
       or message_row.sender_type <> 'customer'
       or message_row.content is distinct from btrim(p_content) then
      raise exception 'Telegram update message key was reused' using errcode = '23505';
    end if;
  end if;

  update public.telegram_updates u
  set identity_id = identity_row.id, conversation_id = conversation_row.id,
      inbound_message_id = message_row.id, updated_at = now()
  where u.bot_id = p_bot_id and u.update_id = p_update_id;

  update public.conversations c
  set updated_at = now()
  where c.id = conversation_row.id;

  return query select conversation_row.id, conversation_row.mode,
    conversation_row.nia_context, message_row.id;
end;
$$;

create or replace function public.claim_telegram_handoff_reply(
  p_bot_id bigint,
  p_update_id bigint,
  p_content text
)
returns table (message_id uuid, chat_id bigint, dispatch_status text, delivery_status text, created_at timestamptz, should_dispatch boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_row public.telegram_updates%rowtype;
  conversation_row public.conversations%rowtype;
  identity_row public.telegram_identities%rowtype;
  message_row public.messages%rowtype;
  reply_key text := 'telegram:' || p_bot_id::text || ':' || p_update_id::text || ':handoff';
begin
  if p_content is null or length(btrim(p_content)) not between 1 and 4000 then
    raise exception 'Invalid Telegram handoff reply' using errcode = '22023';
  end if;
  select u.* into update_row
  from public.telegram_updates u
  where u.bot_id = p_bot_id and u.update_id = p_update_id
  for update;
  if not found or update_row.state <> 'processing' then
    raise exception 'Telegram update is not currently owned' using errcode = '42501';
  end if;
  select c.* into conversation_row
  from public.conversations c
  where c.id = update_row.conversation_id
  for update;
  if not found then
    raise exception 'Telegram conversation not found' using errcode = 'P0002';
  end if;
  if conversation_row.mode <> 'AI_ACTIVE' then
    update public.telegram_updates
    set state = 'human_owned', lease_expires_at = null, updated_at = now()
    where bot_id = p_bot_id and update_id = p_update_id;
    return;
  end if;
  select i.* into identity_row
  from public.telegram_identities i
  where i.id = conversation_row.telegram_identity_id;
  if not found or conversation_row.channel <> 'telegram' then
    raise exception 'Telegram identity not found' using errcode = 'P0002';
  end if;

  perform set_config('nestly.telegram_handoff_conversation', conversation_row.id::text, true);
  update public.conversations
  set mode = 'HUMAN_ACTIVE', assigned_staff_id = null, updated_at = now()
  where id = conversation_row.id
  returning * into conversation_row;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key, dispatch_status, dispatch_updated_at
  ) values (
    conversation_row.id, 'outbound', 'system',
    'I have sent your request to the Nestly team. Your messages are saved here for a staff reply. This does not confirm an inspection or booking.',
    'text', 'queued', reply_key, 'dispatching', now()
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into message_row;

  if message_row.id is null then
    select m.* into message_row from public.messages m where m.idempotency_key = reply_key;
    if message_row.conversation_id <> conversation_row.id or message_row.sender_type <> 'system' then
      raise exception 'Telegram handoff key was reused' using errcode = '23505';
    end if;
    update public.telegram_updates
    set state = case when message_row.dispatch_status = 'dispatching' then 'dispatching' else 'completed' end,
        reply_message_id = message_row.id, updated_at = now()
    where bot_id = p_bot_id and update_id = p_update_id;
    return query select message_row.id, identity_row.chat_id, message_row.dispatch_status,
      message_row.delivery_status, message_row.created_at, false;
    return;
  end if;

  insert into public.telegram_message_dispatches (
    message_id, bot_id, chat_id, update_id, state, lease_expires_at
  ) values (
    message_row.id, p_bot_id, identity_row.chat_id, p_update_id, 'dispatching', now() + interval '2 minutes'
  );
  update public.telegram_updates
  set reply_message_id = message_row.id, state = 'dispatching',
      lease_expires_at = now() + interval '2 minutes', updated_at = now()
  where bot_id = p_bot_id and update_id = p_update_id;
  return query select message_row.id, identity_row.chat_id, 'dispatching'::text,
    'queued'::text, message_row.created_at, true;
end;
$$;

create or replace function public.claim_telegram_ai_reply(
  p_bot_id bigint,
  p_update_id bigint,
  p_content text,
  p_context jsonb
)
returns table (message_id uuid, chat_id bigint, dispatch_status text, delivery_status text, created_at timestamptz, should_dispatch boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_row public.telegram_updates%rowtype;
  conversation_row public.conversations%rowtype;
  identity_row public.telegram_identities%rowtype;
  message_row public.messages%rowtype;
  reply_key text := 'telegram:' || p_bot_id::text || ':' || p_update_id::text || ':nia';
begin
  if p_content is null or length(btrim(p_content)) not between 1 and 4000
     or p_context is null or jsonb_typeof(p_context) <> 'object'
     or octet_length(p_context::text) > 8192 then
    raise exception 'Invalid Telegram Nia reply' using errcode = '22023';
  end if;
  select u.* into update_row
  from public.telegram_updates u
  where u.bot_id = p_bot_id and u.update_id = p_update_id
  for update;
  if not found or update_row.state <> 'processing' then
    raise exception 'Telegram update is not currently owned' using errcode = '42501';
  end if;
  select c.* into conversation_row
  from public.conversations c
  where c.id = update_row.conversation_id
  for update;
  if not found then
    raise exception 'Telegram conversation not found' using errcode = 'P0002';
  end if;
  if conversation_row.channel <> 'telegram' then
    raise exception 'Nia reply requires a Telegram conversation' using errcode = '22023';
  end if;
  if conversation_row.mode <> 'AI_ACTIVE' then
    update public.telegram_updates
    set state = 'human_owned', lease_expires_at = null, updated_at = now()
    where bot_id = p_bot_id and update_id = p_update_id;
    return;
  end if;
  if exists (
    select 1 from public.messages m
    where m.conversation_id = conversation_row.id
      and m.direction = 'outbound'
      and m.sender_type in ('agent', 'nia')
      and m.dispatch_status in ('dispatching', 'unknown')
  ) then
    raise exception 'An earlier Telegram send has an unresolved outcome'
      using errcode = '55000';
  end if;
  select i.* into identity_row
  from public.telegram_identities i
  where i.id = conversation_row.telegram_identity_id;
  if not found then
    raise exception 'Telegram identity not found' using errcode = 'P0002';
  end if;

  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key, dispatch_status, dispatch_updated_at
  ) values (
    conversation_row.id, 'outbound', 'nia', btrim(p_content), 'text',
    'queued', reply_key, 'dispatching', now()
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into message_row;

  if message_row.id is null then
    select m.* into message_row from public.messages m where m.idempotency_key = reply_key;
    if message_row.conversation_id <> conversation_row.id
       or message_row.sender_type <> 'nia'
       or message_row.content is distinct from btrim(p_content) then
      raise exception 'Telegram Nia reply key was reused' using errcode = '23505';
    end if;
    update public.telegram_updates
    set state = case when message_row.dispatch_status = 'dispatching' then 'dispatching' else 'completed' end,
        reply_message_id = message_row.id, updated_at = now()
    where bot_id = p_bot_id and update_id = p_update_id;
    return query select message_row.id, identity_row.chat_id, message_row.dispatch_status,
      message_row.delivery_status, message_row.created_at, false;
    return;
  end if;

  insert into public.telegram_message_dispatches (
    message_id, bot_id, chat_id, update_id, state, lease_expires_at
  ) values (
    message_row.id, p_bot_id, identity_row.chat_id, p_update_id, 'dispatching', now() + interval '2 minutes'
  );
  update public.conversations
  set nia_context = p_context, updated_at = now()
  where id = conversation_row.id;
  update public.telegram_updates
  set reply_message_id = message_row.id, state = 'dispatching',
      lease_expires_at = now() + interval '2 minutes', updated_at = now()
  where bot_id = p_bot_id and update_id = p_update_id;
  return query select message_row.id, identity_row.chat_id, 'dispatching'::text,
    'queued'::text, message_row.created_at, true;
end;
$$;

create or replace function public.claim_telegram_staff_reply(
  p_conversation_id uuid,
  p_content text,
  p_idempotency_key text
)
returns table (
  message_id uuid,
  bot_id bigint,
  chat_id bigint,
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
  identity_row public.telegram_identities%rowtype;
  existing_message public.messages%rowtype;
  message_row public.messages%rowtype;
begin
  if auth.uid() is null
     or not public.can_manage_conversation(p_conversation_id)
     or public.caller_role() not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care') then
    raise exception 'Conversation is not accessible to this staff member' using errcode = '42501';
  end if;
  if p_content is null or length(btrim(p_content)) not between 1 and 4000
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid Telegram staff reply' using errcode = '22023';
  end if;
  select c.* into conversation_row
  from public.conversations c
  where c.id = p_conversation_id
  for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if conversation_row.channel <> 'telegram'
     or conversation_row.mode <> 'HUMAN_ACTIVE'
     or conversation_row.assigned_staff_id is distinct from auth.uid() then
    raise exception 'An assigned staff takeover is required before replying'
      using errcode = '42501';
  end if;
  select m.* into existing_message from public.messages m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.conversation_id <> p_conversation_id
       or existing_message.sender_type <> 'agent'
       or existing_message.direction <> 'outbound'
       or existing_message.content is distinct from btrim(p_content) then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    select i.* into identity_row
    from public.telegram_identities i
    where i.id = conversation_row.telegram_identity_id;
    return query select existing_message.id, identity_row.bot_id, identity_row.chat_id,
      existing_message.dispatch_status, existing_message.delivery_status,
      existing_message.created_at, false;
    return;
  end if;
  if exists (
    select 1 from public.messages m
    where m.conversation_id = conversation_row.id
      and m.direction = 'outbound'
      and m.sender_type in ('agent', 'nia')
      and m.dispatch_status in ('dispatching', 'unknown')
  ) then
    raise exception 'A previous Telegram send has an unresolved outcome'
      using errcode = '55000';
  end if;
  select i.* into identity_row
  from public.telegram_identities i
  where i.id = conversation_row.telegram_identity_id;
  if not found then
    raise exception 'Telegram identity not found' using errcode = 'P0002';
  end if;
  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key, dispatch_status, dispatch_updated_at
  ) values (
    p_conversation_id, 'outbound', 'agent', btrim(p_content), 'text',
    'queued', p_idempotency_key, 'dispatching', now()
  ) returning * into message_row;
  insert into public.telegram_message_dispatches (
    message_id, bot_id, chat_id, state, lease_expires_at
  ) values (
    message_row.id, identity_row.bot_id, identity_row.chat_id,
    'dispatching', now() + interval '2 minutes'
  );
  return query select message_row.id, identity_row.bot_id, identity_row.chat_id,
    'dispatching'::text, 'queued'::text, message_row.created_at, true;
end;
$$;

create or replace function public.finish_telegram_dispatch(
  p_message_id uuid,
  p_outcome text,
  p_telegram_message_id bigint default null,
  p_error_code text default null
)
returns table (message_id uuid, dispatch_status text, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_row public.telegram_message_dispatches%rowtype;
  message_row public.messages%rowtype;
  next_state text;
  next_delivery text;
begin
  if p_outcome not in ('accepted', 'rejected', 'unknown')
     or (p_error_code is not null and length(p_error_code) > 32)
     or (p_outcome = 'accepted' and (p_telegram_message_id is null or p_telegram_message_id <= 0))
     or (p_outcome <> 'accepted' and p_telegram_message_id is not null) then
    raise exception 'Invalid Telegram dispatch outcome' using errcode = '22023';
  end if;
  select d.* into dispatch_row
  from public.telegram_message_dispatches d
  where d.message_id = p_message_id
  for update;
  if not found then
    raise exception 'Telegram dispatch not found' using errcode = 'P0002';
  end if;
  select m.* into message_row
  from public.messages m
  where m.id = p_message_id
  for update;
  if not found then
    raise exception 'Telegram message not found' using errcode = 'P0002';
  end if;

  if dispatch_row.state in ('accepted', 'rejected') then
    return query select message_row.id, message_row.dispatch_status, message_row.delivery_status;
    return;
  end if;
  if p_outcome = 'unknown' and dispatch_row.state <> 'dispatching' then
    return query select message_row.id, message_row.dispatch_status, message_row.delivery_status;
    return;
  end if;
  if dispatch_row.telegram_message_id is not null
     and dispatch_row.telegram_message_id is distinct from p_telegram_message_id then
    raise exception 'Telegram message ID cannot be changed' using errcode = '23505';
  end if;

  next_state := p_outcome;
  next_delivery := case p_outcome when 'accepted' then 'sent' when 'rejected' then 'failed' else 'queued' end;
  update public.telegram_message_dispatches d
  set state = next_state,
      telegram_message_id = case when p_outcome = 'accepted' then p_telegram_message_id else d.telegram_message_id end,
      error_code = case when p_outcome = 'accepted' then null else p_error_code end,
      lease_expires_at = null,
      updated_at = now()
  where d.message_id = p_message_id;
  update public.messages m
  set dispatch_status = case p_outcome when 'rejected' then 'failed' else next_state end,
      delivery_status = next_delivery,
      dispatch_error_code = case when p_outcome = 'accepted' then null else p_error_code end,
      dispatch_updated_at = now()
  where m.id = p_message_id
  returning * into message_row;
  if dispatch_row.update_id is not null then
    update public.telegram_updates u
    set state = case p_outcome
        when 'accepted' then 'completed'
        when 'rejected' then 'rejected'
        else 'unknown'
      end,
      error_code = case when p_outcome = 'accepted' then null else p_error_code end,
      lease_expires_at = null,
      updated_at = now()
    where u.bot_id = dispatch_row.bot_id and u.update_id = dispatch_row.update_id;
  end if;
  return query select message_row.id, message_row.dispatch_status, message_row.delivery_status;
end;
$$;

create or replace function public.mark_expired_telegram_dispatches_unknown()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  with expired as (
    update public.telegram_message_dispatches d
    set state = 'unknown', error_code = 'DISPATCH_LEASE_EXPIRED',
        lease_expires_at = null, updated_at = now()
    where d.state = 'dispatching' and d.lease_expires_at <= now()
    returning d.message_id, d.bot_id, d.update_id
  ), updated_messages as (
    update public.messages m
    set dispatch_status = 'unknown', dispatch_error_code = 'DISPATCH_LEASE_EXPIRED',
        dispatch_updated_at = now()
    from expired e
    where m.id = e.message_id and m.dispatch_status = 'dispatching'
    returning m.id
  )
  update public.telegram_updates u
  set state = 'unknown', error_code = 'DISPATCH_LEASE_EXPIRED',
      lease_expires_at = null, updated_at = now()
  from expired e
  where e.update_id is not null
    and u.bot_id = e.bot_id and u.update_id = e.update_id;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function public.guard_telegram_pending_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.channel = 'telegram' then
    with expired as (
      update public.telegram_message_dispatches d
      set state = 'unknown',
          error_code = 'DISPATCH_LEASE_EXPIRED',
          lease_expires_at = null,
          updated_at = now()
      from public.messages m
      where d.message_id = m.id
        and m.conversation_id = old.id
        and d.state = 'dispatching'
        and d.lease_expires_at <= now()
      returning d.message_id, d.bot_id, d.update_id
    ), updated_messages as (
      update public.messages m
      set dispatch_status = 'unknown',
          dispatch_error_code = 'DISPATCH_LEASE_EXPIRED',
          dispatch_updated_at = now()
      from expired e
      where m.id = e.message_id and m.dispatch_status = 'dispatching'
      returning m.id
    )
    update public.telegram_updates u
    set state = 'unknown',
        error_code = 'DISPATCH_LEASE_EXPIRED',
        lease_expires_at = null,
        updated_at = now()
    from expired e
    where e.update_id is not null
      and u.bot_id = e.bot_id and u.update_id = e.update_id;
  end if;

  if (
    new.mode is distinct from old.mode
    or new.assigned_staff_id is distinct from old.assigned_staff_id
  ) and exists (
    select 1
    from public.messages m
    where m.conversation_id = old.id
      and m.direction = 'outbound'
      and m.sender_type in ('agent', 'nia')
      and m.dispatch_status = 'dispatching'
      and m.dispatch_updated_at > now() - interval '2 minutes'
  ) then
    raise exception 'Conversation ownership cannot change while a Telegram send is actively dispatching'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.guard_twilio_pending_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.mode is distinct from old.mode
    or new.assigned_staff_id is distinct from old.assigned_staff_id
  ) and exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.conversation_id = old.id
      and m.direction = 'outbound'
      and m.sender_type = 'agent'
      and m.dispatch_status in ('dispatching', 'unknown')
      and (
        c.channel <> 'telegram'
        or (
          m.dispatch_status = 'dispatching'
          and m.dispatch_updated_at > now() - interval '2 minutes'
        )
      )
  ) then
    raise exception 'Conversation ownership cannot change while a Twilio or active Telegram send is unresolved'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_twilio_pending_assignment_change() from public, anon, authenticated, service_role;

drop trigger if exists nestly_telegram_pending_assignment_guard on public.conversations;
create trigger nestly_telegram_pending_assignment_guard
before update of mode, assigned_staff_id on public.conversations
for each row execute function public.guard_telegram_pending_assignment_change();

revoke all on function public.claim_telegram_update(bigint, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.complete_telegram_update(bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.persist_telegram_inbound(bigint, bigint, bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_telegram_handoff_reply(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.claim_telegram_ai_reply(bigint, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_telegram_staff_reply(uuid, text, text) from public, anon, service_role;
revoke all on function public.finish_telegram_dispatch(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.mark_expired_telegram_dispatches_unknown() from public, anon, authenticated, service_role;
revoke all on function public.guard_telegram_pending_assignment_change() from public, anon, authenticated, service_role;

grant execute on function public.claim_telegram_update(bigint, bigint, bigint, bigint) to service_role;
grant execute on function public.complete_telegram_update(bigint, bigint, text, text) to service_role;
grant execute on function public.persist_telegram_inbound(bigint, bigint, bigint, bigint, text, text, text) to service_role;
grant execute on function public.claim_telegram_handoff_reply(bigint, bigint, text) to service_role;
grant execute on function public.claim_telegram_ai_reply(bigint, bigint, text, jsonb) to service_role;
grant execute on function public.claim_telegram_staff_reply(uuid, text, text) to authenticated;
grant execute on function public.finish_telegram_dispatch(uuid, text, bigint, text) to service_role;
grant execute on function public.mark_expired_telegram_dispatches_unknown() to service_role;
