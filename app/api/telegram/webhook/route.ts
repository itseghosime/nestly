import { generateNiaAiReply, sanitizeNiaHistory, hasPriorTelegramMessages, getReturningNiaGreeting } from '@/lib/backend/nia-n8n-response';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { answerNiaConversationMessage } from '@/lib/backend/nia-conversation-response';
import { isNiaHandoffRequest } from '@/lib/backend/nia-conversation-context';
import {
  getTelegramServerSettings,
  formatTelegramPropertySearchReply,
  isTelegramWebhookSecretValid,
  parseTelegramUpdate,
  readBoundedWebhookBody,
  sendTelegramText,
  type TelegramSendResult,
} from '@/lib/backend/telegram';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type UpdateClaim = {
  should_process: boolean;
  state: string;
  attempt_count: number;
};

type PersistedInbound = {
  conversation_id: string;
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED';
  nia_context: unknown;
  message_id: string;
};

type DispatchClaim = {
  message_id: string;
  chat_id: number | string;
  dispatch_status: string;
  delivery_status: string;
  created_at: string;
  should_dispatch: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0 || !isRecord(value[0])) return null;
  return value[0];
}

function parseUpdateClaim(value: unknown): UpdateClaim | null {
  const row = firstRow(value);
  if (
    !row
    || typeof row.should_process !== 'boolean'
    || typeof row.state !== 'string'
    || typeof row.attempt_count !== 'number'
  ) return null;
  return {
    should_process: row.should_process,
    state: row.state,
    attempt_count: row.attempt_count,
  };
}

function parsePersistedInbound(value: unknown): PersistedInbound | null {
  const row = firstRow(value);
  if (
    !row
    || typeof row.conversation_id !== 'string'
    || (row.mode !== 'AI_ACTIVE' && row.mode !== 'HUMAN_ACTIVE' && row.mode !== 'CLOSED')
    || !isRecord(row.nia_context)
    || typeof row.message_id !== 'string'
  ) return null;
  return {
    conversation_id: row.conversation_id,
    mode: row.mode,
    nia_context: row.nia_context,
    message_id: row.message_id,
  };
}

function parseDispatchClaim(value: unknown): DispatchClaim | null {
  const row = firstRow(value);
  if (
    !row
    || typeof row.message_id !== 'string'
    || !(typeof row.chat_id === 'number' || typeof row.chat_id === 'string')
    || typeof row.dispatch_status !== 'string'
    || typeof row.delivery_status !== 'string'
    || typeof row.created_at !== 'string'
    || typeof row.should_dispatch !== 'boolean'
  ) return null;
  return {
    message_id: row.message_id,
    chat_id: row.chat_id,
    dispatch_status: row.dispatch_status,
    delivery_status: row.delivery_status,
    created_at: row.created_at,
    should_dispatch: row.should_dispatch,
  };
}

