-- Handoff transition triggers need to write notifications despite staff-facing
-- notification access being read-only. Keep the trigger caller explicitly scoped.
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
  if auth.uid() is null
     or not (
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
