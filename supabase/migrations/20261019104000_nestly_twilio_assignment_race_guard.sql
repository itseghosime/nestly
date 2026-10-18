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
    from public.messages as m
    where m.conversation_id = old.id
      and m.direction = 'outbound'
      and m.sender_type = 'agent'
      and m.dispatch_status in ('dispatching', 'unknown')
  ) then
    raise exception 'Conversation ownership cannot change while a Twilio send is unresolved'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_twilio_pending_assignment_change() from public, anon, authenticated, service_role;

drop trigger if exists nestly_twilio_pending_assignment_guard on public.conversations;
create trigger nestly_twilio_pending_assignment_guard
before update of mode, assigned_staff_id on public.conversations
for each row execute function public.guard_twilio_pending_assignment_change();
