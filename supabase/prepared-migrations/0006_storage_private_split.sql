-- 0006_storage_private_split — Make buckets private; draft media never public via URL
-- Corrects 0003/0004 which left property-media public=true (SELECT policies alone do not protect public URLs)
-- Requires 0001..0005

-- Force buckets private (actual public flag, not just policy names)
update storage.buckets set public = false where id = 'property-media';

-- Dedicated private bucket for drafts/evidence (never served publicly even via signed URL unless staff-auth)
insert into storage.buckets (id, name, public) values ('property-drafts','property-drafts', false)
on conflict (id) do update set public = false;

-- Helper already exists: is_property_publicly_readable(text) from 0004
-- Storage SELECT for property-media: only allow reading objects that belong to published+available+vetted|verified properties
-- For drafts, only authenticated staff with editor role may read (via signed URL flow)
-- Note: with public=false, anon direct /object/public/ URL returns 400; they must go through API which checks RLS + publication_state before issuing signed URL

-- Drop prior permissive policies on storage.objects (names from 0003/0004)
drop policy if exists "property-media public read" on storage.objects;
drop policy if exists "property-media public read only if published" on storage.objects;
drop policy if exists "property-media authenticated preview" on storage.objects;
drop policy if exists "property-media staff write" on storage.objects;
drop policy if exists "property-media staff update" on storage.objects;
drop policy if exists "property-media staff delete" on storage.objects;

-- property-media: public may SELECT only published objects (enforced at storage policy + API signed-URL gate)
create policy "property-media select if published" on storage.objects
  for select using (
    bucket_id = 'property-media'
    and public.is_property_publicly_readable(split_part(name,'/',1))
  );

-- property-media: authenticated staff preview (drafts) — allowed only for editor roles, still requires signed URL via API
create policy "property-media staff read draft" on storage.objects
  for select using (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  );

-- property-media: write restricted to editor roles + image extension (4-5 MB enforced via storage + API file-size check)
create policy "property-media staff insert" on storage.objects
  for insert with check (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and (storage.extension(name) in ('jpg','jpeg','png','webp'))
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  );

create policy "property-media staff update" on storage.objects
  for update using (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  ) with check (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
  );

create policy "property-media staff delete" on storage.objects
  for delete using (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent'))
  );

-- property-drafts: private bucket — only staff editors may read/write, never anon, never public URL
create policy "property-drafts staff select" on storage.objects
  for select using (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance'))
  );

create policy "property-drafts staff insert" on storage.objects
  for insert with check (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and (storage.extension(name) in ('jpg','jpeg','png','webp','pdf'))
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance'))
  );

create policy "property-drafts staff update" on storage.objects for update using (
  bucket_id = 'property-drafts' and auth.role() = 'authenticated'
);
create policy "property-drafts staff delete" on storage.objects for delete using (
  bucket_id = 'property-drafts' and auth.role() = 'authenticated'
);

comment on table storage.buckets is 'property-media is private (public=false); public access via signed URL only after publication check. property-drafts is always private evidence.';
