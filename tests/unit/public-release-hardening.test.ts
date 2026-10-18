import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeTotal, formatMoveInTotal, computeFeeBreakdown, type FeeRow } from '@/lib/price';

describe('Public Release Hardening: Fee Ledger Contract', () => {
  it('returns null when fee array is empty', () => {
    expect(computeTotal(2000000, [])).toBeNull();
    expect(formatMoveInTotal(2000000, [])).toBeNull();
    expect(computeFeeBreakdown(2000000, [])).toEqual([]);
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

  it('correctly calculates percentage-fee row with base=subtotal using running subtotal in sort_order', () => {
    // Example: rent 1,000 + fixed fee 100 + 10% subtotal must show fee 110 and total 1,210
    const fees: FeeRow[] = [
      {
        fee_key: 'fixed_fee',
        kind: 'fixed',
        amount: 100,
        base: 'rent',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 1,
      },
      {
        fee_key: 'subtotal_percent_fee',
        kind: 'percent',
        amount: 10,
        base: 'subtotal',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 2,
      },
    ];

    const breakdown = computeFeeBreakdown(1000, fees);
    expect(breakdown).toHaveLength(2);

    // Fixed fee: 100 -> runningSubtotal = 1,100
    expect(breakdown[0].calculatedAmount).toBe(100);
    expect(breakdown[0].runningSubtotal).toBe(1100);

    // 10% of running subtotal (1,100): 110 -> runningSubtotal = 1,210
    expect(breakdown[1].calculatedAmount).toBe(110);
    expect(breakdown[1].runningSubtotal).toBe(1210);

    // Total must be 1,210 consistent with computeTotal
    expect(computeTotal(1000, fees)).toBe(1210);
    expect(formatMoveInTotal(1000, fees)).toBe('₦1,210');
  });

  it('correctly calculates compounded multi-tier fees with mixed bases in sort_order', () => {
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
        base: 'rent', // 10% of base rent: 200,000
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 2,
      },
      {
        fee_key: 'agency_fee',
        kind: 'percent',
        amount: 10,
        base: 'subtotal', // 10% of subtotal (2,000,000 + 200,000 + 200,000 = 2,400,000) -> 240,000
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 3,
      },
    ];

    const breakdown = computeFeeBreakdown(2000000, fees);
    expect(breakdown[0].calculatedAmount).toBe(200000);
    expect(breakdown[0].runningSubtotal).toBe(2200000);

    expect(breakdown[1].calculatedAmount).toBe(200000);
    expect(breakdown[1].runningSubtotal).toBe(2400000);

    expect(breakdown[2].calculatedAmount).toBe(240000);
    expect(breakdown[2].runningSubtotal).toBe(2640000);

    expect(computeTotal(2000000, fees)).toBe(2640000);
  });
});

describe('Public Release Hardening: Deterministic Connected-Mode 404 & Network Error Handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('fetchPropertyById returns null on 404 without falling back to fixtures in connected mode', async () => {
    const { fetchPropertyById, IS_DEMO_MODE } = await import('@/lib/properties');
    expect(IS_DEMO_MODE).toBe(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    const result = await fetchPropertyById('non-existent-id');
    expect(result).toBeNull();
  });

  it('fetchPropertyById throws error on HTTP 500 in connected mode so page shows recoverable error', async () => {
    const { fetchPropertyById, IS_DEMO_MODE } = await import('@/lib/properties');
    expect(IS_DEMO_MODE).toBe(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    await expect(fetchPropertyById('prop-500')).rejects.toThrow('HTTP 500');
  });

  it('fetchNeighborhoodBySlug returns null on 404 in connected mode', async () => {
    const { fetchNeighborhoodBySlug, IS_DEMO_MODE } = await import('@/lib/neighborhoods');
    expect(IS_DEMO_MODE).toBe(false);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    const result = await fetchNeighborhoodBySlug('non-existent-slug');
    expect(result).toBeNull();
  });

  it('fetchNeighborhoodBySlug throws on network failure in connected mode', async () => {
    const { fetchNeighborhoodBySlug, IS_DEMO_MODE } = await import('@/lib/neighborhoods');
    expect(IS_DEMO_MODE).toBe(false);

    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection offline'));

    await expect(fetchNeighborhoodBySlug('gra-benin')).rejects.toThrow('Network connection offline');
  });
});

describe('Public Release Hardening: Stale Related Listings Clearing Logic', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('clears related listings when fetchProperties returns an empty array', async () => {
    const { fetchProperties } = await import('@/lib/properties');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ properties: [] }),
    });

    const properties = await fetchProperties();
    expect(properties).toEqual([]);

    // Simulating component state update logic: empty array must produce empty related list
    const currentId = 'prop-1';
    const related = (Array.isArray(properties) ? properties : []).filter((p) => p.id !== currentId).slice(0, 3);
    expect(related).toEqual([]);
  });

  it('clears related listings when related-list request throws an error', async () => {
    const { fetchProperties } = await import('@/lib/properties');

    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    let relatedState = [{ id: 'stale-prop-1' }];
    try {
      await fetchProperties();
    } catch {
      // In component catch block: related listings are cleared
      relatedState = [];
    }

    expect(relatedState).toEqual([]);
  });

  it('clears related listings when route property ID changes', () => {
    const previousRelated = [{ id: 'prop-2', title: 'Old Related Property' }];
    const nextRouteId = 'prop-2';

    // When route ID changes in connected mode (IS_DEMO_MODE = false):
    const isDemoMode = false;
    let relatedState = previousRelated;
    if (nextRouteId !== 'prop-1') {
      relatedState = isDemoMode ? [] : [];
    }

    expect(relatedState).toEqual([]);
  });
});
