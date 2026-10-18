import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function hasValidCronAuthorization(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get('authorization');
  if (!expected || expected.length < 32 || !authorization?.startsWith('Bearer ')) return false;

  const suppliedBytes = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'Recovery schedule is not configured' }, { status: 503 });
  }
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error('Telegram dispatch recovery database is unavailable');
    return NextResponse.json({ error: 'Recovery is temporarily unavailable' }, { status: 503 });
  }

  const { data, error } = await admin.rpc('mark_expired_telegram_dispatches_unknown');
  if (error) {
    console.error('Telegram dispatch recovery failed', error.code || 'unknown');
    return NextResponse.json({ error: 'Recovery is temporarily unavailable' }, { status: 503 });
  }
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    console.error('Telegram dispatch recovery returned an invalid result');
    return NextResponse.json({ error: 'Recovery is temporarily unavailable' }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true, expiredDispatchesMarkedUnknown: data },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
