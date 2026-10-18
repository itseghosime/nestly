import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { z } from 'zod';
import { getIdempotencyKey, assertSameOrigin } from '@/lib/backend/public-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTwilioStatusCallbackUrl } from '@/lib/backend/twilio-webhook';
import { requireStaff } from '@/lib/backend/staff-context';

export const runtime = 'nodejs';

const STAFF_REPLY_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Customer Care',
] as const;

const replySchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const TWILIO_STATUSES = new Set([
  'accepted',
  'scheduled',
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'undelivered',
  'canceled',
]);

type DispatchRow = {
  message_id: string;
  recipient: string | null;
  dispatch_status: string;
  delivery_status: string;
  created_at: string;
  should_dispatch: boolean;
};

type RecordedRow = {
  message_id: string;
  dispatch_status: string;
  delivery_status: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return isRecord(value[0]) ? value[0] : null;
}

function parseDispatchRow(value: unknown): DispatchRow | null {
  const row = firstRow(value);
  if (
    !row
    || typeof row.message_id !== 'string'
    || !(row.recipient === null || typeof row.recipient === 'string')
    || typeof row.dispatch_status !== 'string'
    || typeof row.delivery_status !== 'string'
    || typeof row.created_at !== 'string'
    || typeof row.should_dispatch !== 'boolean'
  ) return null;
  return {
    message_id: row.message_id,
    recipient: row.recipient,
    dispatch_status: row.dispatch_status,
    delivery_status: row.delivery_status,
    created_at: row.created_at,
    should_dispatch: row.should_dispatch,
  };
}

function parseRecordedRow(value: unknown): RecordedRow | null {
  const row = firstRow(value);
  if (
    !row
    || typeof row.message_id !== 'string'
    || typeof row.dispatch_status !== 'string'
    || typeof row.delivery_status !== 'string'
  ) return null;
  return {
    message_id: row.message_id,
    dispatch_status: row.dispatch_status,
    delivery_status: row.delivery_status,
  };
}

function providerField(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null
    ? Reflect.get(error, name)
    : undefined;
}

function providerStatusCode(error: unknown): number | null {
  const status = providerField(error, 'status') ?? providerField(error, 'statusCode');
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

function providerErrorCode(error: unknown): string | null {
  const code = providerField(error, 'code');
  const value = typeof code === 'string' || typeof code === 'number' ? String(code) : '';
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? value : null;
}

function hasParameter(payload: object, ...names: string[]): boolean {
  return names.some((name) => Object.prototype.hasOwnProperty.call(payload, name));
}

function validWhatsAppAddress(value: string): string | null {
  const phone = value.startsWith('whatsapp:') ? value.slice('whatsapp:'.length) : value;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? `whatsapp:${phone}` : null;
}

function twilioConfiguration() {
  if (process.env.TWILIO_OUTBOUND_ENABLED !== 'true') return null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const callbackBase = process.env.TWILIO_STATUS_CALLBACK_URL;
  const siteUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !accountSid
    || !/^AC[0-9A-Fa-f]{32}$/.test(accountSid)
    || !authToken
    || !from
    || !validWhatsAppAddress(from)
    || !callbackBase
    || !buildTwilioStatusCallbackUrl(callbackBase, '00000000-0000-4000-8000-000000000000')
    || !siteUrl
    || !serviceRoleKey
  ) return null;
  return { accountSid, authToken, from, callbackBase };
}

function apiMessage(row: DispatchRow | RecordedRow, content: string, createdAt: string) {
  return {
    id: row.message_id,
    direction: 'outbound',
    sender_type: 'agent',
    content,
    delivery_status: row.delivery_status,
    dispatch_status: row.dispatch_status,
    dispatch_error_code: null,
    dispatch_updated_at: createdAt,
    has_provider_message_id: false,
    created_at: createdAt,
  };
}

function dispatchFailureResponse(code: string | undefined) {
  if (code === '42501') {
    return NextResponse.json({ error: 'You are not authorized to reply to this conversation' }, { status: 403 });
  }
  if (code === 'P0002') {
    return NextResponse.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });
  }
  if (code === '22023') {
    return NextResponse.json({ error: 'A staff takeover and valid WhatsApp customer address are required' }, { status: 409 });
  }
  if (code === '55000') {
    return NextResponse.json({
      error: 'A previous Twilio send has an unresolved outcome. Do not send another message until it is reconciled.',
    }, { status: 409 });
  }
  if (code === '23505') {
    return NextResponse.json({ error: 'This reply request identifier was already used' }, { status: 409 });
  }
  console.error('Twilio staff reply claim failed', code || 'unknown');
  return NextResponse.json({ error: 'Unable to prepare Twilio reply' }, { status: 503 });
}

