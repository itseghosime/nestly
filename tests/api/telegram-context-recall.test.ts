import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  requireStaff: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/backend/staff-context', () => ({
  requireStaff: mocks.requireStaff,
}));

import { POST as telegramWebhook } from '@/app/api/telegram/webhook/route';
import { PATCH as updateConversation } from '@/app/api/staff/conversations/[id]/route';
import { POST as sendStaffReply } from '@/app/api/staff/conversations/[id]/messages/route';

const SITE_URL = 'https://nestly.example.test';
const BOT_TOKEN = `123456789:${'C'.repeat(35)}`;
const WEBHOOK_SECRET = 'synthetic-telegram-webhook-secret-000000000000';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 44556677;

type Lifecycle = {
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE';
  assignedStaffId: string | null;
  context: unknown;
  queuedHandoffNotifications: number;
  nextMessageId: number;
  aiReplies: string[];
  outboundMessages: string[];
  propertySearchRequests: number;
};

let lifecycle: Lifecycle;

function dispatchClaim(overrides: Record<string, unknown> = {}) {
  lifecycle.nextMessageId += 1;
  return {
    message_id: `33333333-3333-4333-8333-${String(lifecycle.nextMessageId).padStart(12, '0')}`,
    chat_id: USER_ID,
    bot_id: 123456789,
    dispatch_status: 'dispatching',
    delivery_status: 'queued',
    created_at: '2026-10-18T19:00:00.000Z',
    should_dispatch: true,
    ...overrides,
  };
}

