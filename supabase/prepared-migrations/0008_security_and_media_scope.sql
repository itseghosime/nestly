-- Hardens application-role authorization, exact zone scope, publication transitions, and media references.
-- This migration is prepared locally only; inspect remote history before applying it.

alter table public.property_media
  add column if not exists bucket_id text,
  add column if not exists object_path text,
  add column if not exists media_kind text not null default 'listing'
    check (media_kind in ('listing', 'evidence'));

update public.property_media
set bucket_id = split_part(url, '/', 1),
    object_path = substr(url, length(split_part(url, '/', 1)) + 2)
where bucket_id is null
  and (url like 'property-media/%' or url like 'property-drafts/%');

alter table public.property_media
  add constraint property_media_storage_scope_check
  check (
    (bucket_id is null and media_kind = 'listing')
    or (bucket_id = 'property-media' and media_kind = 'listing')
    or bucket_id = 'property-drafts'
  ) not valid;

update storage.buckets
set public = false
where id in ('property-media', 'property-drafts');

create or replace function public.caller_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
$$;

create or replace function public.caller_zone()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p.assigned_zone
  from public.profiles as p
  where p.id = auth.uid()
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.caller_role() = 'Platform Admin'
$$;

create or replace function public.is_lead_or_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.caller_role() in ('Platform Admin', 'Operations Lead')
$$;

