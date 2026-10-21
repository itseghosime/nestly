import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireStaff: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/backend/public-request', () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));

import { POST } from '@/app/api/leads/landlord/[id]/convert/route';

const submissionId = '11111111-1111-4111-8111-111111111111';
const propertyId = '22222222-2222-4222-8222-222222222222';
const property = {
  property_id: propertyId,
  title: 'house in GRA',
  publication_state: 'draft',
  verification_state: 'unverified',
  rent_annual: 12_000_000,
  created: true,
};
const validRequest = () => new Request('https://nestly.example/api/leads/landlord/convert', {
  method: 'POST',
  headers: { Origin: 'https://nestly.example', 'Content-Type': 'application/json' },
  body: JSON.stringify({ propertyType: 'house' }),
});
const params = Promise.resolve({ id: submissionId });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertSameOrigin.mockReturnValue(null);
  mocks.requireStaff.mockResolvedValue({
    context: { role: 'Platform Admin', client: { rpc: mocks.rpc } },
  });
  mocks.rpc.mockResolvedValue({ data: [property], error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('landlord submission draft conversion', () => {
  it('creates an unverified private draft through the atomic RPC', async () => {
    const response = await POST(validRequest(), { params });
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual(property);
    expect(mocks.requireStaff).toHaveBeenCalledWith(['Platform Admin', 'Operations Lead']);
    expect(mocks.rpc).toHaveBeenCalledWith('convert_landlord_submission_to_draft', {
      p_submission_id: submissionId,
      p_property_type: 'house',
    });
  });

  it('returns a successful idempotent retry without creating another property', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...property, created: false }], error: null });
    const response = await POST(validRequest(), { params });
    expect(response.status).toBe(200);
    expect((await response.json()).data.created).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid input and unauthorized staff before conversion', async () => {
    const invalid = new Request('https://nestly.example/api/leads/landlord/convert', {
      method: 'POST',
      headers: { Origin: 'https://nestly.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyType: 'penthouse' }),
    });
    expect((await POST(invalid, { params })).status).toBe(400);
    mocks.requireStaff.mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await POST(validRequest(), { params })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not reveal submissions outside the staff member’s zone', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } });
    expect((await POST(validRequest(), { params })).status).toBe(404);
  });
});
