-- Phase B: persistent leads, human-reviewed offers, and capacity-safe inspection requests.
-- This migration is prepared locally only; reconcile remote migration history before applying.

create extension if not exists btree_gist;

create table if not exists public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  transit_buffer_mins smallint not null default 30 check (transit_buffer_mins between 0 and 240),
  daylight_lock boolean not null default false,
  daylight_start time not null default '07:00',
  daylight_end time not null default '18:00',
  retention_days smallint not null default 365 check (retention_days between 30 and 3650),
  nia_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (daylight_start < daylight_end)
);

insert into public.workspace_settings (id) values (1) on conflict (id) do nothing;
alter table public.workspace_settings enable row level security;
drop policy if exists "workspace_settings_staff_read" on public.workspace_settings;
create policy "workspace_settings_staff_read" on public.workspace_settings
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance', 'Customer Care')
  ));
drop policy if exists "workspace_settings_admin_write" on public.workspace_settings;
create policy "workspace_settings_admin_write" on public.workspace_settings
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_required check (email <> '' or phone <> ''),
  unique (email, phone)
);
alter table public.customers enable row level security;
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  role_name text := public.caller_role();
  assigned_zone text;
begin
  if auth.uid() is null
     or role_name not in ('Platform Admin', 'Operations Lead', 'Customer Care') then
    return false;
  end if;
  if role_name in ('Platform Admin', 'Customer Care') then
    return exists (select 1 from public.customers c where c.id = p_customer_id);
  end if;
  select p.assigned_zone into assigned_zone from public.profiles p where p.id = auth.uid();
  return exists (
    select 1 from public.contact_enquiries e
    where e.customer_id = p_customer_id and e.property_id is not null
      and public.can_access_property(e.property_id)
  ) or exists (
    select 1 from public.landlord_submissions l
    where l.customer_id = p_customer_id
      and public.zone_matches_property(assigned_zone, l.state, l.city, l.neighborhood)
  ) or exists (
    select 1 from public.offers o
    where o.customer_id = p_customer_id and public.can_access_property(o.property_id)
  ) or exists (
    select 1 from public.bookings b
    join public.inspection_slots s on s.id = b.slot_id
    where b.customer_id = p_customer_id and public.can_access_property(s.property_id)
  );
end;
$$;
drop policy if exists "customers_staff_read" on public.customers;
create policy "customers_staff_read" on public.customers
  for select using (public.can_access_customer(id));
drop policy if exists "customers_staff_update" on public.customers;
create policy "customers_staff_update" on public.customers
  for update using (public.can_access_customer(id))
  with check (public.can_access_customer(id));
revoke all on function public.can_access_customer(uuid) from public, anon;
grant execute on function public.can_access_customer(uuid) to authenticated;
revoke insert, update, delete on public.customers from anon, authenticated;

create table if not exists public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  property_id text references public.properties(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  email text not null default '',
  phone text not null default '',
  message text not null check (length(message) between 1 and 4000),
  status text not null default 'new' check (status in ('new', 'in_review', 'responded', 'closed')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email <> '' or phone <> '')
);
alter table public.contact_enquiries enable row level security;
drop policy if exists "contact_enquiries_public_insert" on public.contact_enquiries;
create policy "contact_enquiries_public_insert" on public.contact_enquiries
  for insert to anon, authenticated with check (
    status = 'new' and customer_id is null
    and (property_id is null or public.is_property_publicly_readable(property_id))
  );
drop policy if exists "contact_enquiries_staff_read" on public.contact_enquiries;
create policy "contact_enquiries_staff_read" on public.contact_enquiries
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('Platform Admin', 'Customer Care')
        or (
          p.role = 'Operations Lead'
          and (
            property_id is null
            or public.can_access_property(property_id)
          )
        )
      )
  ));
drop policy if exists "contact_enquiries_staff_update" on public.contact_enquiries;
create policy "contact_enquiries_staff_update" on public.contact_enquiries
  for update using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('Platform Admin', 'Customer Care')
        or (p.role = 'Operations Lead' and property_id is not null and public.can_access_property(property_id))
      )
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('Platform Admin', 'Customer Care')
        or (p.role = 'Operations Lead' and property_id is not null and public.can_access_property(property_id))
      )
  ));

create or replace function public.attach_contact_customer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  customer_row public.customers%rowtype;
begin
  insert into public.customers (display_name, email, phone)
  values (new.name, lower(btrim(new.email)), btrim(new.phone))
  on conflict (email, phone) do update
    set updated_at = now()
  returning * into customer_row;
  update public.contact_enquiries set customer_id = customer_row.id where id = new.id;
  return new;
end;
$$;
drop trigger if exists trg_contact_enquiry_customer on public.contact_enquiries;
create trigger trg_contact_enquiry_customer
after insert on public.contact_enquiries
for each row execute function public.attach_contact_customer();

