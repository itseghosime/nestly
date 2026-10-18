import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, guardPublicRequest } from '@/lib/backend/public-request';
import {
  hashWebsiteConversationToken,
  isWebsiteConversationToken,
  WEBSITE_CONVERSATION_COOKIE,
} from '@/lib/backend/website-conversation-session';
import { createClient } from '@/lib/supabase/server';

const acknowledgementSchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(100),
}).strict();

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const rateLimitFailure = await guardPublicRequest(request, 'nia-conversation-ack', {
    maxRequests: 60,
    windowSeconds: 60,
  });
  if (rateLimitFailure) return rateLimitFailure;

  const cookieStore = await cookies();
  const token = cookieStore.get(WEBSITE_CONVERSATION_COOKIE)?.value;
  if (!isWebsiteConversationToken(token)) {
    return NextResponse.json({ error: 'Conversation session is unavailable' }, { status: 401 });
  }

  const parsed = acknowledgementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid website delivery acknowledgement' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('acknowledge_website_conversation_messages', {
    p_token_hash: hashWebsiteConversationToken(token),
    p_message_ids: parsed.data.messageIds,
  });
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Conversation session is unavailable' }, { status: 401 });
    }
    if (error.code === '22023') {
      return NextResponse.json({ error: 'Invalid website delivery acknowledgement' }, { status: 400 });
    }
    console.error('Website message delivery acknowledgement failed', error.code || 'unknown');
    return NextResponse.json({ error: 'Unable to confirm website message delivery' }, { status: 503 });
  }

  return NextResponse.json({
    data: { acknowledged: Array.isArray(data) ? data.length : 0 },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
