-- 0002_properties_core — Properties with four orthogonal states, precise money, and public view
-- Tables: properties, property_fees, property_media, verification_events
-- Called by: app/api/properties/**, app/api/properties/[id]/media, public_properties view
-- Reads/Writes: properties.rent_annual numeric(12,2)+currency, publication/rental/verification states; property_fees kind/base/required/confirmed_at
-- User verbatim: "Compatible migrations, RLS, storage policies, and fictional seed data."
create extension if not exists "pgcrypto";
create table if not exists public.properties (
  id text primary key,
  slug text unique not null,
  title text not null,
  tagline text not null,
  property_type text not null check (property_type in ('Apartment','Self-Contained','Terrace Duplex','Detached House','Penthouse')),
  rent_annual numeric(12,2) not null check (rent_annual >= 0),
  currency char(3) not null default 'NGN' check (currency in ('NGN','USD','GBP')),
  state text not null check (state in ('Edo','Delta')),
  city text not null,
  neighborhood text not null,
  address_short text not null,
  bedrooms smallint not null check (bedrooms >= 0),
  bathrooms smallint not null check (bathrooms >= 0),
  toilets smallint not null check (toilets >= 0),
  power_rating text not null default '',
  water_supply text not null default '',
  security_rating text not null default '',
  verification_state text not null default 'unverified' check (verification_state in ('unverified','vetted','verified')),
  publication_state text not null default 'draft' check (publication_state in ('draft','review','published','archived')),
  rental_availability text not null default 'available' check (rental_availability in ('available','reserved','rented','unavailable')),
  featured_image text not null default '',
  description text not null default '',
  features text[] not null default '{}',
  nearby_landmarks text[] not null default '{}',
  landlord_contact jsonb not null default '{}'::jsonb,
  fixture_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create table if not exists public.property_fees (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete cascade,
  fee_key text not null,
  kind text not null check (kind in ('fixed','percent')),
  amount numeric(12,2) not null check (amount >= 0),
  base text not null default 'rent' check (base in ('rent','subtotal')),
  required boolean not null default true,
  sort_order smallint not null default 0,
  confirmed_at timestamptz,
  unique(property_id, fee_key)
);
create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete cascade,
  url text not null,
  caption text,
  sort_order smallint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.properties(id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_id uuid references auth.users(id),
  evidence_ref text,
  created_at timestamptz not null default now()
);
create or replace function public.format_price(amount numeric, cur char(3)) returns text as $$
  select case cur when 'NGN' then '₦' when 'USD' then '$' else '£' end || to_char(amount, 'FM999,999,999,990.00');
$$ language sql immutable;
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists trg_properties_updated_at on public.properties;
create trigger trg_properties_updated_at before update on public.properties
for each row execute function public.touch_updated_at();
create or replace view public.public_properties as
select
  id, slug, title, tagline, property_type, rent_annual, currency,
  format_price(rent_annual, currency) as price_formatted,
  state, city, neighborhood, address_short,
  bedrooms, bathrooms, toilets,
  power_rating, water_supply, security_rating,
  verification_state, publication_state, rental_availability,
  featured_image, description, features, nearby_landmarks,
  created_at, updated_at
from public.properties
where publication_state = 'published'
  and rental_availability = 'available'
  and verification_state in ('vetted','verified');
alter table public.properties enable row level security;
alter table public.property_fees enable row level security;
alter table public.property_media enable row level security;
alter table public.verification_events enable row level security;
drop policy if exists "properties_anon_public" on public.properties;
create policy "properties_anon_public" on public.properties for select using (
  publication_state = 'published' and rental_availability = 'available' and verification_state in ('vetted','verified')
);
drop policy if exists "properties_staff_read" on public.properties;
create policy "properties_staff_read" on public.properties for select using (auth.role() = 'authenticated');
drop policy if exists "properties_staff_write" on public.properties;
create policy "properties_staff_write" on public.properties for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
);
drop policy if exists "fees_public_read" on public.property_fees;
create policy "fees_public_read" on public.property_fees for select using (
  exists (select 1 from public.properties pr where pr.id = property_id and pr.publication_state='published' and pr.rental_availability='available' and pr.verification_state in ('vetted','verified'))
);
drop policy if exists "fees_staff_all" on public.property_fees;
create policy "fees_staff_all" on public.property_fees for all using (exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "media_public_read" on public.property_media;
create policy "media_public_read" on public.property_media for select using (
  deleted_at is null and exists (select 1 from public.properties pr where pr.id = property_id and pr.publication_state='published' and pr.rental_availability='available' and pr.verification_state in ('vetted','verified'))
);
drop policy if exists "media_staff_read" on public.property_media;
create policy "media_staff_read" on public.property_media for select using (exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "media_staff_write" on public.property_media;
create policy "media_staff_write" on public.property_media for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
);
