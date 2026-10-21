import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  from: vi.fn(),
  adminRpc: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
}));

vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.adminRpc }),
}));

import { GET } from '@/app/api/inspections/bookings/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  const query = {
    select: mocks.select,
    order: mocks.order,
    gte: mocks.gte,
    lt: mocks.lt,
    eq: mocks.eq,
    range: mocks.range,
  };
  for (const method of [mocks.select, mocks.order, mocks.gte, mocks.lt, mocks.eq]) {
    method.mockReturnValue(query);
  }
  mocks.range.mockResolvedValue({ data: [], error: null, count: 0 });
  mocks.adminRpc.mockResolvedValue({ data: null, error: null });
  mocks.from.mockReturnValue(query);
  mocks.requireStaff.mockResolvedValue({ context: { client: { from: mocks.from } } });
});
afterEach(() => vi.unstubAllEnvs());

describe('inspection calendar date windows', () => {
  it('filters by a bounded inclusive WAT date window and returns exact pagination metadata', async () => {
    const response = await GET(new Request(
      'https://nestly.example/api/inspections/bookings?from=2026-10-01&to=2026-10-31&page=2',
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [], page: 2, pageSize: 100, total: 0 });
    expect(mocks.select).toHaveBeenCalledWith(
      expect.stringContaining('inspection_slots!inspections_slot_id_fkey!inner'),
      { count: 'exact' },
    );
    expect(mocks.gte).toHaveBeenCalledWith('slot.starts_at', '2026-10-01T00:00:00+01:00');
    expect(mocks.lt).toHaveBeenCalledWith('slot.starts_at', '2026-11-01T00:00:00+01:00');
    expect(mocks.range).toHaveBeenCalledWith(100, 199);
  });

  it.each([
    'from=2026-10-01',
    'from=2026-10-31&to=2026-10-01',
    'from=2026-10-01&to=2026-12-02',
    'from=not-a-date&to=2026-10-02',
  ])('rejects invalid calendar range %s before database access', async (query) => {
    const response = await GET(new Request(
      `https://nestly.example/api/inspections/bookings?${query}`,
    ));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('does not query bookings when staff authorization fails', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    expect((await GET(new Request('https://nestly.example/api/inspections/bookings'))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
