-- Add Nestly application features to the existing WF01-backed schema.
-- This migration is additive for data tables; it keeps the legacy columns and
-- preserves the existing customer/conversation/message history.

create extension if not exists btree_gist with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in (
    'Platform Admin',
    'Operations Lead',
    'Field Vetting Agent',
    'Legal & Compliance',
    'Customer Care'
  )),
  capabilities text[] not null default '{}',
  assigned_zone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, display_name, role)
select
  sp.id,
  sp.full_name,
  case when sp.role = 'admin' then 'Platform Admin' else 'Field Vetting Agent' end
from public.staff_profiles as sp
on conflict (id) do nothing;

create or replace function public.caller_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.caller_role() = 'Platform Admin', false)
$$;

alter table public.properties
  add column if not exists slug text,
  add column if not exists tagline text not null default '',
  add column if not exists rent_annual numeric(15, 2),
  add column if not exists currency text not null default 'NGN',
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists address_short text,
  add column if not exists toilets integer,
  add column if not exists power_rating text,
  add column if not exists water_supply text,
  add column if not exists security_rating text,
  add column if not exists verification_state text,
  add column if not exists publication_state text,
  add column if not exists rental_availability text,
  add column if not exists featured_image text not null default '',
  add column if not exists nearby_landmarks text[] not null default '{}',
  add column if not exists landlord_contact jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists fixture_id text;

update public.properties
set slug = trim(both '-' from regexp_replace(lower(reference), '[^a-z0-9]+', '-', 'g'))
  || '-' || left(id::text, 8)
where slug is null;

update public.properties
set rent_annual = price_ngn
where rent_annual is null and price_period = 'yearly';

update public.properties
set rental_availability = case status
  when 'available' then 'available'
  when 'unavailable' then 'unavailable'
  when 'rented' then 'rented'
  else 'unknown'
end
where rental_availability is null;

update public.properties
set verification_state = case when verified_at is null then 'unverified' else 'verified' end
where verification_state is null;

update public.properties
set publication_state = case
  when status = 'available' and verified_at is not null then 'published'
  when status = 'available' then 'review'
  when status = 'archived' then 'archived'
  else 'draft'
end
where publication_state is null;

alter table public.properties
  alter column publication_state set default 'draft',
  alter column publication_state set not null,
  alter column rental_availability set default 'unknown',
  alter column rental_availability set not null,
  alter column verification_state set default 'unverified',
  alter column verification_state set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_publication_state_check'
  ) then
    alter table public.properties add constraint properties_publication_state_check
      check (publication_state in ('draft', 'review', 'published', 'archived'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_rental_availability_check'
  ) then
    alter table public.properties add constraint properties_rental_availability_check
      check (rental_availability in ('unknown', 'available', 'unavailable', 'rented'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_verification_state_check'
  ) then
    alter table public.properties add constraint properties_verification_state_check
      check (verification_state in ('unverified', 'pending', 'vetted', 'verified', 'rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_rent_annual_nonnegative'
  ) then
    alter table public.properties add constraint properties_rent_annual_nonnegative
      check (rent_annual is null or rent_annual >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_currency_check'
  ) then
    alter table public.properties add constraint properties_currency_check
      check (currency in ('NGN', 'USD', 'GBP'));
  end if;
end;
$$;

create unique index if not exists properties_slug_key on public.properties (slug);
create index if not exists properties_public_search_idx
  on public.properties (publication_state, rental_availability, verification_state, state, city, rent_annual);

create table if not exists public.property_fees (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  fee_key text not null check (length(fee_key) between 1 and 80),
  label text not null check (length(label) between 1 and 120),
  kind text not null check (kind in ('fixed', 'percent')),
  amount numeric(15, 2) not null check (amount >= 0 and (kind <> 'percent' or amount <= 100)),
  base text not null default 'rent' check (base in ('rent', 'subtotal')),
  required boolean not null default true,
  confirmed_at timestamptz,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, fee_key)
);

insert into public.property_fees (property_id, fee_key, label, kind, amount, base, required, sort_order)
select p.id, fee.fee_key, fee.label, 'fixed', fee.amount, 'rent', true, fee.sort_order
from public.properties as p
cross join lateral (
  values
    ('legacy_service_charge', 'Service charge', p.service_charge_ngn, 10),
    ('legacy_agency_fee', 'Agency fee', p.agency_fee_ngn, 20),
    ('legacy_other_fees', 'Other listed fees', p.other_fees_ngn, 30)
) as fee(fee_key, label, amount, sort_order)
where fee.amount > 0
on conflict (property_id, fee_key) do nothing;

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  actor_id uuid references auth.users(id),
  from_state text,
  to_state text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  state text not null,
  city text not null,
  hero_image text not null default '',
  tagline text not null default '',
  average_annual_rent_2bed numeric(15, 2),
  average_annual_rent_3bed numeric(15, 2),
  power_reliability text not null default '',
  security_rating text not null default '',
  road_network text not null default '',
  overview text not null default '',
  highlights text[] not null default '{}',
  recommended_for text[] not null default '{}',
  popular_streets text[] not null default '{}',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_media
  add column if not exists url text,
  add column if not exists bucket_id text,
  add column if not exists object_path text,
  add column if not exists media_kind text not null default 'listing',
  add column if not exists deleted_at timestamptz;

update public.property_media
set url = media_url
where url is null;

alter table public.property_media
  alter column url set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_media'::regclass
      and conname = 'property_media_kind_check'
  ) then
    alter table public.property_media add constraint property_media_kind_check
      check (media_kind in ('listing', 'evidence'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_media'::regclass
      and conname = 'property_media_storage_reference_check'
  ) then
    alter table public.property_media add constraint property_media_storage_reference_check
      check (
        (bucket_id is null and object_path is null)
        or (bucket_id in ('property-media', 'property-drafts') and object_path is not null)
      );
  end if;
end;
$$;

create or replace function public.zone_matches_property(
  p_zone text,
  p_state text,
  p_city text,
  p_neighborhood text,
  p_legacy_location text default null
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_zone), '') is not null
    and lower(btrim(p_zone)) in (
      lower(btrim(coalesce(p_state, ''))),
      lower(btrim(coalesce(p_city, ''))),
      lower(btrim(coalesce(p_neighborhood, ''))),
      lower(btrim(coalesce(p_legacy_location, '')))
    )
$$;

create or replace function public.can_access_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties as p
    left join public.profiles as profile on profile.id = (select auth.uid())
    where p.id = p_property_id
      and (
        (
          (select auth.uid()) is null
          and p.publication_state = 'published'
          and p.rental_availability = 'available'
          and p.verification_state in ('vetted', 'verified')
        )
        or profile.role = 'Platform Admin'
        or (
          profile.role in (
            'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'
          )
          and public.zone_matches_property(
            profile.assigned_zone, p.state, p.city, p.neighborhood, p.location
          )
        )
      )
  )
$$;

create or replace function public.can_edit_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties as p
    join public.profiles as profile on profile.id = (select auth.uid())
    where p.id = p_property_id
      and (select auth.uid()) is not null
      and (
        profile.role = 'Platform Admin'
        or (
          profile.role in ('Operations Lead', 'Field Vetting Agent')
          and public.zone_matches_property(
            profile.assigned_zone, p.state, p.city, p.neighborhood, p.location
          )
        )
      )
  )
$$;

create or replace function public.can_create_property(
  p_state text,
  p_city text,
  p_neighborhood text,
  p_legacy_location text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.caller_role() = 'Platform Admin'
    or (
      public.caller_role() in ('Operations Lead', 'Field Vetting Agent')
      and exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and public.zone_matches_property(
            profile.assigned_zone, p_state, p_city, p_neighborhood, p_legacy_location
          )
      )
    )
$$;

create or replace function public.can_read_staff_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as actor
    join public.profiles as target on target.id = p_profile_id
    where actor.id = (select auth.uid())
      and (
        actor.id = target.id
        or actor.role = 'Platform Admin'
        or (
          actor.role = 'Operations Lead'
          and actor.assigned_zone is not null
          and actor.assigned_zone = target.assigned_zone
          and target.role <> 'Platform Admin'
        )
      )
  )
$$;

create or replace function public.is_media_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.caller_role() in (
    'Platform Admin', 'Operations Lead', 'Field Vetting Agent'
  )
