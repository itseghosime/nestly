alter table public.workspace_settings
  add column if not exists workspace_name text not null default 'Nestly',
  add column if not exists default_inspection_duration_mins smallint not null default 90;

alter table public.properties
  add column if not exists source_landlord_submission_id uuid
    references public.landlord_submissions(id) on delete restrict;

alter table public.landlord_submissions
  add column if not exists converted_property_id uuid
    references public.properties(id) on delete set null;

create unique index if not exists properties_source_landlord_submission_key
  on public.properties (source_landlord_submission_id)
  where source_landlord_submission_id is not null;

create table if not exists public.landlord_submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.landlord_submissions(id) on delete cascade,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  bucket_id text not null default 'property-drafts' check (bucket_id = 'property-drafts'),
  object_path text not null unique check (object_path like 'landlord-submissions/%'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  upload_status text not null default 'uploading' check (upload_status in ('uploading', 'uploaded')),
  created_at timestamptz not null default now(),
  unique (submission_id, content_sha256)
);

alter table public.landlord_submission_media enable row level security;
revoke all on public.landlord_submission_media from public, anon, authenticated;
grant all on public.landlord_submission_media to service_role;

alter table public.property_media
  add column if not exists landlord_submission_media_id uuid
    references public.landlord_submission_media(id) on delete set null;

create unique index if not exists property_media_landlord_submission_media_key
  on public.property_media (landlord_submission_media_id);

alter table public.landlord_submission_media
  add column if not exists property_media_id uuid
    references public.property_media(id) on delete set null;

create unique index if not exists landlord_submission_media_property_media_key
  on public.landlord_submission_media (property_media_id)
  where property_media_id is not null;

create or replace function public.reserve_landlord_submission_media(
  p_receipt_hash text,
  p_content_sha256 text,
  p_mime_type text,
  p_size_bytes integer
)
returns setof public.landlord_submission_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id uuid;
  source_status text;
  existing_media public.landlord_submission_media%rowtype;
  new_media public.landlord_submission_media%rowtype;
  reserved_count integer;
  file_extension text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Upload reservation requires the server service role'
      using errcode = '42501';
  end if;
  file_extension := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/avif' then 'avif'
    else null
  end;
  if p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$'
    or p_content_sha256 is null or p_content_sha256 !~ '^[a-f0-9]{64}$'
    or file_extension is null
    or p_size_bytes not between 1 and 4194304 then
    raise exception 'Invalid landlord image upload'
      using errcode = '22023';
  end if;

  select id, status into source_id, source_status
  from public.landlord_submissions
  where receipt_hash = p_receipt_hash
  for update;
  if not found then
    raise exception 'Landlord submission not found or inaccessible'
      using errcode = 'P0002';
  end if;
  if source_status = 'rejected' then
    raise exception 'Photo uploads are no longer available for this submission'
      using errcode = '55000';
  end if;

  select * into existing_media
  from public.landlord_submission_media
  where submission_id = source_id
    and content_sha256 = p_content_sha256;
  if found then
    return next existing_media;
    return;
  end if;

  select count(*)::integer into reserved_count
  from public.landlord_submission_media
  where submission_id = source_id;
  if reserved_count >= 5 then
    raise exception 'A maximum of five photos may be attached'
      using errcode = '23514';
  end if;

  insert into public.landlord_submission_media (
    submission_id, content_sha256, object_path, mime_type, size_bytes
  ) values (
    source_id,
    p_content_sha256,
    'landlord-submissions/' || source_id::text || '/'
      || p_content_sha256 || '.' || file_extension,
    p_mime_type,
    p_size_bytes
  ) returning * into new_media;
  return next new_media;
end;
$$;