create or replace function public.zone_matches_property(
  zone text,
  property_state text,
  property_city text,
  property_neighborhood text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select zone is not null
    and lower(btrim(zone)) in (
      lower(btrim(coalesce(property_state, ''))),
      lower(btrim(coalesce(property_city, ''))),
      lower(btrim(coalesce(property_neighborhood, '')))
    )
$$;

create or replace function public.can_access_property(prop_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.properties as pr
    join public.profiles as p on p.id = auth.uid()
    where pr.id = prop_id
      and (
        p.role = 'Platform Admin'
        or (
          p.role in ('Operations Lead', 'Field Vetting Agent', 'Legal & Compliance')
          and public.zone_matches_property(p.assigned_zone, pr.state, pr.city, pr.neighborhood)
        )
      )
  )
$$;

create or replace function public.is_public_property_media(bucket_name text, object_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.property_media as media
    where media.bucket_id = $1
      and media.object_path = $2
      and media.media_kind = 'listing'
      and media.deleted_at is null
      and public.is_property_publicly_readable(media.property_id)
  )
$$;

create or replace function public.is_staff_property_media(object_path text, bucket_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.property_media as media
    where media.bucket_id = $2
      and media.object_path = $1
      and media.deleted_at is null
      and public.can_access_property(media.property_id)
  )
$$;

create or replace function public.can_edit_property_values(
  property_state text,
  property_city text,
  property_neighborhood text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and (
        p.role = 'Platform Admin'
        or (
          p.role in ('Operations Lead', 'Field Vetting Agent')
          and public.zone_matches_property(p.assigned_zone, property_state, property_city, property_neighborhood)
        )
      )
  )
$$;

create or replace function public.can_manage_profile(target_id uuid, target_zone text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_platform_admin()
    or (
      public.caller_role() = 'Operations Lead'
      and target_id <> auth.uid()
      and target_zone is not distinct from public.caller_zone()
    )
$$;

create or replace function public.is_property_publicly_readable(prop_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.properties as pr
    where pr.id = prop_id
      and pr.publication_state = 'published'
      and pr.rental_availability = 'available'
      and pr.verification_state in ('vetted', 'verified')
  )
$$;

create or replace function public.prevent_privileged_self_edit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_role text := public.caller_role();
  actor_zone text := public.caller_zone();
  allowed_caps text[] := case new.role
    when 'Operations Lead' then array[
      'team:invite:zone', 'properties:read:zone', 'properties:write:zone',
      'properties:publish:zone', 'fees:write:zone', 'offers:decide:zone',
      'inspections:manage:zone', 'leads:read:zone', 'inbox:manage:zone',
      'audit:read:zone'
    ]
    when 'Field Vetting Agent' then array[
      'properties:read:zone', 'properties:write:zone', 'verification:write:zone',
      'media:write:zone', 'inspections:manage:zone'
    ]
    when 'Legal & Compliance' then array[
      'properties:read:zone', 'verification:write:zone', 'fees:write:zone'
    ]
    when 'Customer Care' then array[
      'leads:read:zone', 'offers:read:zone', 'conversations:read:zone',
      'conversations:reply:zone', 'inspections:read:zone'
    ]
    else array[]::text[]
  end;
  privileged_changed boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null or actor_role is null then
    raise exception 'An authenticated application profile is required';
  end if;

  if tg_op = 'INSERT' then
    if actor_role = 'Platform Admin' then
      return new;
    end if;
    if actor_role = 'Operations Lead'
       and new.role in ('Field Vetting Agent', 'Legal & Compliance', 'Customer Care')
       and new.assigned_zone is not distinct from actor_zone
       and new.capabilities <@ allowed_caps then
      return new;
    end if;
    raise exception 'Not authorized to create this staff profile';
  end if;

  privileged_changed :=
    old.role is distinct from new.role
    or old.capabilities is distinct from new.capabilities
    or old.assigned_zone is distinct from new.assigned_zone;

  if old.id = auth.uid() and privileged_changed then
    raise exception 'Staff members cannot change their own role, capabilities, or zone';
  end if;

  if not privileged_changed then
    return new;
  end if;

  if actor_role = 'Platform Admin' then
    return new;
  end if;

  if actor_role = 'Operations Lead'
     and old.id <> auth.uid()
     and old.assigned_zone is not distinct from actor_zone
     and new.assigned_zone is not distinct from actor_zone
     and new.role in ('Field Vetting Agent', 'Legal & Compliance', 'Customer Care')
     and new.capabilities <@ allowed_caps then
    return new;
  end if;

  raise exception 'Not authorized to change privileged staff fields';
end;
$$;

drop policy if exists "profiles_staff_read" on public.profiles;
drop policy if exists "profiles_admin_read_v2" on public.profiles;
create policy "profiles_admin_read_v3" on public.profiles
  for select using (
    public.is_platform_admin()
    or (
      public.caller_role() = 'Operations Lead'
      and assigned_zone is not distinct from public.caller_zone()
    )
  );

drop policy if exists "profiles_insert_hierarchy" on public.profiles;
create policy "profiles_insert_hierarchy_v3" on public.profiles
  for insert with check (
    public.is_platform_admin()
    or (
      public.caller_role() = 'Operations Lead'
      and role in ('Field Vetting Agent', 'Legal & Compliance', 'Customer Care')
      and assigned_zone is not distinct from public.caller_zone()
      and capabilities <@ case role
        when 'Field Vetting Agent' then array[
          'properties:read:zone', 'properties:write:zone', 'verification:write:zone',
          'media:write:zone', 'inspections:manage:zone'
        ]
        when 'Legal & Compliance' then array[
          'properties:read:zone', 'verification:write:zone', 'fees:write:zone'
        ]
        when 'Customer Care' then array[
          'leads:read:zone', 'offers:read:zone', 'conversations:read:zone',
          'conversations:reply:zone', 'inspections:read:zone'
        ]
        else array[]::text[]
      end
    )
  );

drop policy if exists "profiles_manage_v3" on public.profiles;
create policy "profiles_manage_v3" on public.profiles
  for update using (public.can_manage_profile(id, assigned_zone))
  with check (public.can_manage_profile(id, assigned_zone));

drop policy if exists "properties_staff_read" on public.properties;
create policy "properties_staff_read_v2" on public.properties
  for select using (public.can_access_property(id));

drop policy if exists "properties_staff_write" on public.properties;
create policy "properties_staff_write_v2" on public.properties
  for all using (public.can_access_property(id) and public.can_edit_property_values(state, city, neighborhood))
  with check (public.can_edit_property_values(state, city, neighborhood));

drop policy if exists "fees_staff_all" on public.property_fees;
drop policy if exists "fees_staff_write_v2" on public.property_fees;
create policy "fees_staff_write_v2" on public.property_fees
  for all using (
    exists (
      select 1 from public.properties as pr
      where pr.id = property_id
        and public.can_access_property(pr.id)
        and public.can_edit_property_values(pr.state, pr.city, pr.neighborhood)
    )
  )
  with check (
    exists (
      select 1 from public.properties as pr
      where pr.id = property_id
        and public.can_access_property(pr.id)
        and public.can_edit_property_values(pr.state, pr.city, pr.neighborhood)
    )
  );

drop policy if exists "media_staff_read" on public.property_media;
drop policy if exists "media_staff_write" on public.property_media;
drop policy if exists "media_public_read" on public.property_media;
create policy "media_public_read_v2" on public.property_media
  for select using (
    deleted_at is null
    and (
      (bucket_id in ('property-media', 'property-drafts') and media_kind = 'listing')
      or (bucket_id is null and url like '/images/%')
    )
    and exists (
      select 1 from public.properties as pr
      where pr.id = property_id
        and public.is_property_publicly_readable(pr.id)
    )
  );
create policy "media_staff_read_v2" on public.property_media
  for select using (deleted_at is null and public.can_access_property(property_id));
create policy "media_staff_write_v2" on public.property_media
  for all using (
    public.can_access_property(property_id)
    and public.can_edit_property_values(
      (select pr.state from public.properties as pr where pr.id = property_id),
      (select pr.city from public.properties as pr where pr.id = property_id),
      (select pr.neighborhood from public.properties as pr where pr.id = property_id)
    )
  )
  with check (
    public.can_access_property(property_id)
    and public.can_edit_property_values(
      (select pr.state from public.properties as pr where pr.id = property_id),
      (select pr.city from public.properties as pr where pr.id = property_id),
      (select pr.neighborhood from public.properties as pr where pr.id = property_id)
    )
  );

drop policy if exists "property-media staff read draft" on storage.objects;
drop policy if exists "property-media staff insert" on storage.objects;
drop policy if exists "property-media staff update" on storage.objects;
drop policy if exists "property-media staff delete" on storage.objects;
drop policy if exists "property-media select if published" on storage.objects;
create policy "property-media public listing objects only" on storage.objects
  for select using (
    bucket_id = 'property-media'
    and public.is_public_property_media(bucket_id, name)
  );
create policy "property-media staff read scoped" on storage.objects
  for select using (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and public.is_staff_property_media(name, 'property-media')
  );
create policy "property-media staff insert scoped" on storage.objects
  for insert with check (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
    and public.can_access_property(split_part(name, '/', 1))
    and public.can_edit_property_values(
      (select pr.state from public.properties as pr where pr.id = split_part(name, '/', 1)),
      (select pr.city from public.properties as pr where pr.id = split_part(name, '/', 1)),
      (select pr.neighborhood from public.properties as pr where pr.id = split_part(name, '/', 1))
    )
  );
create policy "property-media staff update scoped" on storage.objects
  for update using (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and public.can_access_property(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and public.can_access_property(split_part(name, '/', 1))
  );
create policy "property-media staff delete scoped" on storage.objects
  for delete using (
    bucket_id = 'property-media'
    and auth.role() = 'authenticated'
    and public.can_access_property(split_part(name, '/', 1))
  );

drop policy if exists "property-drafts staff select" on storage.objects;
drop policy if exists "property-drafts staff insert" on storage.objects;
drop policy if exists "property-drafts staff update" on storage.objects;
drop policy if exists "property-drafts staff delete" on storage.objects;
create policy "property-drafts staff select scoped" on storage.objects
  for select using (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and public.is_staff_property_media(name, 'property-drafts')
  );
create policy "property-drafts staff insert scoped" on storage.objects
  for insert with check (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'pdf')
    and public.can_access_property(split_part(name, '/', 1))
    and public.can_edit_property_values(
      (select pr.state from public.properties as pr where pr.id = split_part(name, '/', 1)),
      (select pr.city from public.properties as pr where pr.id = split_part(name, '/', 1)),
      (select pr.neighborhood from public.properties as pr where pr.id = split_part(name, '/', 1))
    )
  );
create policy "property-drafts staff update scoped" on storage.objects
  for update using (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and public.can_access_property(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and public.can_access_property(split_part(name, '/', 1))
  );
create policy "property-drafts staff delete scoped" on storage.objects
  for delete using (
    bucket_id = 'property-drafts'
    and auth.role() = 'authenticated'
    and public.can_access_property(split_part(name, '/', 1))
  );

create or replace function public.enforce_property_publication_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_role text := public.caller_role();
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if auth.uid() is null or actor_role is null then
    raise exception 'An authenticated application profile is required';
  end if;
  if tg_op = 'INSERT' then
    if new.publication_state <> 'draft' or new.verification_state <> 'unverified' then
      raise exception 'New properties must start as draft and unverified';
    end if;
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and new.verification_state is distinct from old.verification_state
     and actor_role not in ('Platform Admin', 'Operations Lead', 'Field Vetting Agent') then
    raise exception 'Not authorized to change property verification';
  end if;
  if tg_op = 'UPDATE' and new.publication_state is distinct from old.publication_state then
    if new.publication_state = 'published'
       and actor_role not in ('Platform Admin', 'Operations Lead') then
      raise exception 'Only Platform Admin or Operations Lead may publish';
    end if;
    if new.publication_state = 'published'
       and new.verification_state not in ('vetted', 'verified') then
      raise exception 'Property must be vetted before publication';
    end if;
  end if;
  if actor_role <> 'Platform Admin'
     and not public.can_edit_property_values(new.state, new.city, new.neighborhood) then
    raise exception 'Property is outside the caller''s assigned zone';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_property_publication_authority on public.properties;
create trigger trg_property_publication_authority
before insert or update on public.properties
for each row execute function public.enforce_property_publication_authority();

create or replace function public.record_verification_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.verification_state is distinct from old.verification_state then
    insert into public.verification_events (property_id, from_state, to_state, actor_id)
    values (new.id, old.verification_state, new.verification_state, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_property_verification_event on public.properties;
create trigger trg_property_verification_event
after update on public.properties
for each row execute function public.record_verification_event();

revoke all on function public.caller_role() from public, anon;
revoke all on function public.caller_zone() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_lead_or_admin() from public, anon;
revoke all on function public.can_access_property(text) from public, anon;
revoke all on function public.can_edit_property_values(text, text, text) from public, anon;
revoke all on function public.can_manage_profile(uuid, text) from public, anon;
revoke all on function public.is_public_property_media(text, text) from public, authenticated;
revoke all on function public.is_staff_property_media(text, text) from public, anon;
revoke all on function public.prevent_privileged_self_edit() from public, anon, authenticated;
revoke all on function public.enforce_property_publication_authority() from public, anon, authenticated;
revoke all on function public.record_verification_event() from public, anon, authenticated;
revoke all on function public.is_property_publicly_readable(text) from public, authenticated;
revoke all on function public.zone_matches_property(text, text, text, text) from public, anon, authenticated;

grant execute on function public.caller_role() to authenticated;
grant execute on function public.caller_zone() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_lead_or_admin() to authenticated;
grant execute on function public.can_access_property(text) to authenticated;
grant execute on function public.can_edit_property_values(text, text, text) to authenticated;
grant execute on function public.can_manage_profile(uuid, text) to authenticated;
grant execute on function public.is_public_property_media(text, text) to anon, authenticated;
grant execute on function public.is_staff_property_media(text, text) to authenticated;
grant execute on function public.is_property_publicly_readable(text) to anon, authenticated;
grant execute on function public.zone_matches_property(text, text, text, text) to authenticated;

comment on function public.caller_role() is 'Application role is always resolved from public.profiles for auth.uid(); JWT role claims are database roles and are not trusted as staff roles.';
comment on function public.can_access_property(text) is 'Exact normalized match only: assigned_zone must equal property state, city, or neighborhood. No substring or implicit cross-zone access.';
comment on column public.property_media.bucket_id is 'Storage bucket for this specific media object; required to sign private storage URLs.';
comment on column public.property_media.object_path is 'Exact Storage object path; signing endpoints must also verify the media row and property.';
