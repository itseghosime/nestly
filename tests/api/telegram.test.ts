import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  answerNiaConversationMessage: vi.fn(),
  createAdminClient: vi.fn(),
  adminRpc: vi.fn(),
  createPublicClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createPublicClient,
}));
vi.mock('@/lib/backend/nia-conversation-response', () => ({
  answerNiaConversationMessage: mocks.answerNiaConversationMessage,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from '@/app/api/telegram/webhook/route';
import {
  getTelegramBotId,
  getTelegramServerSettings,
  isTelegramWebhookSecretValid,
  parseTelegramUpdate,
  readBoundedWebhookBody,
  formatTelegramPropertySearchReply,
  sendTelegramText,
} from '@/lib/backend/telegram';

const BOT_TOKEN = `123456789:${'A'.repeat(35)}`;
const WEBHOOK_SECRET = 'synthetic-telegram-webhook-secret-000000000000';
const SITE_URL = 'https://nestly.example.test';
const MESSAGE_CONTENT = 'Synthetic Telegram query about a property fee';
const BOT_ID = 123456789;
const UPDATE_ID = 8822001;

function makeUpdate(overrides: Record<string, unknown> = {}) {
  return {
    update_id: UPDATE_ID,
    message: {
      message_id: 52,
      from: {
        id: 44556677,
        is_bot: false,
        first_name: 'Synthetic',
        last_name: 'Customer',
        username: 'synthetic_customer',
      },
      chat: { id: 44556677, type: 'private' },
      text: MESSAGE_CONTENT,
    },
    ...overrides,
  };
}

function webhookRequest(payload: unknown, secret = WEBHOOK_SECRET) {
  return new Request('https://nestly.example.test/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret,
    },
    body: JSON.stringify(payload),
  });
}

function claimRow(overrides: Record<string, unknown> = {}) {
  return { should_process: true, state: 'processing', attempt_count: 1, ...overrides };
}

function persistedRow(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: '11111111-1111-4111-8111-111111111111',
    mode: 'AI_ACTIVE',
    nia_context: { preferences: null, recentPropertyIds: [], selectedPropertyId: null },
    message_id: '22222222-2222-4222-8222-222222222222',
    ...overrides,
  };
}

function dispatchRow(overrides: Record<string, unknown> = {}) {
  return {
    message_id: '33333333-3333-4333-8333-333333333333',
    chat_id: 44556677,
    dispatch_status: 'dispatching',
    delivery_status: 'queued',
    created_at: '2026-10-19T12:00:00.000Z',
    should_dispatch: true,
    ...overrides,
  };
}

