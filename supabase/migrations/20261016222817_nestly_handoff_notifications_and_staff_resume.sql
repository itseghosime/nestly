-- Nestly handoff notifications and authenticated staff resume.
-- Existing conversation/notification RLS remains in force.
create or replace function public.nestly_handoff_notifications()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.mode is not distinct from new.mode then
    return new;
  end if;
  if new.mode = 'HUMAN_ACTIVE' then
    insert into public.notifications
      (conversation_id, channel, recipient, template_key, idempotency_key, status)
    select new.id, 'dashboard', s.id::text, 'human_handoff_requested',
      'handoff:' || new.id::text || ':' || new.updated_at::text || ':' || s.id::text,
      'queued'
    from public.staff_profiles s
    where new.assigned_staff_id is null or s.id = new.assigned_staff_id
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
create trigger nestly_conversation_handoff_notifications
after update of mode on public.conversations
for each row
when (old.mode is distinct from new.mode)
execute function public.nestly_handoff_notifications();

create or replace function public.return_to_ai(p_conversation_id uuid)
returns public.conversations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conversation public.conversations;
begin
  if auth.uid() is null or not public.is_nestly_staff() then
    raise exception 'Only authenticated Nestly staff can resume Nia' using errcode = '42501';
  end if;
  select * into conversation from public.conversations
    where id = p_conversation_id for update;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if conversation.mode = 'CLOSED' then
    raise exception 'Closed conversations cannot be resumed' using errcode = '22023';
  end if;
  if conversation.mode = 'AI_ACTIVE' then
    return conversation;
  end if;
  update public.conversations
    set mode = 'AI_ACTIVE', ai_resumed_at = now(), assigned_staff_id = null
    where id = p_conversation_id
    returning * into conversation;
  return conversation;
end;
$$;
revoke all on function public.return_to_ai(uuid) from public, anon, authenticated;
grant execute on function public.return_to_ai(uuid) to authenticated;
comment on function public.return_to_ai(uuid) is
'Staff-only return of a human-mode conversation to Nia. Uses caller RLS; no automatic or customer-triggered resume.';
;
