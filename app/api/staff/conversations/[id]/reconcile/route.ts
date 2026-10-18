import { NextResponse } from 'next/server';
import twilio from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/backend/staff-context';

export const runtime = 'nodejs';

const RECONCILIATION_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Customer Care',
] as const;
const STALE_AFTER_MS = 15 * 60 * 1000;
const EVIDENCE_BEFORE_MS = 2 * 60 * 1000;
const EVIDENCE_AFTER_MS = 15 * 60 * 1000;
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

const requestSchema = z.object({
  messageId: z.string().uuid(),
  providerMessageSid: z.string().regex(/^SM[0-9A-Fa-f]{32}$/).optional(),
}).strict();

type ConversationRow = {
  id: string;
  channel: string;
  customer: { whatsapp_phone: string | null } | { whatsapp_phone: string | null }[] | null;
};

type PendingMessageRow = {
  id: string;
  direction: string;
  sender_type: string;
  content: string | null;
  dispatch_status: string;
  dispatch_updated_at: string | null;
  provider_message_id: string | null;
  created_at: string;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function normalizedWhatsAppAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const phone = value.startsWith('whatsapp:') ? value.slice('whatsapp:'.length) : value;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? `whatsapp:${phone}` : null;
}

function safeErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = Reflect.get(error, 'code');
  const status = Reflect.get(error, 'status') ?? Reflect.get(error, 'statusCode');
  const candidate = typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : typeof status === 'number' && Number.isInteger(status)
      ? `HTTP_${status}`
      : '';
  return /^[A-Za-z0-9_-]{1,32}$/.test(candidate) ? candidate : null;
}

function validTwilioConfiguration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = normalizedWhatsAppAddress(process.env.TWILIO_WHATSAPP_FROM);
  if (
    !accountSid
    || !/^AC[0-9A-Fa-f]{32}$/.test(accountSid)
    || !authToken
    || !from
  ) return null;
  return { accountSid, authToken, from };
}

function staleAt(dispatchUpdatedAt: string | null, createdAt: string): number | null {
  const date = new Date(dispatchUpdatedAt || createdAt).getTime();
  return Number.isFinite(date) ? date : null;
}

function parseReconciliationResult(value: unknown) {
  const row = Array.isArray(value) ? value[0] : null;
  if (
    typeof row !== 'object'
    || row === null
    || typeof Reflect.get(row, 'message_id') !== 'string'
    || typeof Reflect.get(row, 'dispatch_status') !== 'string'
    || typeof Reflect.get(row, 'delivery_status') !== 'string'
    || typeof Reflect.get(row, 'disposition') !== 'string'
  ) return null;
  return {
    id: Reflect.get(row, 'message_id') as string,
    dispatchStatus: Reflect.get(row, 'dispatch_status') as string,
    deliveryStatus: Reflect.get(row, 'delivery_status') as string,
    disposition: Reflect.get(row, 'disposition') as string,
  };
}

