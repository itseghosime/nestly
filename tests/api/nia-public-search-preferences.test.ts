import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { answerNiaConversationMessage } from '@/lib/backend/nia-conversation-response';
import type { NiaPropertySearchCriteria } from '@/lib/backend/nia-property-search';

const publicProperty = {
  id: 'public-property-1',
  title: 'Synthetic published apartment',
  price_ngn: 5_000_000,
  price_period: 'yearly',
  currency: 'NGN',
  state: 'Edo',
  city: 'Benin City',
  location: 'GRA',
  neighborhood: 'GRA',
  rent_annual: 5_000_000,
};

const preferenceCases = [
  {
    name: 'exact filler-only location change has no previous amenities',
    query: 'Try GRA instead.',
    previous: {
      location: 'Ugbor',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: [],
    },
    expected: {
      location: 'GRA',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: [],
    },
  },
  {
    name: 'exact filler-only location change retains solar and parking',
    query: 'Try GRA instead.',
    previous: {
      location: 'Ugbor',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: ['solar', 'parking'],
    },
    expected: {
      location: 'GRA',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: ['solar', 'parking'],
    },
  },
  {
    name: 'cleans earlier parser filler while retaining solar and parking',
    query: 'Try GRA instead.',
    previous: {
      location: 'Ugbor',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: ['nia', 'looking', 'two', 'try', 'solar', 'parking'],
    },
    expected: {
      location: 'GRA',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: ['solar', 'parking'],
    },
  },
  {
    name: 'cleans earlier parser filler when there are no genuine amenities',
    query: 'Try GRA instead.',
    previous: {
      location: 'Ugbor',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: ['nia', 'looking', 'two', 'try'],
    },
    expected: {
      location: 'GRA',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: [],
    },
  },
  {
    name: 'updates location and bedrooms without existing amenity filters',
    query: 'Please try a 3-bedroom apartment in Sapele instead.',
    previous: {
      location: 'GRA',
      bedrooms: 2,
      maxAnnualRent: 4_000_000,
      propertyType: 'apartment',
      keywords: [],
    },
    expected: {
      location: 'Sapele',
      bedrooms: 3,
      maxAnnualRent: 4_000_000,
      propertyType: 'apartment',
      keywords: [],
    },
  },
  {
    name: 'updates location and bedrooms while retaining solar and parking',
    query: 'Please try a 3-bedroom apartment in Sapele instead.',
    previous: {
      location: 'GRA',
      bedrooms: 2,
      maxAnnualRent: 4_000_000,
      propertyType: 'apartment',
      keywords: ['solar', 'parking'],
    },
    expected: {
      location: 'Sapele',
      bedrooms: 3,
      maxAnnualRent: 4_000_000,
      propertyType: 'apartment',
      keywords: ['solar', 'parking'],
    },
  },
] satisfies Array<{
  name: string;
  query: string;
  previous: NiaPropertySearchCriteria;
  expected: NiaPropertySearchCriteria;
}>;

describe('Nia preference changes applied to the public-property search contract', () => {
  it.each(preferenceCases)('$name', async ({ query, previous, expected }) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify([publicProperty]),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': '0-0/1',
        },
      },
    ));
    const supabase = createClient(
      'https://synthetic-search.supabase.co',
      'synthetic-anon-key',
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: { fetch: fetchMock },
      },
    );

    const answer = await answerNiaConversationMessage(supabase, query, {
      preferences: previous,
      recentPropertyIds: [],
      selectedPropertyId: null,
    });

    expect(answer.context.preferences).toEqual(expected);
    expect(answer.properties).toHaveLength(1);
    expect(answer.searchResultCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();

    const requestInput = fetchMock.mock.calls[0][0];
    const requestUrl = requestInput instanceof Request
      ? requestInput.url
      : String(requestInput);
    const url = new URL(requestUrl);
    const filters = url.searchParams;
    const orFilters = filters.getAll('or');

    expect(url.pathname).toBe('/rest/v1/public_properties');
    expect(filters.get('publication_state')).toBe('eq.published');
    expect(filters.get('rental_availability')).toBe('eq.available');
    expect(filters.get('verification_state')).toBe('in.(vetted,verified)');
    expect(filters.get('bedrooms')).toBe(`eq.${expected.bedrooms}`);
    expect(filters.get('property_type')).toBe(`eq.${expected.propertyType}`);
    expect(filters.get('select')).toContain('bedrooms');
    expect(filters.get('select')).toContain('property_type');
    expect(filters.get('select')).not.toContain('staff_notes');
    expect(orFilters.some((filter) => filter.includes(`location.ilike.%${expected.location}%`))).toBe(true);

    const keywordFilters = orFilters.filter((filter) => filter.includes('title.ilike.'));
    expect(keywordFilters).toHaveLength(expected.keywords.length);
    for (const keyword of expected.keywords) {
      expect(keywordFilters.some((filter) => filter.includes(`description.ilike.%${keyword}%`))).toBe(true);
    }
    expect(orFilters.join('|')).not.toMatch(/%(try|nia|looking|two)%/);

    if (expected.maxAnnualRent) {
      expect(filters.getAll('rent_annual')).toEqual(['not.is.null', `lte.${expected.maxAnnualRent}`]);
    }
  });
});

describe('Nia preference recall and non-search messages', () => {
  const savedContext = {
    preferences: {
      bedrooms: 2,
      location: 'GRA',
      propertyType: 'apartment' as const,
      keywords: [],
    },
    recentPropertyIds: ['public-property-1'],
    selectedPropertyId: 'public-property-1',
  };

  function createNoQueryClient(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
    return createClient(
      'https://synthetic-search.supabase.co',
      'synthetic-anon-key',
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: { fetch: fetchMock },
      },
    );
  }

  it('answers preference recall from saved context without searching or changing it', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const supabase = createNoQueryClient(fetchMock);

    const answer = await answerNiaConversationMessage(
      supabase,
      'What were my property preferences?',
      savedContext,
    );

    expect(answer.message).toBe(
      'Your saved property preferences are 2 bedrooms, in GRA, apartment, no amenity or detail filters.',
    );
    expect(answer.properties).toEqual([]);
    expect(answer.context).toEqual(savedContext);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clarifies ordinary conversation without overwriting established criteria', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const supabase = createNoQueryClient(fetchMock);

    const answer = await answerNiaConversationMessage(
      supabase,
      'The weather was lovely today.',
      savedContext,
    );

    expect(answer.message).toContain('Your preferences are unchanged');
    expect(answer.properties).toEqual([]);
    expect(answer.context).toEqual(savedContext);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears preferences only after an explicit reset request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const supabase = createNoQueryClient(fetchMock);

    const answer = await answerNiaConversationMessage(
      supabase,
      'Clear my preferences.',
      savedContext,
    );

    expect(answer.message).toContain('I cleared your saved property preferences');
    expect(answer.context).toEqual({
      preferences: null,
      recentPropertyIds: [],
      selectedPropertyId: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
