import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const STAFF_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Customer Care',
] as const;

const reviewSchema = z.object({
  messageId: z.string().uuid(),
  acknowledgeUnknown: z.literal(true),
});

const reviewResultSchema = z.object({
  message_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  reviewed_by: z.string().uuid(),
  created_at: z.string(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Explicit acknowledgement is required' }, { status: 400 });
  }

  const { data, error } = await context.client.rpc('acknowledge_telegram_unknown_send', {
    p_conversation_id: id,
    p_message_id: parsed.data.messageId,
    p_acknowledged: true,
  });
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({
        error: 'Only the assigned staff member may acknowledge this unknown Telegram send.',
      }, { status: 403 });
    }
    if (error.code === 'P0002') {
      return NextResponse.json({ error: 'Conversation not found or inaccessible' }, { status: 404 });
    }
    if (error.code === '22023') {
      return NextResponse.json({ error: 'This message no longer has an unknown send outcome.' }, { status: 409 });
    }
    console.error('Telegram unknown-send acknowledgement failed', error.code || 'unknown');
    return NextResponse.json({ error: 'Unable to record the review decision' }, { status: 503 });
  }

  const row = reviewResultSchema.safeParse(Array.isArray(data) ? data[0] : data);
  if (!row.success || row.data.message_id !== parsed.data.messageId || row.data.conversation_id !== id) {
    console.error('Telegram unknown-send acknowledgement returned an invalid result');
    return NextResponse.json({ error: 'Unable to confirm the review decision' }, { status: 503 });
  }

  return NextResponse.json({
    data: {
      messageId: row.data.message_id,
      conversationId: row.data.conversation_id,
      reviewedAt: row.data.created_at,
    },
    notice: 'The original message remains unknown and will not be resent. A new staff reply is a separate send.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
