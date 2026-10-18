import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { answerNiaConversationMessage } from '@/lib/backend/nia-conversation-response';
import { isNiaHandoffRequest } from '@/lib/backend/nia-conversation-context';
import { getIdempotencyKey, guardPublicRequest } from '@/lib/backend/public-request';
import {
  createWebsiteConversationToken,
  hashWebsiteConversationToken,
  isWebsiteConversationToken,
  WEBSITE_CONVERSATION_COOKIE,
  WEBSITE_CONVERSATION_COOKIE_PATH,
  WEBSITE_CONVERSATION_MAX_AGE,
} from '@/lib/backend/website-conversation-session';
import { createClient } from '@/lib/supabase/server';

const messageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const validMode = (value: unknown): value is 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED' => (
  value === 'AI_ACTIVE' || value === 'HUMAN_ACTIVE' || value === 'CLOSED'
);

async function getConversationState(supabase: Awaited<ReturnType<typeof createClient>>, tokenHash: string) {
  const { data, error } = await supabase.rpc('get_website_conversation_v2', {
    p_token_hash: tokenHash,
  });
  if (error) {
    console.error('Website conversation state lookup failed', error.code || 'unknown');
    throw new Error('CONVERSATION_STATE_UNAVAILABLE');
  }
  const rows = Array.isArray(data) ? data : [];
  const first = rows[0];
  if (!first) return null;
  if (!validMode(first.mode) || typeof first.conversation_id !== 'string') {
    throw new Error('CONVERSATION_STATE_INVALID');
  }
  return {
    conversationId: first.conversation_id as string,
    mode: first.mode,
    context: first.nia_context,
  };
}

function errorResponse(error: { code?: string }, fallback: string) {
  if (error.code === '22023') {
    return NextResponse.json({ error: 'The message or conversation state is invalid' }, { status: 409 });
  }
  if (error.code === '23505') {
    return NextResponse.json({ error: 'This request identifier was already used' }, { status: 409 });
  }
  if (error.code === '42501') {
    return NextResponse.json({ error: 'This conversation session is no longer available' }, { status: 401 });
  }
  console.error(fallback, error.code || 'unknown');
  return NextResponse.json({ error: fallback }, { status: 503 });
}

function attachSessionCookie(response: NextResponse, token: string | null, isNewConversation: boolean) {
  if (token && isNewConversation) {
    response.cookies.set(WEBSITE_CONVERSATION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: WEBSITE_CONVERSATION_COOKIE_PATH,
      maxAge: WEBSITE_CONVERSATION_MAX_AGE,
    });
  }
  return response;
}

export async function POST(request: Request) {
  const rateLimitFailure = await guardPublicRequest(request, 'nia-conversation-write', {
    maxRequests: 30,
    windowSeconds: 60,
  });
  if (rateLimitFailure) return rateLimitFailure;

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'A valid Idempotency-Key header is required' }, { status: 400 });
  }
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a message of at most 4000 characters' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(WEBSITE_CONVERSATION_COOKIE)?.value;
  let token = isWebsiteConversationToken(existingToken) ? existingToken : null;
  let isNewConversation = false;
  const supabase = await createClient();
  let state = token
    ? await getConversationState(supabase, hashWebsiteConversationToken(token))
    : null;

  if (!state) {
    token = createWebsiteConversationToken();
    const tokenHash = hashWebsiteConversationToken(token);
    const { error } = await supabase.rpc('create_website_conversation', {
      p_name: 'Website visitor',
      p_email: null,
      p_phone: null,
      p_initial_message: parsed.data.content,
      p_token_hash: tokenHash,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return errorResponse(error, 'Unable to save your message');
    isNewConversation = true;
    try {
      state = await getConversationState(supabase, tokenHash);
    } catch {
      return attachSessionCookie(NextResponse.json({ error: 'Your message was saved, but the conversation could not be loaded' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }), token, isNewConversation);
    }
    if (!state) {
      console.error('Website conversation creation returned no readable conversation');
      return attachSessionCookie(NextResponse.json({ error: 'Unable to load the saved conversation' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }), token, isNewConversation);
    }
  } else {
    if (!token) {
      return NextResponse.json({ error: 'Unable to establish the saved conversation' }, { status: 503 });
    }
    if (state.mode === 'CLOSED') {
      return NextResponse.json({ error: 'This conversation is closed' }, { status: 409 });
    }
    const { error } = await supabase.rpc('submit_website_message', {
      p_token_hash: hashWebsiteConversationToken(token),
      p_content: parsed.data.content,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return errorResponse(error, 'Unable to save your message');
  }

  if (!token || !state) {
    console.error('Website conversation session could not be established');
    return NextResponse.json({ error: 'Unable to establish the saved conversation' }, { status: 503 });
  }
  const tokenHash = hashWebsiteConversationToken(token);
  if (isNiaHandoffRequest(parsed.data.content) && state.mode === 'AI_ACTIVE') {
    const { error } = await supabase.rpc('request_website_handoff', {
      p_token_hash: tokenHash,
      p_idempotency_key: `${idempotencyKey}:handoff`,
    });
    if (error) return attachSessionCookie(errorResponse(error, 'Unable to request a staff handoff'), token, isNewConversation);
    state = await getConversationState(supabase, tokenHash);
  } else if (state.mode === 'AI_ACTIVE') {
    try {
      const answer = await answerNiaConversationMessage(supabase, parsed.data.content, state.context);
      const { error } = await supabase.rpc('append_website_nia_reply', {
        p_token_hash: tokenHash,
        p_content: answer.message,
        p_idempotency_key: `${idempotencyKey}:nia`,
        p_context: answer.context,
      });
      if (error) return attachSessionCookie(errorResponse(error, 'Unable to save Nia’s reply'), token, isNewConversation);

      return attachSessionCookie(NextResponse.json({
        data: {
          mode: state.mode,
          message: answer.message,
          properties: answer.properties,
        },
      }, { headers: { 'Cache-Control': 'no-store' } }), token, isNewConversation);
    } catch (serviceError) {
      const code = serviceError instanceof Error ? serviceError.message : 'unknown';
      console.error('Nia conversation response failed', code);
      return attachSessionCookie(NextResponse.json({ error: 'Your message was saved, but Nia could not prepare a reply' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }), token, isNewConversation);
    }
  }

  return attachSessionCookie(NextResponse.json({
    data: {
      mode: state?.mode ?? 'HUMAN_ACTIVE',
      message: state?.mode === 'HUMAN_ACTIVE'
        ? 'Your message is saved. A Nestly teammate is handling this conversation.'
        : 'This conversation is closed.',
      properties: [],
    },
  }, { headers: { 'Cache-Control': 'no-store' } }), token, isNewConversation);
}
