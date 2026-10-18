import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn();
  const messagesFetch = vi.fn();
  const messagesResource = Object.assign(
    vi.fn(() => ({ fetch: messagesFetch })),
    { create: messagesCreate },
  );
  const validateRequest = vi.fn();
  const twilioFactory = Object.assign(
    vi.fn(() => ({ messages: messagesResource })),
    { validateRequest },
  );
  return {
    messagesCreate,
    messagesFetch,
    messagesResource,
    validateRequest,
    twilioFactory,
    requireStaff: vi.fn(),
    createAdminClient: vi.fn(),
  };
});

vi.mock('twilio', () => ({ default: mocks.twilioFactory }));
vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import {
  GET as getConversation,
} from '@/app/api/staff/conversations/[id]/route';
import { POST as postStaffReply } from '@/app/api/staff/conversations/[id]/messages/route';
import { POST as postReconciliation } from '@/app/api/staff/conversations/[id]/reconcile/route';
import { POST as postStatusCallback } from '@/app/api/twilio/whatsapp/status/route';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_SID = `AC${'1'.repeat(32)}`;
const AUTH_TOKEN = 'synthetic-only-auth-token';
const SERVICE_ROLE = 'synthetic-only-service-role-key';
const CALLBACK_BASE = 'https://nestly.example.test/api/twilio/whatsapp/status';
const SITE_URL = 'https://nestly.example.test';
const CONTENT = 'Synthetic staff reply; never sent externally';
const IDEMPOTENCY_KEY = 'synthetic-staff-reply-0001';
const PROVIDER_SID = `SM${'2'.repeat(32)}`;
const STALE_CREATED_AT = '2025-01-01T12:00:00.000Z';

const staffRpc = vi.fn();
const adminRpc = vi.fn();
const conversationQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
const staffClient = {
  rpc: staffRpc,
  from: vi.fn(),
};

function setTwilioEnvironment() {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE);
  vi.stubEnv('TWILIO_OUTBOUND_ENABLED', 'true');
  vi.stubEnv('TWILIO_ACCOUNT_SID', ACCOUNT_SID);
  vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
  vi.stubEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886');
  vi.stubEnv('TWILIO_STATUS_CALLBACK_URL', CALLBACK_BASE);
}

function setConversationChannel(channel: 'website' | 'whatsapp') {
  conversationQuery.select.mockReturnValue(conversationQuery);
  conversationQuery.eq.mockReturnValue(conversationQuery);
  conversationQuery.maybeSingle.mockResolvedValue({
    data: { channel },
    error: null,
  });
  staffClient.from.mockReturnValue(conversationQuery);
}

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    message_id: MESSAGE_ID,
    recipient: 'whatsapp:+15550000001',
    dispatch_status: 'dispatching',
    delivery_status: 'queued',
    created_at: '2026-10-19T12:00:00.000Z',
    should_dispatch: true,
    ...overrides,
  };
}

function recordedRow(overrides: Record<string, unknown> = {}) {
  return {
    message_id: MESSAGE_ID,
    dispatch_status: 'accepted',
    delivery_status: 'queued',
    ...overrides,
  };
}

function staffRequest(idempotencyKey = IDEMPOTENCY_KEY) {
  return new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}/messages`, {
    method: 'POST',
    headers: {
      Origin: SITE_URL,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ content: CONTENT }),
  });
}

function callbackRequest(
  body: URLSearchParams,
  query = `message_id=${MESSAGE_ID}`,
  pathname = '/api/twilio/whatsapp/status',
  includeSignature = true,
) {
  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  if (includeSignature) headers.set('X-Twilio-Signature', 'synthetic-signature');
  return new Request(`https://proxy-mismatch.example${pathname}?${query}`, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
}

function callbackBody(status = 'delivered') {
  return new URLSearchParams({
    AccountSid: ACCOUNT_SID,
    MessageSid: PROVIDER_SID,
    MessageStatus: status,
    ErrorCode: '',
  });
}