$$;

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      raise exception 'Staff profiles are provisioned by an authorized invitation'
        using errcode = '42501';
    end if;
    if old.id = auth.uid()
       and (
         new.role is distinct from old.role
         or new.capabilities is distinct from old.capabilities
         or new.assigned_zone is distinct from old.assigned_zone
         or new.id is distinct from old.id
       ) then
      raise exception 'A user cannot change their own role, capabilities, or zone'
        using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       or new.capabilities is distinct from old.capabilities
       or new.assigned_zone is distinct from old.assigned_zone then
      if public.caller_role() <> 'Platform Admin' then
        raise exception 'Only a Platform Admin may change trusted staff permissions'
          using errcode = '42501';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_profile_to_legacy_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_profiles (id, full_name, role)
  values (
    new.id,
    new.display_name,
    case when new.role = 'Platform Admin' then 'admin' else 'agent' end
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role;
  return new;
end;
$$;

create or replace function public.sync_legacy_staff_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set display_name = new.full_name,
      updated_at = now()
  where id = new.id
    and display_name is distinct from new.full_name;
  return new;
end;
$$;

drop trigger if exists nestly_profile_guard on public.profiles;
create trigger nestly_profile_guard
before insert or update on public.profiles
for each row execute function public.guard_profile_changes();

drop trigger if exists nestly_profile_to_legacy_staff on public.profiles;
create trigger nestly_profile_to_legacy_staff
after insert or update of display_name, role on public.profiles
for each row execute function public.sync_profile_to_legacy_staff();

drop trigger if exists nestly_legacy_staff_to_profile on public.staff_profiles;
create trigger nestly_legacy_staff_to_profile
after insert or update of full_name, role on public.staff_profiles
for each row execute function public.sync_legacy_staff_to_profile();

create or replace function public.guard_property_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.caller_role();
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if new.publication_state <> 'draft'
         or new.verification_state <> 'unverified'
         or new.created_by is distinct from auth.uid() then
        raise exception 'New properties must be created as drafts by the current user'
          using errcode = '42501';
      end if;
    end if;
  else
    if auth.uid() is not null and auth.role() <> 'service_role' then
      if new.created_by is distinct from old.created_by
         or new.status is distinct from old.status then
        raise exception 'Use the authorized property lifecycle fields'
          using errcode = '42501';
      end if;
      if new.publication_state is distinct from old.publication_state then
        if actor_role not in ('Platform Admin', 'Operations Lead')
           or not public.can_edit_property(old.id) then
          raise exception 'Only authorized property approvers may change publication state'
            using errcode = '42501';
        end if;
        if new.publication_state = 'published'
           and (
             new.verification_state not in ('vetted', 'verified')
             or new.rental_availability <> 'available'
           ) then
          raise exception 'Publishing requires a vetted available property'
            using errcode = '22023';
        end if;
      end if;
      if new.verification_state is distinct from old.verification_state then
        if new.verification_state = 'verified' and actor_role <> 'Platform Admin' then
          raise exception 'Only a Platform Admin may mark a property verified'
            using errcode = '42501';
        end if;
        if actor_role not in (
          'Platform Admin', 'Operations Lead', 'Field Vetting Agent'
        ) or not public.can_edit_property(old.id) then
          raise exception 'Not authorized to change property verification'
            using errcode = '42501';
        end if;
      end if;
    end if;

    if new.verification_state = 'verified' then
      new.verified_at := coalesce(new.verified_at, now());
    elsif new.verification_state is distinct from old.verification_state then
      new.verified_at := null;
    end if;

    if new.publication_state is distinct from old.publication_state
       or new.rental_availability is distinct from old.rental_availability
       or new.verification_state is distinct from old.verification_state then
      new.status := case
        when new.publication_state = 'archived' then 'archived'
        when new.rental_availability = 'rented' then 'rented'
        when new.rental_availability = 'unavailable' then 'unavailable'
        when new.publication_state = 'published'
          and new.rental_availability = 'available'
          and new.verification_state in ('vetted', 'verified') then 'available'
        else 'draft'
      end;
    end if;

    if new.verification_state is distinct from old.verification_state then
      insert into public.verification_events (
        property_id, actor_id, from_state, to_state
      ) values (
        new.id, auth.uid(), old.verification_state, new.verification_state
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_property_lifecycle_guard on public.properties;
create trigger nestly_property_lifecycle_guard
before insert or update on public.properties
for each row execute function public.guard_property_lifecycle();

create or replace function public.is_publicly_discoverable_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties as p
    where p.id = p_property_id
      and p.publication_state = 'published'
      and p.rental_availability = 'available'
      and p.verification_state in ('vetted', 'verified')
  )
$$;

create or replace view public.public_properties
with (security_barrier = true)
as
select
  p.id,
  p.slug,
  p.reference,
  p.title,
  p.tagline,
  p.description,
  p.property_type,
  p.price_ngn,
  p.price_period,
  p.rent_annual,
  p.currency,
  p.state,
  p.city,
  p.location,
  p.neighborhood,
  p.address_short,
  p.bedrooms,
  p.bathrooms,
  p.toilets,
  p.power_rating,
  p.water_supply,
  p.security_rating,
  p.verification_state,
  p.publication_state,
  p.rental_availability,
  p.featured_image,
  p.features,
  p.nearby_landmarks,
  p.created_at,
  p.updated_at
from public.properties as p
where p.publication_state = 'published'
  and p.rental_availability = 'available'
  and p.verification_state in ('vetted', 'verified');

alter table public.profiles enable row level security;
alter table public.property_fees enable row level security;
alter table public.neighborhoods enable row level security;
alter table public.verification_events enable row level security;

create policy nestly_verification_events_staff_read on public.verification_events
for select to authenticated
using (
  public.caller_role() in (
    'Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'
  )
  and public.can_access_property(property_id)
);

drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_staff_read on public.profiles;
create policy nestly_profiles_read on public.profiles
for select to authenticated
using (public.can_read_staff_profile(id));
create policy nestly_profiles_self_update on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists public_view_verified_properties on public.properties;
drop policy if exists staff_manage_properties on public.properties;
create policy nestly_property_staff_read on public.properties
for select to authenticated
using (
  (
    public.caller_role() in (
      'Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'
    )
    and public.can_access_property(id)
  )
  or (
    public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
    and created_by = (select auth.uid())
    and publication_state in ('draft', 'review')
  )
);
create policy nestly_property_insert on public.properties
for insert to authenticated
with check (
  public.can_create_property(state, city, neighborhood, location)
  and created_by = (select auth.uid())
  and publication_state = 'draft'
  and verification_state = 'unverified'
);
create policy nestly_property_update on public.properties
for update to authenticated
using (public.can_edit_property(id))
with check (public.can_edit_property(id));
create policy nestly_property_delete on public.properties
for delete to authenticated
using (public.is_platform_admin());
revoke all on public.properties from anon;
grant select, insert, update, delete on public.properties to authenticated;
grant select on public.public_properties to anon, authenticated;

drop policy if exists public_view_media on public.property_media;
drop policy if exists staff_manage_media on public.property_media;
create policy nestly_public_listing_media on public.property_media
for select to anon, authenticated
using (
  deleted_at is null
  and media_kind = 'listing'
  and public.is_publicly_discoverable_property(property_id)
);
create policy nestly_staff_property_media on public.property_media
for select to authenticated
using (
  deleted_at is null
  and public.can_access_property(property_id)
  and (
    media_kind = 'listing'
    or (media_kind = 'evidence' and public.is_media_editor())
  )
);
create policy nestly_staff_insert_media on public.property_media
for insert to authenticated
with check (
  public.is_media_editor()
  and public.can_edit_property(property_id)
);
create policy nestly_staff_update_media on public.property_media
for update to authenticated
using (public.is_media_editor() and public.can_edit_property(property_id))
with check (public.is_media_editor() and public.can_edit_property(property_id));
create policy nestly_staff_delete_media on public.property_media
for delete to authenticated
using (public.is_media_editor() and public.can_edit_property(property_id));

drop policy if exists property_fees_public_read on public.property_fees;
drop policy if exists property_fees_staff_all on public.property_fees;
create policy nestly_property_fees_public_read on public.property_fees
for select to anon, authenticated
using (public.is_publicly_discoverable_property(property_id));
create policy nestly_property_fees_staff_read on public.property_fees
for select to authenticated
using (public.can_access_property(property_id));
create policy nestly_property_fees_staff_insert on public.property_fees
for insert to authenticated
with check (public.can_edit_property(property_id));
create policy nestly_property_fees_staff_update on public.property_fees
for update to authenticated
using (public.can_edit_property(property_id))
with check (public.can_edit_property(property_id));
create policy nestly_property_fees_staff_delete on public.property_fees
for delete to authenticated
using (public.can_edit_property(property_id));

drop policy if exists neighborhoods_public_read on public.neighborhoods;
create policy nestly_neighborhoods_public_read on public.neighborhoods
for select to anon, authenticated using (active);
create policy nestly_neighborhoods_staff_read on public.neighborhoods
for select to authenticated
using (public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance'));
create policy nestly_neighborhoods_staff_manage on public.neighborhoods
for all to authenticated
using (public.caller_role() in ('Platform Admin', 'Operations Lead'))
with check (public.caller_role() in ('Platform Admin', 'Operations Lead'));

create or replace function public.property_id_from_storage_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('property-media', 'property-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('property-drafts', 'property-drafts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from storage.buckets
    where id in ('property-media', 'property-drafts') and public
  ) then
    raise exception 'Nestly property media buckets must remain private';
  end if;
end;
$$;

drop policy if exists nestly_property_storage_read on storage.objects;
drop policy if exists nestly_property_storage_insert on storage.objects;
drop policy if exists nestly_property_storage_update on storage.objects;
drop policy if exists nestly_property_storage_delete on storage.objects;
create policy nestly_property_storage_read on storage.objects
for select to anon, authenticated
using (
  exists (
    select 1
    from public.property_media as media
    where media.bucket_id = storage.objects.bucket_id
      and media.object_path = storage.objects.name
      and media.deleted_at is null
      and media.media_kind = 'listing'
      and media.bucket_id = 'property-media'
      and (
        public.is_publicly_discoverable_property(media.property_id)
        or (
          auth.role() = 'authenticated'
          and public.is_media_editor()
          and public.can_access_property(media.property_id)
        )
      )
  )
  or (
    bucket_id = 'property-drafts'
    and case
      when auth.role() = 'authenticated' then
        public.is_media_editor()
        and exists (
          select 1
          from public.property_media as media
          where media.bucket_id = storage.objects.bucket_id
            and media.object_path = storage.objects.name
            and media.deleted_at is null
            and public.can_edit_property(media.property_id)
        )
      else false
    end
  )
);
create policy nestly_property_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('property-media', 'property-drafts')
  and public.is_media_editor()
  and public.can_edit_property(public.property_id_from_storage_path(name))
);
create policy nestly_property_storage_update on storage.objects
for update to authenticated
using (
  bucket_id in ('property-media', 'property-drafts')
  and public.is_media_editor()
  and exists (
    select 1
    from public.property_media as media
    where media.bucket_id = storage.objects.bucket_id
      and media.object_path = storage.objects.name
      and media.deleted_at is null
      and public.can_edit_property(media.property_id)
  )
)
with check (
  bucket_id in ('property-media', 'property-drafts')
  and public.is_media_editor()
  and exists (
    select 1
    from public.property_media as media
    where media.bucket_id = storage.objects.bucket_id
      and media.object_path = storage.objects.name
      and media.deleted_at is null
      and public.can_edit_property(media.property_id)
  )
);
create policy nestly_property_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id in ('property-media', 'property-drafts')
  and public.is_media_editor()
  and exists (
    select 1
    from public.property_media as media
    where media.bucket_id = storage.objects.bucket_id
      and media.object_path = storage.objects.name
      and public.can_edit_property(media.property_id)
  )
);

