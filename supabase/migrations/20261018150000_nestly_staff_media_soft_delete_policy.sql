drop policy if exists nestly_staff_property_media on public.property_media;
create policy nestly_staff_property_media on public.property_media
for select to authenticated
using (
  public.can_access_property(property_id)
  and (
    media_kind = 'listing'
    or (media_kind = 'evidence' and public.is_media_editor())
  )
);