function staffRouteParams() {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

function reconciliationRequest(body: Record<string, unknown>) {
  return new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}/reconcile`, {
    method: 'POST',
    headers: {
      Origin: SITE_URL,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function reconciliationConversationQuery() {
  return queryFor({
    data: {
      id: CONVERSATION_ID,
      channel: 'whatsapp',
      customer: { whatsapp_phone: '+15550000001' },
    },
    error: null,
  });
}

function reconciliationMessageQuery(overrides: Record<string, unknown> = {}) {
  return queryFor({
    data: {
      id: MESSAGE_ID,
      direction: 'outbound',
      sender_type: 'agent',
      content: CONTENT,
      dispatch_status: 'unknown',
      dispatch_updated_at: STALE_CREATED_AT,
      provider_message_id: null,
      created_at: STALE_CREATED_AT,
      ...overrides,
    },
    error: null,
  });
}

function setReconciliationQueries(messageOverrides: Record<string, unknown> = {}) {
  const conversation = reconciliationConversationQuery();
  const message = reconciliationMessageQuery(messageOverrides);
  staffClient.from.mockImplementation((table: string) => (
    table === 'conversations' ? conversation : message
  ));
}

function queryFor(result: { data: unknown; error: { code: string } | null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  query.limit.mockImplementation(() => Promise.resolve(result));
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  setTwilioEnvironment();
  mocks.requireStaff.mockResolvedValue({
    context: { client: staffClient, userId: STAFF_ID, role: 'Platform Admin' },
    response: null,
  });
  mocks.createAdminClient.mockReturnValue({ rpc: adminRpc });
  staffRpc.mockResolvedValue({ data: [claimRow()], error: null });
  adminRpc.mockResolvedValue({ data: [recordedRow()], error: null });
  mocks.messagesCreate.mockResolvedValue({ sid: PROVIDER_SID, status: 'queued' });
  mocks.messagesFetch.mockResolvedValue({
    sid: PROVIDER_SID,
    accountSid: ACCOUNT_SID,
    direction: 'outbound-api',
    body: CONTENT,
    from: 'whatsapp:+14155238886',
    to: 'whatsapp:+15550000001',
    status: 'delivered',
    dateCreated: new Date(STALE_CREATED_AT),
    errorCode: null,
  });
  mocks.validateRequest.mockReturnValue(true);
  setConversationChannel('whatsapp');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('staff conversation replies', () => {
  it('keeps linked conversation reads working when the additive tracking migration is not present', async () => {
    const conversationData = {
      id: CONVERSATION_ID,
      channel: 'whatsapp',
      mode: 'HUMAN_ACTIVE',
      current_property_id: null,
      assigned_staff_id: STAFF_ID,
      created_at: '2026-10-19T11:00:00.000Z',
      updated_at: '2026-10-19T12:00:00.000Z',
      customer: {
        display_name: 'Synthetic Customer',
        email: null,
        phone: null,
        whatsapp_phone: 'whatsapp:+15550000001',
      },
      property: null,
    };
    const conversationQuery = queryFor({ data: conversationData, error: null });
    const missingDispatchQuery = queryFor({ data: null, error: { code: '42703' } });
    const legacyMessagesQuery = queryFor({
      data: [{
        id: MESSAGE_ID,
        direction: 'outbound',
        sender_type: 'agent',
        content: CONTENT,
        message_type: 'text',
        delivery_status: 'queued',
        created_at: '2026-10-19T12:00:00.000Z',
      }],
      error: null,
    });
    const profileQuery = queryFor({ data: { display_name: 'Synthetic Staff' }, error: null });
    let messageQueryCount = 0;
    staffClient.from.mockImplementation((table: string) => {
      if (table === 'conversations') return conversationQuery;
      if (table === 'profiles') return profileQuery;
      messageQueryCount += 1;
      return messageQueryCount === 1 ? missingDispatchQuery : legacyMessagesQuery;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await getConversation(new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}`), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.whatsappDispatchAvailable).toBe(false);
    expect(result.data.canSendWhatsApp).toBe(false);
    expect(result.data.messages[0].dispatch_status).toBe('not_applicable');
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(CONTENT);
  });

  it('enables the WhatsApp composer only for assigned staff after takeover and explicit opt-in', async () => {
    const conversationData = {
      id: CONVERSATION_ID,
      channel: 'whatsapp',
      mode: 'HUMAN_ACTIVE',
      current_property_id: null,
      assigned_staff_id: STAFF_ID,
      created_at: '2026-10-19T11:00:00.000Z',
      updated_at: '2026-10-19T12:00:00.000Z',
      customer: { display_name: 'Synthetic Customer', email: null, phone: null, whatsapp_phone: 'whatsapp:+15550000001' },
      property: null,
    };
    const conversationQuery = queryFor({ data: conversationData, error: null });
    const messagesQuery = queryFor({
      data: [{
        id: MESSAGE_ID,
        direction: 'outbound',
        sender_type: 'agent',
        content: CONTENT,
        message_type: 'text',
        delivery_status: 'queued',
        dispatch_status: 'unknown',
        dispatch_error_code: null,
        created_at: '2026-10-19T12:00:00.000Z',
      }],
      error: null,
    });
    const profileQuery = queryFor({ data: { display_name: 'Synthetic Staff' }, error: null });
    staffClient.from.mockImplementation((table: string) => (
      table === 'conversations'
        ? conversationQuery
        : table === 'profiles'
          ? profileQuery
          : messagesQuery
    ));

    const response = await getConversation(new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}`), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.data.whatsappDispatchAvailable).toBe(true);
    expect(result.data.whatsappOutboundEnabled).toBe(true);
    expect(result.data.canSendWhatsApp).toBe(true);
    expect(result.data.messages[0].dispatch_status).toBe('unknown');

    vi.stubEnv('TWILIO_OUTBOUND_ENABLED', 'false');
    const disabledResponse = await getConversation(
      new Request(`${SITE_URL}/api/staff/conversations/${CONVERSATION_ID}`),
      staffRouteParams(),
    );
    const disabledResult = await disabledResponse.json();
    expect(disabledResult.data.whatsappDispatchAvailable).toBe(true);
    expect(disabledResult.data.whatsappOutboundEnabled).toBe(false);
    expect(disabledResult.data.canSendWhatsApp).toBe(false);
  });

  it('keeps staff-initiated WhatsApp sending disabled unless explicitly enabled', async () => {
    vi.stubEnv('TWILIO_OUTBOUND_ENABLED', 'false');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await postStaffReply(staffRequest(), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(503);
    expect(result.error).toContain('not configured');
    expect(staffRpc).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
    expect(mocks.messagesCreate).not.toHaveBeenCalled();

    delete process.env.TWILIO_OUTBOUND_ENABLED;
    const missingFlagResponse = await postStaffReply(staffRequest(), staffRouteParams());
    expect(missingFlagResponse.status).toBe(503);
    expect(staffRpc).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(AUTH_TOKEN);
  });

  it('preserves website replies and never calls Twilio for website conversations', async () => {
    setConversationChannel('website');
    staffRpc.mockResolvedValue({
      data: [{ message_id: MESSAGE_ID, created_at: '2026-10-19T12:00:00.000Z' }],
      error: null,
    });

    const response = await postStaffReply(staffRequest(), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.data.delivery_status).toBe('queued');
    expect(result.data.dispatch_status).toBe('not_applicable');
    expect(staffRpc).toHaveBeenCalledWith('send_website_staff_reply', {
      p_conversation_id: CONVERSATION_ID,
      p_content: CONTENT,
      p_idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('requires the database to authorize a human takeover before any provider request', async () => {
    staffRpc.mockResolvedValue({ data: null, error: { code: '22023' } });

    const response = await postStaffReply(staffRequest(), staffRouteParams());

    expect(response.status).toBe(409);
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('sends plain text in Body without template fields and preserves the status callback', async () => {
    staffRpc.mockResolvedValue({ data: [claimRow()], error: null });
    adminRpc.mockResolvedValue({ data: [recordedRow()], error: null });

    const response = await postStaffReply(staffRequest(), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1);
    expect(mocks.messagesCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+15550000001',
      body: CONTENT,
      statusCallback: `${CALLBACK_BASE}?message_id=${MESSAGE_ID}`,
    });
    const sendPayload = mocks.messagesCreate.mock.calls[0]?.[0];
    expect(sendPayload).toHaveProperty('body', CONTENT);
    expect(sendPayload).not.toHaveProperty('contentVariables');
    expect(sendPayload).not.toHaveProperty('contentSid');
    expect(sendPayload).not.toHaveProperty('ContentVariables');
    expect(sendPayload).not.toHaveProperty('ContentSid');
    expect(adminRpc).toHaveBeenCalledWith('finish_twilio_staff_reply', {
      p_message_id: MESSAGE_ID,
      p_outcome: 'accepted',
      p_provider_message_id: PROVIDER_SID,
      p_provider_status: 'queued',
      p_error_code: null,
    });
    expect(result.data.delivery_status).toBe('queued');
    expect(result.notice).toContain('not confirmed');
  });

  it('does not resend an idempotent accepted request', async () => {
    staffRpc.mockResolvedValue({
      data: [claimRow({
        recipient: null,
        dispatch_status: 'accepted',
        should_dispatch: false,
      })],
      error: null,
    });

    const response = await postStaffReply(staffRequest(), staffRouteParams());

    expect(response.status).toBe(200);
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('logs sanitized diagnostics for a definitive rejection and permits only an explicit new attempt', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.messagesCreate.mockRejectedValue(Object.assign(new Error([
      CONTENT,
      'whatsapp:+15550000001',
      AUTH_TOKEN,
      ACCOUNT_SID,
      SERVICE_ROLE,
    ].join(' ')), {
      status: 400,
      code: 21654,
    }));
    adminRpc.mockResolvedValue({ data: [recordedRow({
      dispatch_status: 'failed',
      delivery_status: 'failed',
    })], error: null });

    const response = await postStaffReply(staffRequest(), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(502);
    expect(result.retryWithNewKey).toBe(true);
    expect(result.data.dispatch_status).toBe('failed');
    expect(errorSpy).toHaveBeenCalledWith('Twilio staff reply provider error', {
      httpStatus: 400,
      twilioErrorCode: '21654',
      redactedErrorMessage: 'Provider error message redacted',
      parameters: {
        Body: true,
        ContentSid: false,
        ContentVariables: false,
      },
    });
    const serializedLog = JSON.stringify(errorSpy.mock.calls);
    expect(serializedLog).not.toContain(CONTENT);
    expect(serializedLog).not.toContain('whatsapp:+15550000001');
    expect(serializedLog).not.toContain(AUTH_TOKEN);
    expect(serializedLog).not.toContain(ACCOUNT_SID);
    expect(serializedLog).not.toContain(SERVICE_ROLE);
    expect(adminRpc).toHaveBeenCalledWith('finish_twilio_staff_reply', expect.objectContaining({
      p_outcome: 'rejected',
      p_error_code: '21654',
    }));
  });

  it('marks network outcomes unknown and blocks retries with the same or a new request', async () => {
    mocks.messagesCreate.mockRejectedValue(new Error(CONTENT));
    adminRpc.mockResolvedValue({ data: [recordedRow({ dispatch_status: 'unknown' })], error: null });
    staffRpc
      .mockResolvedValueOnce({ data: [claimRow()], error: null })
      .mockResolvedValueOnce({
        data: [claimRow({
          recipient: null,
          dispatch_status: 'unknown',
          should_dispatch: false,
        })],
        error: null,
      });

    const first = await postStaffReply(staffRequest(), staffRouteParams());
    const firstBody = await first.json();
    const retry = await postStaffReply(staffRequest('synthetic-staff-reply-0002'), staffRouteParams());

    expect(first.status).toBe(202);
    expect(firstBody.data.dispatch_status).toBe('unknown');
    expect(retry.status).toBe(202);
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1);
    expect(adminRpc).toHaveBeenCalledTimes(1);
  });

  it('fails closed before claiming a reply when the status callback is not public HTTPS', async () => {
    vi.stubEnv('TWILIO_STATUS_CALLBACK_URL', 'http://localhost:3000/api/twilio/whatsapp/status');

    const response = await postStaffReply(staffRequest(), staffRouteParams());

    expect(response.status).toBe(503);
    expect(staffRpc).not.toHaveBeenCalled();
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });

  it('does not retry when Twilio accepted the request but durable tracking fails', async () => {
    adminRpc
      .mockResolvedValueOnce({ data: null, error: { code: '08006' } })
      .mockResolvedValueOnce({ data: null, error: { code: '08006' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await postStaffReply(staffRequest(), staffRouteParams());
    const result = await response.json();

    expect(response.status).toBe(202);
    expect(result.notice).toContain('Do not resend');
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(CONTENT);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(AUTH_TOKEN);
  });
});

describe('signed Twilio status callbacks', () => {
  it('rejects missing signatures without accessing the database', async () => {
    const response = await postStatusCallback(callbackRequest(callbackBody(), undefined, undefined, false));

    expect(response.status).toBe(403);
    expect(mocks.validateRequest).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid or tampered signatures before database access', async () => {
    mocks.validateRequest.mockReturnValue(false);

    const response = await postStatusCallback(callbackRequest(callbackBody()));

    expect(response.status).toBe(403);
    expect(mocks.validateRequest).toHaveBeenCalledTimes(1);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('rejects malformed status payloads and foreign account callbacks', async () => {
    const invalidBody = callbackBody('unknown');
    const invalidStatus = await postStatusCallback(callbackRequest(invalidBody));
    const wrongAccountBody = callbackBody();
    wrongAccountBody.set('AccountSid', `AC${'9'.repeat(32)}`);
    const wrongAccount = await postStatusCallback(callbackRequest(wrongAccountBody));

    expect(invalidStatus.status).toBe(400);
    expect(wrongAccount.status).toBe(400);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('validates against the configured callback URL and atomically applies the callback', async () => {
    const response = await postStatusCallback(callbackRequest(callbackBody('delivered')));

    expect(response.status).toBe(204);
    expect(mocks.validateRequest).toHaveBeenCalledWith(
      AUTH_TOKEN,
      'synthetic-signature',
      `${CALLBACK_BASE}?message_id=${MESSAGE_ID}`,
      expect.objectContaining({
        AccountSid: ACCOUNT_SID,
        MessageSid: PROVIDER_SID,
        MessageStatus: 'delivered',
      }),
    );
    expect(adminRpc).toHaveBeenCalledWith('apply_twilio_message_status', {
      p_message_id: MESSAGE_ID,
      p_provider_message_id: PROVIDER_SID,
      p_provider_status: 'delivered',
      p_error_code: null,
    });
  });

  describe('staff Twilio dispatch reconciliation', () => {
    it('verifies the exact provider record and records its status without sending again', async () => {
      staffRpc.mockResolvedValueOnce({ data: true, error: null });
      setReconciliationQueries();
      adminRpc.mockResolvedValueOnce({
        data: [{
          message_id: MESSAGE_ID,
          dispatch_status: 'accepted',
          delivery_status: 'delivered',
          disposition: 'reconciled',
        }],
        error: null,
      });

      const response = await postReconciliation(reconciliationRequest({
        messageId: MESSAGE_ID,
        providerMessageSid: PROVIDER_SID,
      }), staffRouteParams());
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.data.deliveryStatus).toBe('delivered');
      expect(result.notice).toContain('No message was resent');
      expect(mocks.messagesFetch).toHaveBeenCalledTimes(1);
      expect(mocks.messagesResource).toHaveBeenCalledWith(PROVIDER_SID);
      expect(adminRpc).toHaveBeenCalledWith('reconcile_twilio_staff_reply', expect.objectContaining({
        p_actor_id: STAFF_ID,
        p_message_id: MESSAGE_ID,
        p_provider_message_id: PROVIDER_SID,
        p_provider_status: 'delivered',
        p_provider_created_at: new Date(STALE_CREATED_AT).toISOString(),
      }));
      expect(mocks.messagesCreate).not.toHaveBeenCalled();
    });

    it('does not alter status when the provider record does not exactly match', async () => {
      staffRpc.mockResolvedValueOnce({ data: true, error: null });
      setReconciliationQueries();
      mocks.messagesFetch.mockResolvedValueOnce({
        sid: PROVIDER_SID,
        accountSid: ACCOUNT_SID,
        direction: 'outbound-api',
        body: 'different synthetic message',
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+15550000001',
        status: 'delivered',
        dateCreated: new Date(STALE_CREATED_AT),
        errorCode: null,
      });

      const response = await postReconciliation(reconciliationRequest({
        messageId: MESSAGE_ID,
        providerMessageSid: PROVIDER_SID,
      }), staffRouteParams());

      expect(response.status).toBe(409);
      expect(adminRpc).toHaveBeenCalledWith('record_twilio_reconciliation_attempt', expect.objectContaining({
        p_result: 'evidence_mismatch',
      }));
      expect(adminRpc).not.toHaveBeenCalledWith('reconcile_twilio_staff_reply', expect.anything());
      expect(mocks.messagesCreate).not.toHaveBeenCalled();
    });

    it('keeps the message unresolved when Twilio lookup fails and audits the attempt', async () => {
      staffRpc.mockResolvedValueOnce({ data: true, error: null });
      setReconciliationQueries();
      mocks.messagesFetch.mockRejectedValueOnce({ status: 404, code: 20404, message: 'Synthetic provider error' });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await postReconciliation(reconciliationRequest({
        messageId: MESSAGE_ID,
        providerMessageSid: PROVIDER_SID,
      }), staffRouteParams());
      const result = await response.json();

      expect(response.status).toBe(503);
      expect(result.error).toContain('do not resend');
      expect(adminRpc).toHaveBeenCalledWith('record_twilio_reconciliation_attempt', expect.objectContaining({
        p_result: 'provider_unavailable',
        p_error_code: '20404',
      }));
      expect(adminRpc).not.toHaveBeenCalledWith('reconcile_twilio_staff_reply', expect.anything());
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(CONTENT);
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(AUTH_TOKEN);
    });

    it('requires an exact MessageSid when no SID was persisted and never treats absence as proof of non-delivery', async () => {
      staffRpc.mockResolvedValueOnce({ data: true, error: null });
      setReconciliationQueries();

      const response = await postReconciliation(reconciliationRequest({ messageId: MESSAGE_ID }), staffRouteParams());
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toContain('not proof');
      expect(adminRpc).toHaveBeenCalledWith('record_twilio_reconciliation_attempt', expect.objectContaining({
        p_result: 'sid_required',
      }));
      expect(mocks.messagesFetch).not.toHaveBeenCalled();
      expect(mocks.messagesCreate).not.toHaveBeenCalled();
    });

    it('waits for the stale interval and does not accept a caller-supplied delivery status', async () => {
      staffRpc.mockResolvedValueOnce({ data: true, error: null });
      setReconciliationQueries({ dispatch_updated_at: new Date().toISOString() });
      const fresh = await postReconciliation(reconciliationRequest({
        messageId: MESSAGE_ID,
        providerMessageSid: PROVIDER_SID,
      }), staffRouteParams());

      expect(fresh.status).toBe(409);
      expect(mocks.messagesFetch).not.toHaveBeenCalled();
      expect(adminRpc).toHaveBeenCalledWith('record_twilio_reconciliation_attempt', expect.objectContaining({
        p_result: 'not_stale',
      }));

      const forgedStatus = await postReconciliation(reconciliationRequest({
        messageId: MESSAGE_ID,
        providerMessageSid: PROVIDER_SID,
        providerStatus: 'delivered',
      }), staffRouteParams());
      expect(forgedStatus.status).toBe(400);
      expect(mocks.messagesFetch).not.toHaveBeenCalled();
    });

    it('rejects unauthorized operators before conversation or provider access', async () => {
      mocks.requireStaff.mockResolvedValueOnce({ response: new Response('Forbidden', { status: 403 }) });

      const response = await postReconciliation(reconciliationRequest({
        messageId: MESSAGE_ID,
        providerMessageSid: PROVIDER_SID,
      }), staffRouteParams());

      expect(response.status).toBe(403);
      expect(staffRpc).not.toHaveBeenCalled();
      expect(staffClient.from).not.toHaveBeenCalled();
      expect(mocks.messagesFetch).not.toHaveBeenCalled();
    });
  });

  it('rejects extra callback query data and unexpected paths before validation', async () => {
    const extraQuery = await postStatusCallback(callbackRequest(
      callbackBody(),
      `message_id=${MESSAGE_ID}&extra=1`,
    ));
    const wrongPath = await postStatusCallback(callbackRequest(
      callbackBody(),
      `message_id=${MESSAGE_ID}`,
      '/other/path',
    ));

    expect(extraQuery.status).toBe(400);
    expect(wrongPath.status).toBe(400);
    expect(mocks.validateRequest).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
