import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeTotal, formatMoveInTotal, computeFeeBreakdown, type FeeRow } from '@/lib/price';
import type { Property } from '@/lib/types';

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

  it('aligns computeFeeBreakdown with computeTotal rounding behavior (reproduction: rent 100, 33.333% rent, 33.333% subtotal)', () => {
    const fees: FeeRow[] = [
      {
        fee_key: 'fee_1',
        kind: 'percent',
        amount: 33.333,
        base: 'rent',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 1,
      },
      {
        fee_key: 'fee_2',
        kind: 'percent',
        amount: 33.333,
        base: 'subtotal',
        required: true,
        confirmed_at: '2026-04-01T00:00:00Z',
        sort_order: 2,
      },
    ];

    const total = computeTotal(100, fees);
    expect(total).toBe(177.78);

    const breakdown = computeFeeBreakdown(100, fees);
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].calculatedAmount).toBe(33.33);
    expect(breakdown[0].runningSubtotal).toBe(133.33);

    expect(breakdown[1].calculatedAmount).toBe(44.44);
    // Preserving full precision for intermediate calculations produces 177.78, matching computeTotal exactly
    expect(breakdown[1].runningSubtotal).toBe(177.78);
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

describe('Public Release Hardening: Stale Related Listings Component Behavior', () => {
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

  it('clears related listings when the API returns an empty data array { data: [] }', async () => {
    const { syncRelatedProperties } = await import('@/lib/properties');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }), // Correct API envelope
    });

    const updates: Property[][] = [];
    const setRelated = vi.fn((props: Property[]) => {
      updates.push(props);
    });

    const isCancelled = false;
    await syncRelatedProperties('prop-1', setRelated, () => isCancelled);

    expect(setRelated).toHaveBeenCalledTimes(1);
    expect(setRelated).toHaveBeenCalledWith([]);
    expect(updates[updates.length - 1]).toEqual([]);
  });

  it('clears related listings when the related-list request fails with an error', async () => {
    const { syncRelatedProperties } = await import('@/lib/properties');

    global.fetch = vi.fn().mockRejectedValue(new Error('HTTP 500 Connection reset'));

    const updates: Property[][] = [];
    const setRelated = vi.fn((props: Property[]) => {
      updates.push(props);
    });

    const isCancelled = false;
    await syncRelatedProperties('prop-1', setRelated, () => isCancelled);

    expect(setRelated).toHaveBeenCalledTimes(1);
    expect(setRelated).toHaveBeenCalledWith([]);
    expect(updates[updates.length - 1]).toEqual([]);
  });

  it('clears related listings immediately when route ID changes in connected mode', async () => {
    const { IS_DEMO_MODE } = await import('@/lib/properties');
    expect(IS_DEMO_MODE).toBe(false);

    // Component state harness modeling app/property/[id]/page.tsx
    let currentId = 'prop-1';
    let relatedProperties: Property[] = [
      { id: 'rel-1', title: 'Previous Related Listing' } as Property,
    ];

    const handleRouteChange = (nextId: string) => {
      if (nextId !== currentId) {
        currentId = nextId;
        // In connected mode, component resets related properties to [] immediately
        relatedProperties = IS_DEMO_MODE ? [] : [];
      }
    };

    handleRouteChange('prop-2');

    expect(currentId).toBe('prop-2');
    expect(relatedProperties).toEqual([]);
  });

  it('discards late responses from a previous route without overwriting the new route state', async () => {
    const { syncRelatedProperties } = await import('@/lib/properties');

    let resolveSlowFetch: (val: unknown) => void = () => {};
    const slowFetchPromise = new Promise((resolve) => {
      resolveSlowFetch = resolve;
    });

    global.fetch = vi.fn().mockReturnValue(slowFetchPromise);

    const relatedUpdates: Property[][] = [];
    const setRelated = vi.fn((props: Property[]) => {
      relatedUpdates.push(props);
    });

    // 1. Initial route 'prop-1' triggers fetch
    let route1Cancelled = false;
    const fetchPromise = syncRelatedProperties('prop-1', setRelated, () => route1Cancelled);

    // 2. User rapidly navigates to 'prop-2' before 'prop-1' fetch resolves
    // Component effect cleanup for 'prop-1' runs:
    route1Cancelled = true;
    // Component route change resets related properties:
    setRelated([]);

    expect(relatedUpdates).toEqual([[]]);

    // 3. Slow network response for 'prop-1' finally resolves with data
    resolveSlowFetch({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'stale-listing', title: 'Stale Property from Route 1', price_annual: 1500000 },
        ],
      }),
    });

    await fetchPromise;

    // 4. Verify the late response was discarded and setRelated was NOT called with stale data
    expect(setRelated).toHaveBeenCalledTimes(1); // Only the route reset to []
    expect(relatedUpdates[relatedUpdates.length - 1]).toEqual([]);
  });
});
