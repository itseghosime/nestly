import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  staffRpc: vi.fn(),
}));

vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));

import { POST } from '@/app/api/staff/conversations/[id]/telegram-recovery/route';

const SITE_URL = 'https://nestly.example.test';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

function request(body: unknown = { messageId: MESSAGE_ID, acknowledgeUnknown: true }) {
  return new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}/telegram-recovery`, {
    method: 'POST',
    headers: { Origin: SITE_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ id: CONVERSATION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE_URL);
  mocks.requireStaff.mockResolvedValue({
    context: { client: { rpc: mocks.staffRpc }, userId: 'synthetic-staff' },
    response: null,
  });
  mocks.staffRpc.mockResolvedValue({
    data: [{
      message_id: MESSAGE_ID,
      conversation_id: CONVERSATION_ID,
      reviewed_by: '33333333-3333-4333-8333-333333333333',
      created_at: '2026-10-18T18:00:00.000Z',
    }],
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Telegram unknown-send review', () => {
  it('requires explicit acknowledgement and records a non-resend review', async () => {
    const response = await POST(request(), routeParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { messageId: MESSAGE_ID, conversationId: CONVERSATION_ID },
      notice: expect.stringContaining('remains unknown and will not be resent'),
    });
    expect(mocks.staffRpc).toHaveBeenCalledWith('acknowledge_telegram_unknown_send', {
      p_conversation_id: CONVERSATION_ID,
      p_message_id: MESSAGE_ID,
      p_acknowledged: true,
    });
  });

  it('rejects malformed or non-explicit acknowledgements', async () => {
    const response = await POST(request({ messageId: MESSAGE_ID, acknowledgeUnknown: false }), routeParams);
    expect(response.status).toBe(400);
    expect(mocks.staffRpc).not.toHaveBeenCalled();
  });

  it('surfaces assignment denial and no-longer-unknown conflicts', async () => {
    mocks.staffRpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    expect((await POST(request(), routeParams)).status).toBe(403);
    mocks.staffRpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } });
    expect((await POST(request(), routeParams)).status).toBe(409);
  });
});
