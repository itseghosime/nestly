import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ requireStaff: vi.fn(), assertSameOrigin: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/backend/public-request', () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  deriveReceiptToken: vi.fn(), getIdempotencyKey: vi.fn(), guardPublicRequest: vi.fn(), hashReceiptToken: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
import { PATCH as contactPatch } from '@/app/api/leads/contact/route';
import { PATCH as landlordPatch } from '@/app/api/leads/landlord/route';

const id = '11111111-1111-4111-8111-111111111111';
const updatedAt = '2026-10-20T12:00:00+00:00';
function request(status: string, expectedUpdatedAt = updatedAt) {
  return new Request('https://nestly.example/api/leads/contact', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'https://nestly.example' },
    body: JSON.stringify({ id, status, expectedUpdatedAt }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertSameOrigin.mockReturnValue(null);
  mocks.requireStaff.mockResolvedValue({ context: { role: 'Platform Admin', userId: id, client: { from: mocks.from, rpc: mocks.rpc } } });
  mocks.rpc.mockResolvedValue({ data: [{ id, status: 'in_review', updated_at: updatedAt }], error: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('staff lead status mutations', () => {
  it.each([contactPatch, landlordPatch])('rejects unauthenticated requests before reading lead data', async handler => {
    mocks.requireStaff.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    expect((await handler(request('in_review'))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin update before checking the session or writing', async () => {
    mocks.assertSameOrigin.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await contactPatch(request('closed'))).status).toBe(403);
    expect(mocks.requireStaff).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('restricts landlord mutations to the roles supported by linked update policies', async () => {
    mocks.requireStaff.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await landlordPatch(request('accepted'))).status).toBe(403);
    expect(mocks.requireStaff).toHaveBeenCalledWith(['Platform Admin', 'Operations Lead']);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['published', 'approved', 'new'])('rejects an invalid contact status %s without querying', async status => {
    expect((await contactPatch(request(status))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires the loaded revision rather than accepting a blind overwrite', async () => {
    const req = new Request('https://nestly.example/api/leads/contact', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'closed' }),
    });
    expect((await contactPatch(req)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns an inaccessible lead without writing or revealing another row', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } });
    expect((await contactPatch(request('in_review'))).status).toBe(404);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('preserves a newer staff update when the client revision is stale', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    expect((await contactPatch(request('closed'))).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('delegates revision comparison, status update, and audit to one atomic RPC', async () => {
    const response = await contactPatch(request('in_review'));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('update_staff_lead_status', {
      p_kind: 'contact',
      p_lead_id: id,
      p_status: 'in_review',
      p_expected_updated_at: updatedAt,
    });
    expect((await response.json()).data.status).toBe('in_review');
  });
  it('does not claim success if the atomic revision check loses', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    expect((await contactPatch(request('closed'))).status).toBe(409);
  });
  it('makes an already-applied retry a safe RPC no-op', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ id, status: 'closed', updated_at: '2026-10-20T12:02:00+00:00' }],
      error: null,
    });
    expect((await contactPatch(request('closed'))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps landlord acceptance separate from publication', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id, status: 'accepted', updated_at: updatedAt }], error: null });
    expect((await landlordPatch(request('accepted'))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('update_staff_lead_status', expect.objectContaining({
      p_kind: 'landlord',
      p_status: 'accepted',
    }));
  });
});
