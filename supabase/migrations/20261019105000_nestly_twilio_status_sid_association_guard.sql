create or replace function public.guard_twilio_status_event_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as current_message
    where current_message.id = new.message_id
      and (
        current_message.provider_message_id is null
        or current_message.provider_message_id = new.provider_message_id
      )
  ) or exists (
    select 1
    from public.messages as another_message
    where another_message.provider_message_id = new.provider_message_id
      and another_message.id <> new.message_id
  ) then
    raise exception 'Twilio MessageSid is already associated with another message'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_twilio_status_event_message() from public, anon, authenticated, service_role;

drop trigger if exists nestly_twilio_status_event_message_guard on public.twilio_message_status_events;
create trigger nestly_twilio_status_event_message_guard
before insert on public.twilio_message_status_events
for each row execute function public.guard_twilio_status_event_message();
