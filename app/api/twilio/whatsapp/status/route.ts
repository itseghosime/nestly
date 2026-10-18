import { z } from 'zod';
import {
  buildTwilioStatusCallbackUrl,
  isPublicHttpsUrl,
  parseTwilioFormParams,
  validateTwilioSignature,
} from '@/lib/backend/twilio-webhook';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTwilioMessageSid } from '@/lib/twilio-message-sid';

export const runtime = 'nodejs';

const messageIdSchema = z.string().uuid();
const providerStatuses = new Set([
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

function noStoreResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('x-twilio-signature');
  if (!signature) return noStoreResponse(403);

  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(contentType)) {
    return noStoreResponse(415);
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const callbackBase = process.env.TWILIO_STATUS_CALLBACK_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !authToken
    || !accountSid
    || !/^AC[0-9A-Fa-f]{32}$/.test(accountSid)
    || !callbackBase
    || !isPublicHttpsUrl(callbackBase)
    || !buildTwilioStatusCallbackUrl(callbackBase, '00000000-0000-4000-8000-000000000000')
    || !supabaseUrl
    || !serviceRoleKey
  ) {
    console.error('Twilio status callback configuration is incomplete or invalid');
    return noStoreResponse(503);
  }

  let configuredCallbackUrl: URL;
  try {
    configuredCallbackUrl = new URL(callbackBase);
  } catch {
    console.error('Twilio status callback URL is invalid');
    return noStoreResponse(503);
  }

  const requestUrl = new URL(request.url);
  const messageIds = requestUrl.searchParams.getAll('message_id');
  if (
    requestUrl.pathname !== configuredCallbackUrl.pathname
    || requestUrl.searchParams.size !== 1
    || messageIds.length !== 1
    || !messageIdSchema.safeParse(messageIds[0]).success
  ) {
    return noStoreResponse(400);
  }

  const rawBody = await request.text();
  const params = parseTwilioFormParams(rawBody);
  const signedUrl = buildTwilioStatusCallbackUrl(callbackBase, messageIds[0]);
  if (!signedUrl || !validateTwilioSignature(authToken, signature, signedUrl, params)) {
    return noStoreResponse(403);
  }

  if (
    typeof params.AccountSid !== 'string'
    || params.AccountSid !== accountSid
    || !isTwilioMessageSid(params.MessageSid)
    || typeof params.MessageStatus !== 'string'
    || !providerStatuses.has(params.MessageStatus.toLowerCase())
  ) {
    return noStoreResponse(400);
  }

  if (params.ErrorCode !== undefined && typeof params.ErrorCode !== 'string') {
    return noStoreResponse(400);
  }
  const rawErrorCode = typeof params.ErrorCode === 'string' ? params.ErrorCode : '';
  if (rawErrorCode && !/^\d{1,8}$/.test(rawErrorCode)) {
    return noStoreResponse(400);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error('Twilio status callback database client is unavailable');
    return noStoreResponse(503);
  }

  try {
    const { error } = await admin.rpc('apply_twilio_message_status', {
      p_message_id: messageIds[0],
      p_provider_message_id: params.MessageSid,
      p_provider_status: params.MessageStatus.toLowerCase(),
      p_error_code: rawErrorCode || null,
    });
    if (error) {
      if (error.code === 'P0002') return noStoreResponse(404);
      if (error.code === '22023') return noStoreResponse(400);
      if (error.code === '23505' || error.code === '55000') return noStoreResponse(409);
      console.error('Twilio status callback persistence failed', error.code || 'unknown');
      return noStoreResponse(503);
    }
    return noStoreResponse(204);
  } catch {
    console.error('Twilio status callback persistence failed');
    return noStoreResponse(503);
  }
}
