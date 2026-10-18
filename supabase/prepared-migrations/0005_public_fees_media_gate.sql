-- 0005_public_fees_media_gate — Ensure public fee/media endpoints cannot reveal draft/restricted records
-- Complements 0002/0004. Also harden public_properties to exclude private landlord_contact entirely at DB level.

-- Rewrite public_properties to never expose landlord_contact (already excluded, but enforce explicitly)
drop view if exists public.public_properties;
create view public.public_properties with (security_invoker = true) as
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

grant select on public.public_properties to anon, authenticated;

-- Ensure anon cannot SELECT properties rows that are not public (defense in depth beyond RLS)
-- RLS policies already enforce; this migration documents and keeps them.
-- No additional change.

-- Note: property_fees and property_media public policies already gate on published existence in 0002; keep.