function acceptedProviderResponse(messageId = 9001) {
  return new Response(JSON.stringify({
    ok: true,
    result: { message_id: messageId },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function setTelegramEnvironment(outbound = 'true') {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.stubEnv('TELEGRAM_OUTBOUND_ENABLED', outbound);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-role');
}

beforeEach(() => {
  vi.clearAllMocks();
  setTelegramEnvironment();
  mocks.createPublicClient.mockReturnValue({});
  mocks.answerNiaConversationMessage.mockResolvedValue({
    message: 'The confirmed annual service fee is NGN 5,000 (synthetic test answer).',
    properties: [],
    context: { preferences: null, recentPropertyIds: [], selectedPropertyId: null },
  });
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc });
  mocks.adminRpc.mockImplementation(async (name: string) => {
    if (name === 'claim_telegram_update') return { data: [claimRow()], error: null };
    if (name === 'persist_telegram_inbound') return { data: [persistedRow()], error: null };
    if (name === 'claim_telegram_ai_reply') return { data: [dispatchRow()], error: null };
    if (name === 'claim_telegram_handoff_reply') return { data: [dispatchRow()], error: null };
    return { data: [{ message_id: '33333333-3333-4333-8333-333333333333' }], error: null };
  });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(acceptedProviderResponse()));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Telegram settings and parser', () => {
  it('keeps token and outbound state server-only with sending off by default', () => {
    const settings = getTelegramServerSettings({
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    } as NodeJS.ProcessEnv);
    expect(settings.botId).toBe(BOT_ID);
    expect(settings.configured).toBe(true);
    expect(settings.outboundEnabled).toBe(false);
    expect(settings.token).toBe(BOT_TOKEN);
  });

  it('validates secret-header values without accepting missing or mismatched secrets', () => {
    expect(isTelegramWebhookSecretValid(WEBHOOK_SECRET, WEBHOOK_SECRET)).toBe(true);
    expect(isTelegramWebhookSecretValid(null, WEBHOOK_SECRET)).toBe(false);
    expect(isTelegramWebhookSecretValid('wrong-secret', WEBHOOK_SECRET)).toBe(false);
  });

  it('accepts only private text chats with a matching user and chat identity', () => {
    expect(parseTelegramUpdate(makeUpdate()).kind).toBe('private_message');
    expect(parseTelegramUpdate(makeUpdate({
      message: {
        ...((makeUpdate() as { message: Record<string, unknown> }).message),
        chat: { id: 99887766, type: 'private' },
      },
    })).kind).toBe('invalid');
    expect(parseTelegramUpdate(makeUpdate({
      message: {
        ...((makeUpdate() as { message: Record<string, unknown> }).message),
        chat: { id: -123, type: 'group' },
      },
    })).kind).toBe('unsupported');
    expect(parseTelegramUpdate({ update_id: UPDATE_ID, callback_query: {} }))
      .toEqual({ kind: 'unsupported', updateId: UPDATE_ID });
  });

  it('rejects invalid bot tokens and oversized or invalid UTF-8 request bodies', async () => {
    expect(getTelegramBotId('not-a-bot-token')).toBeNull();
    const tooLarge = new Request('https://local.test', {
      method: 'POST',
      body: '12345',
      headers: { 'Content-Length': '5000' },
    });
    expect(await readBoundedWebhookBody(tooLarge, 100)).toBeNull();
    const invalidUtf8 = new Request('https://local.test', {
      method: 'POST',
      body: new Uint8Array([0xff, 0xfe]),
    });
    expect(await readBoundedWebhookBody(invalidUtf8)).toBeNull();
  });

  it('formats grounded property results as numbered public links within Telegram’s text limit', () => {
    const reply = formatTelegramPropertySearchReply(1, [{
      id: 'public-property-1',
      title: 'Synthetic published apartment',
      location: 'GRA, Benin City',
      priceLabel: '₦5,000,000/year',
    }], SITE_URL);

    expect(reply).toContain('1. Synthetic published apartment');
    expect(reply).toContain('Location: GRA, Benin City');
    expect(reply).toContain('Rent: ₦5,000,000/year');
    expect(reply).toContain('Link: https://nestly.example.test/property/public-property-1');

    const oversized = formatTelegramPropertySearchReply(12, Array.from({ length: 12 }, (_, index) => ({
      id: `public-property-${index + 1}`,
      title: 'Synthetic title '.repeat(40),
      location: 'Synthetic location '.repeat(20),
      priceLabel: '₦5,000,000/year '.repeat(20),
    })), SITE_URL);
    expect(oversized.length).toBeLessThanOrEqual(4096);
    expect(oversized).toContain('Link: https://nestly.example.test/property/public-property-1');
  });

  it('uses the sendMessage API and classifies acceptance, rejection, and uncertain timeout honestly', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(acceptedProviderResponse(177))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        error_code: 403,
        description: 'synthetic rejection',
      }), { status: 403 }))
      .mockRejectedValueOnce(new Error('synthetic network timeout'));

    const accepted = await sendTelegramText(BOT_TOKEN, 44556677, 'Synthetic outgoing message', fetcher);
    expect(accepted).toEqual({ outcome: 'accepted', telegramMessageId: 177 });
    const [requestUrl, requestInit] = fetcher.mock.calls[0]!;
    expect(String(requestUrl)).toContain('/sendMessage');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      chat_id: 44556677,
      text: 'Synthetic outgoing message',
    });
    expect(await sendTelegramText(BOT_TOKEN, 44556677, 'Synthetic retry', fetcher))
      .toEqual({ outcome: 'rejected', errorCode: 'TELEGRAM_API_403' });
    expect(await sendTelegramText(BOT_TOKEN, 44556677, 'Synthetic timeout', fetcher))
      .toEqual({ outcome: 'unknown', errorCode: 'NETWORK_OUTCOME_UNKNOWN' });
  });
});

