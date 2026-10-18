import {
  isPublicHttpsUrl,
  parseTwilioFormParams,
  validateTwilioSignature,
} from '@/lib/backend/twilio-webhook';

export const runtime = 'nodejs';

function noStoreResponse(body: string, status: number, contentType?: string): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(body, { status, headers });
}

function forbidden(): Response {
  return noStoreResponse('Forbidden', 403);
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('x-twilio-signature');
  if (!signature) return forbidden();

  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(contentType)) {
    return noStoreResponse('Unsupported media type', 415);
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const publicWebhookUrl = process.env.TWILIO_PUBLIC_WEBHOOK_URL;
  const wf01Url = process.env.NESTLY_WF01_WEBHOOK_URL;
  const relaySecret = process.env.NESTLY_WF01_RELAY_SECRET;
  if (
    !authToken
    || !publicWebhookUrl
    || !isPublicHttpsUrl(publicWebhookUrl)
    || !wf01Url
    || !isPublicHttpsUrl(wf01Url)
    || !relaySecret
    || relaySecret.length < 32
  ) {
    console.error('Twilio relay configuration is incomplete or invalid');
    return noStoreResponse('Twilio relay unavailable', 503);
  }

  const rawBody = await request.text();
  const params = parseTwilioFormParams(rawBody);
  const validSignature = validateTwilioSignature(
    authToken,
    signature,
    publicWebhookUrl,
    params,
  );
  if (!validSignature) return forbidden();

  if (
    typeof params.MessageSid !== 'string'
    || !params.MessageSid.trim()
    || typeof params.From !== 'string'
    || !params.From.trim()
    || typeof params.WaId !== 'string'
    || !params.WaId.trim()
  ) {
    return noStoreResponse('Invalid Twilio message payload', 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(wf01Url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Nestly-Relay-Secret': relaySecret,
      },
      body: rawBody,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    console.error('Twilio relay could not reach WF01');
    return noStoreResponse('Bad Gateway', 502);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return noStoreResponse('Bad Gateway', 502);
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const responseContentType = upstream.headers.get('content-type');
  if (responseContentType) headers.set('Content-Type', responseContentType);
  return new Response(upstream.body, { status: upstream.status, headers });
}
