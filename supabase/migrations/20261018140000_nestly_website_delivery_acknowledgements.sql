create or replace function public.nestly_queue_website_outbound_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction = 'outbound'
     and new.sender_type in ('nia', 'agent', 'system')
     and new.delivery_status = 'sent'
     and exists (
       select 1
       from public.conversations c
       where c.id = new.conversation_id
         and c.channel = 'website'
     ) then
    new.delivery_status := 'queued';
  end if;
  return new;
end;
$$;

revoke all on function public.nestly_queue_website_outbound_messages() from public, anon, authenticated;

update public.messages m
set delivery_status = 'queued'
from public.conversations c
where c.id = m.conversation_id
  and c.channel = 'website'
  and m.direction = 'outbound'
  and m.sender_type in ('nia', 'agent', 'system')
  and m.delivery_status = 'sent';

drop trigger if exists nestly_queue_website_outbound_messages on public.messages;
create trigger nestly_queue_website_outbound_messages
before insert or update of conversation_id, direction, sender_type, delivery_status
on public.messages
for each row
execute function public.nestly_queue_website_outbound_messages();

create or replace function public.acknowledge_website_conversation_messages(
  p_token_hash text,
  p_message_ids uuid[]
)
returns table (message_id uuid, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.website_conversation_tokens%rowtype;
begin
  if length(coalesce(p_token_hash, '')) not between 32 and 128
     or coalesce(cardinality(p_message_ids), 0) not between 1 and 100 then
    raise exception 'Invalid website delivery acknowledgement'
      using errcode = '22023';
  end if;

  select t.* into token_row
  from public.website_conversation_tokens t
  join public.conversations c on c.id = t.conversation_id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
    and c.channel = 'website'
  for update of t;
  if not found then
    raise exception 'Conversation token is invalid or expired'
      using errcode = '42501';
  end if;

  return query
  update public.messages m
  set delivery_status = 'delivered'
  where m.conversation_id = token_row.conversation_id
    and m.id = any(p_message_ids)
    and m.direction = 'outbound'
    and m.sender_type in ('nia', 'agent', 'system')
    and m.delivery_status = 'queued'
  returning m.id, m.delivery_status;
end;
$$;

revoke all on function public.acknowledge_website_conversation_messages(text, uuid[]) from public;
grant execute on function public.acknowledge_website_conversation_messages(text, uuid[]) to anon, authenticated;
