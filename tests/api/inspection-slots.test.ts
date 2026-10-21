import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireStaff: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/backend/public-request', () => ({
  assertSameOrigin: routeMocks.assertSameOrigin,
}));
vi.mock('@/lib/backend/staff-context', () => ({
  requireStaff: routeMocks.requireStaff,
}));

import { POST } from '@/app/api/inspections/slots/route';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const SLOT_ID = '22222222-2222-4222-8222-222222222222';

function slotRequest(fieldAgentId: string | null, includeEnd = true) {
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 90 * 60_000).toISOString();
  return new Request('https://nestly.example/api/inspections/slots', {
    method: 'POST',
    headers: {
      Origin: 'https://nestly.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      propertyId: PROPERTY_ID,
      fieldAgentId,
      startsAt,
      ...(includeEnd ? { endsAt } : {}),
      capacity: 1,
      transitBufferMins: 30,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.assertSameOrigin.mockReturnValue(null);
  routeMocks.requireStaff.mockResolvedValue({
    context: {
      client: { from: routeMocks.from },
      userId: '33333333-3333-4333-8333-333333333333',
      role: 'Platform Admin',
    },
  });
  routeMocks.from.mockReturnValue({ insert: routeMocks.insert });
  routeMocks.insert.mockReturnValue({ select: routeMocks.select });
  routeMocks.select.mockReturnValue({ single: routeMocks.single });
  routeMocks.single.mockResolvedValue({
    data: {
      id: SLOT_ID,
      property_id: PROPERTY_ID,
      agent_id: null,
      capacity: 1,
      is_active: true,
      transit_buffer_mins: 30,
    },
    error: null,
  });
});

describe('staff inspection slot creation', () => {
  it('creates a capacity-one slot with no agent while preserving the requested transit buffer', async () => {
    const response = await POST(slotRequest(null));
    const result = await response.json();
    const inserted = routeMocks.insert.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(result.data).toMatchObject({ id: SLOT_ID, agent_id: null, transit_buffer_mins: 30 });
    expect(inserted).toMatchObject({
      property_id: PROPERTY_ID,
      agent_id: null,
      capacity: 1,
      is_active: true,
      transit_buffer_mins: 30,
    });
  });

  it('keeps explicitly assigned agent IDs unchanged', async () => {
    const agentId = '44444444-4444-4444-8444-444444444444';

    await POST(slotRequest(agentId));

    expect(routeMocks.insert.mock.calls[0][0]).toMatchObject({ agent_id: agentId });
  });

  it('uses the persisted workspace duration when the client omits the slot end', async () => {
    const request = slotRequest(null, false);
    const body = await request.clone().json();
    const workspaceQuery = {
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: { default_inspection_duration_mins: 75 },
            error: null,
          }),
        }),
      }),
    };
    routeMocks.from.mockImplementation((table: string) => (
      table === 'workspace_settings' ? workspaceQuery : { insert: routeMocks.insert }
    ));
    const response = await POST(request);
    const inserted = routeMocks.insert.mock.calls[0][0];

    expect(response.status).toBe(201);
    expect(Date.parse(inserted.ends_at) - Date.parse(body.startsAt)).toBe(75 * 60_000);
    expect(routeMocks.from).toHaveBeenCalledWith('workspace_settings');
  });

  it('does not create a slot when staff authorization fails', async () => {
    routeMocks.requireStaff.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    });

    const response = await POST(slotRequest(null));

    expect(response.status).toBe(403);
    expect(routeMocks.from).not.toHaveBeenCalled();
  });
});
