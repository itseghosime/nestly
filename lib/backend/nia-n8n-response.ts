import { getNiaSocialReply } from '@/lib/backend/nia-social-reply';
import type { NiaConversationAnswer } from '@/lib/backend/nia-conversation-response';

export type NiaHistoryMessage = { role: 'user' | 'assistant' | 'staff'; content: string };
export type NiaAiResult =
  | { status: 'generated'; message: string; kind: 'grounded' | 'conversation' }
  | { status: 'fallback'; reason: string };

export function sanitizeNiaHistory(rows: unknown, currentMessageId: string): NiaHistoryMessage[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === 'object' && row.id !== currentMessageId
    && typeof row.content === 'string')
    .slice(0, 10).reverse().map((row) => ({
      role: row.direction === 'inbound' ? 'user' as const
        : row.sender_type === 'staff' ? 'staff' as const : 'assistant' as const,
      content: row.content.slice(0, 1500),
    }));
}

export async function generateNiaAiReply(
  input: { requestId: string; query: string; answer: NiaConversationAnswer; history: NiaHistoryMessage[]; returningUser?: boolean },
  options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {},
): Promise<NiaAiResult> {
  const env = options.env ?? process.env;
  if (env.NIA_N8N_ENABLED !== 'true') return { status: 'fallback', reason: 'DISABLED' };
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  let url: URL;
  try {
    url = new URL(env.NIA_N8N_WEBHOOK_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('invalid URL');
    }
  } catch { return { status: 'fallback', reason: 'INVALID_CONFIG' }; }
  if (!secret) return { status: 'fallback', reason: 'INVALID_CONFIG' };
  const kind = input.answer.searchResultCount !== undefined || input.answer.properties.length > 0
    ? 'grounded' : 'conversation';
  const body = JSON.stringify({
    version: 1, requestId: input.requestId, query: input.query,
    visitor: { returningUser: input.returningUser === true },
    answerKind: kind, context: input.answer.context,
    history: input.history.slice(-10),
    grounding: { message: input.answer.message, properties: input.answer.properties, searchResultCount: input.answer.searchResultCount },
  });
  if (body.length > 32000) return { status: 'fallback', reason: 'REQUEST_TOO_LARGE' };
  try {
    const response = await (options.fetcher ?? fetch)(url.toString(), {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Nestly-Relay-Secret': secret },
      body, signal: AbortSignal.timeout(18_000),
    });
    if (!response.ok) return { status: 'fallback', reason: 'AGENT_UNAVAILABLE' };
    // Stream with a hard bound; a malformed endpoint cannot exhaust server memory.
    if (!response.body) return { status: 'fallback', reason: 'INVALID_RESPONSE' };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16_384) {
          await reader.cancel();
          return { status: 'fallback', reason: 'RESPONSE_TOO_LARGE' };
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
    if (!payload || payload.version !== 1 || payload.requestId !== input.requestId
      || typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 1200) {
      return { status: 'fallback', reason: 'INVALID_RESPONSE' };
    }
    const message = payload.message.trim();
    // Public links and money always come from the canonical backend output.
    if (/https?:\/\/|www\.|[₦$£€]|\b(?:NGN|USD|GBP|naira|million|billion)\b/i.test(message)
      || /<\/?[a-z][^>]*>|\x00/i.test(message)
      || (kind === 'grounded' && (message.length > 240 || /\d/.test(message)))) {
      return { status: 'fallback', reason: 'UNSAFE_RESPONSE' };
    }
    const welcome = getReturningNiaGreeting(input.query, input.returningUser === true);
    return { status: 'generated', message: welcome && !/welcome back/i.test(message) ? welcome : message, kind };
  } catch { return { status: 'fallback', reason: 'AGENT_UNAVAILABLE' }; }
}

export function getReturningNiaGreeting(query: string, returningUser: boolean): string | null {
  const social = getNiaSocialReply(query, false);
  return returningUser && social && /^(?:Hey!|Hello!|Hi!)/.test(social)
    ? 'Welcome back! 👋 How can I help you today?'
    : null;
}

export async function hasPriorTelegramMessages(
  client: import('@supabase/supabase-js').SupabaseClient,
  identity: { botId: number; userId: number; currentMessageId: string },
): Promise<boolean> {
  const lookup = await client.from('telegram_identities').select('id')
    .eq('bot_id', identity.botId).eq('telegram_user_id', identity.userId).maybeSingle();
  if (lookup.error || !lookup.data || typeof lookup.data.id !== 'string') return false;
  const prior = await client.from('messages')
    .select('id, conversation:conversations!inner(telegram_identity_id)')
    .eq('conversation.telegram_identity_id', lookup.data.id)
    .eq('direction', 'inbound').neq('id', identity.currentMessageId).limit(1);
  return !prior.error && Array.isArray(prior.data) && prior.data.length > 0;
}
