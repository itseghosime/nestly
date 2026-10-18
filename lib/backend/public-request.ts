import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type PublicRateLimit = {
  maxRequests: number;
  windowSeconds: number;
};

export function getIdempotencyKey(request: Request): string | null {
  const key = request.headers.get('idempotency-key');
  return key && /^[A-Za-z0-9._:-]{16,128}$/.test(key) ? key : null;
}

export function deriveReceiptToken(scope: 'offer' | 'inspection', idempotencyKey: string): string | null {
  const secret = process.env.PUBLIC_RECEIPT_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return createHmac('sha256', secret).update(`${scope}:${idempotencyKey}`).digest('hex');
}

export function hashReceiptToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function assertSameOrigin(request: Request): NextResponse | null {
  const canonicalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let canonicalOrigin: string;
  try {
    canonicalOrigin = canonicalSiteUrl
      ? new URL(canonicalSiteUrl).origin
      : new URL(request.url).origin;
  } catch {
    return NextResponse.json({ error: 'Request origin protection is not configured' }, { status: 503 });
  }
  const origin = request.headers.get('origin');
  if (origin === canonicalOrigin) return null;
  if (origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  if (request.headers.get('sec-fetch-site') === 'same-origin') return null;
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      if (new URL(referer).origin === canonicalOrigin) return null;
    } catch {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }
  }

  return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
}

export async function guardPublicRequest(
  request: Request,
  scope: string,
  limit: PublicRateLimit,
): Promise<NextResponse | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: 'Public request protection is not configured' }, { status: 503 });
  }
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;

  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim();
  if (!address && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Trusted client address is unavailable' }, { status: 503 });
  }
  const keyHash = createHash('sha256')
    .update(`${scope}:${address || 'local-development'}`)
    .digest('hex');
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('consume_public_rate_limit', {
    p_key_hash: keyHash,
    p_max_requests: limit.maxRequests,
    p_window_seconds: limit.windowSeconds,
  });
  if (error) {
    console.error('Public request rate limiter failed', error.code);
    return NextResponse.json({ error: 'Public request protection is unavailable' }, { status: 503 });
  }
  if (data !== true) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  return null;
}
