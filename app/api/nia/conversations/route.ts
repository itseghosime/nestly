import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getNiaPublicPropertiesByIds } from '@/lib/backend/nia-conversation-response';
import { normalizeNiaContext } from '@/lib/backend/nia-conversation-context';
import type { NiaSearchProperty } from '@/lib/backend/nia-property-search';
import { assertSameOrigin, guardPublicRequest } from '@/lib/backend/public-request';
import {
  hashWebsiteConversationToken,
  isWebsiteConversationToken,
  WEBSITE_CONVERSATION_COOKIE,
  WEBSITE_CONVERSATION_COOKIE_PATH,
} from '@/lib/backend/website-conversation-session';
import { createClient } from '@/lib/supabase/server';

const VALID_MODES = new Set(['AI_ACTIVE', 'HUMAN_ACTIVE', 'CLOSED']);
const VALID_SENDERS = new Set(['customer', 'nia', 'agent', 'system']);

export async function GET(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;

  const cookieStore = await cookies();
  const token = cookieStore.get(WEBSITE_CONVERSATION_COOKIE)?.value;
  if (!isWebsiteConversationToken(token)) {
    return NextResponse.json({ data: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const rateLimitFailure = await guardPublicRequest(request, 'nia-conversation-read', {
    maxRequests: 100,
    windowSeconds: 60,
  });
  if (rateLimitFailure) return rateLimitFailure;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_website_conversation_v2', {
    p_token_hash: hashWebsiteConversationToken(token),
  });
  if (error) {
    console.error('Website conversation read failed', error.code || 'unknown');
    return NextResponse.json({ error: 'Unable to load saved conversation' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const rows = Array.isArray(data) ? data : [];
  const first = rows[0];
  if (!first) {
    const response = NextResponse.json({ data: null }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(WEBSITE_CONVERSATION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: WEBSITE_CONVERSATION_COOKIE_PATH,
      maxAge: 0,
    });
    return response;
  }

  if (
    typeof first.conversation_id !== 'string'
    || typeof first.mode !== 'string'
    || !VALID_MODES.has(first.mode)
    || !rows.every((row) => (
      row.conversation_id === first.conversation_id
      && row.mode === first.mode
      && (
        row.message_id === null
        || (
          typeof row.message_id === 'string'
          && typeof row.sender_type === 'string'
          && VALID_SENDERS.has(row.sender_type)
          && (row.content === null || typeof row.content === 'string')
          && typeof row.delivery_status === 'string'
          && typeof row.created_at === 'string'
        )
      )
    ))
  ) {
    console.error('Website conversation read returned an invalid row shape');
    return NextResponse.json({ error: 'Unable to load saved conversation' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // A completed conversation must not leave this browser unable to start a new chat.
  // Expire only its token; messages and staff history remain untouched.
  if (first.mode === 'CLOSED') {
    const response = NextResponse.json({ data: null }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(WEBSITE_CONVERSATION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: WEBSITE_CONVERSATION_COOKIE_PATH,
      maxAge: 0,
    });
    return response;
  }

  const messages = rows.flatMap((row) => row.message_id
    ? [{
      id: row.message_id,
      senderType: row.sender_type,
      content: row.content,
      deliveryStatus: row.delivery_status,
      createdAt: row.created_at,
    }]
    : []);
  let currentProperties: NiaSearchProperty[];
  try {
    const context = normalizeNiaContext(first.nia_context);
    const propertyIds = context.selectedPropertyId
      ? [context.selectedPropertyId]
      : context.recentPropertyIds;
    const properties = await getNiaPublicPropertiesByIds(supabase, propertyIds);
    currentProperties = properties.map(({ id, title, location, priceLabel }) => ({
      id,
      title,
      location,
      priceLabel,
    }));
  } catch {
    return NextResponse.json({ error: 'Unable to load current conversation context' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json({
    data: {
      conversationId: first.conversation_id,
      mode: first.mode,
      messages,
      currentProperties,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
