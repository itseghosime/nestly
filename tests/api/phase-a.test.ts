import { describe, expect, it } from 'vitest';
import { computeTotal, type FeeRow } from '@/lib/price';
import {
  canManageStaffRole,
  canPublishProperty,
  isPubliclyDiscoverableProperty,
  zoneMatchesProperty,
} from '@/lib/backend/authorization';

const confirmedAt = new Date().toISOString();
const fee = (overrides: Partial<FeeRow> = {}): FeeRow => ({
  fee_key: 'fee',
  kind: 'fixed',
  amount: 0,
  base: 'rent',
  required: true,
  confirmed_at: confirmedAt,
  sort_order: 0,
  ...overrides,
});

describe('fee totals', () => {
  it('applies fixed and rent-based fees in order', () => {
    const fees = [
      fee({ fee_key: 'caution', amount: 200000 }),
      fee({ fee_key: 'legal', kind: 'percent', amount: 10, sort_order: 1 }),
      fee({ fee_key: 'service', amount: 300000, sort_order: 2 }),
    ];
    expect(computeTotal(3500000, fees)).toBe(4350000);
  });

  it('returns no final quote when there are no fee records', () => {
    expect(computeTotal(3500000, [])).toBeNull();
  });

  it('returns no final quote when a required fee is unconfirmed', () => {
    expect(computeTotal(1000000, [fee({ confirmed_at: null })])).toBeNull();
  });

  it('keeps optional unconfirmed fees out of the total', () => {
    expect(computeTotal(1000000, [fee({ confirmed_at: null, required: false })])).toBe(1000000);
  });

  it('applies subtotal percentages to the running total and rounds to cents', () => {
    const fees = [
      fee({ amount: 100000 }),
      fee({ fee_key: 'tax', kind: 'percent', amount: 7.5, base: 'subtotal', sort_order: 1 }),
    ];
    expect(computeTotal(1000000, fees)).toBe(1182500);
    expect(computeTotal(0, [fee({ amount: 133.333 })])).toBe(133.33);
  });
});

describe('application authorization rules', () => {
  it('does not let Operations Leads create peer or Platform Admin accounts', () => {
    expect(canManageStaffRole('Operations Lead', 'Field Vetting Agent')).toBe(true);
    expect(canManageStaffRole('Operations Lead', 'Operations Lead')).toBe(false);
    expect(canManageStaffRole('Operations Lead', 'Platform Admin')).toBe(false);
  });

  it('allows only exact normalized state, city, or neighborhood zone matches', () => {
    const property = { state: 'Edo', city: 'Benin City', neighborhood: 'GRA Benin City' };
    expect(zoneMatchesProperty(' edo ', property)).toBe(true);
    expect(zoneMatchesProperty('GRA Benin & Boundary Road', property)).toBe(false);
    expect(zoneMatchesProperty(null, property)).toBe(false);
  });

  it('requires a vetted property and authorized staff before publication', () => {
    expect(canPublishProperty('Operations Lead', 'vetted')).toBe(true);
    expect(canPublishProperty('Field Vetting Agent', 'verified')).toBe(false);
    expect(canPublishProperty('Platform Admin', 'unverified')).toBe(false);
  });

  it('requires publication, rental availability, and verification independently', () => {
    expect(isPubliclyDiscoverableProperty({
      publication_state: 'published',
      rental_availability: 'available',
      verification_state: 'verified',
    })).toBe(true);
    expect(isPubliclyDiscoverableProperty({
      publication_state: 'draft',
      rental_availability: 'available',
      verification_state: 'verified',
    })).toBe(false);
    expect(isPubliclyDiscoverableProperty({
      publication_state: 'published',
      rental_availability: 'available',
      verification_state: 'unverified',
    })).toBe(false);
  });
});
