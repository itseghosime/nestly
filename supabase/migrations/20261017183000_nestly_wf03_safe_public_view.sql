-- Create the public search boundary before WF03 is switched away from properties.
-- Keep this projection identical in name, order, and type to the later canonical view.
create view public.public_properties
with (security_barrier = true)
as
select
  p.id,
  trim(both '-' from regexp_replace(lower(p.reference), '[^a-z0-9]+', '-', 'g'))
    || '-' || left(p.id::text, 8) as slug,
  p.reference,
  p.title,
  ''::text as tagline,
  p.description,
  p.property_type,
  p.price_ngn,
  p.price_period,
  case when p.price_period = 'yearly' then p.price_ngn else null end::numeric(15, 2)
    as rent_annual,
  'NGN'::text as currency,
  null::text as state,
  null::text as city,
  p.location,
  p.neighborhood,
  null::text as address_short,
  p.bedrooms,
  p.bathrooms,
  null::integer as toilets,
  null::text as power_rating,
  null::text as water_supply,
  null::text as security_rating,
  case when p.verified_at is null then 'unverified' else 'verified' end::text
    as verification_state,
  case
    when p.status = 'available' and p.verified_at is not null then 'published'
    when p.status = 'available' then 'review'
    when p.status = 'archived' then 'archived'
    else 'draft'
  end::text as publication_state,
  case p.status
    when 'available' then 'available'
    when 'unavailable' then 'unavailable'
    when 'rented' then 'rented'
    else 'unknown'
  end::text as rental_availability,
  ''::text as featured_image,
  p.features,
  '{}'::text[] as nearby_landmarks,
  p.created_at,
  p.updated_at
from public.properties as p
where p.status = 'available'
  and p.verified_at is not null;

grant select on public.public_properties to anon, authenticated, service_role;
