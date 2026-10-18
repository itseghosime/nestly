import { describe, expect, it } from 'vitest';
import { getPropertyGalleryPhotos } from '@/lib/property-gallery';

describe('property gallery transition cover ordering', () => {
  it('keeps the featured card image first even when the gallery starts elsewhere', () => {
    expect(getPropertyGalleryPhotos({ featuredImage: 'cover', galleryImages: ['kitchen', 'bath'] }))
      .toEqual(['cover', 'kitchen', 'bath']);
  });
  it('keeps a clicked fallback photo first when it belongs to the validated listing', () => {
    expect(getPropertyGalleryPhotos({ featuredImage: 'cover', galleryImages: ['kitchen', 'bath'] }, 'kitchen'))
      .toEqual(['kitchen', 'cover', 'bath']);
  });
  it('ignores an unrelated preview from an earlier property', () => {
    expect(getPropertyGalleryPhotos({ featuredImage: 'cover', galleryImages: ['kitchen'] }, 'other-listing'))
      .toEqual(['cover', 'kitchen']);
  });
  it('deduplicates the cover and filters empty URLs', () => {
    expect(getPropertyGalleryPhotos({ featuredImage: 'cover', galleryImages: ['cover', '', 'kitchen', 'kitchen'] }))
      .toEqual(['cover', 'kitchen']);
  });
  it('supports a missing cover and an empty gallery', () => {
    expect(getPropertyGalleryPhotos({ featuredImage: '', galleryImages: ['room'] })).toEqual(['room']);
    expect(getPropertyGalleryPhotos({ featuredImage: '', galleryImages: [] })).toEqual([]);
  });
});
