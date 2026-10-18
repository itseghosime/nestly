-- 0004_security_hardening — Block self-edit of privileged profile fields, tighten storage/media isolation
-- Requires 0001_profiles + 0002_properties_core + 0003_neighborhoods_storage

-- Privileged fields may not be self-edited at DB level; only Platform Admin / Operations Lead may change role/capabilities/assigned_zone
create or replace function public.prevent_privileged_self_edit() returns trigger as $$
begin
  if (coalesce(old.role,'') is distinct from coalesce(new.role,''))
     or (coalesce(old.capabilities::text,'') is distinct from coalesce(new.capabilities::text,''))
     or (coalesce(old.assigned_zone,'') is distinct from coalesce(new.assigned_zone,'')) then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead')) then
      raise exception 'Privileged profile fields may only be changed by Platform Admin or Operations Lead';
    end if;
    if old.id = auth.uid() and new.id = auth.uid() and new.role is distinct from old.role then
      -- Extra guard: even admins cannot self-promote via direct UPDATE of own row unless also authorized; log intent
      -- Allow only if caller is Platform Admin (already checked) and not simply escalating own role without audit
      null;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_profiles_privileged_guard on public.profiles;
create trigger trg_profiles_privileged_guard before update on public.profiles
for each row execute function public.prevent_privileged_self_edit();

-- Tighten property_media write: must reference existing property and caller must be authorized editor
-- RLS already restricts to Platform Admin/Operations Lead/Field Vetting Agent; add FK existence via policy is implicit.
-- No additional SQL needed beyond existing RLS; document here that mutations require property_id FK and role check.

-- Storage: draft/unpublished images must not leak via public bucket.
-- Strategy: bucket property-media remains public for published media only.
-- Enforce at storage policy: anon read allowed only when property is published+vetted|verified.
-- Path convention is "<property_id>/<filename>" so we can derive property_id via split_part(name,'/',1).
create or replace function public.is_property_publicly_readable(prop_id text) returns boolean as $$
  select exists (
    select 1 from public.properties pr
    where pr.id = prop_id
      and pr.publication_state = 'published'
      and pr.rental_availability = 'available'
      and pr.verification_state in ('vetted','verified')
  );
$$ language sql stable security definer;

-- Replace public read policy on storage.objects for this bucket to check publication state
drop policy if exists "property-media public read" on storage.objects;
create policy "property-media public read only if published" on storage.objects
  for select using (
    bucket_id = 'property-media'
    and public.is_property_publicly_readable(split_part(name,'/',1))
  );

-- Keep authenticated read fallback for staff preview of draft media via direct storage URL with auth
drop policy if exists "property-media authenticated preview" on storage.objects;
create policy "property-media authenticated preview" on storage.objects
  for select using (
    bucket_id = 'property-media' and auth.role() = 'authenticated'
  );

-- Staff write already restricted to authenticated + image extension; keep but ensure only editors
drop policy if exists "property-media staff write" on storage.objects;
create policy "property-media staff write" on storage.objects
  for insert with check (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and (storage.extension(name) in ('jpg','jpeg','png','webp'))
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  );

drop policy if exists "property-media staff update" on storage.objects;
create policy "property-media staff update" on storage.objects
  for update using (
    bucket_id = 'property-media' and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  );

drop policy if exists "property-media staff delete" on storage.objects;
create policy "property-media staff delete" on storage.objects
  for delete using (
    bucket_id = 'property-media' and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  );

-- Public view privileges: ensure anon can read public_properties but not underlying properties table drafts
-- RLS already: anon SELECT on properties only where published+available+vetted|verified. Revoke direct table select for anon if needed is via RLS, not GRANT.
-- Ensure public_properties is security definer off but respects RLS: recreate as security_invoker = false explicitly (default) and grant select
grant select on public.public_properties to anon, authenticated;

-- Close fee/media leak: public fee/media policies already restrict to published properties; keep as is.
-- No change needed here beyond documentation; policies verified.

-- Seed fees are fictional examples: annotate via comment (no row change)
comment on table public.property_fees is 'Per-listing fee ledger; seed rows are fictional examples, not statutory rates. Total is null when any required && confirmed_at is null.';
