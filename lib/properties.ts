import type { Property } from './types';
import { PROPERTIES as FIXTURES } from './fixtures/properties';

const ALLOW_FIXTURE_FALLBACK = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export type FetchPropertiesParams = {
  location?: string;
  beds?: string;
  maxPrice?: number;
  type?: string;
  keyword?: string;
  sort?: string;
};

type ApiPropertyRow = {
  id: string;
  code?: string;
  reference?: string;
  slug?: string;
  title?: string;
  tagline?: string;
  propertyType?: Property['propertyType'];
  property_type?: Property['propertyType'];
  priceAnnual?: number | string;
  rent_annual?: number | string;
  price_annual?: number | string;
  priceFormatted?: string;
  price_formatted?: string;
  state?: Property['state'];
  city?: string;
  neighborhood?: string;
  addressShort?: string;
  address_short?: string;
  bedrooms?: number;
  bathrooms?: number;
  toilets?: number;
  powerRating?: string;
  power_rating?: string;
  waterSupply?: string;
  water_supply?: string;
  securityRating?: string;
  security_rating?: string;
  verificationBadge?: Property['verificationBadge'];
  verification_state?: string;
  inspectionStatus?: Property['inspectionStatus'];
  featuredImage?: string;
  featured_image?: string;
  galleryImages?: string[];
  gallery_images?: string[];
  media?: Array<{ url: string }>;
  description?: string;
  features?: string[];
  nearbyLandmarks?: string[];
  nearby_landmarks?: string[];
  landlordContact?: Property['landlordContact'];
  landlord_contact?: Property['landlordContact'];
  publication_state?: string;
  rental_availability?: string;
  status?: string;
};

function mapApiRow(row: ApiPropertyRow): Property {
  const listingStatus = row.publication_state === 'published'
    ? row.rental_availability === 'available'
      ? 'Available'
      : row.rental_availability === 'rented'
        ? 'Rented'
        : 'Unavailable'
    : row.publication_state === 'review'
      ? 'In Review'
      : 'Draft';
  return {
    id: row.id,
    code: row.code || row.reference || row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline,
    propertyType: row.propertyType || row.property_type || 'Apartment',
    priceAnnual: Number(row.priceAnnual ?? row.rent_annual ?? row.price_annual ?? 0),
    priceFormatted: row.priceFormatted || row.price_formatted || `₦${Number(row.priceAnnual ?? row.rent_annual ?? 0).toLocaleString('en-NG')}`,
    state: row.state || 'Edo',
    city: row.city || '',
    neighborhood: row.neighborhood || '',
    addressShort: row.addressShort || row.address_short || '',
    bedrooms: row.bedrooms ?? 0,
    bathrooms: row.bathrooms ?? 0,
    toilets: row.toilets ?? 0,
    powerRating: row.powerRating || row.power_rating || '',
    waterSupply: row.waterSupply || row.water_supply || '',
    securityRating: row.securityRating || row.security_rating || '',
    verificationBadge: row.verificationBadge || (row.verification_state === 'verified' ? 'Verified Physical Title' : row.verification_state === 'vetted' ? 'Vetted Landlord' : 'Direct Instruction'),
    inspectionStatus: row.inspectionStatus || 'Slots Available',
    featuredImage: row.featuredImage || row.featured_image || '',
    galleryImages: row.galleryImages || row.gallery_images || row.media?.map((media) => media.url) || [],
    description: row.description || '',
    features: row.features || [],
    nearbyLandmarks: row.nearbyLandmarks || row.nearby_landmarks || [],
    landlordContact: row.landlordContact || row.landlord_contact || undefined,
    status: listingStatus,
  } as Property;
}

export async function fetchProperties(params: FetchPropertiesParams = {}): Promise<Property[]> {
  const qs = new URLSearchParams();
  if (params.location && params.location !== 'all') qs.set('location', params.location);
  if (params.beds && params.beds !== 'all') qs.set('beds', params.beds);
  if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
  if (params.type && params.type !== 'all') qs.set('type', params.type);
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.sort) qs.set('sort', params.sort);
  const url = `/api/properties${qs.toString() ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    const rows: ApiPropertyRow[] = Array.isArray(body.data) ? body.data : [];
    return rows.map(mapApiRow);
  } catch (e) {
    if (ALLOW_FIXTURE_FALLBACK) return FIXTURES;
    throw e;
  }
}

export async function fetchPropertyById(id: string): Promise<Property | null> {
  try {
    const res = await fetch(`/api/properties/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    if (!body.data) return null;
    return mapApiRow(body.data as ApiPropertyRow);
  } catch (e) {
    if (ALLOW_FIXTURE_FALLBACK) return FIXTURES.find((p) => p.id === id) || null;
    throw e;
  }
}

export { FIXTURES as FIXTURE_PROPERTIES };