revoke all on function public.reserve_landlord_submission_media(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_landlord_submission_media(text, text, text, integer)
  to service_role;

create or replace function public.mark_landlord_submission_media_uploaded(
  p_receipt_hash text,
  p_media_id uuid
)
returns table(submission_id uuid, converted_property_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id uuid;
  source_status text;
  converted_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Upload confirmation requires the server service role'
      using errcode = '42501';
  end if;
  select id, status, landlord_submissions.converted_property_id
  into source_id, source_status, converted_id
  from public.landlord_submissions
  where receipt_hash = p_receipt_hash
  for update;
  if not found then
    raise exception 'Landlord submission not found or inaccessible'
      using errcode = 'P0002';
  end if;
  if source_status = 'rejected' then
    raise exception 'Photo uploads are no longer available for this submission'
      using errcode = '55000';
  end if;
  update public.landlord_submission_media
  set upload_status = 'uploaded'
  where id = p_media_id
    and landlord_submission_media.submission_id = source_id;
  if not found then
    raise exception 'Landlord photo reservation not found'
      using errcode = 'P0002';
  end if;
  return query select source_id, converted_id;
end;
$$;

revoke all on function public.mark_landlord_submission_media_uploaded(text, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_landlord_submission_media_uploaded(text, uuid)
  to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_settings_workspace_name_check'
      and conrelid = 'public.workspace_settings'::regclass
  ) then
    alter table public.workspace_settings
      add constraint workspace_settings_workspace_name_check
      check (length(btrim(workspace_name)) between 1 and 120);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_settings_inspection_duration_check'
      and conrelid = 'public.workspace_settings'::regclass
  ) then
    alter table public.workspace_settings
      add constraint workspace_settings_inspection_duration_check
      check (default_inspection_duration_mins between 15 and 240
        and mod(default_inspection_duration_mins, 15) = 0);
  end if;
end
$$;

create or replace function public.update_staff_workspace_settings(
  p_workspace_name text,
  p_default_inspection_duration_mins smallint,
  p_transit_buffer_mins smallint,
  p_daylight_lock boolean,
  p_daylight_start time,
  p_daylight_end time,
  p_retention_days smallint
)
returns setof public.workspace_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_settings public.workspace_settings%rowtype;
  changed_fields text[];
begin
  if (select auth.uid()) is null
    or coalesce(public.caller_role(), '') <> 'Platform Admin' then
    raise exception 'Workspace settings require a platform administrator'
      using errcode = '42501';
  end if;
  if p_workspace_name is null
    or length(btrim(p_workspace_name)) not between 1 and 120
    or p_default_inspection_duration_mins is null
    or p_default_inspection_duration_mins not between 15 and 240
    or mod(p_default_inspection_duration_mins, 15) <> 0
    or p_transit_buffer_mins is null
    or p_transit_buffer_mins not between 0 and 240
    or p_daylight_lock is null
    or p_daylight_start is null
    or p_daylight_end is null
    or p_daylight_start >= p_daylight_end
    or p_retention_days is null
    or p_retention_days not between 30 and 3650 then
    raise exception 'Invalid workspace settings' using errcode = '22023';
  end if;

  select * into current_settings
  from public.workspace_settings
  where id = 1
  for update;
  if not found then
    raise exception 'Workspace settings are not configured' using errcode = 'P0002';
  end if;

  changed_fields := array_remove(array[
    case when current_settings.workspace_name is distinct from btrim(p_workspace_name)
      then 'workspace_name' end,
    case when current_settings.default_inspection_duration_mins is distinct from p_default_inspection_duration_mins
      then 'default_inspection_duration_mins' end,
    case when current_settings.transit_buffer_mins is distinct from p_transit_buffer_mins
      then 'transit_buffer_mins' end,
    case when current_settings.daylight_lock is distinct from p_daylight_lock
      then 'daylight_lock' end,
    case when current_settings.daylight_start is distinct from p_daylight_start
      then 'daylight_start' end,
    case when current_settings.daylight_end is distinct from p_daylight_end
      then 'daylight_end' end,
    case when current_settings.retention_days is distinct from p_retention_days
      then 'retention_days' end
  ], null);

  if cardinality(changed_fields) > 0 then
    update public.workspace_settings
    set workspace_name = btrim(p_workspace_name),
        default_inspection_duration_mins = p_default_inspection_duration_mins,
        transit_buffer_mins = p_transit_buffer_mins,
        daylight_lock = p_daylight_lock,
        daylight_start = p_daylight_start,
        daylight_end = p_daylight_end,
        retention_days = p_retention_days,
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = 1
    returning * into current_settings;

    insert into public.audit_logs (
      actor_id, actor_type, action, entity_type, metadata
    ) values (
      (select auth.uid()), 'admin', 'workspace.settings.updated',
      'workspace_settings', jsonb_build_object('changed_fields', changed_fields)
    );
  end if;

  return next current_settings;
end;
$$;

revoke all on function public.update_staff_workspace_settings(
  text, smallint, smallint, boolean, time, time, smallint
) from public, anon;
grant execute on function public.update_staff_workspace_settings(
  text, smallint, smallint, boolean, time, time, smallint
) to authenticated;

create or replace function public.update_staff_coverage(
  p_neighborhood_id uuid,
  p_active boolean
)
returns setof public.neighborhoods
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_neighborhood public.neighborhoods%rowtype;
  current_active boolean;
begin
  if (select auth.uid()) is null
    or coalesce(public.caller_role(), '') not in ('Platform Admin', 'Operations Lead') then
    raise exception 'Coverage changes require an operations administrator'
      using errcode = '42501';
  end if;
  if p_neighborhood_id is null or p_active is null then
    raise exception 'A coverage area and active state are required'
      using errcode = '22023';
  end if;

  select active into current_active
  from public.neighborhoods
  where id = p_neighborhood_id
  for update;
  if not found then
    raise exception 'Coverage area not found' using errcode = 'P0002';
  end if;

  if current_active is distinct from p_active then
    update public.neighborhoods
    set active = p_active, updated_at = now()
    where id = p_neighborhood_id
    returning * into updated_neighborhood;

    insert into public.audit_logs (
      actor_id, actor_type, action, entity_type, entity_id, metadata
    ) values (
      (select auth.uid()),
      case when public.caller_role() = 'Platform Admin' then 'admin' else 'agent' end,
      'coverage.area.updated', 'neighborhood', p_neighborhood_id,
      jsonb_build_object('active', p_active)
    );
  else
    select * into updated_neighborhood
    from public.neighborhoods
    where id = p_neighborhood_id;
  end if;

  return next updated_neighborhood;
end;
$$;

revoke all on function public.update_staff_coverage(uuid, boolean) from public, anon;
grant execute on function public.update_staff_coverage(uuid, boolean) to authenticated;

create or replace function public.is_property_in_active_coverage(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and (
        not exists (
          select 1
          from public.neighborhoods n
          where lower(btrim(n.name)) = lower(btrim(p.neighborhood))
            and lower(btrim(n.city)) = lower(btrim(p.city))
            and lower(btrim(n.state)) = lower(btrim(p.state))
        )
        or exists (
          select 1
          from public.neighborhoods n
          where lower(btrim(n.name)) = lower(btrim(p.neighborhood))
            and lower(btrim(n.city)) = lower(btrim(p.city))
            and lower(btrim(n.state)) = lower(btrim(p.state))
            and n.active
        )
      )
  )
$$;

revoke all on function public.is_property_in_active_coverage(uuid) from public, anon;
grant execute on function public.is_property_in_active_coverage(uuid) to authenticated;

create or replace function public.guard_inspection_slot_coverage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active
    and not public.is_property_in_active_coverage(new.property_id) then
    raise exception 'Inspection property is outside active workspace coverage'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_slot_coverage_guard on public.inspection_slots;
create trigger nestly_slot_coverage_guard
before insert or update of property_id, is_active on public.inspection_slots
for each row execute function public.guard_inspection_slot_coverage();

create or replace view public.public_inspection_slots
with (security_barrier = true)
as
select
  s.id,
  s.property_id,
  s.starts_at,
  s.ends_at,
  s.capacity - (
    select count(*)::integer
    from public.inspections i
    where i.slot_id = s.id
      and (
        i.status = 'CONFIRMED'
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at > now()
        )
      )
  ) as spaces_remaining
