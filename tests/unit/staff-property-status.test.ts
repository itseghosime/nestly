import { describe, expect, it } from 'vitest';
import { getEffectiveMaxAnnualRent, DEFAULT_PUBLIC_MAX_ANNUAL_RENT } from '@/lib/backend/property-list-query';
import { getDemoFixtures } from '@/lib/demo-mode';
import {
  getStaffPropertyStatusLabel,
  matchesStaffPropertyStatus,
} from '@/lib/staff-property-status';

describe('staff property status display and filters', () => {
  it('does not infer publication or rental availability from inspection status', () => {
    const property = { publicationState: undefined, rentalAvailability: 'available' as const };
    expect(getStaffPropertyStatusLabel(property)).toBe('Publication status not provided');
    expect(matchesStaffPropertyStatus(property, 'available')).toBe(false);
  });

  it('requires both publication and rental availability for available and rented filters', () => {
    expect(matchesStaffPropertyStatus({
      publicationState: 'published',
      rentalAvailability: 'available',
    }, 'available')).toBe(true);
    expect(matchesStaffPropertyStatus({
      publicationState: 'review',
      rentalAvailability: 'available',
    }, 'available')).toBe(false);
    expect(matchesStaffPropertyStatus({
      publicationState: 'published',
      rentalAvailability: 'rented',
    }, 'rented')).toBe(true);
  });

  it('shows unknown rental availability without treating it as available', () => {
    const property = { publicationState: 'published' as const, rentalAvailability: undefined };
    expect(getStaffPropertyStatusLabel(property)).toBe('Published · Availability not listed');
    expect(matchesStaffPropertyStatus(property, 'available')).toBe(false);
  });
});

describe('property list rent ceiling and demo fixtures', () => {
  it('retains the public default rent ceiling but does not cap staff records implicitly', () => {
    expect(getEffectiveMaxAnnualRent(null, false)).toBe(DEFAULT_PUBLIC_MAX_ANNUAL_RENT);
    expect(getEffectiveMaxAnnualRent(null, true)).toBeNull();
    expect(getEffectiveMaxAnnualRent(12_000_000, true)).toBe(12_000_000);
  });

  it('returns fictional fixtures only when explicit demo mode is enabled', () => {
    const fixtures = [{ id: 'sample' }];
    expect(getDemoFixtures(true, fixtures)).toEqual(fixtures);
    expect(getDemoFixtures(false, fixtures)).toEqual([]);
  });
});
