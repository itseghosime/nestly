import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireStaff: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/backend/public-request', () => ({
  assertSameOrigin: routeMocks.assertSameOrigin,
}));
vi.mock('@/lib/backend/staff-context', () => ({
  requireStaff: routeMocks.requireStaff,
}));

import { GET, PATCH } from '@/app/api/staff/notifications/route';

const STAFF_ID = '22222222-2222-4222-8222-222222222222';
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333';
const READ_AT = '2026-10-20T18:00:00.000Z';

const notificationsQuery = {
  select: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
  maybeSingle: vi.fn(),
};
const readsQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  maybeSingle: vi.fn(),
};

function request(body: unknown) {
  return new Request('https://nestly.example/api/staff/notifications', {
    method: 'PATCH',
    headers: {
      Origin: 'https://nestly.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.assertSameOrigin.mockReturnValue(null);
  routeMocks.requireStaff.mockResolvedValue({
    context: {
      client: { from: routeMocks.from },
      userId: STAFF_ID,
      role: 'Platform Admin',
    },
  });
  routeMocks.from.mockImplementation((table: string) => (
    table === 'notifications' ? notificationsQuery : readsQuery
  ));

  notificationsQuery.select.mockReturnThis();
  notificationsQuery.order.mockReturnThis();
  notificationsQuery.eq.mockReturnThis();
  notificationsQuery.range.mockResolvedValue({
    data: [{
      id: NOTIFICATION_ID,
      conversation_id: null,
      inspection_id: null,
      channel: 'dashboard',
      template_key: 'inspection.pending',
      status: 'queued',
      attempts: 0,
      created_at: READ_AT,
    }],
    error: null,
    count: 1,
  });
  notificationsQuery.maybeSingle.mockResolvedValue({
    data: { id: NOTIFICATION_ID },
    error: null,
  });

  readsQuery.select.mockReturnThis();
  readsQuery.eq.mockReturnThis();
  readsQuery.in.mockResolvedValue({ data: [], error: null });
  readsQuery.upsert.mockResolvedValue({ error: null });
  readsQuery.maybeSingle.mockResolvedValue({ data: { read_at: READ_AT }, error: null });
  readsQuery.delete.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
});

describe('staff notification read state', () => {
  it('returns read state for the current staff member only', async () => {
    readsQuery.in.mockResolvedValue({
      data: [{ notification_id: NOTIFICATION_ID, read_at: READ_AT }],
      error: null,
    });

    const response = await GET(new Request('https://nestly.example/api/staff/notifications'));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data[0]).toMatchObject({
      id: NOTIFICATION_ID,
      isRead: true,
      readAt: READ_AT,
    });
    expect(routeMocks.from).toHaveBeenCalledWith('notification_reads');
    expect(readsQuery.eq).toHaveBeenCalledWith('profile_id', STAFF_ID);
  });

  it('rejects access when the staff role is not permitted', async () => {
    routeMocks.requireStaff.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    });

    const response = await PATCH(request({ id: NOTIFICATION_ID, isRead: true }));

    expect(response.status).toBe(403);
    expect(routeMocks.from).not.toHaveBeenCalled();
  });

  it('marks a visible notification read for the authenticated user, ignoring client-supplied ownership', async () => {
    const response = await PATCH(request({
      id: NOTIFICATION_ID,
      isRead: true,
      profile_id: '99999999-9999-4999-8999-999999999999',
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({ id: NOTIFICATION_ID, isRead: true, readAt: READ_AT });
    expect(readsQuery.upsert).toHaveBeenCalledWith(
      { notification_id: NOTIFICATION_ID, profile_id: STAFF_ID },
      { onConflict: 'notification_id,profile_id', ignoreDuplicates: true },
    );
  });

  it('marks a notification unread by deleting only the current user’s read row', async () => {
    const response = await PATCH(request({ id: NOTIFICATION_ID, isRead: false }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({ id: NOTIFICATION_ID, isRead: false, readAt: null });
    expect(readsQuery.delete).toHaveBeenCalledOnce();
  });

  it('does not create read state for a notification the caller cannot see', async () => {
    notificationsQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const response = await PATCH(request({ id: NOTIFICATION_ID, isRead: true }));

    expect(response.status).toBe(404);
    expect(readsQuery.upsert).not.toHaveBeenCalled();
  });

  it('returns an error instead of claiming read state when persistence fails', async () => {
    readsQuery.upsert.mockResolvedValueOnce({ error: { code: '42501' } });

    const response = await PATCH(request({ id: NOTIFICATION_ID, isRead: true }));

    expect(response.status).toBe(403);
    expect(readsQuery.maybeSingle).not.toHaveBeenCalled();
  });
});
