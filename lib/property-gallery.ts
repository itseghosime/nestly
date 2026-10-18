import type { Property } from '@/lib/types';

export function getPropertyGalleryPhotos(
  property: Pick<Property, 'featuredImage' | 'galleryImages'>,
  initialImageSrc?: string,
): string[] {
  const list = Array.from(new Set(
    [property.featuredImage, ...(property.galleryImages || [])].filter(Boolean),
  ));
  // A transition preview may choose a fallback already present on this listing.
  // Never inject an unrelated/stale preview URL into the current listing.
  const cover = initialImageSrc && list.includes(initialImageSrc)
    ? initialImageSrc
    : property.featuredImage;
  return cover ? [cover, ...list.filter((url) => url !== cover)] : list;
}
