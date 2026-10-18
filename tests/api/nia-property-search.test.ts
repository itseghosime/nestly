import { describe, expect, it } from 'vitest';
import {
  formatNiaListingPrice,
  hasNiaSearchCriteria,
  isNiaPropertySearchResponse,
  parseNiaPropertySearch,
  sanitizeNiaFilterPhrase,
} from '@/lib/backend/nia-property-search';

describe('Nia grounded property search parsing', () => {
  it('extracts structured filters and an annual rent ceiling', () => {
    expect(parseNiaPropertySearch('Find a 3-bedroom house in Benin City under ₦5m per year')).toEqual({
      location: 'Benin City',
      bedrooms: 3,
      maxAnnualRent: 5_000_000,
      propertyType: 'house',
      keywords: [],
    });
  });

  it('parses the reported natural-language two-bedroom request without filler keywords', () => {
    expect(parseNiaPropertySearch('Hi Nia, I’m looking for a two-bedroom apartment in Benin City.')).toEqual({
      location: 'Benin City',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: [],
    });
  });

  it.each([
    ['Find a 2-bedroom apartment in Benin City', 2],
    ['Find a 3 bedroom apartment in Benin City', 3],
    ['Find a four-bedroom apartment in Benin City', 4],
  ])('parses bedroom count from %s', (query, bedrooms) => {
    expect(parseNiaPropertySearch(query)).toMatchObject({ bedrooms });
  });

  it('keeps feature terms while recognizing location', () => {
    expect(parseNiaPropertySearch('Homes with solar in Sapele')).toMatchObject({
      location: 'Sapele',
      keywords: ['solar'],
    });
  });

  it('removes request filler without dropping meaningful amenity keywords', () => {
    expect(parseNiaPropertySearch(
      'Hi Nia, I’m looking for a two-bedroom apartment in Benin City with solar and parking',
    )).toMatchObject({
      location: 'Benin City',
      bedrooms: 2,
      propertyType: 'apartment',
      keywords: ['solar', 'parking'],
    });
  });

  it('does not infer an annual budget from a period-free amount', () => {
    const criteria = parseNiaPropertySearch('Apartments under 2m');
    expect(criteria.propertyType).toBe('apartment');
    expect(criteria.maxAnnualRent).toBeUndefined();
  });

  it('asks for criteria when a message contains no supported search terms', () => {
    const criteria = parseNiaPropertySearch('hello please help me');
    expect(hasNiaSearchCriteria(criteria)).toBe(false);
  });

  it('removes filter syntax characters before constructing a database filter', () => {
    expect(sanitizeNiaFilterPhrase('Benin),city.eq.anything%')).toBe('Benin city eq anything');
  });

  it('does not label unspecified price periods as annual', () => {
    expect(formatNiaListingPrice(2_000_000, 'NGN', 'unspecified')).toContain('period unconfirmed');
    expect(formatNiaListingPrice(2_000_000, 'NGN', 'yearly')).toContain('/year');
    expect(formatNiaListingPrice(2_000_000, 'XXX', 'yearly')).toContain('currency unconfirmed');
  });

  it('accepts consistent matches, no-match, and clarification response shapes', () => {
    expect(isNiaPropertySearchResponse({
      status: 'matches',
      count: 1,
      matches: [{ id: 'property-1', title: 'Home', location: 'Benin City', priceLabel: '₦2m/year' }],
      message: 'Found one listing',
    })).toBe(true);
    expect(isNiaPropertySearchResponse({
      status: 'no_match',
      count: 0,
      matches: [],
      message: 'No current listing matched',
    })).toBe(true);
    expect(isNiaPropertySearchResponse({
      status: 'clarification',
      message: 'Please add a location',
    })).toBe(true);
  });

  it('rejects inconsistent match counts and empty successful matches', () => {
    expect(isNiaPropertySearchResponse({
      status: 'matches',
      count: 0,
      matches: [{ id: 'property-1', title: 'Home', location: 'Benin City', priceLabel: '₦2m/year' }],
      message: 'Found one listing',
    })).toBe(false);
    expect(isNiaPropertySearchResponse({
      status: 'matches',
      count: 1,
      matches: [],
      message: 'Found one listing',
    })).toBe(false);
  });
});