from public.inspection_slots s
where s.is_active
  and s.starts_at > now()
  and public.is_publicly_discoverable_property(s.property_id)
  and (
    not exists (
      select 1
      from public.properties p
      join public.neighborhoods n
        on lower(btrim(n.name)) = lower(btrim(p.neighborhood))
        and lower(btrim(n.city)) = lower(btrim(p.city))
        and lower(btrim(n.state)) = lower(btrim(p.state))
      where p.id = s.property_id
    )
    or exists (
      select 1
      from public.properties p
      join public.neighborhoods n
        on lower(btrim(n.name)) = lower(btrim(p.neighborhood))
        and lower(btrim(n.city)) = lower(btrim(p.city))
        and lower(btrim(n.state)) = lower(btrim(p.state))
        and n.active
      where p.id = s.property_id
    )
  )
  and s.capacity > (
    select count(*)::integer
    from public.inspections i
    where i.slot_id = s.id
      and (
        i.status = 'CONFIRMED'
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at > now()
        )
      )
  );

create or replace function public.update_staff_lead_status(
  p_kind text,
  p_lead_id uuid,
  p_status text,
  p_expected_updated_at timestamptz
)
returns table(id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.caller_role(), '');
  current_contact public.contact_enquiries%rowtype;
  current_landlord public.landlord_submissions%rowtype;
  new_updated_at timestamptz;
