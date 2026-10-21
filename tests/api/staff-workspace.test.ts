import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireStaff: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  order: vi.fn(),
  coverageResult: vi.fn(),
}));

vi.mock('@/lib/backend/public-request', () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));

import { GET as getSettings, PATCH as patchSettings } from '@/app/api/staff/workspace/route';
import {
  GET as getCoverage,
  PATCH as patchCoverage,
} from '@/app/api/staff/workspace/coverage/route';

const areaId = '11111111-1111-4111-8111-111111111111';
const defaults = {
  workspace_name: 'Nestly',
  default_inspection_duration_mins: 90,
  transit_buffer_mins: 30,
  daylight_lock: true,
  daylight_start: '09:00:00',
  daylight_end: '17:00:00',
  retention_days: 365,
  updated_at: '2026-10-20T12:00:00+00:00',
  updated_by: null,
};
function request(body: unknown, url = 'https://nestly.example/api/staff/workspace') {
  return new Request(url, {
    method: 'PATCH',
    headers: { Origin: 'https://nestly.example', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertSameOrigin.mockReturnValue(null);
  mocks.requireStaff.mockResolvedValue({
    context: {
      role: 'Platform Admin',
      userId: '22222222-2222-4222-8222-222222222222',
      client: { from: mocks.from, rpc: mocks.rpc },
    },
  });
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    single: mocks.single,
    order: mocks.order,
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(mocks.coverageResult()).then(resolve),
  };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.order.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: defaults, error: null });
  mocks.coverageResult.mockReturnValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: [defaults], error: null });
});

describe('staff workspace settings', () => {
  it('loads persisted workspace settings for staff readers', async () => {
    const response = await getSettings();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(defaults);
    expect(mocks.requireStaff).toHaveBeenCalledWith(['Platform Admin', 'Operations Lead', 'Field Vetting Agent']);
  });

  it.each(['Operations Lead', 'Field Vetting Agent'])('returns a read-only workspace contract for %s', async (role) => {
    mocks.requireStaff.mockResolvedValueOnce({ context: {
      role, userId: areaId, client: { from: mocks.from, rpc: mocks.rpc },
    } });
    const response = await getSettings();
    expect(response.status).toBe(200);
    expect((await response.json()).canManage).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('no-store, private');
  });

  it('saves all validated settings through the atomic audited RPC', async () => {
    const response = await patchSettings(request({
      workspaceName: 'Nestly Operations',
      defaultInspectionDurationMins: 75,
      transitBufferMins: 45,
      daylightLock: true,
      daylightStart: '08:30',
      daylightEnd: '17:30',
      retentionDays: 730,
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('update_staff_workspace_settings', {
      p_workspace_name: 'Nestly Operations',
      p_default_inspection_duration_mins: 75,
      p_transit_buffer_mins: 45,
      p_daylight_lock: true,
      p_daylight_start: '08:30',
      p_daylight_end: '17:30',
      p_retention_days: 730,
    });
  });

  it('rejects invalid or cross-origin settings before invoking the RPC', async () => {
    expect((await patchSettings(request({
      workspaceName: 'Nestly',
      defaultInspectionDurationMins: 77,
      transitBufferMins: 30,
      daylightLock: false,
      daylightStart: '09:00',
      daylightEnd: '17:00',
      retentionDays: 365,
    }))).status).toBe(400);
    mocks.assertSameOrigin.mockReturnValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await patchSettings(request({}))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps settings updates restricted to Platform Admins', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await patchSettings(request({}))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('staff coverage administration', () => {
  it('returns live coverage and whether the current role may manage it', async () => {
    const area = { id: areaId, name: 'Central', city: 'Benin City', state: 'Edo', active: true };
    mocks.coverageResult.mockReturnValueOnce({ data: [area], error: null });
    const response = await getCoverage();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [area], canManage: true });
  });

  it('updates coverage through the permission-checked audited RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ id: areaId, name: 'Central', city: 'Benin City', state: 'Edo', active: false }],
      error: null,
    });
    const response = await patchCoverage(request(
      { id: areaId, active: false },
      'https://nestly.example/api/staff/workspace/coverage',
    ));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('update_staff_coverage', {
      p_neighborhood_id: areaId,
      p_active: false,
    });
  });

  it('does not call the coverage RPC when staff authorization fails', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await patchCoverage(request(
      { id: areaId, active: false },
      'https://nestly.example/api/staff/workspace/coverage',
    ))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
