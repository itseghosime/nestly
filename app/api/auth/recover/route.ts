import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guardPublicRequest } from '@/lib/backend/public-request';
import { buildAuthCallbackUrl } from '@/lib/backend/auth-callback-url';
export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'auth-recovery', { maxRequests: 5, windowSeconds: 3600 });
  if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  const redirectTo = buildAuthCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL, 'recovery');
  if (!redirectTo) return NextResponse.json({ error: 'Password recovery callback is not configured' }, { status: 503 });
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(body.email.toLowerCase(), {
    redirectTo,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