begin
  if (select auth.uid()) is null or p_lead_id is null
    or p_expected_updated_at is null
    or p_status is null then
    raise exception 'A staff identity, lead, status, and revision are required'
      using errcode = '22023';
  end if;

  if p_kind = 'contact' then
    if actor_role not in ('Platform Admin', 'Operations Lead', 'Customer Care')
      or p_status not in ('in_review', 'responded', 'closed') then
      raise exception 'Not authorized to update this contact enquiry'
        using errcode = '42501';
    end if;
    select * into current_contact
    from public.contact_enquiries
    where contact_enquiries.id = p_lead_id
    for update;
    if not found
      or (actor_role = 'Operations Lead'
        and (current_contact.property_id is null
          or not public.can_access_property(current_contact.property_id))) then
      raise exception 'Lead not found or inaccessible' using errcode = 'P0002';
    end if;
    if current_contact.status = p_status then
      return query select current_contact.id, current_contact.status, current_contact.updated_at;
      return;
    end if;
    if current_contact.updated_at is distinct from p_expected_updated_at then
      raise exception 'Lead revision is stale' using errcode = '40001';
    end if;
    update public.contact_enquiries
    set status = p_status, updated_at = now()
    where contact_enquiries.id = p_lead_id
    returning contact_enquiries.updated_at into new_updated_at;
    insert into public.audit_logs (
      actor_id, actor_type, action, entity_type, entity_id, metadata
    ) values (
      (select auth.uid()),
      case when actor_role = 'Platform Admin' then 'admin' else 'agent' end,
      'contact_enquiry.status.updated', 'contact_enquiry', p_lead_id,
      jsonb_build_object('from_status', current_contact.status, 'to_status', p_status)
    );
    return query select p_lead_id, p_status, new_updated_at;
    return;
  elsif p_kind = 'landlord' then
    if actor_role not in ('Platform Admin', 'Operations Lead')
      or p_status not in ('in_review', 'accepted', 'rejected') then
      raise exception 'Not authorized to update this landlord submission'
        using errcode = '42501';
    end if;
    select * into current_landlord
    from public.landlord_submissions
    where landlord_submissions.id = p_lead_id
    for update;
    if not found
      or (actor_role = 'Operations Lead'
        and not exists (
          select 1 from public.profiles actor
          where actor.id = (select auth.uid())
            and public.zone_matches_property(
              actor.assigned_zone, current_landlord.state, current_landlord.city,
              current_landlord.neighborhood, null
            )
        )) then
      raise exception 'Lead not found or inaccessible' using errcode = 'P0002';
    end if;
    if current_landlord.status = p_status then
      return query select current_landlord.id, current_landlord.status, current_landlord.updated_at;
      return;
    end if;
    if current_landlord.updated_at is distinct from p_expected_updated_at then
      raise exception 'Lead revision is stale' using errcode = '40001';
    end if;
    update public.landlord_submissions
    set status = p_status, updated_at = now()
    where landlord_submissions.id = p_lead_id
    returning landlord_submissions.updated_at into new_updated_at;
    insert into public.audit_logs (
      actor_id, actor_type, action, entity_type, entity_id, metadata
    ) values (
      (select auth.uid()),
      case when actor_role = 'Platform Admin' then 'admin' else 'agent' end,
      'landlord_submission.status.updated', 'landlord_submission', p_lead_id,
      jsonb_build_object('from_status', current_landlord.status, 'to_status', p_status)
    );
    return query select p_lead_id, p_status, new_updated_at;
    return;
  end if;

  raise exception 'Invalid lead type' using errcode = '22023';