function validChatId(value: number | string): number | null {
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function finishDispatch(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  result: TelegramSendResult,
) {
  const outcome = result.outcome;
  const { error } = await admin.rpc('finish_telegram_dispatch', {
    p_message_id: messageId,
    p_outcome: outcome,
    p_telegram_message_id: outcome === 'accepted' ? result.telegramMessageId : null,
    p_error_code: outcome === 'accepted' ? null : result.errorCode,
  });
  if (!error) return true;

  console.error('Telegram dispatch result could not be persisted', error.code || 'unknown');
  if (outcome === 'unknown') return false;
  const fallback = await admin.rpc('finish_telegram_dispatch', {
    p_message_id: messageId,
    p_outcome: 'unknown',
    p_telegram_message_id: null,
    p_error_code: 'TRACKING_FAILURE',
  });
  if (fallback.error) {
    console.error('Telegram uncertain dispatch tracking failed', fallback.error.code || 'unknown');
  }
  return false;
}

function acceptedSendResult(message: string) {
  return NextResponse.json({ ok: true, result: message }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function retryTelegramUpdate(message: string) {
  return NextResponse.json({ error: message }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

const ACKNOWLEDGED_UPDATE_STATES = new Set([
  'failed',
  'human_owned',
  'ignored',
  'completed',
  'dispatching',
  'rejected',
  'unknown',
]);

async function completeUpdate(
  admin: ReturnType<typeof createAdminClient>,
  botId: number,
  updateId: number,
  state: 'failed' | 'human_owned' | 'ignored',
  errorCode: string | null = null,
) {
  const { error } = await admin.rpc('complete_telegram_update', {
    p_bot_id: botId,
    p_update_id: updateId,
    p_state: state,
    p_error_code: errorCode,
  });
  if (error) console.error('Telegram update completion failed', error.code || 'unknown');
  return !error;
}

async function dispatchClaim(
  admin: ReturnType<typeof createAdminClient>,
  settings: ReturnType<typeof getTelegramServerSettings>,
  claim: DispatchClaim,
  content: string,
) {
  const chatId = validChatId(claim.chat_id);
  let result: TelegramSendResult;
  if (!settings.outboundEnabled) {
    result = { outcome: 'rejected', errorCode: 'OUTBOUND_DISABLED' };
  } else if (!settings.token || !chatId) {
    result = { outcome: 'rejected', errorCode: 'INVALID_TELEGRAM_CONFIG' };
  } else {
    result = await sendTelegramText(settings.token, chatId, content);
  }
  await finishDispatch(admin, claim.message_id, result);
}

export async function POST(request: Request) {
  const settings = getTelegramServerSettings();
  if (!settings.configured || !settings.botId || !settings.webhookSecret) {
    console.error('Telegram webhook configuration is incomplete');
    return NextResponse.json({ error: 'Telegram webhook is not configured' }, { status: 503 });
  }
  if (!isTelegramWebhookSecretValid(
    request.headers.get('x-telegram-bot-api-secret-token'),
    settings.webhookSecret,
  )) {
    return NextResponse.json({ error: 'Invalid Telegram webhook secret' }, { status: 403 });
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'Expected a JSON Telegram update' }, { status: 415 });
  }

  let body: string | null;
  try {
    body = await readBoundedWebhookBody(request);
  } catch {
    return NextResponse.json({ error: 'Unable to read Telegram update' }, { status: 400 });
  }
  if (body === null) {
    return NextResponse.json({ error: 'Telegram update exceeds the size limit' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return NextResponse.json({ error: 'Invalid Telegram update JSON' }, { status: 400 });
  }
  const parsed = parseTelegramUpdate(payload);
  if (parsed.kind === 'invalid') {
    return NextResponse.json({ error: 'Invalid Telegram update' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error('Telegram persistence client is unavailable');
    return NextResponse.json({ error: 'Telegram persistence is unavailable' }, { status: 503 });
  }

  const { data: claimData, error: claimError } = await admin.rpc('claim_telegram_update', {
    p_bot_id: settings.botId,
    p_update_id: parsed.updateId,
    p_telegram_user_id: parsed.kind === 'private_message' ? parsed.userId : null,
    p_chat_id: parsed.kind === 'private_message' ? parsed.chatId : null,
  });
  if (claimError) {
    console.error('Telegram update claim failed', claimError.code || 'unknown');
    return NextResponse.json({ error: 'Unable to claim Telegram update' }, { status: 503 });
  }
  const claim = parseUpdateClaim(claimData);
  if (!claim) {
    console.error('Telegram update claim returned an invalid result');
    return NextResponse.json({ error: 'Unable to claim Telegram update' }, { status: 503 });
  }
  if (!claim.should_process) {
    if (claim.state === 'processing') {
      return retryTelegramUpdate('Telegram update is still being processed');
    }
    if (!ACKNOWLEDGED_UPDATE_STATES.has(claim.state)) {
      console.error('Telegram update claim returned an unsupported state');
      return retryTelegramUpdate('Telegram update state is not safely acknowledgeable');
    }
    return acceptedSendResult('Update already recorded');
  }
  if (claim.state !== 'processing') {
    console.error('Telegram update claim returned a processable non-processing state');
    return retryTelegramUpdate('Telegram update state could not be confirmed');
  }
  if (parsed.kind === 'unsupported') {
    if (!await completeUpdate(admin, settings.botId, parsed.updateId, 'ignored')) {
      return NextResponse.json({ error: 'Unable to record unsupported update' }, { status: 503 });
    }
    return acceptedSendResult('Unsupported update ignored');
  }

  const { data: persistedData, error: persistError } = await admin.rpc('persist_telegram_inbound', {
    p_bot_id: settings.botId,
    p_update_id: parsed.updateId,
    p_telegram_user_id: parsed.userId,
    p_chat_id: parsed.chatId,
    p_display_name: parsed.displayName,
    p_username: parsed.username,
    p_content: parsed.text,
  });
  if (persistError) {
    console.error('Telegram inbound persistence failed', persistError.code || 'unknown');
    await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'PERSISTENCE_FAILED');
    return NextResponse.json({ error: 'Unable to save Telegram message' }, { status: 503 });
  }
  const inbound = parsePersistedInbound(persistedData);
  if (!inbound) {
    console.error('Telegram inbound persistence returned an invalid result');
    await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'INVALID_PERSIST_RESULT');
    return NextResponse.json({ error: 'Unable to save Telegram message' }, { status: 503 });
  }

  if (inbound.mode !== 'AI_ACTIVE') {
    if (!await completeUpdate(admin, settings.botId, parsed.updateId, 'human_owned')) {
      return NextResponse.json({ error: 'Unable to record Telegram ownership state' }, { status: 503 });
    }
    return acceptedSendResult('Message saved for the assigned staff member');
  }

  if (isNiaHandoffRequest(parsed.text)) {
    const { data, error } = await admin.rpc('claim_telegram_handoff_reply', {
      p_bot_id: settings.botId,
      p_update_id: parsed.updateId,
      p_content: parsed.text,
    });
    if (error) {
      console.error('Telegram handoff claim failed', error.code || 'unknown');
      await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'HANDOFF_FAILED');
      return NextResponse.json({ error: 'Unable to request staff handoff' }, { status: 503 });
    }
    const handoff = parseDispatchClaim(data);
    if (!handoff) {
      if (!await completeUpdate(admin, settings.botId, parsed.updateId, 'human_owned')) {
        return NextResponse.json({ error: 'Unable to record Telegram handoff state' }, { status: 503 });
      }
      return acceptedSendResult('Staff ownership was already active');
    }
    if (handoff.should_dispatch) {
      await dispatchClaim(
        admin,
        settings,
        handoff,
        'I have sent your request to the Nestly team. Your messages are saved here for a staff reply. This does not confirm an inspection or booking.',
      );
    }
    return acceptedSendResult('Staff handoff recorded');
  }

  if (!settings.outboundEnabled) {
    await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'OUTBOUND_DISABLED');
    return NextResponse.json({ error: 'Telegram replies are disabled; retry after outbound is enabled' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'PUBLIC_DB_CONFIG_MISSING');
    return NextResponse.json({ error: 'Nia property lookup is unavailable' }, { status: 503 });
  }

  let answer: Awaited<ReturnType<typeof answerNiaConversationMessage>>;
  let responseText: string;
  try {
    const publicClient = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    answer = await answerNiaConversationMessage(publicClient, parsed.text, inbound.nia_context);
    let returningUser = false;
    let history: ReturnType<typeof sanitizeNiaHistory> = [];
    if (process.env.NIA_N8N_ENABLED === 'true') {
      const historyResult = await admin.from('messages')
        .select('id, direction, sender_type, content')
        .eq('conversation_id', inbound.conversation_id)
        .order('created_at', { ascending: false })
        .limit(11);
      if (!historyResult.error) history = sanitizeNiaHistory(historyResult.data, inbound.message_id);
      else console.warn('Nia history lookup unavailable');
      returningUser = history.some((message) => message.role === 'user');
      if (!returningUser) {
        returningUser = await hasPriorTelegramMessages(admin, {
          botId: settings.botId, userId: parsed.userId, currentMessageId: inbound.message_id,
        });
      }
    }
    const ai = await generateNiaAiReply({
      requestId: `telegram:${settings.botId}:${parsed.updateId}`,
      query: parsed.text, answer, history, returningUser,
    });
    if (ai.status === 'fallback' && ai.reason !== 'DISABLED') {
      console.warn('Nia agent fallback', ai.reason);
    }
    const intro = ai.status === 'generated' && ai.kind === 'grounded' ? ai.message : undefined;
    responseText = answer.searchResultCount && answer.properties.length
      ? formatTelegramPropertySearchReply(
        answer.searchResultCount,
        answer.properties,
        process.env.NEXT_PUBLIC_SITE_URL || '',
        intro,
      )
      : ai.status === 'generated'
        ? ai.kind === 'grounded' ? `${ai.message}\n\n${answer.message}` : ai.message
        : getReturningNiaGreeting(parsed.text, returningUser) ?? answer.message;
  } catch (answerError) {
    const code = answerError instanceof Error ? answerError.message : 'unknown';
    console.error('Telegram Nia response failed', code);
    await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'NIA_RESPONSE_FAILED');
    return NextResponse.json({ error: 'Unable to prepare Nia response' }, { status: 503 });
  }

  const { data: replyData, error: replyError } = await admin.rpc('claim_telegram_ai_reply', {
    p_bot_id: settings.botId,
    p_update_id: parsed.updateId,
    p_content: responseText,
    p_context: answer.context,
  });
  if (replyError) {
    console.error('Telegram Nia dispatch claim failed', replyError.code || 'unknown');
    await completeUpdate(admin, settings.botId, parsed.updateId, 'failed', 'AI_DISPATCH_CLAIM_FAILED');
    return NextResponse.json({ error: 'Unable to prepare Nia response' }, { status: 503 });
  }
  const reply = parseDispatchClaim(replyData);
  if (!reply) {
    if (!await completeUpdate(admin, settings.botId, parsed.updateId, 'human_owned')) {
      return NextResponse.json({ error: 'Unable to record Telegram ownership state' }, { status: 503 });
    }
    return acceptedSendResult('Nia response suppressed after staff takeover');
  }
  if (reply.should_dispatch) await dispatchClaim(admin, settings, reply, responseText);
  return acceptedSendResult('Telegram update processed');
}