create table if not exists public.landlord_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  idempotency_key text unique,
  name text not null check (length(name) between 1 and 120),
  email text not null default '',
  phone text not null default '',
  property_type text not null,
  state text not null,
  city text not null,
  neighborhood text not null,
  address text not null,
  bedrooms smallint not null check (bedrooms between 0 and 30),
  expected_annual_rent numeric(12,2) not null check (expected_annual_rent >= 0),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'new' check (status in ('new', 'in_review', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email <> '' or phone <> '')
);
alter table public.landlord_submissions enable row level security;
drop policy if exists "landlord_submissions_public_insert" on public.landlord_submissions;
create policy "landlord_submissions_public_insert" on public.landlord_submissions
  for insert to anon, authenticated with check (status = 'new' and customer_id is null);
drop policy if exists "landlord_submissions_staff_read" on public.landlord_submissions;
create policy "landlord_submissions_staff_read" on public.landlord_submissions
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'Platform Admin'
        or (
          p.role in ('Operations Lead', 'Field Vetting Agent', 'Legal & Compliance')
          and public.zone_matches_property(p.assigned_zone, state, city, neighborhood)
        )
      )
  ));
drop policy if exists "landlord_submissions_staff_update" on public.landlord_submissions;
create policy "landlord_submissions_staff_update" on public.landlord_submissions
  for update using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'Platform Admin'
        or (
          p.role in ('Operations Lead', 'Field Vetting Agent')
          and public.zone_matches_property(p.assigned_zone, state, city, neighborhood)
        )
      )
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'Platform Admin'
        or (
          p.role in ('Operations Lead', 'Field Vetting Agent')
          and public.zone_matches_property(p.assigned_zone, state, city, neighborhood)
        )
      )
  ));

create or replace function public.attach_landlord_customer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  customer_row public.customers%rowtype;
begin
  insert into public.customers (display_name, email, phone)
  values (new.name, lower(btrim(new.email)), btrim(new.phone))
  on conflict (email, phone) do update
    set updated_at = now()
  returning * into customer_row;
  update public.landlord_submissions set customer_id = customer_row.id where id = new.id;
  return new;
end;
$$;
drop trigger if exists trg_landlord_submission_customer on public.landlord_submissions;
create trigger trg_landlord_submission_customer
after insert on public.landlord_submissions
for each row execute function public.attach_landlord_customer();

create table if not exists public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('property', 'customer', 'enquiry', 'landlord_submission', 'offer', 'booking', 'conversation')),
  entity_id text not null,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.staff_notes enable row level security;