alter table public.customers
  alter column whatsapp_phone drop not null,
  add column if not exists display_name text,
  add column if not exists phone text,
  add column if not exists updated_at timestamptz not null default now();

update public.customers
set display_name = coalesce(display_name, full_name, ''),
    phone = coalesce(phone, whatsapp_phone)
where display_name is null or phone is null;

create unique index if not exists customers_email_unique
on public.customers (lower(email))
where email is not null and btrim(email) <> '';

create or replace function public.sync_customer_contact_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    new.full_name := new.display_name;
  elsif new.full_name is distinct from old.full_name then
    new.display_name := new.full_name;
  end if;
  if new.phone is distinct from old.phone then
    new.whatsapp_phone := nullif(btrim(new.phone), '');
  elsif new.whatsapp_phone is distinct from old.whatsapp_phone then
    new.phone := new.whatsapp_phone;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nestly_customer_contact_sync on public.customers;
create trigger nestly_customer_contact_sync
before update on public.customers
for each row execute function public.sync_customer_contact_fields();

create or replace function public.sync_property_media_legacy_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.url := coalesce(new.url, new.media_url);
  new.media_url := coalesce(new.media_url, new.url);
  if new.media_type is null then
    new.media_type := 'image';
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_property_media_legacy_sync on public.property_media;
create trigger nestly_property_media_legacy_sync
before insert or update on public.property_media
for each row execute function public.sync_property_media_legacy_fields();

create table if not exists public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  property_id uuid references public.properties(id) on delete set null,
  message text not null check (length(message) between 1 and 4000),
  status text not null default 'new'
    check (status in ('new', 'in_review', 'responded', 'closed')),
  idempotency_key text not null unique,
  public_reference text not null unique,
  receipt_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  idempotency_key text not null unique,
  public_reference text not null unique,
  receipt_hash text not null unique,
  property_type text not null,
  state text not null,
  city text not null,
  neighborhood text not null,
  address text not null,
  bedrooms smallint not null check (bedrooms between 0 and 30),
  expected_annual_rent numeric(15, 2) not null check (expected_annual_rent >= 0),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'new'
    check (status in ('new', 'in_review', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'property', 'customer', 'enquiry', 'landlord_submission',
    'offer', 'inspection', 'conversation'
  )),
  entity_id uuid not null,
  author_id uuid not null references auth.users(id),
  note text not null check (length(note) between 1 and 4000),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.can_access_staff_note(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.caller_role() = 'Platform Admin' then
    return true;
  end if;
  if p_entity_type = 'property' then
    return public.can_access_property(p_entity_id);
  end if;
  if p_entity_type = 'offer' then
    return exists (
      select 1 from public.offers as o
      where o.id = p_entity_id and public.can_access_property(o.property_id)
    );
  end if;
  if p_entity_type = 'inspection' then
    return exists (
      select 1 from public.inspections as i
      where i.id = p_entity_id and public.can_access_property(i.property_id)
    );
  end if;
  if p_entity_type = 'customer' then
    return public.can_access_customer(p_entity_id);
  end if;
  if p_entity_type = 'enquiry' then
    return exists (
      select 1 from public.contact_enquiries e
      where e.id = p_entity_id
        and (
          public.caller_role() in ('Platform Admin', 'Customer Care')
          or (e.property_id is not null and public.can_access_property(e.property_id))
        )
    );
  end if;
  if p_entity_type = 'landlord_submission' then
    return exists (
      select 1 from public.landlord_submissions l
      join public.profiles actor on actor.id = (select auth.uid())
      where l.id = p_entity_id
        and (
          actor.role in ('Platform Admin', 'Customer Care')
          or public.zone_matches_property(
            actor.assigned_zone, l.state, l.city, l.neighborhood, null
          )
        )
    );
  end if;
  if p_entity_type = 'conversation' then
    return exists (
      select 1 from public.conversations c
      where c.id = p_entity_id
        and (
          public.caller_role() = 'Customer Care'
          or (c.current_property_id is not null
            and public.can_access_property(c.current_property_id))
        )
    );
  end if;
  return false;
end;
$$;

alter table public.contact_enquiries enable row level security;
alter table public.landlord_submissions enable row level security;
alter table public.staff_notes enable row level security;
create policy nestly_enquiries_staff_read on public.contact_enquiries
for select to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Customer Care', 'Operations Lead')
  and (property_id is null or public.can_access_property(property_id))
);
create policy nestly_enquiries_staff_update on public.contact_enquiries
for update to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Customer Care')
  or (public.caller_role() = 'Operations Lead' and property_id is not null and public.can_access_property(property_id))
)
with check (
  public.caller_role() in ('Platform Admin', 'Customer Care')
  or (public.caller_role() = 'Operations Lead' and property_id is not null and public.can_access_property(property_id))
);
create policy nestly_landlord_submissions_staff_read on public.landlord_submissions
for select to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Customer Care')
  or (
    public.caller_role() = 'Operations Lead'
    and exists (
      select 1 from public.profiles actor
      where actor.id = (select auth.uid())
        and public.zone_matches_property(
          actor.assigned_zone, state, city, neighborhood, null
        )
    )
  )
);
create policy nestly_landlord_submissions_staff_update on public.landlord_submissions
for update to authenticated
using (
  public.caller_role() = 'Platform Admin'
  or (
    public.caller_role() = 'Operations Lead'
    and exists (
      select 1 from public.profiles actor
      where actor.id = (select auth.uid())
        and public.zone_matches_property(
          actor.assigned_zone, state, city, neighborhood, null
        )
    )
  )
)
with check (
  public.caller_role() = 'Platform Admin'
  or (
    public.caller_role() = 'Operations Lead'
    and exists (
      select 1 from public.profiles actor
      where actor.id = (select auth.uid())
        and public.zone_matches_property(
          actor.assigned_zone, state, city, neighborhood, null
        )
    )
  )
);
create policy nestly_staff_notes_read on public.staff_notes
for select to authenticated
using (deleted_at is null and public.can_access_staff_note(entity_type, entity_id));
create policy nestly_staff_notes_insert on public.staff_notes
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and public.can_access_staff_note(entity_type, entity_id)
);
create policy nestly_staff_notes_soft_delete on public.staff_notes
for update to authenticated
using (author_id = (select auth.uid()) or public.is_platform_admin())
with check (
  deleted_at is not null
  and (author_id = (select auth.uid()) or public.is_platform_admin())
);