async function logAttempt(
  admin: ReturnType<typeof createAdminClient>,
  staffId: string,
  messageId: string,
  providerMessageSid: string | null,
  result: 'not_stale' | 'sid_required' | 'provider_unavailable' | 'evidence_mismatch' | 'reconciliation_conflict',
  errorCode: string | null = null,
) {
  const { error } = await admin.rpc('record_twilio_reconciliation_attempt', {
    p_actor_id: staffId,
    p_message_id: messageId,
    p_provider_message_id: providerMessageSid,
    p_result: result,
    p_error_code: errorCode,
  });
  if (error) {
    console.error('Twilio reconciliation audit write failed', error.code || 'unknown');
    return false;
  }
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(RECONCILIATION_ROLES);
  if (response) return response;

  const { id: conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide a message ID and, when needed, a valid Twilio MessageSid' }, { status: 400 });
  }

  const access = await context.client.rpc('can_manage_conversation', {
    p_conversation_id: conversationId,
  });
  if (access.error) {
    console.error('Twilio reconciliation access check failed', access.error.code || 'unknown');
    return NextResponse.json({ error: 'Unable to verify conversation access' }, { status: 503 });
  }
  if (access.data !== true) {
    return NextResponse.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });
  }

  const { data: conversationData, error: conversationError } = await context.client
    .from('conversations')
    .select('id, channel, customer:customers!conversations_customer_id_fkey(whatsapp_phone)')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) {
    console.error('Twilio reconciliation conversation lookup failed', conversationError.code || 'unknown');
    return NextResponse.json({ error: 'Unable to load conversation' }, { status: 503 });
  }
  const conversation = conversationData as ConversationRow | null;
  if (!conversation || conversation.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'WhatsApp conversation not found' }, { status: 404 });
  }
  const customer = one(conversation.customer);
  const expectedTo = normalizedWhatsAppAddress(customer?.whatsapp_phone);
  if (!expectedTo) {
    return NextResponse.json({ error: 'Customer WhatsApp address is unavailable; the message remains unresolved' }, { status: 409 });
  }

  const { data: messageData, error: messageError } = await context.client
    .from('messages')
    .select('id, direction, sender_type, content, dispatch_status, dispatch_updated_at, provider_message_id, created_at')
    .eq('id', parsed.data.messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (messageError) {
    console.error('Twilio reconciliation message lookup failed', messageError.code || 'unknown');
    return NextResponse.json({ error: 'Unable to load message dispatch status' }, { status: 503 });
  }
  const message = messageData as PendingMessageRow | null;
  if (
    !message
    || message.direction !== 'outbound'
    || message.sender_type !== 'agent'
    || message.content === null
  ) {
    return NextResponse.json({ error: 'WhatsApp staff reply not found' }, { status: 404 });
  }
  if (!['dispatching', 'unknown'].includes(message.dispatch_status)) {
    return NextResponse.json({ error: 'This message is no longer awaiting reconciliation. Refresh the conversation.' }, { status: 409 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error('Twilio reconciliation service client is unavailable');
    return NextResponse.json({ error: 'Reconciliation is unavailable; do not resend this message' }, { status: 503 });
  }

  const updatedAt = staleAt(message.dispatch_updated_at, message.created_at);
  if (updatedAt === null) {
    return NextResponse.json({ error: 'Stored dispatch timestamp is invalid; message remains unresolved' }, { status: 503 });
  }
  if (Date.now() - updatedAt < STALE_AFTER_MS) {
    const audited = await logAttempt(admin, context.userId, message.id, message.provider_message_id, 'not_stale');
    return NextResponse.json({
      error: audited
        ? 'This send is not stale yet. Wait at least 15 minutes, then refresh its status.'
        : 'This send is not stale yet, and the audit record could not be saved. Wait at least 15 minutes before checking again.',
    }, { status: audited ? 409 : 503 });
  }

  const requestedSid = parsed.data.providerMessageSid ?? null;
  if (message.provider_message_id && requestedSid && requestedSid !== message.provider_message_id) {
    const audited = await logAttempt(admin, context.userId, message.id, requestedSid, 'evidence_mismatch');
    return NextResponse.json({
      error: audited
        ? 'The supplied MessageSid does not match the stored provider reference'
        : 'The supplied MessageSid did not match, and the audit record could not be saved. Do not resend.',
    }, { status: audited ? 409 : 503 });
  }
  const providerMessageSid = message.provider_message_id || requestedSid;
  if (!providerMessageSid) {
    const audited = await logAttempt(admin, context.userId, message.id, null, 'sid_required');
    return NextResponse.json({
      error: audited
        ? 'Find the exact MessageSid in Twilio Console and enter it here. A missing search result is not proof that no message was sent.'
        : 'A MessageSid is required, and the audit record could not be saved. Do not resend.',
    }, { status: audited ? 400 : 503 });
  }

  const config = validTwilioConfiguration();
  if (!config) {
    const audited = await logAttempt(
      admin, context.userId, message.id, providerMessageSid, 'provider_unavailable', 'CONFIGURATION_MISSING',
    );
    return NextResponse.json({
      error: audited
        ? 'Twilio lookup is not configured; the send remains unresolved'
        : 'Twilio lookup is not configured and the audit record could not be saved; do not resend',
    }, { status: 503 });
  }

  let providerMessage: MessageInstance;
  try {
    const client = twilio(config.accountSid, config.authToken);
    providerMessage = await client.messages(providerMessageSid).fetch();
  } catch (lookupError) {
    const code = safeErrorCode(lookupError);
    const audited = await logAttempt(
      admin, context.userId, message.id, providerMessageSid, 'provider_unavailable', code,
    );
    return NextResponse.json({
      error: audited
        ? 'Twilio evidence could not be fetched. The send remains unresolved; do not resend.'
        : 'Twilio evidence could not be fetched and the audit record could not be saved. Do not resend.',
    }, { status: 503 });
  }

  const providerCreatedAt = providerMessage.dateCreated;
  const providerCreatedAtMs = providerCreatedAt instanceof Date ? providerCreatedAt.getTime() : NaN;
  const messageCreatedAtMs = new Date(message.created_at).getTime();
  const providerStatus = typeof providerMessage.status === 'string'
    ? providerMessage.status.toLowerCase()
    : '';
  const expectedFrom = config.from;
  const actualFrom = normalizedWhatsAppAddress(providerMessage.from);
  const actualTo = normalizedWhatsAppAddress(providerMessage.to);
  const evidenceMatches = providerMessage.sid === providerMessageSid
    && providerMessage.accountSid === config.accountSid
    && providerMessage.direction === 'outbound-api'
    && providerMessage.body === message.content
    && actualFrom === expectedFrom
    && actualTo === expectedTo
    && Number.isFinite(providerCreatedAtMs)
    && Number.isFinite(messageCreatedAtMs)
    && providerCreatedAtMs >= messageCreatedAtMs - EVIDENCE_BEFORE_MS
    && providerCreatedAtMs <= messageCreatedAtMs + EVIDENCE_AFTER_MS
    && TWILIO_STATUSES.has(providerStatus);

  if (!evidenceMatches) {
    const audited = await logAttempt(
      admin, context.userId, message.id, providerMessageSid, 'evidence_mismatch', 'EVIDENCE_MISMATCH',
    );
    return NextResponse.json({
      error: audited
        ? 'The Twilio record does not match this exact reply. No status was changed; do not resend.'
        : 'The Twilio record did not match and the audit record could not be saved. No status was changed; do not resend.',
    }, { status: 409 });
  }

  const errorCodeCandidate = typeof providerMessage.errorCode === 'number'
    ? String(providerMessage.errorCode)
    : providerMessage.errorCode;
  const errorCode = typeof errorCodeCandidate === 'string'
    && /^[A-Za-z0-9_-]{1,32}$/.test(errorCodeCandidate)
    ? errorCodeCandidate
    : null;
  const result = await admin.rpc('reconcile_twilio_staff_reply', {
    p_actor_id: context.userId,
    p_message_id: message.id,
    p_provider_message_id: providerMessageSid,
    p_provider_status: providerStatus,
    p_provider_created_at: providerCreatedAt.toISOString(),
    p_error_code: errorCode,
  });
  if (result.error) {
    const audited = await logAttempt(
      admin, context.userId, message.id, providerMessageSid, 'reconciliation_conflict', result.error.code || null,
    );
    console.error('Twilio provider evidence could not be recorded', result.error.code || 'unknown');
    return NextResponse.json({
      error: audited
        ? 'The conversation changed during reconciliation. Refresh the message status; do not resend.'
        : 'The conversation changed during reconciliation and the audit record could not be saved. Do not resend.',
    }, { status: 409 });
  }

  const reconciled = parseReconciliationResult(result.data);
  if (!reconciled) {
    console.error('Twilio reconciliation returned an invalid result shape');
    return NextResponse.json({ error: 'Twilio evidence may have been checked but status is unconfirmed. Refresh before any action.' }, { status: 503 });
  }

  return NextResponse.json({
    data: reconciled,
    providerStatus,
    notice: reconciled.dispatchStatus === 'failed'
      ? 'Twilio confirmed the send failed. Review the message before explicitly sending a new reply.'
      : 'Twilio status was verified and recorded. No message was resent.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
