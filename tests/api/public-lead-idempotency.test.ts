import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  guardPublicRequest: vi.fn(),
  createClient: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/backend/public-request', () => ({
  assertSameOrigin: vi.fn(() => null),
  getIdempotencyKey: (request: Request) => request.headers.get('idempotency-key'),
  guardPublicRequest: routeMocks.guardPublicRequest,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: routeMocks.createClient,
}));

import { POST as submitLandlordProperty } from '@/app/api/leads/landlord/route';

const payload = {
  name: 'Sample Owner',
  email: 'owner@example.test',
  phone: '+2348000000000',
  propertyType: 'apartment',
  state: 'Edo',
  city: 'Benin City',
  neighborhood: 'GRA',
  address: 'Sample street',
  bedrooms: 2,
  expectedAnnualRent: 2_500_000.5,
  description: 'Owner-reported details',
};

function requestWithKey(key: string): Request {
  return new Request('https://nestly.example/api/leads/landlord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(payload),
  });
}

describe('public landlord submission retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.guardPublicRequest.mockResolvedValue(null);
    routeMocks.createClient.mockResolvedValue({
      from: () => ({ insert: routeMocks.insert }),
    });
  });

  it('returns the same receipt for a duplicate idempotency key without treating it as a new submission', async () => {
    routeMocks.insert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23505' } });

    const firstResponse = await submitLandlordProperty(requestWithKey('landlord-retry-key-0001'));
    const retryResponse = await submitLandlordProperty(requestWithKey('landlord-retry-key-0001'));

    expect(firstResponse.status).toBe(202);
    expect(await firstResponse.json()).toEqual({ requestReceived: true, confirmed: false });
    expect(retryResponse.status).toBe(202);
    expect(await retryResponse.json()).toEqual({ requestReceived: true, confirmed: false });
    expect(routeMocks.insert).toHaveBeenCalledTimes(2);
    expect(routeMocks.insert.mock.calls[0][0]).toEqual(routeMocks.insert.mock.calls[1][0]);
    expect(routeMocks.insert.mock.calls[0][0]).toMatchObject({
      idempotency_key: 'landlord-retry-key-0001',
    });
  });
});
