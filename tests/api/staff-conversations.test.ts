import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));

import { GET } from '@/app/api/staff/conversations/route';

const conversationId = '11111111-1111-4111-8111-111111111111';
const assignedStaffId = '22222222-2222-4222-8222-222222222222';
const conversation = {
  id: conversationId,
  channel: 'telegram',
  mode: 'AI_ACTIVE',
  current_property_id: null,
  assigned_staff_id: assignedStaffId,
  created_at: '2026-10-20T12:00:00Z',
  updated_at: '2026-10-20T12:05:00Z',
  customer: { display_name: 'Synthetic Customer', phone: null, whatsapp_phone: null },
  telegram_identity: { username: 'synthetic_test' },
  property: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  const conversationQuery = {
    select: vi.fn(() => conversationQuery),
    order: vi.fn(() => conversationQuery),
    range: vi.fn().mockResolvedValue({ data: [conversation], error: null, count: 1 }),
  };
  const profileQuery = {
    select: vi.fn(() => profileQuery),
    in: vi.fn().mockResolvedValue({
      data: [{ id: assignedStaffId, display_name: 'Assigned Agent' }],
      error: null,
    }),
  };
  mocks.from.mockImplementation((table: string) => {
    if (table === 'conversations') return conversationQuery;
    if (table === 'profiles') return profileQuery;
    throw new Error(`Unexpected table read: ${table}`);
  });
  mocks.requireStaff.mockResolvedValue({
    context: { client: { from: mocks.from, rpc: mocks.rpc } },
  });
  mocks.rpc.mockResolvedValue({
    data: [{
      conversation_id: conversationId,
      sender_type: 'customer',
      content: 'Most recent message',
      created_at: '2026-10-20T12:04:00Z',
    }],
    error: null,
  });
});

describe('staff conversation previews', () => {
  it('loads one database-selected latest message per conversation without a global message cap', async () => {
    const response = await GET(new Request('https://nestly.example/api/staff/conversations?page=1'));

    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({
      id: conversationId,
      assignedStaff: 'Assigned Agent',
      lastMessage: 'Most recent message',
      lastSender: 'customer',
      lastTimestamp: '2026-10-20T12:04:00Z',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_staff_conversation_previews', {
      p_conversation_ids: [conversationId],
    });
    expect(mocks.from).not.toHaveBeenCalledWith('messages');
  });

  it('surfaces preview RPC failures instead of returning success-shaped empty previews', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Denied' } });

    const response = await GET(new Request('https://nestly.example/api/staff/conversations'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Unable to load conversation previews' });
  });

  it('does not query conversation data when staff authorization fails', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    expect((await GET(new Request('https://nestly.example/api/staff/conversations'))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