create or replace function public.can_access_staff_note(p_entity_type text, p_entity_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  role_name text := public.caller_role();
  assigned_zone text;
begin
  if auth.uid() is null then return false; end if;
  if role_name not in ('Platform Admin', 'Operations Lead', 'Legal & Compliance', 'Customer Care') then return false; end if;
  if role_name in ('Platform Admin', 'Customer Care') then
    if p_entity_type = 'property' then return exists (select 1 from public.properties p where p.id = p_entity_id); end if;
    if p_entity_type = 'customer' then return exists (select 1 from public.customers c where c.id::text = p_entity_id); end if;
    if p_entity_type = 'enquiry' then return exists (select 1 from public.contact_enquiries e where e.id::text = p_entity_id); end if;
    if p_entity_type = 'landlord_submission' then return exists (select 1 from public.landlord_submissions l where l.id::text = p_entity_id); end if;
    if p_entity_type = 'offer' then return exists (select 1 from public.offers o where o.id::text = p_entity_id); end if;
    if p_entity_type = 'booking' then return exists (select 1 from public.bookings b where b.id::text = p_entity_id); end if;
    return false;
  end if;

  if p_entity_type = 'property' then
    return public.can_access_property(p_entity_id);
  elsif p_entity_type = 'offer' then
    return exists (select 1 from public.offers o where o.id::text = p_entity_id and public.can_access_property(o.property_id));
  elsif p_entity_type = 'booking' then
    return exists (
      select 1 from public.bookings b
      join public.inspection_slots s on s.id = b.slot_id
      where b.id::text = p_entity_id and public.can_access_property(s.property_id)
    );
  elsif p_entity_type = 'enquiry' then
    return exists (
      select 1 from public.contact_enquiries e
      where e.id::text = p_entity_id and e.property_id is not null
        and public.can_access_property(e.property_id)
    );
  elsif p_entity_type = 'landlord_submission' then
    select p.assigned_zone into assigned_zone from public.profiles p where p.id = auth.uid();
    return exists (
      select 1 from public.landlord_submissions l
      where l.id::text = p_entity_id
        and public.zone_matches_property(assigned_zone, l.state, l.city, l.neighborhood)
    );
  elsif p_entity_type = 'customer' then
    return exists (
      select 1 from public.customers c
      where c.id::text = p_entity_id
        and (
          exists (select 1 from public.contact_enquiries e where e.customer_id = c.id and e.property_id is not null and public.can_access_property(e.property_id))
          or exists (
            select 1 from public.landlord_submissions l
            where l.customer_id = c.id
              and public.zone_matches_property(assigned_zone, l.state, l.city, l.neighborhood)
          )
          or exists (select 1 from public.offers o where o.customer_id = c.id and public.can_access_property(o.property_id))
          or exists (select 1 from public.bookings b join public.inspection_slots s on s.id = b.slot_id where b.customer_id = c.id and public.can_access_property(s.property_id))
        )
    );
  end if;
  return false;
end;
$$;
drop policy if exists "staff_notes_staff_read" on public.staff_notes;
create policy "staff_notes_staff_read" on public.staff_notes
  for select using (deleted_at is null and public.can_access_staff_note(entity_type, entity_id));
drop policy if exists "staff_notes_staff_insert" on public.staff_notes;
create policy "staff_notes_staff_insert" on public.staff_notes
  for insert with check (author_id = auth.uid() and public.can_access_staff_note(entity_type, entity_id));
drop policy if exists "staff_notes_staff_update" on public.staff_notes;
create policy "staff_notes_staff_update" on public.staff_notes
  for update using (
    deleted_at is null
    and (author_id = auth.uid() or public.caller_role() in ('Platform Admin', 'Customer Care'))
    and public.can_access_staff_note(entity_type, entity_id)
  )
  with check (
    deleted_at is not null
    and (author_id = auth.uid() or public.caller_role() in ('Platform Admin', 'Customer Care'))
    and public.can_access_staff_note(entity_type, entity_id)
  );
revoke update on public.staff_notes from anon, authenticated;
grant update (deleted_at) on public.staff_notes to authenticated;
revoke all on function public.attach_contact_customer() from public, anon, authenticated;
revoke all on function public.attach_landlord_customer() from public, anon, authenticated;
revoke all on function public.can_access_staff_note(text, text) from public, anon;
grant execute on function public.can_access_staff_note(text, text) to authenticated;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  property_id text not null references public.properties(id),
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null check (currency in ('NGN', 'USD', 'GBP')),
  message text not null default '' check (length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'countered')),
  counter_amount numeric(12,2) check (counter_amount is null or counter_amount >= 0),
  public_reference text not null unique default (
    'OFF-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))
  ),
  receipt_token_hash text not null unique check (receipt_token_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 128),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'countered' and counter_amount is not null)
    or (status <> 'countered' and counter_amount is null)
  )
);
alter table public.offers enable row level security;
drop policy if exists "offers_staff_read" on public.offers;
create policy "offers_staff_read" on public.offers for select using (
  public.can_access_property(property_id)
  and public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance', 'Customer Care')
);
drop policy if exists "offers_staff_decide" on public.offers;
create policy "offers_staff_decide" on public.offers
  for update using (
    public.can_access_property(property_id)
    and public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance')
    and status = 'pending'
  )
  with check (
    public.can_access_property(property_id)
    and public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance')
    and status in ('approved', 'rejected', 'countered')
    and decided_by = auth.uid()
  );

