import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import {
  getTelegramServerSettings,
  setupTelegramWebhook,
  TELEGRAM_WEBHOOK_DESTINATION,
} from '@/lib/backend/telegram';
import { requireStaff } from '@/lib/backend/staff-context';

export const runtime = 'nodejs';

const PLATFORM_ADMIN = ['Platform Admin'] as const;
const setupSchema = z.object({
  action: z.literal('register'),
}).strict();

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;

  const { response } = await requireStaff(PLATFORM_ADMIN);
  if (response) return response;

  if (new URL(request.url).search) {
    return NextResponse.json({ error: 'Query parameters are not accepted' }, { status: 400 });
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'Expected a JSON setup action' }, { status: 415 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > 1024) {
      return NextResponse.json({ error: 'Setup request is too large' }, { status: 413 });
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: 'Invalid setup request' }, { status: 400 });
  }

  if (!setupSchema.safeParse(body).success) {
    return NextResponse.json({ error: 'Only the fixed registration action is accepted' }, { status: 400 });
  }

  const settings = getTelegramServerSettings();
  if (!settings.configured || !settings.token || !settings.webhookSecret) {
    return NextResponse.json({ error: 'Telegram webhook configuration is unavailable' }, { status: 503 });
  }

  const result = await setupTelegramWebhook(settings.token, settings.webhookSecret);
  if (result.status === 'different_webhook') {
    return NextResponse.json({
      error: 'A different Telegram webhook is already registered; no change was made.',
      currentWebhookHost: result.currentHost,
    }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }
  if (result.status !== 'registered') {
    return NextResponse.json({ error: 'Telegram webhook registration could not be verified' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json({
    data: {
      status: result.status,
      destination: TELEGRAM_WEBHOOK_DESTINATION,
      allowedUpdates: ['message'],
      maxConnections: 1,
      dropPendingUpdates: false,
      pendingUpdateCount: result.pendingUpdateCount,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
