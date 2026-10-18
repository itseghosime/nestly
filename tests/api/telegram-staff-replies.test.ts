import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireStaff: vi.fn(),
  adminRpc: vi.fn(),
  staffRpc: vi.fn(),
  staffFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));

import { POST } from '@/app/api/staff/conversations/[id]/messages/route';

const SITE_URL = 'https://nestly.example.test';
const BOT_TOKEN = `123456789:${'B'.repeat(35)}`;
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = 'synthetic-telegram-staff-reply-0001';
const CONTENT = 'Synthetic staff Telegram response';

const conversationQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
const staffClient = {
  rpc: mocks.staffRpc,
  from: mocks.staffFrom,
};

function request() {
  return new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}/messages`, {
    method: 'POST',
    headers: {
      Origin: SITE_URL,
      'Content-Type': 'application/json',
      'Idempotency-Key': IDEMPOTENCY_KEY,
    },
    body: JSON.stringify({ content: CONTENT }),
  });
}

function routeParams() {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    message_id: MESSAGE_ID,
    bot_id: 123456789,
    chat_id: 44556677,
    dispatch_status: 'dispatching',
    delivery_status: 'queued',
    created_at: '2026-10-19T12:00:00.000Z',
    should_dispatch: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-role');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'synthetic-telegram-webhook-secret-000000000000');
  vi.stubEnv('TELEGRAM_OUTBOUND_ENABLED', 'true');
  conversationQuery.select.mockReturnValue(conversationQuery);
  conversationQuery.eq.mockReturnValue(conversationQuery);
  conversationQuery.maybeSingle.mockResolvedValue({
    data: { channel: 'telegram' },
    error: null,
  });
  mocks.staffFrom.mockReturnValue(conversationQuery);
  mocks.requireStaff.mockResolvedValue({
    context: { client: staffClient, userId: STAFF_ID, role: 'Customer Care' },
    response: null,
  });
  mocks.staffRpc.mockResolvedValue({ data: [claim()], error: null });
  mocks.adminRpc.mockResolvedValue({ data: [{ message_id: MESSAGE_ID }], error: null });
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    ok: true,
    result: { message_id: 9001 },
  }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Telegram staff replies', () => {
  it('rejects the outbound-disabled state before claiming or contacting Telegram', async () => {
    vi.stubEnv('TELEGRAM_OUTBOUND_ENABLED', 'false');
    const response = await POST(request(), routeParams());
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error).toContain('disabled');
    expect(mocks.staffRpc).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('relies on the database assignment claim and never calls Telegram when unauthorized', async () => {
    mocks.staffRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    const response = await POST(request(), routeParams());
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the durable unknown result without resending an uncertain request', async () => {
    mocks.staffRpc.mockResolvedValue({
      data: [claim({ should_dispatch: false, dispatch_status: 'unknown' })],
      error: null,
    });
    const response = await POST(request(), routeParams());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      data: { dispatch_status: 'unknown', has_provider_message_id: false },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records acceptance without claiming delivery or read receipts', async () => {
    const response = await POST(request(), routeParams());
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.data).toMatchObject({
      id: MESSAGE_ID,
      delivery_status: 'sent',
      dispatch_status: 'accepted',
      has_provider_message_id: false,
      has_valid_provider_message_sid: false,
    });
    expect(payload.notice).toContain('Delivery and read status are unavailable');
    expect(mocks.adminRpc).toHaveBeenCalledWith('finish_telegram_dispatch', expect.objectContaining({
      p_message_id: MESSAGE_ID,
      p_outcome: 'accepted',
      p_telegram_message_id: 9001,
    }));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      chat_id: 44556677,
      text: CONTENT,
    });
    expect(JSON.stringify(payload)).not.toContain(BOT_TOKEN);
  });

  it('records a provider timeout as unknown and does not retry it', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic timeout')));
    const response = await POST(request(), routeParams());
    expect(response.status).toBe(202);
    expect(mocks.adminRpc).toHaveBeenCalledWith('finish_telegram_dispatch', expect.objectContaining({
      p_outcome: 'unknown',
      p_error_code: 'NETWORK_OUTCOME_UNKNOWN',
    }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('records a definitive provider rejection without automatically retrying', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error_code: 403,
      description: 'synthetic provider rejection',
    }), { status: 403 })));
    const response = await POST(request(), routeParams());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      retryWithNewKey: true,
      data: { dispatch_status: 'failed', delivery_status: 'failed' },
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith('finish_telegram_dispatch', expect.objectContaining({
      p_outcome: 'rejected',
      p_error_code: 'TELEGRAM_API_403',
    }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