create or replace function public.submit_offer(
  p_property_id text,
  p_amount numeric,
  p_currency text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_receipt_hash text,
  p_idempotency_key text
)
returns table(offer_id uuid, public_reference text, status text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  customer_row public.customers%rowtype;
  existing_offer public.offers%rowtype;
begin
  if p_amount is null or p_amount < 0
     or p_currency is null or p_currency not in ('NGN', 'USD', 'GBP')
     or length(btrim(p_name)) not between 1 and 120
     or (coalesce(btrim(p_email), '') <> '' and length(btrim(p_email)) not between 3 and 254)
     or (coalesce(btrim(p_phone), '') <> '' and length(btrim(p_phone)) not between 5 and 32)
     or (coalesce(btrim(p_email), '') = '' and coalesce(btrim(p_phone), '') = '')
     or length(coalesce(p_message, '')) > 2000
     or p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128 then
    raise exception 'Invalid offer details' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into existing_offer from public.offers o where o.idempotency_key = p_idempotency_key;
  if found then
    if existing_offer.receipt_token_hash <> p_receipt_hash then
      raise exception 'Idempotency key already used' using errcode = '23505';
    end if;
    return query select existing_offer.id, existing_offer.public_reference, existing_offer.status;
    return;
  end if;
  if not public.is_property_publicly_readable(p_property_id) then
    raise exception 'Property is unavailable' using errcode = '22023';
  end if;

  insert into public.customers (display_name, email, phone)
  values (btrim(p_name), lower(coalesce(btrim(p_email), '')), coalesce(btrim(p_phone), ''))
  on conflict (email, phone) do update
    set updated_at = now()
  returning * into customer_row;

  insert into public.offers as inserted_offer (
    customer_id, property_id, amount, currency, message, receipt_token_hash, idempotency_key
  )
  values (
    customer_row.id, p_property_id, p_amount, p_currency, coalesce(p_message, ''),
    p_receipt_hash, p_idempotency_key
  )
  returning inserted_offer.id, inserted_offer.public_reference, inserted_offer.status
  into offer_id, public_reference, status;
  return next;
end;
$$;

create or replace function public.get_offer_receipt(p_receipt_hash text)
returns table(public_reference text, status text, counter_amount numeric, updated_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select o.public_reference, o.status,
         case when o.status = 'countered' then o.counter_amount else null end,
         o.updated_at
  from public.offers as o
  where o.receipt_token_hash = p_receipt_hash
$$;

create or replace function public.enforce_offer_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() <> 'service_role'
       and public.caller_role() not in ('Platform Admin', 'Operations Lead', 'Legal & Compliance') then
      raise exception 'Only authorized staff may decide offers';
    end if;
    if old.status <> 'pending' or new.status not in ('approved', 'rejected', 'countered') then
      raise exception 'Invalid offer decision transition';
    end if;
    if new.status = 'countered' and new.counter_amount is null then
      raise exception 'Countered offers require a counter amount';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_offers_decision on public.offers;
create trigger trg_offers_decision before update on public.offers
for each row execute function public.enforce_offer_decision();

create table if not exists public.inspection_slots (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete restrict,
  field_agent_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  transit_buffer_mins smallint not null default 30 check (transit_buffer_mins between 0 and 240),
  buffered_ends_at timestamptz generated always as (ends_at + transit_buffer_mins * interval '1 minute') stored,
  capacity smallint not null default 1 check (capacity between 1 and 50),
  reserved_count smallint not null default 0 check (reserved_count >= 0 and reserved_count <= capacity),
  status text not null default 'available' check (status in ('available', 'unavailable', 'cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.inspection_slots enable row level security;
alter table public.inspection_slots
  add constraint inspection_slots_property_no_overlap
  exclude using gist (property_id with =, tstzrange(starts_at, buffered_ends_at, '[)') with &&)
  where (status = 'available');
alter table public.inspection_slots
  add constraint inspection_slots_agent_no_overlap
  exclude using gist (field_agent_id with =, tstzrange(starts_at, buffered_ends_at, '[)') with &&)
  where (field_agent_id is not null and status = 'available');

create or replace function public.prepare_inspection_slot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  agent_role text;
  agent_zone text;
  property_state text;
  property_city text;
  property_neighborhood text;
  timing_changed boolean;
  assignment_changed boolean;
begin
  if tg_op = 'INSERT' then
    timing_changed := true;
    assignment_changed := true;
    select s.transit_buffer_mins into new.transit_buffer_mins
    from public.workspace_settings s where s.id = 1;
    new.created_by := auth.uid();
  else
    timing_changed := new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at;
    assignment_changed := new.field_agent_id is distinct from old.field_agent_id
      or new.property_id is distinct from old.property_id;
    new.reserved_count := old.reserved_count;
    new.transit_buffer_mins := old.transit_buffer_mins;
    new.created_by := old.created_by;
    if old.reserved_count > 0 and (
      new.property_id is distinct from old.property_id
      or new.field_agent_id is distinct from old.field_agent_id
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.status is distinct from old.status
    ) then
      raise exception 'A slot with active reservations cannot be rescheduled or disabled';
    end if;
  end if;
  if new.field_agent_id is not null and assignment_changed then
    select p.role, p.assigned_zone, prop.state, prop.city, prop.neighborhood
    into agent_role, agent_zone, property_state, property_city, property_neighborhood
    from public.profiles p
    cross join public.properties prop
    where p.id = new.field_agent_id and prop.id = new.property_id;
    if not found or agent_role <> 'Field Vetting Agent'
       or not public.zone_matches_property(agent_zone, property_state, property_city, property_neighborhood) then
      raise exception 'Assigned agent is not authorized for this property zone';
    end if;
  end if;
  if tg_op = 'INSERT' and new.starts_at <= now() then
    raise exception 'Inspection slot must be in the future';
  elsif tg_op = 'UPDATE' and timing_changed and new.starts_at <= now() then
    raise exception 'Inspection slot must be in the future';
  end if;
  if timing_changed
     and (select s.daylight_lock from public.workspace_settings s where s.id = 1)
     and ((new.starts_at at time zone 'Africa/Lagos')::time < (select s.daylight_start from public.workspace_settings s where s.id = 1)
       or (new.ends_at at time zone 'Africa/Lagos')::time > (select s.daylight_end from public.workspace_settings s where s.id = 1)) then
    raise exception 'Inspection slot is outside configured daylight hours';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_inspection_slot_prepare on public.inspection_slots;
create trigger trg_inspection_slot_prepare before insert or update on public.inspection_slots
for each row execute function public.prepare_inspection_slot();

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.inspection_slots(id) on delete restrict,
  customer_id uuid not null references public.customers(id),
  name text not null check (length(name) between 1 and 120),
  email text not null,
  phone text not null,
  message text not null default '' check (length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'rescheduled', 'cancelled', 'completed', 'no_show', 'expired')),
  outcome text check (outcome is null or outcome in ('attended', 'landlord_unavailable', 'customer_no_show', 'property_unavailable', 'other')),
  public_reference text not null unique default (
    'NST-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))
  ),
  receipt_token_hash text not null unique check (receipt_token_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 128),
  reservation_expires_at timestamptz,
  gate_code text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_pending_expiry_idx
  on public.bookings (reservation_expires_at, slot_id)
  where status in ('pending', 'rescheduled');
alter table public.bookings enable row level security;
create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  status_from text,
  status_to text not null,
  slot_from uuid references public.inspection_slots(id),
  slot_to uuid not null references public.inspection_slots(id),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 160),
  created_at timestamptz not null default now()
);
alter table public.booking_events enable row level security;
drop policy if exists "booking_events_staff_read" on public.booking_events;
create policy "booking_events_staff_read" on public.booking_events
  for select using (exists (
    select 1 from public.bookings b
    join public.inspection_slots s on s.id = b.slot_id
    where b.id = booking_events.booking_id and public.can_access_property(s.property_id)
  ));
revoke insert, update, delete on public.booking_events from anon, authenticated;
create or replace function public.record_booking_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  event_key text;
  prior_status text;
  prior_slot_id uuid;
begin
  if tg_op = 'UPDATE' then
    prior_status := old.status;
    prior_slot_id := old.slot_id;
  end if;
  event_key := nullif(current_setting('app.booking_idempotency_key', true), '');
  if event_key is null then
    event_key := 'booking-expiry:' || new.id::text || ':' ||
      extract(epoch from coalesce(new.reservation_expires_at, new.updated_at))::bigint::text;
  end if;
  insert into public.booking_events (
    booking_id, actor_id, status_from, status_to, slot_from, slot_to, idempotency_key
  )
  values (
    new.id, auth.uid(), prior_status, new.status, prior_slot_id, new.slot_id, event_key
  )
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_booking_event on public.bookings;
create trigger trg_booking_event
after insert or update of status, slot_id on public.bookings
for each row execute function public.record_booking_event();
revoke all on function public.record_booking_event() from public, anon, authenticated;

create or replace view public.public_inspection_slots as
select s.id, s.property_id, s.starts_at, s.ends_at,
       s.capacity - s.reserved_count + expired.expired_count as spaces_remaining
from public.inspection_slots s
cross join lateral (
  select count(*)::integer as expired_count
  from public.bookings b
  where b.slot_id = s.id
    and b.status in ('pending', 'rescheduled')
    and b.reservation_expires_at <= now()
) expired
where s.status = 'available'
  and s.starts_at > now()
  and s.reserved_count - expired.expired_count < s.capacity
  and public.is_property_publicly_readable(s.property_id);
grant select on public.public_inspection_slots to anon, authenticated;

drop policy if exists "bookings_staff_read" on public.bookings;
create policy "bookings_staff_read" on public.bookings
  for select using (exists (
    select 1 from public.inspection_slots s
    where s.id = slot_id and public.can_access_property(s.property_id)
  ));
drop policy if exists "bookings_staff_update" on public.bookings;
revoke update on public.bookings from anon, authenticated;

drop policy if exists "inspection_slots_public_read" on public.inspection_slots;
create policy "inspection_slots_public_read" on public.inspection_slots
  for select to anon using (
    status = 'available'
    and starts_at > now()
    and reserved_count < capacity
    and public.is_property_publicly_readable(property_id)
  );
drop policy if exists "inspection_slots_staff_read" on public.inspection_slots;
create policy "inspection_slots_staff_read" on public.inspection_slots
  for select using (public.can_access_property(property_id));
drop policy if exists "inspection_slots_staff_write" on public.inspection_slots;
create policy "inspection_slots_staff_write" on public.inspection_slots
  for all using (
    public.can_access_property(property_id)
    and public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  )
  with check (
    public.can_access_property(property_id)
    and public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
  );

create or replace function public.adjust_slot_reservation_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_active boolean := false;
  new_active boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_active := old.status in ('pending', 'approved', 'rescheduled');
  end if;
  if tg_op <> 'DELETE' then
    new_active := new.status in ('pending', 'approved', 'rescheduled');
  end if;
  if old_active and (
    tg_op = 'DELETE'
    or (tg_op = 'UPDATE' and (not new_active or old.slot_id is distinct from new.slot_id))
  ) then
    update public.inspection_slots set reserved_count = greatest(0, reserved_count - 1) where id = old.slot_id;
  end if;
  if new_active and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and (not old_active or old.slot_id is distinct from new.slot_id))
  ) then
    update public.inspection_slots set reserved_count = reserved_count + 1 where id = new.slot_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_booking_reservation_count on public.bookings;
