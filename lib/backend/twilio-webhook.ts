import twilio from 'twilio';
import { isIP } from 'node:net';

export type TwilioWebhookParams = Record<string, string | string[]>;

export function parseTwilioFormParams(body: string): TwilioWebhookParams {
  const params: TwilioWebhookParams = Object.create(null);
  new URLSearchParams(body).forEach((value, name) => {
    const previous = params[name];
    params[name] = previous === undefined
      ? value
      : Array.isArray(previous)
        ? [...previous, value]
        : [previous, value];
  });
  return params;
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (
      !hostname
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
    ) return false;

    const ipVersion = isIP(hostname);
    if (ipVersion === 4) {
      const [first, second] = hostname.split('.').map(Number);
      if (
        first === 0
        || first === 10
        || first === 127
        || (first === 169 && second === 254)
        || (first === 172 && second !== undefined && second >= 16 && second <= 31)
        || (first === 192 && second === 168)
        || (first === 100 && second !== undefined && second >= 64 && second <= 127)
        || (first !== undefined && first >= 224)
      ) return false;
    } else if (
      ipVersion === 6
      && (
        hostname === '::'
        || hostname === '::1'
        || hostname.startsWith('fc')
        || hostname.startsWith('fd')
        || hostname.startsWith('fe8')
        || hostname.startsWith('fe9')
        || hostname.startsWith('fea')
        || hostname.startsWith('feb')
        || (hostname.startsWith('::ffff:') && isIP(hostname.slice(7)) === 4)
      )
    ) {
      return false;
    }

    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.hash;
  } catch {
    return false;
  }
}

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  callbackUrl: string,
  params: TwilioWebhookParams,
): boolean {
  try {
    return twilio.validateRequest(authToken, signature, callbackUrl, params);
  } catch {
    return false;
  }
}

export function buildTwilioStatusCallbackUrl(baseUrl: string, messageId: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (
      !isPublicHttpsUrl(baseUrl)
      || url.pathname !== '/api/twilio/whatsapp/status'
      || url.search
      || url.hash
    ) return null;
    url.searchParams.set('message_id', messageId);
    return url.toString();
  } catch {
    return null;
  }
}
