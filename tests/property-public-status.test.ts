import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProperties } from '@/lib/properties';

describe('public property status mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not invent verification or inspection availability when the API has no status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: 'property-1',
          title: 'Test listing',
          property_type: 'apartment',
          rent_annual: 1_200_000,
          state: 'Edo',
          city: 'Benin City',
          neighborhood: 'GRA',
        }],
      }),
    }));

    const [property] = await fetchProperties();

    expect(property.verificationBadge).toBe('Verification status not provided');
    expect(property.inspectionStatus).toBe('Availability not listed');
  });
});