create trigger trg_booking_reservation_count
after insert or update of status, slot_id or delete on public.bookings
for each row execute function public.adjust_slot_reservation_count();

create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'expired'
       and old.status in ('pending', 'rescheduled')
       and old.reservation_expires_at <= now() then
      new.gate_code := null;
    elsif auth.role() <> 'service_role'
       and public.caller_role() not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent') then
      raise exception 'Only authorized staff may decide inspections';
    end if;
    if not (
      (old.status = 'pending' and new.status in ('approved', 'rejected', 'cancelled', 'expired'))
      or (old.status = 'approved' and new.status in ('rescheduled', 'cancelled', 'completed', 'no_show'))
      or (old.status = 'rescheduled' and new.status in ('approved', 'cancelled', 'completed', 'no_show', 'expired'))
    ) then
      raise exception 'Invalid inspection status transition';
    end if;
    if new.status = 'approved' and old.status in ('pending', 'rescheduled') then
      new.gate_code := 'NST-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
    if new.status in ('completed', 'no_show') and new.outcome is null then
      raise exception 'Completed inspections require an outcome';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_booking_transition on public.bookings;
create trigger trg_booking_transition before update on public.bookings
for each row execute function public.enforce_booking_transition();

create or replace function public.transition_inspection_booking(
  p_booking_id uuid,
  p_status text,
  p_new_slot_id uuid,
  p_outcome text,
  p_idempotency_key text
)
returns table(booking_id uuid, public_reference text, status text, slot_id uuid, gate_code text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  booking_row public.bookings%rowtype;
  target_slot public.inspection_slots%rowtype;
  property_id text;
  existing_event public.booking_events%rowtype;
  target_slot_id uuid;
  initial_slot_id uuid;
begin
  if auth.uid() is null
     or public.caller_role() not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
     or p_booking_id is null
     or p_status is null
     or p_status not in ('approved', 'rejected', 'rescheduled', 'cancelled', 'completed', 'no_show')
     or p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128
     or (p_status in ('completed', 'no_show') and p_outcome is null)
     or (p_status not in ('completed', 'no_show') and p_outcome is not null)
     or (p_status = 'rescheduled' and p_new_slot_id is null)
     or (p_status <> 'rescheduled' and p_new_slot_id is not null) then
    raise exception 'Invalid or unauthorized booking transition' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into existing_event from public.booking_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if existing_event.booking_id <> p_booking_id or existing_event.actor_id <> auth.uid() then
      raise exception 'Idempotency key already used' using errcode = '23505';
    end if;
    select * into booking_row from public.bookings b where b.id = p_booking_id;
    if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
    select s.property_id into property_id from public.inspection_slots s where s.id = booking_row.slot_id;
    if not public.can_access_property(property_id) then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
    return query select booking_row.id, booking_row.public_reference, booking_row.status, booking_row.slot_id, booking_row.gate_code;
    return;
  end if;

  select * into booking_row from public.bookings b where b.id = p_booking_id;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  initial_slot_id := booking_row.slot_id;
  select s.property_id into property_id from public.inspection_slots s where s.id = booking_row.slot_id;
  if not public.can_access_property(property_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  target_slot_id := coalesce(p_new_slot_id, booking_row.slot_id);
  perform s.id
  from public.inspection_slots s
  where s.id in (initial_slot_id, target_slot_id)
  order by s.id
  for update;

  select * into booking_row from public.bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if booking_row.slot_id <> initial_slot_id then
    raise exception 'Booking changed concurrently; retry with a new operation key' using errcode = '40001';
  end if;
  select s.property_id into property_id from public.inspection_slots s where s.id = booking_row.slot_id;
  if not public.can_access_property(property_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if booking_row.status in ('pending', 'rescheduled') and booking_row.reservation_expires_at <= now()
     and p_status not in ('cancelled', 'rejected') then
    raise exception 'Pending reservation expired' using errcode = '22023';
  end if;
  if not (
    (booking_row.status = 'pending' and p_status in ('approved', 'rejected', 'cancelled'))
    or (booking_row.status = 'approved' and p_status in ('rescheduled', 'cancelled', 'completed', 'no_show'))
    or (booking_row.status = 'rescheduled' and p_status in ('approved', 'cancelled', 'completed', 'no_show'))
  ) then
    raise exception 'Invalid inspection status transition' using errcode = '22023';
  end if;
  if p_new_slot_id is not null then
    select * into target_slot from public.inspection_slots s where s.id = p_new_slot_id;
    if not found or target_slot.property_id <> property_id or target_slot.status <> 'available'
       or target_slot.starts_at <= now() then
      raise exception 'Replacement slot is unavailable' using errcode = '22023';
    end if;
    if p_new_slot_id = booking_row.slot_id then
      raise exception 'Rescheduling requires a different slot' using errcode = '22023';
    end if;
  end if;

  if target_slot_id <> booking_row.slot_id then
    update public.bookings
    set status = 'expired'
    where slot_id = target_slot_id and status in ('pending', 'rescheduled')
      and reservation_expires_at <= now();
    select * into target_slot from public.inspection_slots s where s.id = target_slot_id;
    if target_slot.reserved_count >= target_slot.capacity then
      raise exception 'Replacement slot is full' using errcode = '23P01';
    end if;
  end if;

  perform set_config('app.booking_idempotency_key', p_idempotency_key, true);
  update public.bookings b
  set status = p_status,
      slot_id = target_slot_id,
      outcome = p_outcome,
      reservation_expires_at = case when p_status = 'rescheduled' then now() + interval '15 minutes' else null end
  where b.id = p_booking_id
  returning * into booking_row;

  return query select booking_row.id, booking_row.public_reference, booking_row.status, booking_row.slot_id, booking_row.gate_code;
end;
$$;

create or replace function public.submit_inspection_request(
  p_slot_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_receipt_hash text,
  p_idempotency_key text
)
returns table(booking_id uuid, public_reference text, status text, reservation_expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  slot_row public.inspection_slots%rowtype;
  customer_row public.customers%rowtype;
  existing_booking public.bookings%rowtype;
begin
  if p_slot_id is null
     or length(btrim(p_name)) not between 1 and 120
     or (coalesce(btrim(p_email), '') <> '' and length(btrim(p_email)) not between 3 and 254)
     or (coalesce(btrim(p_phone), '') <> '' and length(btrim(p_phone)) not between 5 and 32)
     or (coalesce(btrim(p_email), '') = '' and coalesce(btrim(p_phone), '') = '')
     or length(coalesce(p_message, '')) > 2000
     or p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128 then
    raise exception 'Invalid inspection request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into existing_booking from public.bookings b where b.idempotency_key = p_idempotency_key;
  if found then
    if existing_booking.receipt_token_hash <> p_receipt_hash then
      raise exception 'Idempotency key already used' using errcode = '23505';
    end if;
    return query select existing_booking.id, existing_booking.public_reference, existing_booking.status, existing_booking.reservation_expires_at;
    return;
  end if;

  select * into slot_row from public.inspection_slots s where s.id = p_slot_id for update;
  if not found or slot_row.status <> 'available' or slot_row.starts_at <= now()
     or not public.is_property_publicly_readable(slot_row.property_id) then
    raise exception 'Inspection slot is unavailable' using errcode = '22023';
  end if;

  update public.bookings
  set status = 'expired'
  where slot_id = p_slot_id and status in ('pending', 'rescheduled') and reservation_expires_at <= now();
  select * into slot_row from public.inspection_slots s where s.id = p_slot_id for update;
  if slot_row.reserved_count >= slot_row.capacity then
    raise exception 'Inspection slot is full' using errcode = '23P01';
  end if;

  insert into public.customers (display_name, email, phone)
  values (btrim(p_name), lower(coalesce(btrim(p_email), '')), coalesce(btrim(p_phone), ''))
  on conflict (email, phone) do update
    set updated_at = now()
  returning * into customer_row;

  perform set_config('app.booking_idempotency_key', p_idempotency_key, true);
  insert into public.bookings as inserted_booking (
    slot_id, customer_id, name, email, phone, message,
    receipt_token_hash, idempotency_key, reservation_expires_at
  )
  values (
    p_slot_id, customer_row.id, btrim(p_name), lower(coalesce(btrim(p_email), '')), coalesce(btrim(p_phone), ''),
    coalesce(p_message, ''), p_receipt_hash, p_idempotency_key, now() + interval '15 minutes'
  )
  returning inserted_booking.id, inserted_booking.public_reference, inserted_booking.status, inserted_booking.reservation_expires_at
  into booking_id, public_reference, status, reservation_expires_at;
  return next;
end;
$$;

create or replace function public.expire_pending_inspection_bookings()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expired_count integer;
begin
  perform s.id
  from public.inspection_slots s
  where exists (
    select 1 from public.bookings b
    where b.slot_id = s.id
      and b.status in ('pending', 'rescheduled')
      and b.reservation_expires_at <= now()
  )
  order by s.id
  for update;

  update public.bookings
  set status = 'expired', reservation_expires_at = null
  where status in ('pending', 'rescheduled')
    and reservation_expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.get_booking_receipt(p_receipt_hash text)
returns table(public_reference text, status text, gate_code text, reservation_expires_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select b.public_reference,
         case when b.status in ('pending', 'rescheduled') and b.reservation_expires_at <= now() then 'expired' else b.status end,
         case when b.status = 'approved' then b.gate_code else null end,
         b.reservation_expires_at, b.updated_at
  from public.bookings as b
  where b.receipt_token_hash = p_receipt_hash
$$;

create table if not exists public.api_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);
alter table public.api_rate_limits enable row level security;

create or replace function public.consume_public_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_count integer;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
     or p_max_requests not between 1 and 100
     or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;
  insert into public.api_rate_limits (key_hash, window_started_at, request_count)
  values (p_key_hash, now(), 1)
  on conflict (key_hash) do update
    set window_started_at = case
          when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
          else api_rate_limits.window_started_at
        end,
        request_count = case
          when api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
          else api_rate_limits.request_count + 1
        end,
        updated_at = now()
  returning request_count into current_count;
  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.submit_offer(text, numeric, text, text, text, text, text, text, text) from public, authenticated;
revoke all on function public.get_offer_receipt(text) from public, authenticated;
revoke all on function public.submit_inspection_request(uuid, text, text, text, text, text, text) from public, authenticated;
revoke all on function public.get_booking_receipt(text) from public, authenticated;
revoke all on function public.consume_public_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.enforce_offer_decision() from public, anon, authenticated;
revoke all on function public.prepare_inspection_slot() from public, anon, authenticated;
revoke all on function public.adjust_slot_reservation_count() from public, anon, authenticated;
revoke all on function public.enforce_booking_transition() from public, anon, authenticated;
revoke all on function public.expire_pending_inspection_bookings() from public, anon, authenticated;
revoke all on function public.transition_inspection_booking(uuid, text, uuid, text, text) from public, anon;
revoke all on function public.can_access_customer(uuid) from public, anon;
revoke all on function public.consume_public_rate_limit(text, integer, integer) from public, anon, authenticated;

grant execute on function public.submit_offer(text, numeric, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_offer_receipt(text) to anon, authenticated;
grant execute on function public.submit_inspection_request(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_booking_receipt(text) to anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer) to service_role;
grant execute on function public.transition_inspection_booking(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.expire_pending_inspection_bookings() to service_role;

revoke all on public.customers, public.contact_enquiries, public.landlord_submissions,
  public.offers, public.staff_notes, public.inspection_slots, public.bookings, public.booking_events
  from anon;
revoke all on public.bookings, public.booking_events from authenticated;
grant select on public.workspace_settings to authenticated;
grant update (transit_buffer_mins, daylight_lock, daylight_start, daylight_end, retention_days, updated_at, updated_by)
  on public.workspace_settings to authenticated;
grant select on public.customers, public.contact_enquiries, public.landlord_submissions to authenticated;
grant insert on public.contact_enquiries, public.landlord_submissions to anon, authenticated;
revoke update on public.contact_enquiries, public.landlord_submissions from anon, authenticated;
grant update (status) on public.contact_enquiries, public.landlord_submissions to authenticated;
grant select on public.offers to authenticated;
revoke insert, update, delete on public.offers from anon, authenticated;
grant update (status, counter_amount) on public.offers to authenticated;
grant select on public.staff_notes to authenticated;
grant insert (entity_type, entity_id, author_id, body) on public.staff_notes to authenticated;
grant select on public.inspection_slots, public.bookings, public.booking_events to authenticated;
grant select on public.inspection_slots to authenticated;
grant insert (property_id, field_agent_id, starts_at, ends_at, capacity, status)
  on public.inspection_slots to authenticated;
grant update (property_id, field_agent_id, starts_at, ends_at, capacity, status)
  on public.inspection_slots to authenticated;
revoke delete on public.inspection_slots from anon, authenticated;
revoke insert, update, delete on public.bookings, public.booking_events from anon, authenticated;

comment on table public.contact_enquiries is 'Persistent contact enquiries; customer PII is never public-readable.';
comment on table public.landlord_submissions is 'Persistent landlord submissions; PII is visible only to staff within the exact assigned zone.';
comment on table public.offers is 'Offer intake is pending-only for the public; only authorized staff can decide.';
comment on table public.inspection_slots is 'Capacity-safe slots use half-open ranges and a configurable transit buffer.';
comment on table public.bookings is 'Pending booking holds capacity for 15 minutes; only approval generates a gate code. Completion records inspection outcome only, not tenancy.';
comment on table public.api_rate_limits is 'Hashed client/scope keys for atomic public API rate limiting; raw IP addresses are not stored.';
