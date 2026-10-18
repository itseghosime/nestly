import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeTotal, formatMoveInTotal, type FeeRow } from '@/lib/price';
import { fetchPropertyById, IS_DEMO_MODE } from '@/lib/properties';
import { fetchNeighborhoodBySlug } from '@/lib/neighborhoods';

describe('Public Release Hardening: Fee Ledger Contract', () => {
  it('returns null when fee array is empty', () => {
    expect(computeTotal(2000000, [])).toBeNull();
    expect(formatMoveInTotal(2000000, [])).toBeNull();
  });

  it('returns null when any required fee is unconfirmed', () => {
    const fees: FeeRow[] = [
      {
        fee_key: 'caution_deposit',
        kind: 'fixed',
        amount: 200000,
        base: 'rent',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 1,
      },
      {
        fee_key: 'legal_fee',
        kind: 'percent',
        amount: 10,
        base: 'rent',
        required: true,
        confirmed_at: null, // unconfirmed!
        sort_order: 2,
      },
    ];
    expect(computeTotal(2000000, fees)).toBeNull();
    expect(formatMoveInTotal(2000000, fees)).toBeNull();
  });

  it('computes total accurately when all required fees are confirmed', () => {
    const fees: FeeRow[] = [
      {
        fee_key: 'caution_deposit',
        kind: 'fixed',
        amount: 200000,
        base: 'rent',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 1,
      },
      {
        fee_key: 'legal_fee',
        kind: 'percent',
        amount: 10,
        base: 'rent',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 2,
      },
      {
        fee_key: 'service_charge',
        kind: 'fixed',
        amount: 300000,
        base: 'rent',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 3,
      },
    ];
    // rent: 2,000,000 + caution: 200,000 + legal (10% of rent): 200,000 + service: 300,000 = 2,700,000
    expect(computeTotal(2000000, fees)).toBe(2700000);
    expect(formatMoveInTotal(2000000, fees)).toBe('₦2,700,000');
  });
});

describe('Public Release Hardening: 404 Distinction & Network Error Handling', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetchPropertyById returns null on 404 without falling back to fixtures in connected mode', async () => {
    if (IS_DEMO_MODE) return; // connected mode check

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    const result = await fetchPropertyById('non-existent-id');
    expect(result).toBeNull();
  });

  it('fetchPropertyById throws error on HTTP 500 in connected mode so page shows recoverable error', async () => {
    if (IS_DEMO_MODE) return;

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    await expect(fetchPropertyById('prop-500')).rejects.toThrow('HTTP 500');
  });

  it('fetchNeighborhoodBySlug returns null on 404 in connected mode', async () => {
    if (IS_DEMO_MODE) return;

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    const result = await fetchNeighborhoodBySlug('non-existent-slug');
    expect(result).toBeNull();
  });

  it('fetchNeighborhoodBySlug throws on network failure in connected mode', async () => {
    if (IS_DEMO_MODE) return;

    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection offline'));

    await expect(fetchNeighborhoodBySlug('gra-benin')).rejects.toThrow('Network connection offline');
  });
});
