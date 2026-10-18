create or replace function public.guard_inspection_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_role text := public.caller_role();
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and auth.role() <> 'service_role' then
    if actor_role is null
       or actor_role not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
       or not public.can_access_property(new.property_id) then
      raise exception 'Not authorized to manage this inspection'
        using errcode = '42501';
    end if;
    if not (
      (old.status = 'PENDING_CONFIRMATION'
        and new.status in ('CONFIRMED', 'REJECTED', 'CANCELLED', 'RESCHEDULED'))
      or (old.status = 'CONFIRMED'
        and (
          new.status in ('COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED')
          or (new.status = 'PENDING_CONFIRMATION' and new.slot_id is distinct from old.slot_id)
        ))
    ) then
      raise exception 'Invalid inspection status transition'
        using errcode = '22023';
    end if;
    if new.status = 'CONFIRMED' then
      new.confirmed_at := now();
    end if;
  end if;
  if new.gate_details is distinct from old.gate_details
     and not (
       (
         old.status = 'PENDING_CONFIRMATION'
         and new.status = 'CONFIRMED'
         and new.gate_details ~ '^G-[A-F0-9]{10}$'
       )
       or (
         new.gate_details is null
         and old.gate_details is not null
         and new.status in ('PENDING_CONFIRMATION', 'REJECTED', 'CANCELLED')
       )
     ) then
    raise exception 'Gate details may only be attached after confirmation'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

alter function public.transition_inspection_booking(uuid, text, uuid, text, text)
  rename to transition_inspection_booking_legacy;

revoke all on function public.transition_inspection_booking_legacy(uuid, text, uuid, text, text)
  from public, anon, authenticated;

create function public.transition_inspection_booking(
  p_booking_id uuid,
  p_status text,
  p_new_slot_id uuid,
  p_outcome text,
  p_idempotency_key text
)
returns table (
  id uuid,
  status text,
  slot_id uuid,
  outcome text,
  gate_details text,
  confirmed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.caller_role();
  booking_property_id uuid;
begin
  if auth.uid() is null
     or actor_role is null
     or actor_role not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Not authorized or invalid transition request'
      using errcode = '42501';
  end if;

  select i.property_id into booking_property_id
  from public.inspections as i
  where i.id = p_booking_id;
  if not found then
    raise exception 'Inspection request not found' using errcode = 'P0002';
  end if;
  if not public.can_access_property(booking_property_id) then
    raise exception 'Inspection is outside the caller zone' using errcode = '42501';
  end if;

  return query
  select *
  from public.transition_inspection_booking_legacy(
    p_booking_id,
    p_status,
    p_new_slot_id,
    p_outcome,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.transition_inspection_booking(uuid, text, uuid, text, text)
  from public, anon;
grant execute on function public.transition_inspection_booking(uuid, text, uuid, text, text)
  to authenticated;

alter function public.submit_inspection_request(uuid, text, text, text, text, text, text)
  rename to submit_inspection_request_legacy;

revoke all on function public.submit_inspection_request_legacy(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

create function public.submit_inspection_request(
  p_slot_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_receipt_hash text,
  p_idempotency_key text
)
returns table (
  id uuid,
  status text,
  public_reference text,
  reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(coalesce(p_idempotency_key, ''), 0)
  );
  return query
  select *
  from public.submit_inspection_request_legacy(
    p_slot_id,
    p_name,
    p_email,
    p_phone,
    p_message,
    p_receipt_hash,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.submit_inspection_request(uuid, text, text, text, text, text, text)
  from public;
grant execute on function public.submit_inspection_request(uuid, text, text, text, text, text, text)
  to anon, authenticated;

drop policy if exists nestly_inspection_slots_staff_read on public.inspection_slots;
create policy nestly_inspection_slots_staff_read on public.inspection_slots
for select to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  and public.can_access_property(property_id)
);

drop policy if exists nestly_inspection_slots_staff_insert on public.inspection_slots;
create policy nestly_inspection_slots_staff_insert on public.inspection_slots
for insert to authenticated
with check (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  and public.can_edit_property(property_id)
);

drop policy if exists nestly_inspection_slots_staff_update on public.inspection_slots;
create policy nestly_inspection_slots_staff_update on public.inspection_slots
for update to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  and public.can_edit_property(property_id)
)
with check (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  and public.can_edit_property(property_id)
);

drop policy if exists nestly_inspection_slots_staff_delete on public.inspection_slots;
create policy nestly_inspection_slots_staff_delete on public.inspection_slots
for delete to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  and public.can_edit_property(property_id)
);

drop policy if exists nestly_inspections_staff_read on public.inspections;
create policy nestly_inspections_staff_read on public.inspections
for select to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  and public.can_access_property(property_id)
);

drop policy if exists nestly_inspections_staff_update on public.inspections;
revoke update on public.inspections from authenticated;

create or replace function public.get_booking_receipt(p_receipt_hash text)
returns table (
  public_reference text,
  status text,
  property_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  gate_details text,
  reservation_expires_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.public_reference,
    case
      when i.outcome = 'reservation_expired'
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at <= now()
        ) then 'expired'
      when i.status = 'PENDING_CONFIRMATION' then 'pending'
      when i.status = 'CONFIRMED' then 'approved'
      when i.status = 'REJECTED' then 'rejected'
      when i.status = 'CANCELLED' then 'cancelled'
      when i.status = 'COMPLETED' then 'completed'
      when i.status = 'NO_SHOW' then 'no_show'
      else 'unavailable'
    end,
    p.title,
    case
      when i.status = 'CONFIRMED'
        or i.status in ('COMPLETED', 'NO_SHOW')
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at > now()
        ) then s.starts_at
      else null
    end,
    case
      when i.status = 'CONFIRMED'
        or i.status in ('COMPLETED', 'NO_SHOW')
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at > now()
        ) then s.ends_at
      else null
    end,
    case when i.status = 'CONFIRMED' then i.gate_details else null end,
    case
      when i.status = 'PENDING_CONFIRMATION'
        and i.reservation_expires_at > now() then i.reservation_expires_at
      else null
    end,
    i.updated_at
  from public.inspections as i
  join public.inspection_slots as s on s.id = i.slot_id
  join public.properties as p on p.id = i.property_id
  where i.receipt_hash = p_receipt_hash
  limit 1
$$;

revoke all on function public.get_booking_receipt(text) from public;
grant execute on function public.get_booking_receipt(text) to anon, authenticated;
