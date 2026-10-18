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
  if current_status in ('failed', 'undelivered') then
    return current_status;
  elsif current_status = 'read' then
    return 'read';
  elsif current_status = 'delivered' then
    if incoming_status = 'read' then
      return 'read';
    end if;
    return 'delivered';
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
