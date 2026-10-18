import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { getTwilioStaffSendSettings } from '@/lib/backend/twilio-staff-config';
import { getTelegramServerSettings } from '@/lib/backend/telegram';
import { isTwilioMessageSid } from '@/lib/twilio-message-sid';

const CONVERSATION_STAFF_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Customer Care',
  'Legal & Compliance',
] as const;
const MANAGER_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care'] as const;
const WHATSAPP_REPLY_ROLES = new Set(['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Customer Care']);
const actionSchema = z.object({ action: z.enum(['takeover', 'return_to_ai', 'close']) });

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { context, response } = await requireStaff(CONVERSATION_STAFF_ROLES);
  if (response) return response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  }
  const { data, error } = await context.client.from('conversations')
    .select('id, channel, mode, current_property_id, assigned_staff_id, created_at, updated_at, customer:customers!conversations_customer_id_fkey(display_name, email, phone, whatsapp_phone), telegram_identity:telegram_identities!conversations_telegram_identity_id_fkey(display_name, username), property:properties!conversations_current_property_id_fkey(title, reference, location)')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load conversation' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });

  const [modernMessageResult, profileResult] = await Promise.all([
    context.client.from('messages')
      .select('id, direction, sender_type, content, message_type, delivery_status, dispatch_status, dispatch_error_code, dispatch_updated_at, provider_message_id, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    data.assigned_staff_id
      ? context.client.from('profiles').select('display_name').eq('id', data.assigned_staff_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (profileResult.error) {
    return NextResponse.json({ error: 'Unable to load conversation thread' }, { status: 503 });
  }
  let messageRows: {
    id: string;
    direction: string;
    sender_type: string;
    content: string | null;
    message_type: string;
    delivery_status: string;
    dispatch_status?: string | null;
    dispatch_error_code?: string | null;
    dispatch_updated_at?: string | null;
    provider_message_id?: string | null;
    created_at: string;
  }[] = modernMessageResult.data || [];
  let dispatchTrackingAvailable = true;
  if (modernMessageResult.error) {
    if (!['42703', 'PGRST204'].includes(modernMessageResult.error.code || '')) {
      return NextResponse.json({ error: 'Unable to load conversation thread' }, { status: 503 });
    }
    dispatchTrackingAvailable = false;
    console.error('Twilio message tracking schema is not applied to this database');
    const legacyMessageResult = await context.client.from('messages')
      .select('id, direction, sender_type, content, message_type, delivery_status, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (legacyMessageResult.error) {
      return NextResponse.json({ error: 'Unable to load conversation thread' }, { status: 503 });
    }
    messageRows = legacyMessageResult.data || [];
  }
  let telegramReviewRows: { message_id: string; created_at: string }[] = [];
  if (data.channel === 'telegram') {
    const reviewResult = await context.client.from('telegram_dispatch_reviews')
      .select('message_id, created_at')
      .eq('conversation_id', id);
    if (reviewResult.error) {
      console.error('Telegram dispatch review lookup failed', reviewResult.error.code || 'unknown');
      return NextResponse.json({ error: 'Unable to load Telegram send reviews' }, { status: 503 });
    }
    telegramReviewRows = reviewResult.data || [];
  }
  const telegramReviewTimes = new Map(
    telegramReviewRows.map((review) => [review.message_id, review.created_at]),
  );
  const customer = one(data.customer);
  const telegramIdentity = one(data.telegram_identity);
  const property = one(data.property);
  const isAssignedToCurrentStaff = data.assigned_staff_id === context.userId;
  const twilioSendSettings = getTwilioStaffSendSettings();
  const whatsappOutboundEnabled = twilioSendSettings.enabled;
  const telegramSettings = getTelegramServerSettings();
  const telegramSendConfigured = Boolean(telegramSettings.token && telegramSettings.botId);
  return NextResponse.json({
    data: {
      id: data.id,
      channel: data.channel,
      mode: data.mode,
      assignedStaffId: data.assigned_staff_id,
      assignedStaff: profileResult.data?.display_name || (data.assigned_staff_id ? 'Assigned staff' : 'Unassigned'),
      isAssignedToCurrentStaff,
      whatsappDispatchAvailable: dispatchTrackingAvailable,
      whatsappOutboundEnabled,
      whatsappSendConfigured: twilioSendSettings.configured,
      whatsappStatusCallbackConfigured: twilioSendSettings.statusCallbackConfigured,
      canSendWhatsApp: dispatchTrackingAvailable
        && whatsappOutboundEnabled
        && twilioSendSettings.configured
        && data.channel === 'whatsapp'
        && data.mode === 'HUMAN_ACTIVE'
        && isAssignedToCurrentStaff
        && WHATSAPP_REPLY_ROLES.has(context.role),
      telegramDispatchAvailable: true,
      telegramOutboundEnabled: telegramSettings.outboundEnabled,
      telegramSendConfigured,
      telegramWebhookSecretConfigured: telegramSettings.webhookSecretConfigured,
      canSendTelegram: telegramSendConfigured
        && telegramSettings.outboundEnabled
        && data.channel === 'telegram'
        && data.mode === 'HUMAN_ACTIVE'
        && isAssignedToCurrentStaff
        && WHATSAPP_REPLY_ROLES.has(context.role),
      canReviewTelegramUnknown: data.channel === 'telegram'
        && data.mode === 'HUMAN_ACTIVE'
        && isAssignedToCurrentStaff
        && WHATSAPP_REPLY_ROLES.has(context.role),
      createdAt: data.created_at,
      customer: {
        displayName: telegramIdentity?.display_name || customer?.display_name || 'Customer',
        email: customer?.email || '',
        phone: customer?.phone || customer?.whatsapp_phone || '',
        username: telegramIdentity?.username || null,
      },
      property: property
        ? { id: data.current_property_id, title: property.title, reference: property.reference, location: property.location }
        : null,
      messages: (messageRows || []).reverse().map((message) => ({
        ...message,
        dispatch_status: 'dispatch_status' in message && typeof message.dispatch_status === 'string'
          ? message.dispatch_status
          : 'not_applicable',
        dispatch_error_code: 'dispatch_error_code' in message && typeof message.dispatch_error_code === 'string'
          ? message.dispatch_error_code
          : null,
        dispatch_updated_at: 'dispatch_updated_at' in message && typeof message.dispatch_updated_at === 'string'
          ? message.dispatch_updated_at
          : null,
        has_provider_message_id: 'provider_message_id' in message
          && typeof message.provider_message_id === 'string',
        has_valid_provider_message_sid: 'provider_message_id' in message
          && isTwilioMessageSid(message.provider_message_id),
        telegram_follow_up_reviewed: telegramReviewTimes.has(message.id),
        telegram_follow_up_reviewed_at: telegramReviewTimes.get(message.id) || null,
      })),
      messageLimit: 100,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(MANAGER_ROLES);
  if (response) return response;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid conversation action' }, { status: 400 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  }

  if (parsed.data.action === 'return_to_ai') {
    const { data, error } = await context.client.rpc('return_to_ai', { p_conversation_id: id });
    if (error) {
      if (error.code === '42501') return NextResponse.json({ error: 'Forbidden or conversation is out of scope' }, { status: 403 });
      if (error.code === 'P0002') return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      if (error.code === '22023') return NextResponse.json({ error: 'Closed conversations cannot be resumed' }, { status: 409 });
      if (error.code === '55000') return NextResponse.json({ error: 'Wait for the active external send to finish before changing conversation ownership' }, { status: 409 });
      console.error('Conversation return-to-AI failed', error.code);
      return NextResponse.json({ error: 'Unable to return conversation to Nia' }, { status: 503 });
    }
    return NextResponse.json({ data: { id: data.id, mode: data.mode, assignedStaffId: data.assigned_staff_id } });
  }

  const isTakeover = parsed.data.action === 'takeover';
  const { data, error } = await context.client.from('conversations')
    .update(isTakeover
      ? { mode: 'HUMAN_ACTIVE', assigned_staff_id: context.userId }
      : { mode: 'CLOSED' })
    .eq('id', id)
    .neq('mode', 'CLOSED')
    .select('id, mode, assigned_staff_id')
    .maybeSingle();
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden or conversation is out of scope' }, { status: 403 });
    if (error.code === '55000') return NextResponse.json({ error: 'Wait for the active external send to finish before changing conversation ownership' }, { status: 409 });
    console.error('Conversation ownership update failed', error.code);
    return NextResponse.json({ error: 'Unable to update conversation ownership' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Conversation not found, inaccessible, or already closed' }, { status: 404 });
  return NextResponse.json({ data });
}