async function recordDispatch(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  outcome: 'accepted' | 'rejected' | 'unknown',
  providerMessageId: string | null,
  providerStatus: string | null,
  errorCode: string | null,
): Promise<RecordedRow | null> {
  const result = await admin.rpc('finish_twilio_staff_reply', {
    p_message_id: messageId,
    p_outcome: outcome,
    p_provider_message_id: providerMessageId,
    p_provider_status: providerStatus,
    p_error_code: errorCode,
  });
  if (!result.error) {
    const row = parseRecordedRow(result.data);
    if (row) return row;
  }

  console.error('Twilio staff reply tracking failed', result.error?.code || 'invalid-result');
  if (outcome === 'unknown') return null;

  const fallback = await admin.rpc('finish_twilio_staff_reply', {
    p_message_id: messageId,
    p_outcome: 'unknown',
    p_provider_message_id: null,
    p_provider_status: null,
    p_error_code: errorCode,
  });
  if (fallback.error) {
    console.error('Twilio uncertain reply tracking failed', fallback.error.code || 'unknown');
    return null;
  }
  return parseRecordedRow(fallback.data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(STAFF_REPLY_ROLES);
  if (response) return response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  }
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'A valid Idempotency-Key header is required' }, { status: 400 });
  }
  const parsed = replySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a reply of at most 4000 characters' }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await context.client
    .from('conversations')
    .select('channel')
    .eq('id', id)
    .maybeSingle();
  if (conversationError) {
    console.error('Staff conversation channel lookup failed', conversationError.code || 'unknown');
    return NextResponse.json({ error: 'Unable to load conversation' }, { status: 503 });
  }
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });
  }

  if (conversation.channel === 'website') {
    const { data, error } = await context.client.rpc('send_website_staff_reply', {
      p_conversation_id: id,
      p_content: parsed.data.content,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json({ error: 'You are not authorized to reply to this conversation' }, { status: 403 });
      }
      if (error.code === 'P0002') {
        return NextResponse.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });
      }
      if (error.code === '22023') {
        return NextResponse.json({ error: 'Replies are available only for human-owned website conversations' }, { status: 409 });
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This reply request identifier was already used' }, { status: 409 });
      }
      console.error('Staff website reply failed', error.code || 'unknown');
      return NextResponse.json({ error: 'Unable to save staff reply' }, { status: 503 });
    }

    const message = Array.isArray(data) ? data[0] : null;
    if (!message || typeof message.message_id !== 'string' || typeof message.created_at !== 'string') {
      console.error('Staff website reply returned an invalid row shape');
      return NextResponse.json({ error: 'Unable to save staff reply' }, { status: 503 });
    }
    return NextResponse.json({
      data: {
        id: message.message_id,
        direction: 'outbound',
        sender_type: 'agent',
        content: parsed.data.content,
        delivery_status: 'queued',
        dispatch_status: 'not_applicable',
        dispatch_error_code: null,
        dispatch_updated_at: null,
        has_provider_message_id: false,
        created_at: message.created_at,
      },
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }

  if (conversation.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'Unsupported conversation channel' }, { status: 409 });
  }
  const config = twilioConfiguration();
  if (!config) {
    console.error('Twilio staff reply configuration is incomplete or invalid');
    return NextResponse.json({ error: 'Twilio WhatsApp sending is not configured' }, { status: 503 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error('Twilio staff reply tracking client is unavailable');
    return NextResponse.json({ error: 'Twilio WhatsApp sending is not configured' }, { status: 503 });
  }

  const { data, error } = await context.client.rpc('claim_twilio_staff_reply', {
    p_conversation_id: id,
    p_content: parsed.data.content,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return dispatchFailureResponse(error.code);
  const claim = parseDispatchRow(data);
  if (!claim) {
    console.error('Twilio staff reply claim returned an invalid row shape');
    return NextResponse.json({ error: 'Unable to prepare Twilio reply' }, { status: 503 });
  }

  if (!claim.should_dispatch) {
    const message = apiMessage(claim, parsed.data.content, claim.created_at);
    if (claim.dispatch_status === 'unknown' || claim.dispatch_status === 'dispatching') {
      return NextResponse.json({
        data: message,
        notice: 'Twilio may have received this message. Do not resend until a status callback or manual reconciliation resolves it.',
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }
    if (claim.dispatch_status === 'failed') {
      return NextResponse.json({
        error: 'Twilio did not accept this reply. Submit again only to make a new attempt.',
        retryWithNewKey: true,
        data: message,
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ data: message }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const recipient = claim.recipient ? validWhatsAppAddress(claim.recipient) : null;
  const statusCallback = buildTwilioStatusCallbackUrl(config.callbackBase, claim.message_id);
  if (!recipient || !statusCallback) {
    const tracked = await recordDispatch(
      admin, claim.message_id, 'rejected', null, null, 'INVALID_CONFIG',
    );
    if (!tracked) {
      return NextResponse.json({
        data: apiMessage(claim, parsed.data.content, claim.created_at),
        notice: 'The reply was not sent; its stored outcome needs reconciliation.',
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Twilio recipient or callback configuration is invalid', retryWithNewKey: true }, { status: 422 });
  }

  const sendPayload = {
    from: config.from.startsWith('whatsapp:') ? config.from : `whatsapp:${config.from}`,
    to: recipient,
    body: parsed.data.content,
    statusCallback,
  };

  let providerMessage: { sid: string; status: string };
  try {
    const client = twilio(config.accountSid, config.authToken);
    const response = await client.messages.create(sendPayload);
    providerMessage = { sid: response.sid, status: response.status };
  } catch (sendError) {
    const statusCode = providerStatusCode(sendError);
    const code = providerErrorCode(sendError);
    console.error('Twilio staff reply provider error', {
      httpStatus: statusCode,
      twilioErrorCode: code,
      redactedErrorMessage: 'Provider error message redacted',
      parameters: {
        Body: hasParameter(sendPayload, 'body', 'Body'),
        ContentSid: hasParameter(sendPayload, 'contentSid', 'ContentSid'),
        ContentVariables: hasParameter(sendPayload, 'contentVariables', 'ContentVariables'),
      },
    });
    const definitivelyRejected = statusCode !== null
      && statusCode >= 400
      && statusCode < 500
      && statusCode !== 408;
    const tracked = await recordDispatch(
      admin,
      claim.message_id,
      definitivelyRejected ? 'rejected' : 'unknown',
      null,
      null,
      code,
    );
    if (definitivelyRejected && tracked?.dispatch_status === 'failed') {
      return NextResponse.json({
        error: 'Twilio rejected this reply. Review it before submitting a new attempt.',
        retryWithNewKey: true,
        data: apiMessage(tracked, parsed.data.content, claim.created_at),
      }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({
      data: apiMessage(tracked ?? claim, parsed.data.content, claim.created_at),
      notice: 'Twilio may have received this message. Do not resend until a status callback or manual reconciliation resolves it.',
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  if (
    typeof providerMessage.sid !== 'string'
    || !/^SM[0-9A-Fa-f]{32}$/.test(providerMessage.sid)
  ) {
    console.error('Twilio returned an invalid staff reply SID');
    const tracked = await recordDispatch(
      admin, claim.message_id, 'unknown', null, null, 'INVALID_PROVIDER_RESPONSE',
    );
    return NextResponse.json({
      data: apiMessage(tracked ?? claim, parsed.data.content, claim.created_at),
      notice: 'Twilio returned an unrecognized message reference. Do not resend until it is reconciled.',
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  const rawProviderStatus = typeof providerMessage.status === 'string'
    ? providerMessage.status.toLowerCase()
    : '';
  if (!TWILIO_STATUSES.has(rawProviderStatus)) {
    console.error('Twilio returned an unrecognized staff reply status');
  }
  const providerStatus = TWILIO_STATUSES.has(rawProviderStatus) ? rawProviderStatus : 'queued';
  const tracked = await recordDispatch(
    admin,
    claim.message_id,
    'accepted',
    providerMessage.sid,
    providerStatus,
    null,
  );
  if (!tracked) {
    return NextResponse.json({
      data: apiMessage(claim, parsed.data.content, claim.created_at),
      notice: 'Twilio accepted the send request, but its status could not be saved. Do not resend; wait for callback or manual reconciliation.',
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({
    data: apiMessage(tracked, parsed.data.content, claim.created_at),
    notice: 'Twilio accepted the reply. Delivery is not confirmed until a signed status callback arrives.',
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