function webhookRequest(updateId: number, text: string) {
  return new Request(`${SITE_URL}/api/telegram/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      update_id: updateId,
      message: {
        message_id: updateId,
        from: { id: USER_ID, is_bot: false, first_name: 'Synthetic' },
        chat: { id: USER_ID, type: 'private' },
        text,
      },
    }),
  });
}

function staffRequest(path: string, body: unknown, idempotencyKey?: string) {
  return new Request(`${SITE_URL}${path}`, {
    method: idempotencyKey ? 'POST' : 'PATCH',
    headers: {
      Origin: SITE_URL,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function conversationParams() {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle = {
    mode: 'AI_ACTIVE',
    assignedStaffId: null,
    context: { preferences: null, recentPropertyIds: [], selectedPropertyId: null },
    queuedHandoffNotifications: 0,
    nextMessageId: 0,
    aiReplies: [],
    outboundMessages: [],
    propertySearchRequests: 0,
  };
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-role');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.stubEnv('TELEGRAM_OUTBOUND_ENABLED', 'true');

  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'claim_telegram_update') {
      return { data: [{ should_process: true, state: 'processing', attempt_count: 1 }], error: null };
    }
    if (name === 'persist_telegram_inbound') {
      return {
        data: [{
          conversation_id: CONVERSATION_ID,
          mode: lifecycle.mode,
          nia_context: lifecycle.context,
          message_id: `44444444-4444-4444-8444-${String(Number(args.p_update_id)).padStart(12, '0')}`,
        }],
        error: null,
      };
    }
    if (name === 'claim_telegram_ai_reply') {
      if (lifecycle.mode !== 'AI_ACTIVE' || lifecycle.assignedStaffId) {
        return { data: [], error: null };
      }
      lifecycle.context = args.p_context;
      lifecycle.aiReplies.push(String(args.p_content));
      return { data: [dispatchClaim()], error: null };
    }
    if (name === 'claim_telegram_handoff_reply') {
      lifecycle.mode = 'HUMAN_ACTIVE';
      lifecycle.queuedHandoffNotifications = 1;
      return { data: [dispatchClaim()], error: null };
    }
    if (name === 'claim_telegram_staff_reply') {
      if (lifecycle.mode !== 'HUMAN_ACTIVE' || lifecycle.assignedStaffId !== STAFF_ID) {
        return { data: null, error: { code: '42501' } };
      }
      return { data: [dispatchClaim()], error: null };
    }
    if (name === 'return_to_ai') {
      lifecycle.mode = 'AI_ACTIVE';
      lifecycle.assignedStaffId = null;
      lifecycle.queuedHandoffNotifications = 0;
      return {
        data: {
          id: CONVERSATION_ID,
          mode: lifecycle.mode,
          assigned_staff_id: lifecycle.assignedStaffId,
        },
        error: null,
      };
    }
    if (name === 'finish_telegram_dispatch' || name === 'complete_telegram_update') {
      return { data: [], error: null };
    }
    throw new Error(`Unexpected RPC in lifecycle test: ${name}`);
  });

  mocks.from.mockImplementation((table: string) => {
    let update: Record<string, unknown> | null = null;
    const query = {
      update: (values: Record<string, unknown>) => {
        update = values;
        return query;
      },
      select: () => query,
      eq: () => query,
      neq: () => query,
      maybeSingle: async () => {
        if (table !== 'conversations') {
          throw new Error(`Unexpected table in lifecycle test: ${table}`);
        }
        if (update) {
          lifecycle.mode = update.mode === 'HUMAN_ACTIVE' ? 'HUMAN_ACTIVE' : lifecycle.mode;
          lifecycle.assignedStaffId = typeof update.assigned_staff_id === 'string'
            ? update.assigned_staff_id
            : lifecycle.assignedStaffId;
          return {
            data: {
              id: CONVERSATION_ID,
              channel: 'telegram',
              mode: lifecycle.mode,
              assigned_staff_id: lifecycle.assignedStaffId,
            },
            error: null,
          };
        }
        return { data: { channel: 'telegram' }, error: null };
      },
    };
    return query;
  });
  mocks.requireStaff.mockResolvedValue({
    context: {
      client: { rpc: mocks.rpc, from: mocks.from },
      userId: STAFF_ID,
      role: 'Customer Care',
    },
    response: null,
  });

  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'api.telegram.org') {
      const body = input instanceof Request
        ? await input.clone().text()
        : String(init?.body ?? '{}');
      const outgoing = JSON.parse(body) as { text?: string };
      lifecycle.outboundMessages.push(outgoing.text || '');
      return new Response(JSON.stringify({
        ok: true,
        result: { message_id: 9000 + lifecycle.outboundMessages.length },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.hostname === 'supabase.example.test' && url.pathname === '/rest/v1/public_properties') {
      lifecycle.propertySearchRequests += 1;
      return new Response(JSON.stringify([{
        id: 'public-property-1',
        title: 'Synthetic published apartment',
        price_ngn: 5_000_000,
        price_period: 'yearly',
        currency: 'NGN',
        state: 'Edo',
        city: 'Benin City',
        location: 'GRA',
        neighborhood: 'GRA',
        rent_annual: 5_000_000,
      }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': '0-0/1',
        },
      });
    }
    throw new Error(`Unexpected external request in lifecycle test: ${url.hostname}${url.pathname}`);
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Telegram context recall through handoff and return to AI', () => {
  it('preserves search criteria through staff ownership and recalls them without another listing query', async () => {
    const searchResponse = await telegramWebhook(webhookRequest(
      8822101,
      'I need a two-bedroom apartment in GRA.',
    ));
    expect(searchResponse.status).toBe(200);
    expect(lifecycle.context).toEqual({
      preferences: {
        bedrooms: 2,
        location: 'GRA',
        propertyType: 'apartment',
        keywords: [],
      },
      recentPropertyIds: ['public-property-1'],
      selectedPropertyId: null,
    });
    expect(lifecycle.propertySearchRequests).toBe(1);

    const handoffResponse = await telegramWebhook(webhookRequest(
      8822102,
      'Please connect me to a human agent.',
    ));
    expect(handoffResponse.status).toBe(200);
    expect(lifecycle.mode).toBe('HUMAN_ACTIVE');
    expect(lifecycle.queuedHandoffNotifications).toBe(1);
    expect(lifecycle.context).toMatchObject({
      preferences: { bedrooms: 2, location: 'GRA', propertyType: 'apartment', keywords: [] },
    });

    const takeover = await updateConversation(staffRequest(
      `/api/staff/conversations/${CONVERSATION_ID}`,
      { action: 'takeover' },
    ), conversationParams());
    expect(takeover.status).toBe(200);
    expect(lifecycle.assignedStaffId).toBe(STAFF_ID);

    const staffReply = await sendStaffReply(staffRequest(
      `/api/staff/conversations/${CONVERSATION_ID}/messages`,
      { content: 'A Nestly teammate is here to help.' },
      'synthetic-context-cycle-staff-reply-01',
    ), conversationParams());
    expect(staffReply.status).toBe(201);
    expect(lifecycle.outboundMessages).toContain('A Nestly teammate is here to help.');
    expect(lifecycle.context).toMatchObject({
      preferences: { bedrooms: 2, location: 'GRA', propertyType: 'apartment', keywords: [] },
    });

    const resume = await updateConversation(staffRequest(
      `/api/staff/conversations/${CONVERSATION_ID}`,
      { action: 'return_to_ai' },
    ), conversationParams());
    expect(resume.status).toBe(200);
    expect(await resume.json()).toMatchObject({
      data: { mode: 'AI_ACTIVE', assignedStaffId: null },
    });
    expect(lifecycle.assignedStaffId).toBeNull();
    expect(lifecycle.queuedHandoffNotifications).toBe(0);
    const preferencesBeforeRecall = structuredClone(lifecycle.context);

    const recallResponse = await telegramWebhook(webhookRequest(
      8822103,
      'What were my property preferences?',
    ));
    expect(recallResponse.status).toBe(200);
    expect(lifecycle.aiReplies.at(-1)).toContain('2 bedrooms, in GRA, apartment');
    expect(lifecycle.context).toEqual(preferencesBeforeRecall);
    expect(lifecycle.propertySearchRequests).toBe(1);
  });
});