create or replace function public.find_or_create_customer(
  p_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := nullif(lower(btrim(p_email)), '');
  normalized_phone text := nullif(btrim(p_phone), '');
  phone_customer uuid;
  email_customer uuid;
  customer_id uuid;
begin
  if p_name is null
     or length(btrim(p_name)) not between 1 and 120
     or (normalized_email is null and normalized_phone is null) then
    raise exception 'A valid name and contact method are required'
      using errcode = '22023';
  end if;

  if normalized_phone is not null then
    select c.id into phone_customer
    from public.customers as c
    where c.whatsapp_phone = normalized_phone
    limit 1
    for update;
  end if;
  if normalized_email is not null then
    select c.id into email_customer
    from public.customers as c
    where lower(coalesce(c.email, '')) = normalized_email
    limit 1
    for update;
  end if;
  if phone_customer is not null
     and email_customer is not null
     and phone_customer <> email_customer then
    raise exception 'Contact details belong to separate customer records'
      using errcode = '22023';
  end if;
  customer_id := coalesce(phone_customer, email_customer);
  if customer_id is not null then
    return customer_id;
  end if;

  begin
    insert into public.customers (
      whatsapp_phone, phone, full_name, display_name, email
    ) values (
      normalized_phone, normalized_phone, btrim(p_name), btrim(p_name), normalized_email
    ) returning id into customer_id;
  exception when unique_violation then
    if normalized_phone is not null then
      select c.id into customer_id
      from public.customers as c
      where c.whatsapp_phone = normalized_phone
      limit 1;
    end if;
    if customer_id is null and normalized_email is not null then
      select c.id into customer_id
      from public.customers as c
      where lower(coalesce(c.email, '')) = normalized_email
      limit 1;
    end if;
    if customer_id is null then
      raise;
    end if;
  end;
  return customer_id;
end;
$$;

create or replace function public.submit_contact_enquiry(
  p_property_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_receipt_hash text,
  p_idempotency_key text
)
returns table (status text, public_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_enquiry public.contact_enquiries%rowtype;
  customer_id uuid;
  new_enquiry public.contact_enquiries%rowtype;
begin
  if p_message is null
     or length(btrim(p_message)) not between 1 and 4000
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or length(coalesce(p_receipt_hash, '')) not between 32 and 128 then
    raise exception 'Invalid enquiry details' using errcode = '22023';
  end if;
  select * into existing_enquiry
  from public.contact_enquiries as e
  where e.idempotency_key = p_idempotency_key;
  if found then
    if existing_enquiry.receipt_hash is distinct from p_receipt_hash then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_enquiry.status, existing_enquiry.public_reference;
    return;
  end if;
  if p_property_id is not null
     and not public.is_publicly_discoverable_property(p_property_id) then
    raise exception 'Property is unavailable' using errcode = '22023';
  end if;

  customer_id := public.find_or_create_customer(p_name, p_email, p_phone);
  insert into public.contact_enquiries (
    customer_id, property_id, message, idempotency_key,
    public_reference, receipt_hash
  ) values (
    customer_id, p_property_id, btrim(p_message), p_idempotency_key,
    'C-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_receipt_hash
  ) returning * into new_enquiry;

  insert into public.notifications (
    channel, recipient, template_key, idempotency_key, status
  ) values (
    'dashboard', 'team:customer-care', 'contact-enquiry.new',
    'enquiry:' || new_enquiry.id::text, 'queued'
  ) on conflict (idempotency_key) do nothing;

  return query select new_enquiry.status, new_enquiry.public_reference;
end;
$$;

create or replace function public.submit_landlord_submission(
  p_name text,
  p_email text,
  p_phone text,
  p_property_type text,
  p_state text,
  p_city text,
  p_neighborhood text,
  p_address text,
  p_bedrooms smallint,
  p_expected_annual_rent numeric,
  p_description text,
  p_receipt_hash text,
  p_idempotency_key text
)
returns table (status text, public_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_submission public.landlord_submissions%rowtype;
  customer_id uuid;
  new_submission public.landlord_submissions%rowtype;
begin
  if p_property_type is null or p_state is null or p_city is null
     or p_neighborhood is null or p_address is null
     or p_bedrooms is null or p_expected_annual_rent is null
     or length(btrim(p_property_type)) not between 1 and 80
     or length(btrim(p_state)) not between 1 and 80
     or length(btrim(p_city)) not between 1 and 120
     or length(btrim(p_neighborhood)) not between 1 and 120
     or length(btrim(p_address)) not between 1 and 240
     or p_bedrooms not between 0 and 30
     or p_expected_annual_rent < 0
     or length(coalesce(p_description, '')) > 4000
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or length(coalesce(p_receipt_hash, '')) not between 32 and 128 then
    raise exception 'Invalid landlord submission' using errcode = '22023';
  end if;
  select * into existing_submission
  from public.landlord_submissions as s
  where s.idempotency_key = p_idempotency_key;
  if found then
    if existing_submission.receipt_hash is distinct from p_receipt_hash then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_submission.status, existing_submission.public_reference;
    return;
  end if;

  customer_id := public.find_or_create_customer(p_name, p_email, p_phone);
  insert into public.landlord_submissions (
    customer_id, idempotency_key, public_reference, receipt_hash,
    property_type, state, city, neighborhood, address, bedrooms,
    expected_annual_rent, description
  ) values (
    customer_id, p_idempotency_key,
    'L-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_receipt_hash, btrim(p_property_type), btrim(p_state), btrim(p_city),
    btrim(p_neighborhood), btrim(p_address), p_bedrooms,
    p_expected_annual_rent, coalesce(btrim(p_description), '')
  ) returning * into new_submission;

  insert into public.notifications (
    channel, recipient, template_key, idempotency_key, status
  ) values (
    'dashboard', 'team:operations', 'landlord-submission.new',
    'landlord-submission:' || new_submission.id::text, 'queued'
  ) on conflict (idempotency_key) do nothing;

  return query select new_submission.status, new_submission.public_reference;
end;
$$;

create or replace function public.get_contact_enquiry_receipt(p_receipt_hash text)
returns table (public_reference text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.public_reference, e.status
  from public.contact_enquiries as e
  where e.receipt_hash = p_receipt_hash
  limit 1
$$;

create or replace function public.get_landlord_submission_receipt(p_receipt_hash text)
returns table (public_reference text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.public_reference, s.status
  from public.landlord_submissions as s
  where s.receipt_hash = p_receipt_hash
  limit 1
$$;

alter table public.offers
  alter column conversation_id drop not null,
  add column if not exists amount numeric(15, 2),
  add column if not exists currency text not null default 'NGN',
  add column if not exists message text not null default '',
  add column if not exists public_reference text,
  add column if not exists receipt_hash text,
  add column if not exists idempotency_key text,
  add column if not exists decided_by uuid references auth.users(id),
  add column if not exists decided_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.offers
set amount = proposed_amount_ngn,
    decided_by = reviewed_by,
    decided_at = reviewed_at,
    public_reference = coalesce(public_reference, 'O-' || id::text)
where amount is null or public_reference is null;

alter table public.offers alter column amount set not null;
create unique index if not exists offers_public_reference_key on public.offers (public_reference);
create unique index if not exists offers_idempotency_key_key
  on public.offers (idempotency_key) where idempotency_key is not null;
create unique index if not exists offers_receipt_hash_key
  on public.offers (receipt_hash) where receipt_hash is not null;

create or replace function public.submit_offer(
  p_property_id uuid,
  p_amount numeric,
  p_currency text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_receipt_hash text,
  p_idempotency_key text
)
returns table (status text, public_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_offer public.offers%rowtype;
  customer_id uuid;
  new_offer public.offers%rowtype;
begin
  if p_amount is null or p_amount <= 0 or p_currency is distinct from 'NGN'
     or length(coalesce(p_message, '')) > 2000
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or length(coalesce(p_receipt_hash, '')) not between 32 and 128 then
    raise exception 'Invalid offer details' using errcode = '22023';
  end if;

  select * into existing_offer
  from public.offers as o
  where o.idempotency_key = p_idempotency_key;
  if found then
    if existing_offer.receipt_hash is distinct from p_receipt_hash then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_offer.status, existing_offer.public_reference;
    return;
  end if;
  if not public.is_publicly_discoverable_property(p_property_id) then
    raise exception 'Property is unavailable' using errcode = '22023';
  end if;

  customer_id := public.find_or_create_customer(p_name, p_email, p_phone);
  insert into public.offers (
    customer_id, property_id, proposed_amount_ngn, amount, currency,
    message, status, public_reference, receipt_hash, idempotency_key
  ) values (
    customer_id, p_property_id, p_amount, p_amount, 'NGN',
    nullif(btrim(p_message), ''), 'pending',
    'O-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_receipt_hash, p_idempotency_key
  ) returning * into new_offer;

  insert into public.notifications (
    channel, recipient, template_key, idempotency_key, status
  ) values (
    'dashboard', 'team:offers', 'offer.pending',
    'offer:' || new_offer.id::text, 'queued'
  ) on conflict (idempotency_key) do nothing;

  return query select new_offer.status, new_offer.public_reference;
end;
$$;

create or replace function public.get_offer_receipt(p_receipt_hash text)
returns table (public_reference text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.public_reference, o.status
  from public.offers as o
  where o.receipt_hash = p_receipt_hash
  limit 1
$$;

create or replace function public.guard_offer_decision()
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
    if old.status <> 'pending'
       or new.status not in ('accepted', 'rejected', 'countered')
       or actor_role not in ('Platform Admin', 'Operations Lead', 'Legal & Compliance') then
      raise exception 'Only authorized staff may decide a pending offer'
        using errcode = '42501';
    end if;
    if not public.can_access_property(new.property_id) then
      raise exception 'Offer is outside the caller zone'
        using errcode = '42501';
    end if;
    if new.status = 'countered' and new.counter_amount_ngn is null then
      raise exception 'A counter offer requires a counter amount'
        using errcode = '22023';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nestly_offer_decision_guard on public.offers;
create trigger nestly_offer_decision_guard
before update on public.offers
for each row execute function public.guard_offer_decision();

create table if not exists public.workspace_settings (
  id smallint primary key default 1 check (id = 1),
  transit_buffer_mins smallint not null default 30
    check (transit_buffer_mins between 0 and 240),
  daylight_lock boolean not null default false,
  daylight_start time not null default '07:00',
  daylight_end time not null default '18:00',
  retention_days smallint not null default 365
    check (retention_days between 30 and 3650),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (daylight_start < daylight_end)
);
insert into public.workspace_settings (id) values (1) on conflict (id) do nothing;
alter table public.workspace_settings enable row level security;
create policy nestly_workspace_settings_staff_read on public.workspace_settings
for select to authenticated
using (public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent'));
create policy nestly_workspace_settings_admin_update on public.workspace_settings
for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

alter table public.workspace_settings
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_monthly_budget numeric(12, 2);

alter table public.inspection_slots
  add column if not exists transit_buffer_mins smallint not null default 30;

alter table public.inspection_slots
  drop constraint if exists inspection_slots_capacity_check,
  add constraint inspection_slots_capacity_check check (capacity between 1 and 50);
drop index if exists public.one_active_booking_per_slot;

create or replace function public.apply_workspace_transit_buffer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transit_buffer_mins is null or new.transit_buffer_mins = 30 then
    select s.transit_buffer_mins into new.transit_buffer_mins
    from public.workspace_settings s where s.id = 1;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_slot_buffer_default on public.inspection_slots;
create trigger nestly_slot_buffer_default
before insert on public.inspection_slots
for each row execute function public.apply_workspace_transit_buffer();

create or replace function public.guard_inspection_slot_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_reservations integer;
begin
  if new.capacity is distinct from old.capacity
     or new.is_active is distinct from old.is_active then
    select count(*)::integer into active_reservations
    from public.inspections i
    where i.slot_id = old.id
      and (
        i.status = 'CONFIRMED'
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at > now()
        )
      );
    if new.capacity < active_reservations then
      raise exception 'Capacity cannot be lower than active reservations'
        using errcode = '23514';
    end if;
    if not new.is_active and active_reservations > 0 then
      raise exception 'A slot with active reservations cannot be deactivated'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_slot_capacity_guard on public.inspection_slots;
create trigger nestly_slot_capacity_guard
before update on public.inspection_slots
for each row execute function public.guard_inspection_slot_capacity();

create or replace function public.guard_inspection_slot_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent_role text;
  agent_zone text;
  daylight_locked boolean;
  daylight_start time;
  daylight_end time;
  local_start timestamp without time zone;
  local_end timestamp without time zone;
  property_row public.properties%rowtype;
begin
  if new.is_active and new.starts_at <= now() then
    raise exception 'Inspection slots must be scheduled in the future'
      using errcode = '23514';
  end if;
  if new.is_active then
    select s.daylight_lock, s.daylight_start, s.daylight_end
    into daylight_locked, daylight_start, daylight_end
    from public.workspace_settings as s
    where s.id = 1;
    if daylight_locked then
      local_start := new.starts_at at time zone 'Africa/Lagos';
      local_end := new.ends_at at time zone 'Africa/Lagos';
      if local_start::date <> local_end::date
         or local_start::time < daylight_start
         or local_end::time > daylight_end then
        raise exception 'Inspection slot must fit within configured daylight hours'
          using errcode = '23514';
      end if;
    end if;
  end if;
  if new.agent_id is null then
    return new;
  end if;

  select p.role, p.assigned_zone into agent_role, agent_zone
  from public.profiles p
  where p.id = new.agent_id;
  if not found or agent_role <> 'Field Vetting Agent' then
    raise exception 'Inspection slots must be assigned to a Field Vetting Agent'
      using errcode = '42501';
  end if;

  select * into property_row
  from public.properties p
  where p.id = new.property_id;
  if not found
     or not public.zone_matches_property(
       agent_zone,
       property_row.state,
       property_row.city,
       property_row.neighborhood,
       property_row.location
     ) then
    raise exception 'The assigned agent must be scoped to the property zone'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_slot_agent_guard on public.inspection_slots;
create trigger nestly_slot_agent_guard
before insert or update of property_id, agent_id, starts_at, is_active on public.inspection_slots
for each row execute function public.guard_inspection_slot_agent();

create or replace function public.inspection_buffered_time_range(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_buffer_minutes smallint
)
returns tstzrange
language sql
immutable
strict
set search_path = ''
as $$
  select tstzrange(
    p_starts_at - (p_buffer_minutes * interval '1 minute'),
    p_ends_at + (p_buffer_minutes * interval '1 minute'),
    '[)'
  )
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_slots'::regclass
      and conname = 'inspection_slots_transit_buffer_check'
  ) then
    alter table public.inspection_slots add constraint inspection_slots_transit_buffer_check
      check (transit_buffer_mins between 0 and 240);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_slots'::regclass
      and conname = 'inspection_slots_property_no_buffered_overlap'
  ) then
    alter table public.inspection_slots add constraint inspection_slots_property_no_buffered_overlap
      exclude using gist (
        property_id with =,
        (public.inspection_buffered_time_range(starts_at, ends_at, transit_buffer_mins)) with &&
      ) where (is_active);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_slots'::regclass
      and conname = 'inspection_slots_agent_no_buffered_overlap'
  ) then
    alter table public.inspection_slots add constraint inspection_slots_agent_no_buffered_overlap
      exclude using gist (
        agent_id with =,
        (public.inspection_buffered_time_range(starts_at, ends_at, transit_buffer_mins)) with &&
      ) where (is_active and agent_id is not null);
  end if;
end;
$$;

alter table public.inspections
  add column if not exists public_reference text,
  add column if not exists receipt_hash text,
  add column if not exists idempotency_key text,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists customer_message text,
  add column if not exists outcome text,
  add column if not exists gate_details text;

update public.inspections
set public_reference = coalesce(public_reference, 'I-' || id::text)
where public_reference is null;

create unique index if not exists inspections_public_reference_key
  on public.inspections (public_reference);
create unique index if not exists inspections_idempotency_key_key
  on public.inspections (idempotency_key) where idempotency_key is not null;
create unique index if not exists inspections_receipt_hash_key
  on public.inspections (receipt_hash) where receipt_hash is not null;

create or replace function public.expire_pending_inspections(p_slot_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  update public.inspections
  set status = 'CANCELLED',
      outcome = 'reservation_expired',
      updated_at = now()
  where status = 'PENDING_CONFIRMATION'
    and reservation_expires_at is not null
    and reservation_expires_at <= now()
    and (p_slot_id is null or slot_id = p_slot_id);
  get diagnostics changed_count = row_count;
  return changed_count;
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
declare
  slot_row public.inspection_slots%rowtype;
  customer_row public.customers%rowtype;
  inspection_row public.inspections%rowtype;
  active_reservations integer;
  normalized_phone text := nullif(btrim(p_phone), '');
  normalized_email text := nullif(lower(btrim(p_email)), '');
begin
  if p_name is null
     or length(btrim(p_name)) not between 1 and 120
     or length(coalesce(p_message, '')) > 2000
     or (normalized_phone is null and normalized_email is null)
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160
     or length(coalesce(p_receipt_hash, '')) not between 32 and 128 then
    raise exception 'Invalid inspection request' using errcode = '22023';
  end if;

  select * into inspection_row
  from public.inspections as i
  where i.idempotency_key = p_idempotency_key;
  if found then
    if inspection_row.receipt_hash is distinct from p_receipt_hash then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select inspection_row.id, inspection_row.status,
      inspection_row.public_reference, inspection_row.reservation_expires_at;
    return;
  end if;

  perform public.expire_pending_inspections(p_slot_id);
  select * into slot_row
  from public.inspection_slots as s
  where s.id = p_slot_id and s.is_active and s.starts_at > now()
  for update;
  if not found
     or not public.is_publicly_discoverable_property(slot_row.property_id) then
    raise exception 'Inspection slot is unavailable' using errcode = '22023';
  end if;
  select count(*)::integer into active_reservations
  from public.inspections i
  where i.slot_id = slot_row.id
    and (
      i.status = 'CONFIRMED'
      or (
        i.status = 'PENDING_CONFIRMATION'
        and i.reservation_expires_at > now()
      )
    );
  if active_reservations >= slot_row.capacity then
    raise exception 'Inspection slot is full' using errcode = '23P01';
  end if;

  select * into customer_row
  from public.customers as c
  where (normalized_phone is not null and c.whatsapp_phone = normalized_phone)
     or (
       normalized_phone is null and normalized_email is not null
       and lower(coalesce(c.email, '')) = normalized_email
     )
  order by c.created_at
  limit 1
  for update;

  if not found then
    begin
      insert into public.customers (
        whatsapp_phone, phone, full_name, display_name, email
      ) values (
        normalized_phone, normalized_phone, btrim(p_name), btrim(p_name), normalized_email
      ) returning * into customer_row;
    exception when unique_violation then
      select * into customer_row
      from public.customers as c
      where (normalized_phone is not null and c.whatsapp_phone = normalized_phone)
         or (
           normalized_phone is null and normalized_email is not null
           and lower(coalesce(c.email, '')) = normalized_email
         )
      limit 1
      for update;
    end;
  end if;

  insert into public.inspections (
    slot_id, property_id, customer_id, status, agent_id,
    public_reference, receipt_hash, idempotency_key,
    reservation_expires_at, customer_message
  ) values (
    slot_row.id, slot_row.property_id, customer_row.id, 'PENDING_CONFIRMATION', slot_row.agent_id,
    'I-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_receipt_hash, p_idempotency_key, now() + interval '15 minutes',
    nullif(btrim(p_message), '')
  ) returning * into inspection_row;

  insert into public.notifications (
    inspection_id, channel, recipient, template_key, idempotency_key, status
  ) values (
    inspection_row.id, 'dashboard', 'team:inspections', 'inspection.pending',
    'inspection:' || inspection_row.id::text, 'queued'
  ) on conflict (idempotency_key) do nothing;

  return query select inspection_row.id, inspection_row.status,
    inspection_row.public_reference, inspection_row.reservation_expires_at;
end;
$$;

create or replace function public.get_inspection_receipt(p_receipt_hash text)
returns table (
  public_reference text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.public_reference, i.status,
    case when i.status = 'CONFIRMED' then s.starts_at else null end,
    case when i.status = 'CONFIRMED' then s.ends_at else null end
  from public.inspections as i
  join public.inspection_slots as s on s.id = i.slot_id
  where i.receipt_hash = p_receipt_hash
  limit 1
$$;

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
    if (
      actor_role is distinct from 'Customer Care'
      and not public.can_access_property(new.property_id)
    ) or actor_role is null or actor_role not in (
      'Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care'
    ) then
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
    if new.gate_details is distinct from old.gate_details
       and not (
         (new.status = 'CONFIRMED' and new.gate_details is not null)
         or (
           new.gate_details is null
           and old.gate_details is not null
           and new.status in ('PENDING_CONFIRMATION', 'REJECTED', 'CANCELLED')
         )
       ) then
      raise exception 'Gate details may only be attached after confirmation'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_inspection_transition_guard on public.inspections;
create trigger nestly_inspection_transition_guard
before update on public.inspections
for each row execute function public.guard_inspection_transition();

create table if not exists public.inspection_transition_requests (
  idempotency_key text primary key,
  inspection_id uuid not null references public.inspections(id),
  requested_status text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.inspection_transition_requests enable row level security;

create or replace function public.expire_pending_inspection_bookings()
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.expire_pending_inspections(null)
$$;

create or replace function public.transition_inspection_booking(
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
  current_inspection public.inspections%rowtype;
  replacement_slot public.inspection_slots%rowtype;
  target_status text;
  cached_result jsonb;
  result_row public.inspections%rowtype;
  active_reservations integer;
  actor_role text := public.caller_role();
begin
  if auth.uid() is null
     or actor_role is null
     or actor_role not in (
       'Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care'
     )
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Not authorized or invalid transition request'
      using errcode = '42501';
  end if;

  select r.result into cached_result
  from public.inspection_transition_requests r
  where r.idempotency_key = p_idempotency_key
    and r.inspection_id = p_booking_id;
  if found then
    return query select
      (cached_result ->> 'id')::uuid,
      cached_result ->> 'status',
      (cached_result ->> 'slot_id')::uuid,
      cached_result ->> 'outcome',
      cached_result ->> 'gate_details',
      (cached_result ->> 'confirmed_at')::timestamptz,
      (cached_result ->> 'updated_at')::timestamptz;
    return;
  end if;

  select * into current_inspection
  from public.inspections i
  where i.id = p_booking_id
  for update;
  if not found then
    raise exception 'Inspection request not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'Customer Care'
     and not public.can_access_property(current_inspection.property_id) then
    raise exception 'Inspection is outside the caller zone' using errcode = '42501';
  end if;

  if p_status = 'approved' then
    target_status := 'CONFIRMED';
  elsif p_status = 'rejected' then
    target_status := 'REJECTED';
  elsif p_status = 'cancelled' then
    target_status := 'CANCELLED';
  elsif p_status = 'completed' then
    target_status := 'COMPLETED';
  elsif p_status = 'no_show' then
    target_status := 'NO_SHOW';
  elsif p_status = 'rescheduled' then
    target_status := 'PENDING_CONFIRMATION';
  else
    raise exception 'Invalid inspection transition' using errcode = '22023';
  end if;
  if (target_status in ('COMPLETED', 'NO_SHOW')) <> (p_outcome is not null) then
    raise exception 'An outcome is required only for completed or no-show inspections'
      using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in (
    'attended', 'landlord_unavailable', 'customer_no_show',
    'property_unavailable', 'other'
  ) then
    raise exception 'Invalid inspection outcome' using errcode = '22023';
  end if;

  if p_status = 'rescheduled' then
    if p_new_slot_id is null
       or current_inspection.status not in ('PENDING_CONFIRMATION', 'CONFIRMED') then
      raise exception 'A pending or confirmed inspection and replacement slot are required'
        using errcode = '22023';
    end if;
    select * into replacement_slot
    from public.inspection_slots s
    where s.id = p_new_slot_id
      and s.property_id = current_inspection.property_id
      and s.is_active
      and s.starts_at > now()
    for update;
    if not found then
      raise exception 'Replacement slot is unavailable' using errcode = '22023';
    end if;
    perform public.expire_pending_inspections(replacement_slot.id);
    select count(*)::integer into active_reservations
    from public.inspections i
    where i.slot_id = replacement_slot.id
      and i.id <> current_inspection.id
      and (
        i.status = 'CONFIRMED'
        or (
          i.status = 'PENDING_CONFIRMATION'
          and i.reservation_expires_at > now()
        )
      );
    if active_reservations >= replacement_slot.capacity then
      raise exception 'Replacement slot is full' using errcode = '23P01';
    end if;
  elsif p_new_slot_id is not null then
    raise exception 'A replacement slot is valid only for rescheduling'
      using errcode = '22023';
  end if;

  update public.inspections i
  set slot_id = case when p_status = 'rescheduled' then replacement_slot.id else i.slot_id end,
      agent_id = case when p_status = 'rescheduled' then replacement_slot.agent_id else i.agent_id end,
      status = target_status,
      outcome = case when p_status = 'rescheduled' then null else p_outcome end,
      reservation_expires_at = case
        when p_status = 'rescheduled' then now() + interval '15 minutes'
        else null
      end,
      gate_details = case
        when p_status = 'approved'
          then 'G-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
        when p_status in ('rescheduled', 'rejected', 'cancelled') then null
        else i.gate_details
      end,
      confirmed_at = case when target_status = 'CONFIRMED' then now() else null end,
      updated_at = now()
  where i.id = p_booking_id
  returning * into result_row;

  insert into public.inspection_transition_requests (
    idempotency_key, inspection_id, requested_status, result
  ) values (
    p_idempotency_key,
    p_booking_id,
    p_status,
    jsonb_build_object(
      'id', result_row.id,
      'status', result_row.status,
      'slot_id', result_row.slot_id,
      'outcome', result_row.outcome,
      'gate_details', result_row.gate_details,
      'confirmed_at', result_row.confirmed_at,
      'updated_at', result_row.updated_at
    )
  );

  if p_status in ('rescheduled', 'approved') then
    insert into public.notifications (
      inspection_id, channel, recipient, template_key, idempotency_key, status
    ) values (
      result_row.id,
      'dashboard',
      case when p_status = 'approved' then 'customer:' || result_row.customer_id::text else 'team:inspections' end,
      case when p_status = 'approved' then 'inspection.confirmed' else 'inspection.rescheduled' end,
      'inspection-transition:' || result_row.id::text || ':' || p_idempotency_key,
      'queued'
    ) on conflict (idempotency_key) do nothing;
  end if;

  return query select result_row.id, result_row.status, result_row.slot_id,
    result_row.outcome, result_row.gate_details, result_row.confirmed_at, result_row.updated_at;
exception
  when unique_violation then
    if exists (
      select 1 from public.inspection_transition_requests r
      where r.idempotency_key = p_idempotency_key
        and r.inspection_id <> p_booking_id
    ) then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    raise exception 'The inspection slot is full' using errcode = '23P01';
end;
$$;

alter table public.conversations
  add column if not exists channel text not null default 'whatsapp';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_channel_check'
  ) then
    alter table public.conversations add constraint conversations_channel_check
      check (channel in ('website', 'whatsapp'));
  end if;
end;
$$;

alter table public.messages
  add column if not exists idempotency_key text,
  add column if not exists reply_suppressed_at timestamptz;
create unique index if not exists messages_idempotency_key_key
  on public.messages (idempotency_key) where idempotency_key is not null;

create table if not exists public.website_conversation_tokens (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  token_hash text not null unique,
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.website_conversation_tokens enable row level security;

create table if not exists public.website_conversation_contacts (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
alter table public.website_conversation_contacts enable row level security;

create table if not exists public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  idempotency_key text not null unique,
  state text not null default 'queued'
    check (state in ('queued', 'claimed', 'sent', 'failed', 'suppressed')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_outbox_ready_idx
  on public.message_outbox (state, available_at, created_at);
alter table public.message_outbox enable row level security;
create policy nestly_outbox_staff_read on public.message_outbox
for select to authenticated
using (public.caller_role() in ('Platform Admin', 'Operations Lead', 'Customer Care'));

create or replace function public.suppress_ai_outbox_after_takeover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode in ('HUMAN_ACTIVE', 'CLOSED') then
    update public.message_outbox as o
    set state = 'suppressed', updated_at = now()
    where o.conversation_id = new.id and o.state in ('queued', 'claimed');
    update public.messages as m
    set reply_suppressed_at = now()
    from public.message_outbox as o
    where o.message_id = m.id
      and o.conversation_id = new.id
      and o.state = 'suppressed'
      and m.reply_suppressed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_suppress_outbox_on_takeover on public.conversations;
create trigger nestly_suppress_outbox_on_takeover
after update of mode on public.conversations
for each row
when (old.mode is distinct from new.mode)
execute function public.suppress_ai_outbox_after_takeover();

create or replace function public.claim_ai_outbox_message()
returns setof public.message_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.message_outbox%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the configured message dispatcher may claim outbox work'
      using errcode = '42501';
  end if;
  select o.* into candidate
  from public.message_outbox as o
  join public.conversations as c on c.id = o.conversation_id
  where o.state = 'queued'
    and o.available_at <= now()
    and o.attempts < 5
    and c.mode = 'AI_ACTIVE'
    and c.assigned_staff_id is null
  order by o.created_at
  for update of o skip locked
  limit 1;
  if not found then
    return;
  end if;
  update public.message_outbox
  set state = 'claimed', claimed_at = now(), updated_at = now()
  where id = candidate.id
  returning * into candidate;
  return next candidate;
end;
$$;

create or replace function public.guard_conversation_channel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.channel is distinct from old.channel
     and auth.uid() is not null
     and auth.role() <> 'service_role' then
    raise exception 'Conversation channel identity is system-managed'
      using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.role() <> 'service_role' then
    if (
      new.mode is distinct from old.mode
      or new.assigned_staff_id is distinct from old.assigned_staff_id
    ) and not public.can_manage_conversation(old.id) then
      raise exception 'Not authorized to change conversation ownership or mode'
        using errcode = '42501';
    end if;
    if new.assigned_staff_id is not null
       and new.assigned_staff_id <> auth.uid()
       and public.caller_role() not in ('Platform Admin', 'Operations Lead') then
      raise exception 'Only a Platform Admin or Operations Lead may assign another agent'
        using errcode = '42501';
    end if;
    if new.assigned_staff_id is not null
       and public.caller_role() = 'Operations Lead'
       and not exists (
         select 1
         from public.profiles as actor
         join public.profiles as target on target.id = new.assigned_staff_id
         where actor.id = auth.uid()
           and target.role <> 'Platform Admin'
           and target.assigned_zone = actor.assigned_zone
       ) then
      raise exception 'Operations Leads may only assign staff in their exact zone'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_conversation_channel_guard on public.conversations;
create trigger nestly_conversation_channel_guard
before update on public.conversations
for each row execute function public.guard_conversation_channel();

create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role text := public.caller_role();
  actor_zone text;
begin
  if actor_role in ('Platform Admin', 'Customer Care') then
    return exists (select 1 from public.customers c where c.id = p_customer_id);
  end if;
  if actor_role not in (
    'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'
  ) then
    return false;
  end if;
  select p.assigned_zone into actor_zone
  from public.profiles p where p.id = (select auth.uid());
  return exists (
    select 1 from public.conversations c
    where c.customer_id = p_customer_id
      and c.current_property_id is not null
      and public.can_access_property(c.current_property_id)
  ) or exists (
    select 1 from public.offers o
    where o.customer_id = p_customer_id
      and public.can_access_property(o.property_id)
  ) or exists (
    select 1 from public.inspections i
    where i.customer_id = p_customer_id
      and public.can_access_property(i.property_id)
  ) or exists (
    select 1 from public.contact_enquiries e
    where e.customer_id = p_customer_id
      and e.property_id is not null
      and public.can_access_property(e.property_id)
  ) or exists (
    select 1 from public.landlord_submissions l
    where l.customer_id = p_customer_id
      and public.zone_matches_property(
        actor_zone, l.state, l.city, l.neighborhood, null
      )
  );
end;
$$;

drop policy if exists staff_only_customers on public.customers;
create policy nestly_customers_staff_read on public.customers
for select to authenticated
using (public.can_access_customer(id));

drop policy if exists staff_only_offers on public.offers;
create policy nestly_offers_staff_read on public.offers
for select to authenticated
using (
  public.caller_role() = 'Customer Care'
  or (
    public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance')
    and public.can_access_property(property_id)
  )
);
create policy nestly_offers_staff_decide on public.offers
for update to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance')
  and public.can_access_property(property_id)
)
with check (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance')
  and public.can_access_property(property_id)
);

drop policy if exists staff_only_inspection_slots on public.inspection_slots;
create policy nestly_inspection_slots_staff_read on public.inspection_slots
for select to authenticated
using (public.can_access_property(property_id));
create policy nestly_inspection_slots_staff_insert on public.inspection_slots
for insert to authenticated
with check (public.can_edit_property(property_id));
create policy nestly_inspection_slots_staff_update on public.inspection_slots
for update to authenticated
using (public.can_edit_property(property_id))
with check (public.can_edit_property(property_id));
create policy nestly_inspection_slots_staff_delete on public.inspection_slots
for delete to authenticated
using (public.can_edit_property(property_id));

drop policy if exists staff_only_inspections on public.inspections;
create policy nestly_inspections_staff_read on public.inspections
for select to authenticated
using (
  public.caller_role() = 'Customer Care'
  or (
    public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
    and public.can_access_property(property_id)
  )
);
create policy nestly_inspections_staff_update on public.inspections
for update to authenticated
using (
  public.caller_role() = 'Customer Care'
  or (
    public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
    and public.can_access_property(property_id)
  )
)
with check (
  public.caller_role() = 'Customer Care'
  or (
    public.caller_role() in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent')
    and public.can_access_property(property_id)
  )
);

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
          public.caller_role() in ('Operations Lead', 'Field Vetting Agent')
          and c.current_property_id is not null
          and public.can_access_property(c.current_property_id)
        )
        or (
          c.assigned_staff_id = (select auth.uid())
          and
          c.current_property_id is not null
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
            or c.assigned_staff_id = (select auth.uid())
          )
        )
      )
  )
$$;

create or replace function public.return_to_ai(p_conversation_id uuid)
returns public.conversations
language plpgsql
set search_path = ''
as $$
declare
  conversation public.conversations;
begin
  if auth.uid() is null
     or not public.can_manage_conversation(p_conversation_id) then
    raise exception 'Not authorized to return this conversation to Nia'
      using errcode = '42501';
  end if;
  select * into conversation
  from public.conversations
  where id = p_conversation_id
  for update;
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

create or replace function public.create_website_conversation(
  p_name text,
  p_email text,
  p_phone text,
  p_initial_message text,
  p_token_hash text,
  p_idempotency_key text
)
returns table (conversation_id uuid, message_id uuid, channel text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_token public.website_conversation_tokens%rowtype;
  customer_id uuid;
  new_conversation public.conversations%rowtype;
  new_message public.messages%rowtype;
  existing_message_id uuid;
begin
  if p_name is null or p_initial_message is null
     or length(btrim(p_name)) not between 1 and 120
     or length(btrim(p_initial_message)) not between 1 and 4000
     or (nullif(btrim(p_email), '') is null and nullif(btrim(p_phone), '') is null)
     or length(coalesce(p_token_hash, '')) not between 32 and 128
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid website conversation details' using errcode = '22023';
  end if;
  select * into existing_token
  from public.website_conversation_tokens t
  where t.idempotency_key = p_idempotency_key;
  if found then
    if existing_token.token_hash is distinct from p_token_hash then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    select m.id into existing_message_id
    from public.messages m
    where m.conversation_id = existing_token.conversation_id
      and m.idempotency_key = p_idempotency_key
    limit 1;
    return query select existing_token.conversation_id, existing_message_id, 'website'::text;
    return;
  end if;

  insert into public.customers (full_name, display_name)
  values (btrim(p_name), btrim(p_name))
  returning id into customer_id;
  insert into public.conversations (customer_id, mode, channel)
  values (customer_id, 'AI_ACTIVE', 'website')
  returning * into new_conversation;
  insert into public.website_conversation_contacts (conversation_id, email, phone)
  values (
    new_conversation.id,
    nullif(lower(btrim(p_email)), ''),
    nullif(btrim(p_phone), '')
  );
  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    new_conversation.id, 'inbound', 'customer', btrim(p_initial_message),
    'text', 'received', p_idempotency_key
  ) returning * into new_message;
  insert into public.website_conversation_tokens (
    conversation_id, token_hash, idempotency_key, expires_at
  ) values (
    new_conversation.id, p_token_hash, p_idempotency_key, now() + interval '30 days'
  );
  return query select new_conversation.id, new_message.id, 'website'::text;
end;
$$;

create or replace function public.submit_website_message(
  p_token_hash text,
  p_content text,
  p_idempotency_key text
)
returns table (message_id uuid, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.website_conversation_tokens%rowtype;
  existing_message public.messages%rowtype;
  new_message public.messages%rowtype;
begin
  if p_content is null
     or length(btrim(p_content)) not between 1 and 4000
     or length(coalesce(p_token_hash, '')) not between 32 and 128
     or length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid website message' using errcode = '22023';
  end if;
  select * into token_row
  from public.website_conversation_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  for update;
  if not found then
    raise exception 'Conversation token is invalid or expired'
      using errcode = '42501';
  end if;
  select * into existing_message
  from public.messages m
  where m.idempotency_key = p_idempotency_key;
  if found then
    if existing_message.conversation_id <> token_row.conversation_id
       or existing_message.sender_type <> 'customer' then
      raise exception 'Idempotency key was reused' using errcode = '23505';
    end if;
    return query select existing_message.id, existing_message.delivery_status;
    return;
  end if;
  insert into public.messages (
    conversation_id, direction, sender_type, content, message_type,
    delivery_status, idempotency_key
  ) values (
    token_row.conversation_id, 'inbound', 'customer', btrim(p_content),
    'text', 'received', p_idempotency_key
  ) returning * into new_message;
  return query select new_message.id, new_message.delivery_status;
end;
$$;

create or replace function public.get_website_conversation(p_token_hash text)
returns table (
  conversation_id uuid,
  mode text,
  message_id uuid,
  sender_type text,
  content text,
  delivery_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.mode, m.id, m.sender_type, m.content, m.delivery_status, m.created_at
  from public.website_conversation_tokens t
  join public.conversations c on c.id = t.conversation_id
  left join public.messages m on m.conversation_id = c.id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  order by m.created_at
$$;

create or replace function public.guard_message_authorship()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  conversation_mode text;
begin
  if new.sender_type = 'customer' then
    if new.direction <> 'inbound' then
      raise exception 'Customer-authored messages must be inbound'
        using errcode = '22023';
    end if;
  elsif new.sender_type = 'nia' then
    if new.direction <> 'outbound' then
      raise exception 'Nia messages must be outbound'
        using errcode = '22023';
    end if;
    select c.mode into conversation_mode
    from public.conversations c where c.id = new.conversation_id;
    if conversation_mode <> 'AI_ACTIVE' then
      raise exception 'Nia cannot reply while a human owns the conversation'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_message_authorship_guard on public.messages;
create trigger nestly_message_authorship_guard
before insert on public.messages
for each row execute function public.guard_message_authorship();

drop policy if exists staff_only_conversations on public.conversations;
create policy nestly_conversations_staff_read on public.conversations
for select to authenticated
using (public.can_access_conversation(id));
create policy nestly_conversations_staff_update on public.conversations
for update to authenticated
using (public.can_manage_conversation(id))
with check (public.can_manage_conversation(id));

drop policy if exists staff_only_messages on public.messages;
create policy nestly_messages_staff_read on public.messages
for select to authenticated
using (public.can_access_conversation(conversation_id));
create policy nestly_messages_staff_insert on public.messages
for insert to authenticated
with check (
  sender_type = 'agent'
  and direction = 'outbound'
  and public.can_manage_conversation(conversation_id)
);

drop policy if exists staff_only_notifications on public.notifications;
create policy nestly_notifications_staff_read on public.notifications
for select to authenticated
using (public.caller_role() in ('Platform Admin', 'Operations Lead', 'Customer Care'));

create policy nestly_website_token_no_direct_access on public.website_conversation_tokens
for all to authenticated using (false) with check (false);
create policy nestly_website_contact_no_direct_access on public.website_conversation_contacts
for all to authenticated using (false) with check (false);

create or replace function public.record_nestly_audit(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.caller_role();
begin
  insert into public.audit_logs (actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case
      when auth.role() = 'service_role' or auth.uid() is null then 'system'
      when actor_role = 'Platform Admin' then 'admin'
      when p_action like 'nia.%' then 'nia'
      else 'agent'
    end,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.audit_property_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_state is distinct from new.publication_state
     or old.rental_availability is distinct from new.rental_availability
     or old.verification_state is distinct from new.verification_state then
    perform public.record_nestly_audit(
      'property', new.id, 'property.lifecycle_changed',
      jsonb_build_object(
        'old_publication', old.publication_state,
        'new_publication', new.publication_state,
        'old_availability', old.rental_availability,
        'new_availability', new.rental_availability,
        'old_verification', old.verification_state,
        'new_verification', new.verification_state
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_offer_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    perform public.record_nestly_audit(
      'offer', new.id, 'offer.decision',
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_inspection_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    perform public.record_nestly_audit(
      'inspection', new.id, 'inspection.status_changed',
      jsonb_build_object('from', old.status, 'to', new.status, 'outcome', new.outcome)
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_conversation_handoff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.mode is distinct from new.mode then
    perform public.record_nestly_audit(
      'conversation', new.id, 'conversation.mode_changed',
      jsonb_build_object('from', old.mode, 'to', new.mode, 'assigned_staff_id', new.assigned_staff_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists nestly_audit_property_lifecycle on public.properties;
create trigger nestly_audit_property_lifecycle
after update on public.properties
for each row execute function public.audit_property_lifecycle();
drop trigger if exists nestly_audit_offer_decision on public.offers;
create trigger nestly_audit_offer_decision
after update on public.offers
for each row execute function public.audit_offer_decision();
drop trigger if exists nestly_audit_inspection_transition on public.inspections;
create trigger nestly_audit_inspection_transition
after update on public.inspections
for each row execute function public.audit_inspection_transition();
drop trigger if exists nestly_audit_conversation_handoff on public.conversations;
create trigger nestly_audit_conversation_handoff
after update on public.conversations
for each row execute function public.audit_conversation_handoff();

alter table public.profiles enable row level security;
alter table public.contact_enquiries enable row level security;
alter table public.landlord_submissions enable row level security;
alter table public.verification_events enable row level security;
alter table public.inspection_transition_requests enable row level security;
alter table public.website_conversation_tokens enable row level security;
alter table public.website_conversation_contacts enable row level security;
alter table public.message_outbox enable row level security;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
revoke all on public.verification_events from anon, authenticated;
grant select on public.verification_events to authenticated;

revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
revoke all on public.offers from anon, authenticated;
grant select on public.offers to authenticated;
grant update (status, counter_amount_ngn, agent_notes) on public.offers to authenticated;
revoke all on public.inspections from anon, authenticated;
grant select on public.inspections to authenticated;
revoke all on public.inspection_slots from anon;
grant select, insert, update, delete on public.inspection_slots to authenticated;
revoke all on public.conversations from anon, authenticated;
grant select, update on public.conversations to authenticated;
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
revoke all on public.property_media from anon, authenticated;
grant select on public.property_media to anon, authenticated;
grant insert, update, delete on public.property_media to authenticated;
revoke all on public.verification_events from anon, authenticated;
grant select on public.verification_events to authenticated;

revoke all on public.contact_enquiries from anon, authenticated;
revoke all on public.landlord_submissions from anon, authenticated;
revoke all on public.staff_notes from anon, authenticated;
grant select on public.contact_enquiries to authenticated;
grant update (status, updated_at) on public.contact_enquiries to authenticated;
grant select on public.landlord_submissions to authenticated;
grant update (status, updated_at) on public.landlord_submissions to authenticated;
grant select, insert on public.staff_notes to authenticated;
grant update (deleted_at) on public.staff_notes to authenticated;
grant select on public.property_fees to anon, authenticated;
grant insert, update, delete on public.property_fees to authenticated;
grant select on public.neighborhoods to anon, authenticated;
grant insert, update, delete on public.neighborhoods to authenticated;
grant select on public.workspace_settings to authenticated;
grant select on public.message_outbox to authenticated;
grant select on public.public_inspection_slots to anon, authenticated;
grant select on public.public_properties to anon, authenticated;
revoke all on public.website_conversation_tokens from anon, authenticated;
revoke all on public.website_conversation_contacts from anon, authenticated;
revoke all on public.inspection_transition_requests from anon, authenticated;
revoke all on public.message_outbox from anon, authenticated;
grant select on public.message_outbox to authenticated;
grant update (
  transit_buffer_mins, daylight_lock, daylight_start, daylight_end,
  retention_days, ai_provider, ai_model, ai_monthly_budget, updated_by
) on public.workspace_settings to authenticated;

revoke all on function public.caller_role() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_publicly_discoverable_property(uuid) from public;
revoke all on function public.can_access_property(uuid) from public;
revoke all on function public.can_edit_property(uuid) from public, anon;
revoke all on function public.can_create_property(text, text, text, text) from public, anon;
revoke all on function public.can_read_staff_profile(uuid) from public, anon;
revoke all on function public.can_access_customer(uuid) from public, anon;
revoke all on function public.can_access_conversation(uuid) from public, anon;
revoke all on function public.can_manage_conversation(uuid) from public, anon;
revoke all on function public.is_media_editor() from public;
revoke all on function public.zone_matches_property(text, text, text, text, text) from public;
revoke all on function public.property_id_from_storage_path(text) from public;
revoke all on function public.can_access_staff_note(text, uuid) from public, anon;
revoke all on function public.find_or_create_customer(text, text, text) from public, anon, authenticated;
revoke all on function public.expire_pending_inspections(uuid) from public, anon, authenticated;
revoke all on function public.expire_pending_inspection_bookings() from public, anon, authenticated;
revoke all on function public.submit_offer(uuid, numeric, text, text, text, text, text, text, text) from public;
revoke all on function public.get_offer_receipt(text) from public;
revoke all on function public.submit_contact_enquiry(uuid, text, text, text, text, text, text) from public;
revoke all on function public.submit_landlord_submission(text, text, text, text, text, text, text, text, smallint, numeric, text, text, text) from public;
revoke all on function public.get_contact_enquiry_receipt(text) from public;
revoke all on function public.get_landlord_submission_receipt(text) from public;
revoke all on function public.submit_inspection_request(uuid, text, text, text, text, text, text) from public;
revoke all on function public.get_inspection_receipt(text) from public;
revoke all on function public.transition_inspection_booking(uuid, text, uuid, text, text) from public;
revoke all on function public.create_website_conversation(text, text, text, text, text, text) from public;
revoke all on function public.submit_website_message(text, text, text) from public;
revoke all on function public.get_website_conversation(text) from public;
revoke all on function public.return_to_ai(uuid) from public, anon;
revoke all on function public.claim_ai_outbox_message() from public, anon, authenticated;
revoke all on function public.record_nestly_audit(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_ai_outbox_message() from public, anon, authenticated;
grant execute on function public.caller_role() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_publicly_discoverable_property(uuid) to anon, authenticated;
grant execute on function public.can_access_property(uuid) to anon, authenticated;
grant execute on function public.can_edit_property(uuid) to authenticated;
grant execute on function public.can_edit_property(uuid) to anon;
grant execute on function public.can_create_property(text, text, text, text) to authenticated;
grant execute on function public.can_read_staff_profile(uuid) to authenticated;
grant execute on function public.can_access_customer(uuid) to authenticated;
grant execute on function public.can_access_conversation(uuid) to authenticated;
grant execute on function public.can_manage_conversation(uuid) to authenticated;
grant execute on function public.is_media_editor() to anon, authenticated;
grant execute on function public.zone_matches_property(text, text, text, text, text) to authenticated;
grant execute on function public.property_id_from_storage_path(text) to authenticated;
grant execute on function public.can_access_staff_note(text, uuid) to authenticated;
grant execute on function public.submit_offer(uuid, numeric, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_offer_receipt(text) to anon, authenticated;
grant execute on function public.submit_contact_enquiry(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_landlord_submission(text, text, text, text, text, text, text, text, smallint, numeric, text, text, text) to anon, authenticated;
grant execute on function public.get_contact_enquiry_receipt(text) to anon, authenticated;
grant execute on function public.get_landlord_submission_receipt(text) to anon, authenticated;
grant execute on function public.submit_inspection_request(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_inspection_receipt(text) to anon, authenticated;
grant execute on function public.transition_inspection_booking(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.expire_pending_inspection_bookings() to service_role;
grant execute on function public.create_website_conversation(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_website_message(text, text, text) to anon, authenticated;
grant execute on function public.get_website_conversation(text) to anon, authenticated;
grant execute on function public.return_to_ai(uuid) to authenticated;
grant execute on function public.claim_ai_outbox_message() to service_role;