describe('Telegram webhook', () => {
  it('rejects invalid secret headers before database access or provider calls', async () => {
    const response = await POST(webhookRequest(makeUpdate(), 'wrong-secret'));
    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records unsupported updates without creating a customer conversation', async () => {
    const response = await POST(webhookRequest({
      update_id: UPDATE_ID,
      callback_query: { id: 'synthetic-callback' },
    }));
    expect(response.status).toBe(200);
    expect(mocks.adminRpc.mock.calls.map(([name]) => name)).toEqual([
      'claim_telegram_update',
      'complete_telegram_update',
    ]);
    expect(mocks.adminRpc).toHaveBeenCalledWith('complete_telegram_update', expect.objectContaining({
      p_state: 'ignored',
    }));
    expect(mocks.answerNiaConversationMessage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'completed',
    'ignored',
    'human_owned',
    'dispatching',
    'rejected',
    'unknown',
    'failed',
  ])('acknowledges durable %s updates without resending', async (state) => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: [claimRow({ should_process: false, state })],
      error: null,
    });
    const response = await POST(webhookRequest(makeUpdate()));
    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.answerNiaConversationMessage).not.toHaveBeenCalled();
  });

  it('serializes concurrent duplicate updates so only one response is sent', async () => {
    let claimed = false;
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_telegram_update') {
        if (claimed) return { data: [claimRow({ should_process: false, state: 'processing' })], error: null };
        claimed = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { data: [claimRow()], error: null };
      }
      if (name === 'persist_telegram_inbound') return { data: [persistedRow()], error: null };
      if (name === 'claim_telegram_ai_reply') return { data: [dispatchRow()], error: null };
      return { data: [], error: null };
    });

    const responses = await Promise.all([
      POST(webhookRequest(makeUpdate())),
      POST(webhookRequest(makeUpdate())),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 503]);
    expect(await responses[1]!.json()).toEqual({
      error: 'Telegram update is still being processed',
    });
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'persist_telegram_inbound')).toHaveLength(1);
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'claim_telegram_ai_reply')).toHaveLength(1);
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'finish_telegram_dispatch')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('resumes redelivery when a prior processing lease has expired', async () => {
    let claimAttempts = 0;
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_telegram_update') {
        claimAttempts += 1;
        if (claimAttempts === 1) {
          return { data: [claimRow({ should_process: false, state: 'processing' })], error: null };
        }
        return { data: [claimRow({ attempt_count: 2 })], error: null };
      }
      if (name === 'persist_telegram_inbound') return { data: [persistedRow()], error: null };
      if (name === 'claim_telegram_ai_reply') return { data: [dispatchRow()], error: null };
      return { data: [{ message_id: dispatchRow().message_id }], error: null };
    });

    const crashedWorkerResponse = await POST(webhookRequest(makeUpdate()));
    expect(crashedWorkerResponse.status).toBe(503);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();

    const redeliveryResponse = await POST(webhookRequest(makeUpdate()));
    expect(redeliveryResponse.status).toBe(200);
    expect(claimAttempts).toBe(2);
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'persist_telegram_inbound')).toHaveLength(1);
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'claim_telegram_ai_reply')).toHaveLength(1);
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'finish_telegram_dispatch')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('persists separate private identities and grounds fee answers in the saved Nia context', async () => {
    const persisted: Array<{ p_telegram_user_id: number; p_chat_id: number }> = [];
    mocks.adminRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_telegram_update') return { data: [claimRow()], error: null };
      if (name === 'persist_telegram_inbound') {
        persisted.push({
          p_telegram_user_id: Number(args.p_telegram_user_id),
          p_chat_id: Number(args.p_chat_id),
        });
        return { data: [persistedRow({ conversation_id: `${persisted.length}`.padStart(8, '0') + '-1111-4111-8111-111111111111' })], error: null };
      }
      if (name === 'claim_telegram_ai_reply') return { data: [dispatchRow({ chat_id: Number(persisted.at(-1)?.p_chat_id) })], error: null };
      return { data: [], error: null };
    });

    const first = makeUpdate();
    const second = makeUpdate({
      update_id: UPDATE_ID + 1,
      message: {
        message_id: 53,
        from: { id: 77889900, is_bot: false, first_name: 'Other', username: 'synthetic_customer' },
        chat: { id: 77889900, type: 'private' },
        text: 'What is the fee for the first listing?',
      },
    });
    expect((await POST(webhookRequest(first))).status).toBe(200);
    expect((await POST(webhookRequest(second))).status).toBe(200);
    expect(persisted).toEqual([
      { p_telegram_user_id: 44556677, p_chat_id: 44556677 },
      { p_telegram_user_id: 77889900, p_chat_id: 77889900 },
    ]);
    expect(mocks.answerNiaConversationMessage).toHaveBeenCalledWith(
      expect.anything(),
      'What is the fee for the first listing?',
      persistedRow().nia_context,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('silences Nia after takeover and rechecks ownership immediately before dispatch', async () => {
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_telegram_update') return { data: [claimRow()], error: null };
      if (name === 'persist_telegram_inbound') {
        return { data: [persistedRow({ mode: 'HUMAN_ACTIVE' })], error: null };
      }
      return { data: [], error: null };
    });
    const humanResponse = await POST(webhookRequest(makeUpdate()));
    expect(humanResponse.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('complete_telegram_update', expect.objectContaining({
      p_state: 'human_owned',
    }));
    expect(mocks.answerNiaConversationMessage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    vi.clearAllMocks();
    setTelegramEnvironment();
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc });
    mocks.answerNiaConversationMessage.mockResolvedValue({
      message: 'Suppressed synthetic answer',
      properties: [],
      context: { preferences: null, recentPropertyIds: [], selectedPropertyId: null },
    });
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_telegram_update') return { data: [claimRow()], error: null };
      if (name === 'persist_telegram_inbound') return { data: [persistedRow()], error: null };
      if (name === 'claim_telegram_ai_reply') return { data: [], error: null };
      return { data: [], error: null };
    });
    const racedResponse = await POST(webhookRequest(makeUpdate()));
    expect(racedResponse.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('claim_telegram_ai_reply', expect.anything());
    expect(mocks.adminRpc).toHaveBeenCalledWith('complete_telegram_update', expect.objectContaining({
      p_state: 'human_owned',
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('persists and sends grounded numbered listing details for a property search', async () => {
    mocks.answerNiaConversationMessage.mockResolvedValue({
      message: 'I found 1 current published listing matching those details.',
      searchResultCount: 1,
      properties: [{
        id: 'public-property-1',
        title: 'Synthetic published apartment',
        location: 'GRA, Benin City',
        priceLabel: '₦5,000,000/year',
        staff_notes: 'Private synthetic staff note',
      }],
      context: { preferences: null, recentPropertyIds: ['public-property-1'], selectedPropertyId: null },
    });

    const response = await POST(webhookRequest(makeUpdate()));
    expect(response.status).toBe(200);

    const claim = mocks.adminRpc.mock.calls.find(([name]) => name === 'claim_telegram_ai_reply');
    const savedContent = String(claim?.[1]?.p_content);
    expect(savedContent).toContain('1. Synthetic published apartment');
    expect(savedContent).toContain('Location: GRA, Benin City');
    expect(savedContent).toContain('Rent: ₦5,000,000/year');
    expect(savedContent).toContain('https://nestly.example.test/property/public-property-1');
    expect(savedContent).not.toContain('Private synthetic staff note');

    const sendCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes('/sendMessage'));
    expect(JSON.parse(String(sendCall?.[1]?.body))).toEqual({
      chat_id: 44556677,
      text: savedContent,
    });
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === 'claim_telegram_ai_reply')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('records handoff without running Nia', async () => {
    const update = makeUpdate({
      message: {
        message_id: 54,
        from: { id: 44556677, is_bot: false, first_name: 'Synthetic' },
        chat: { id: 44556677, type: 'private' },
        text: 'Please let me speak to a human agent',
      },
    });
    const response = await POST(webhookRequest(update));
    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('claim_telegram_handoff_reply', expect.anything());
    expect(mocks.answerNiaConversationMessage).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not resend a timed-out dispatch when the same update is replayed', async () => {
    let claimed = false;
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_telegram_update') {
        if (claimed) return { data: [claimRow({ should_process: false, state: 'unknown' })], error: null };
        claimed = true;
        return { data: [claimRow()], error: null };
      }
      if (name === 'persist_telegram_inbound') return { data: [persistedRow()], error: null };
      if (name === 'claim_telegram_ai_reply') return { data: [dispatchRow()], error: null };
      return { data: [], error: null };
    });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic timeout')));

    expect((await POST(webhookRequest(makeUpdate()))).status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('finish_telegram_dispatch', expect.objectContaining({
      p_outcome: 'unknown',
      p_error_code: 'NETWORK_OUTCOME_UNKNOWN',
    }));
    expect((await POST(webhookRequest(makeUpdate()))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps staff and AI sends disabled when the deployment flag is absent', async () => {
    setTelegramEnvironment('');
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_telegram_update') return { data: [claimRow()], error: null };
      if (name === 'persist_telegram_inbound') return { data: [persistedRow()], error: null };
      return { data: [], error: null };
    });
    const response = await POST(webhookRequest(makeUpdate()));
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.answerNiaConversationMessage).not.toHaveBeenCalled();
    expect(mocks.adminRpc).toHaveBeenCalledWith('complete_telegram_update', expect.objectContaining({
      p_state: 'failed',
      p_error_code: 'OUTBOUND_DISABLED',
    }));
  });
});
