import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: routeMocks.createClient,
}));

import { GET as getProperty } from '@/app/api/properties/[id]/route';

const propertyId = '6d4e2947-dd3f-45f3-ad27-59b4a7120895';

const syntheticProperty = {
  id: propertyId,
  title: 'NESTLY-QA-INSPECTION-001',
  tagline: 'Synthetic test only — not a real property',
  description: '',
  property_type: 'apartment',
  rent_annual: null,
  price_formatted: null,
  currency: 'NGN',
  address_short: null,
  state: null,
  city: null,
  neighborhood: 'Synthetic QA',
  bedrooms: 0,
  bathrooms: 0,
  toilets: null,
  power_rating: null,
  water_supply: null,
  security_rating: null,
  verification_state: 'vetted',
  featured_image: '',
  features: null,
  nearby_landmarks: [],
  publication_state: 'published',
  rental_availability: 'available',
};

function queryFor(result: { data: unknown; error: null }) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return query;
}

function configurePropertyResponse(
  property: Record<string, unknown>,
  fees: unknown[] | null = [],
  media: unknown[] | null = [],
) {
  const queryResults: Record<string, { data: unknown; error: null }> = {
    public_properties: { data: property, error: null },
    property_fees: { data: fees, error: null },
    property_media: { data: media, error: null },
  };
  routeMocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn((table: string) => queryFor(queryResults[table] || { data: null, error: null })),
  });
}

describe('GET /api/properties/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns synthetic listings with null rent and no fee or media rows', async () => {
    configurePropertyResponse(syntheticProperty, null, null);

    const response = await getProperty(
      new Request(`https://nestly.example/api/properties/${propertyId}`),
      { params: Promise.resolve({ id: propertyId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        priceAnnual: 0,
        priceFormatted: '₦0',
        addressShort: null,
        featuredImage: '',
        galleryImages: [],
        fees: [],
        media: [],
        computedTotal: null,
        unconfirmedFeeCount: 1,
      },
    });
  });

  it('preserves fee uncertainty when required fees are unconfirmed', async () => {
    const fee = {
      fee_key: 'security_deposit',
      kind: 'fixed',
      amount: 250_000,
      base: 'rent',
      required: true,
      confirmed_at: null,
      sort_order: 1,
    };
    configurePropertyResponse(
      { ...syntheticProperty, rent_annual: 2_500_000 },
      [fee],
    );

    const response = await getProperty(
      new Request(`https://nestly.example/api/properties/${propertyId}`),
      { params: Promise.resolve({ id: propertyId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        priceAnnual: 2_500_000,
        priceFormatted: '₦2,500,000',
        fees: [fee],
        computedTotal: null,
        unconfirmedFeeCount: 1,
        galleryImages: [],
      },
    });
  });
});
