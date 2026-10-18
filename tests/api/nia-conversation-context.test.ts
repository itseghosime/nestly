import { describe, expect, it } from 'vitest';
import {
  classifyNiaMessageIntent,
  getNiaReferenceIndex,
  isNiaFeeQuestion,
  isNiaHandoffRequest,
  normalizeNiaContext,
  resolveNiaPreferences,
} from '@/lib/backend/nia-conversation-context';
import { parseNiaPropertySearch } from '@/lib/backend/nia-property-search';

describe('Nia website conversation context', () => {
  it('remembers references to the first three recent results', () => {
    expect(getNiaReferenceIndex('What about the second one?')).toBe(1);
    expect(getNiaReferenceIndex('check option 3')).toBe(2);
    expect(getNiaReferenceIndex('show the first listing')).toBe(0);
    expect(getNiaReferenceIndex('show another one')).toBeNull();
  });

  it('carries active preferences through an explicit preference change', () => {
    const previous = {
      location: 'GRA',
      bedrooms: 2,
      maxAnnualRent: 4_000_000,
      keywords: ['solar'],
    };
    expect(resolveNiaPreferences('Actually, in Ugbor', previous)).toEqual({
      location: 'Ugbor',
      bedrooms: 2,
      maxAnnualRent: 4_000_000,
      keywords: ['solar'],
    });
  });

  it('updates requested preferences while retaining unchanged context', () => {
    const previous = {
      location: 'GRA',
      bedrooms: 2,
      maxAnnualRent: 4_000_000,
      propertyType: 'house' as const,
      keywords: ['solar'],
    };
    expect(resolveNiaPreferences(
      'Actually, I need a three-bedroom apartment in Ugbor',
      previous,
    )).toEqual({
      location: 'Ugbor',
      bedrooms: 3,
      maxAnnualRent: 4_000_000,
      propertyType: 'apartment',
      keywords: ['solar'],
    });
  });

  it('retains parsed preferences through conversation-context normalization', () => {
    const preferences = parseNiaPropertySearch(
      'Hi Nia, I’m looking for a two-bedroom apartment in Benin City.',
    );
    const restored = normalizeNiaContext(JSON.parse(JSON.stringify({
      preferences,
      recentPropertyIds: ['property-1'],
      selectedPropertyId: 'property-1',
    })));

    expect(restored).toEqual({
      preferences,
      recentPropertyIds: ['property-1'],
      selectedPropertyId: 'property-1',
    });
  });

  it('starts a fresh preference set for a new search', () => {
    const previous = { location: 'GRA', bedrooms: 2, keywords: [] };
    expect(resolveNiaPreferences('3-bedroom apartments in Sapele', previous)).toMatchObject({
      location: 'Sapele',
      bedrooms: 3,
      propertyType: 'apartment',
    });
  });

  it('recognizes grounded fee requests and real staff handoff requests', () => {
    expect(isNiaFeeQuestion('What are the confirmed fees for the second one?')).toBe(true);
    expect(isNiaHandoffRequest('Please connect me to a person')).toBe(true);
    expect(isNiaHandoffRequest('Show me homes in GRA')).toBe(false);
  });

  it.each([
    ['recalls saved property preferences', 'What were my property preferences?', 'preference_recall'],
    ['clarifies ordinary conversation rather than searching', 'The weather was lovely today.', 'unsupported'],
    ['recognizes an explicit location change', 'Try GRA instead.', 'search'],
    ['recognizes a requested amenity search', 'Add solar to the search.', 'search'],
    ['resets only on an explicit reset request', 'Clear my preferences.', 'reset_preferences'],
  ] as const)('classifies intent when the user %s', (_description, query, intent) => {
    expect(classifyNiaMessageIntent(query)).toBe(intent);
  });

  it('normalizes malformed stored context without trusting invalid fields', () => {
    expect(normalizeNiaContext({
      preferences: { location: { raw: 'injection' }, bedrooms: 100, keywords: [1, 'solar'] },
      recentPropertyIds: ['valid-id', 12],
      selectedPropertyId: { invalid: true },
    })).toEqual({
      preferences: { keywords: ['solar'] },
      recentPropertyIds: ['valid-id'],
      selectedPropertyId: null,
    });
  });
});
