-- 0003_neighborhoods_storage — Neighborhoods + Storage bucket property-media
-- Tables: neighborhoods. Storage: bucket property-media (public read, authenticated write, image/*, 5MB)
-- Called by: app/api/neighborhoods/**, app/api/properties/[id]/media (Storage upload)
create table if not exists public.neighborhoods (
  id text primary key,
  slug text unique not null,
  name text not null,
  state text not null check (state in ('Edo','Delta')),
  city text not null,
  hero_image text not null default '',
  tagline text not null default '',
  average_annual_rent_2bed text not null default '',
  average_annual_rent_3bed text not null default '',
  power_reliability text not null default '',
  security_rating text not null default '',
  road_network text not null default '',
  overview text not null default '',
  highlights text[] not null default '{}',
  recommended_for text[] not null default '{}',
  popular_streets text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.neighborhoods enable row level security;
drop policy if exists "neighborhoods_public_read" on public.neighborhoods;
create policy "neighborhoods_public_read" on public.neighborhoods for select using (active = true);
drop policy if exists "neighborhoods_staff_all" on public.neighborhoods;
create policy "neighborhoods_staff_all" on public.neighborhoods for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead'))
);
insert into storage.buckets (id, name, public) values ('property-media','property-media', true)
on conflict (id) do nothing;
drop policy if exists "property-media public read" on storage.objects;
create policy "property-media public read" on storage.objects for select using (bucket_id = 'property-media');
drop policy if exists "property-media staff write" on storage.objects;
create policy "property-media staff write" on storage.objects for insert with check (
  bucket_id = 'property-media' and auth.role() = 'authenticated'
  and (storage.extension(name) in ('jpg','jpeg','png','webp'))
);
drop policy if exists "property-media staff update" on storage.objects;
create policy "property-media staff update" on storage.objects for update using (
  bucket_id = 'property-media' and auth.role() = 'authenticated'
);
drop policy if exists "property-media staff delete" on storage.objects;
create policy "property-media staff delete" on storage.objects for delete using (
  bucket_id = 'property-media' and auth.role() = 'authenticated'
);
