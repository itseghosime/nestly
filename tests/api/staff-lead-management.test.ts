import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ requireStaff: vi.fn(), assertSameOrigin: vi.fn(), from: vi.fn() }));
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
const current = { id, status: 'new', updated_at: updatedAt };
function chain(result: unknown) {
  const query = { select: vi.fn(), update: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
function request(status: string, expectedUpdatedAt = updatedAt) {
  return new Request('https://nestly.example/api/leads/contact', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'https://nestly.example' },
    body: JSON.stringify({ id, status, expectedUpdatedAt }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertSameOrigin.mockReturnValue(null);
  mocks.requireStaff.mockResolvedValue({ context: { role: 'Platform Admin', userId: id, client: { from: mocks.from } } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('staff lead status mutations', () => {
  it.each([contactPatch, landlordPatch])('rejects unauthenticated requests before reading lead data', async handler => {
    mocks.requireStaff.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    expect((await handler(request('in_review'))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin update before checking the session or writing', async () => {
    mocks.assertSameOrigin.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await contactPatch(request('closed'))).status).toBe(403);
    expect(mocks.requireStaff).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('restricts landlord mutations to the roles supported by linked update policies', async () => {
    mocks.requireStaff.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await landlordPatch(request('accepted'))).status).toBe(403);
    expect(mocks.requireStaff).toHaveBeenCalledWith(['Platform Admin', 'Operations Lead']);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(['published', 'approved', 'new'])('rejects an invalid contact status %s without querying', async status => {
    expect((await contactPatch(request(status))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('requires the loaded revision rather than accepting a blind overwrite', async () => {
    const req = new Request('https://nestly.example/api/leads/contact', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'closed' }),
    });
    expect((await contactPatch(req)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns an inaccessible lead without writing or revealing another row', async () => {
    mocks.from.mockReturnValue(chain({ data: null, error: null }));
    expect((await contactPatch(request('in_review'))).status).toBe(404);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('preserves a newer staff update when the client revision is stale', async () => {
    mocks.from.mockReturnValue(chain({ data: { ...current, updated_at: '2026-10-20T12:01:00+00:00' }, error: null }));
    expect((await contactPatch(request('closed'))).status).toBe(409);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('compares the revision atomically during the write', async () => {
    const read = chain({ data: current, error: null });
    const write = chain({ data: { ...current, status: 'in_review', updated_at: '2026-10-20T12:02:00+00:00' }, error: null });
    mocks.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
    const response = await contactPatch(request('in_review'));
    expect(response.status).toBe(200);
    expect(write.eq).toHaveBeenCalledWith('id', id);
    expect(write.eq).toHaveBeenCalledWith('updated_at', updatedAt);
    expect((await response.json()).data.status).toBe('in_review');
  });
  it('does not claim success if another write wins after the read', async () => {
    mocks.from.mockReturnValueOnce(chain({ data: current, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }));
    expect((await contactPatch(request('closed'))).status).toBe(409);
  });
  it('makes an already-applied retry a no-op without another write', async () => {
    mocks.from.mockReturnValue(chain({ data: { ...current, status: 'closed', updated_at: '2026-10-20T12:02:00+00:00' }, error: null }));
    expect((await contactPatch(request('closed'))).status).toBe(200);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
  it('keeps landlord acceptance separate from publication', async () => {
    const read = chain({ data: current, error: null });
    const write = chain({ data: { ...current, status: 'accepted' }, error: null });
    mocks.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
    expect((await landlordPatch(request('accepted'))).status).toBe(200);
    expect(mocks.from.mock.calls.every(([table]) => table === 'landlord_submissions')).toBe(true);
    expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
  });
});