end;
$$;

revoke all on function public.update_staff_lead_status(text, uuid, text, timestamptz) from public, anon;
grant execute on function public.update_staff_lead_status(text, uuid, text, timestamptz) to authenticated;

create or replace function public.convert_landlord_submission_to_draft(
  p_submission_id uuid,
  p_property_type text
)
returns table(
  property_id uuid,
  title text,
  publication_state text,
  verification_state text,
  rent_annual numeric,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.caller_role(), '');
  source public.landlord_submissions%rowtype;
  source_customer public.customers%rowtype;
  new_property public.properties%rowtype;
begin
  if (select auth.uid()) is null
    or actor_role not in ('Platform Admin', 'Operations Lead') then
    raise exception 'Not authorized to create property drafts'
      using errcode = '42501';
  end if;
  if p_submission_id is null or p_property_type is null or p_property_type not in (
    'apartment', 'house', 'duplex', 'studio', 'land', 'commercial'
  ) then
    raise exception 'A valid landlord submission and property type are required'
      using errcode = '22023';
  end if;

  select * into source
  from public.landlord_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Landlord submission not found or inaccessible'
      using errcode = 'P0002';
  end if;
  if actor_role = 'Operations Lead'
    and not exists (
      select 1 from public.profiles actor
      where actor.id = (select auth.uid())
        and public.zone_matches_property(
          actor.assigned_zone, source.state, source.city, source.neighborhood, null
        )
    ) then
    raise exception 'Landlord submission not found or inaccessible'
      using errcode = 'P0002';
  end if;

  select * into new_property
  from public.properties
  where source_landlord_submission_id = source.id;
  if found then
    update public.landlord_submissions
    set converted_property_id = new_property.id
    where id = source.id
      and converted_property_id is distinct from new_property.id;
    insert into public.property_media (
      property_id, url, bucket_id, object_path, media_kind, sort_order,
      landlord_submission_media_id
    )
    select
      new_property.id,
      media.bucket_id || '/' || media.object_path,
      media.bucket_id,
      media.object_path,
      'evidence',
      row_number() over (order by media.created_at)::integer,
      media.id
    from public.landlord_submission_media media
    where media.submission_id = source.id
      and media.upload_status = 'uploaded'
    on conflict (landlord_submission_media_id) do nothing;
    update public.landlord_submission_media staged
    set property_media_id = media.id
    from public.property_media media
    where media.landlord_submission_media_id = staged.id
      and staged.submission_id = source.id
      and staged.property_media_id is distinct from media.id;
    return query select new_property.id, new_property.title,
      new_property.publication_state, new_property.verification_state, new_property.rent_annual, false;
    return;
  end if;
  if not public.can_create_property(source.state, source.city, source.neighborhood, source.address) then
    raise exception 'Not authorized to create a property in this zone'
      using errcode = '42501';
  end if;

  select * into source_customer
  from public.customers
  where id = source.customer_id;

  insert into public.properties (
    reference, slug, title, description, property_type, location, neighborhood,
    bedrooms, bathrooms, price_ngn, rent_annual, price_period, currency,
    state, city, address_short, verification_state, publication_state,
    rental_availability, landlord_contact, created_by, source_landlord_submission_id
  ) values (
    'LS-' || upper(substr(replace(source.id::text, '-', ''), 1, 12)),
    'landlord-submission-' || substr(replace(source.id::text, '-', ''), 1, 12),
    p_property_type || ' in ' || source.neighborhood,
    source.description,
    p_property_type,
    concat_ws(', ', source.address, source.neighborhood, source.city, source.state),
    source.neighborhood,
    source.bedrooms,
    0,
    source.expected_annual_rent,
    source.expected_annual_rent,
    'yearly',
    'NGN',
    source.state,
    source.city,
    source.address,
    'unverified',
    'draft',
    'available',
    jsonb_build_object(
      'name', coalesce(source_customer.display_name, source_customer.full_name),
      'email', source_customer.email,
      'phone', source_customer.phone,
      'sourceSubmissionId', source.id
    ),
    (select auth.uid()),
    source.id
  ) returning * into new_property;

  update public.landlord_submissions
  set converted_property_id = new_property.id
  where id = source.id;

  insert into public.property_media (
    property_id, url, bucket_id, object_path, media_kind, sort_order,
    landlord_submission_media_id
  )
  select
    new_property.id,
    media.bucket_id || '/' || media.object_path,
    media.bucket_id,
    media.object_path,
    'evidence',
    row_number() over (order by media.created_at)::integer,
    media.id
  from public.landlord_submission_media media
  where media.submission_id = source.id
    and media.upload_status = 'uploaded'
  on conflict (landlord_submission_media_id) do nothing;

  update public.landlord_submission_media staged
  set property_media_id = media.id
  from public.property_media media
  where media.landlord_submission_media_id = staged.id
    and staged.submission_id = source.id
    and staged.property_media_id is distinct from media.id;

  insert into public.audit_logs (
    actor_id, actor_type, action, entity_type, entity_id, metadata
  ) values
  (
    (select auth.uid()),
    case when actor_role = 'Platform Admin' then 'admin' else 'agent' end,
    'landlord_submission.property_draft_created', 'landlord_submission', source.id,
    jsonb_build_object('property_id', new_property.id)
  ),
  (
    (select auth.uid()),
    case when actor_role = 'Platform Admin' then 'admin' else 'agent' end,
    'property.created_from_landlord_submission', 'property', new_property.id,
    jsonb_build_object('source_submission_id', source.id)
  );

  return query select new_property.id, new_property.title,
    new_property.publication_state, new_property.verification_state, new_property.rent_annual, true;
end;
$$;

revoke all on function public.convert_landlord_submission_to_draft(uuid, text) from public, anon;
grant execute on function public.convert_landlord_submission_to_draft(uuid, text) to authenticated;

create or replace function public.get_staff_conversation_previews(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  sender_type text,
  content text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (message.conversation_id)
    message.conversation_id,
    message.sender_type,
    message.content,
    message.created_at
  from public.messages message
  where message.conversation_id = any(coalesce(p_conversation_ids, '{}'::uuid[]))
  order by message.conversation_id, message.created_at desc, message.id desc
$$;

revoke all on function public.get_staff_conversation_previews(uuid[])
  from public, anon;
grant execute on function public.get_staff_conversation_previews(uuid[])
  to authenticated;
