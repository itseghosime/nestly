import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTelegramServerSettings, sendTelegramText } from '@/lib/backend/telegram';

type HandoffAlert = { conversationId: string; eventId: string; channel: 'website' | 'telegram' };

/** No transcript, customer identity or credentials are copied into the staff alert. */
export async function notifyTelegramHandoff(
  input: HandoffAlert,
  options: { client?: SupabaseClient; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {},
): Promise<'accepted' | 'duplicate' | 'disabled' | 'unavailable' | 'unknown' | 'rejected'> {
  const env = options.env ?? process.env;
  const settings = getTelegramServerSettings(env);
  const chatId = Number(env.TELEGRAM_HANDOFF_CHAT_ID);
  if (!settings.outboundEnabled || !settings.token || !settings.botId || !Number.isSafeInteger(chatId) || chatId <= 0) return 'disabled';
  if (!/^[0-9a-f-]{36}$/i.test(input.conversationId) || !input.eventId || input.eventId.length > 200) return 'unavailable';
  let origin: URL;
  try {
    origin = new URL(env.NEXT_PUBLIC_SITE_URL || '');
    if (origin.protocol !== 'https:' || origin.username || origin.password) return 'unavailable';
  } catch { return 'unavailable'; }
  const client = options.client ?? createAdminClient();
  const state = await client.from('conversations').select('mode').eq('id', input.conversationId).maybeSingle();
  if (state.error || state.data?.mode !== 'HUMAN_ACTIVE') return 'unavailable';
  // Internal dashboard outbox entry: the template identifies the Telegram transport.
  // Unique idempotency key claims a send once, including across concurrent requests.
  const claim = await client.from('notifications').insert({
    conversation_id: input.conversationId,
    channel: 'dashboard',
    recipient: `telegram:${chatId}`,
    template_key: 'human_handoff.telegram_alert',
    idempotency_key: `telegram-staff-alert:${input.conversationId}:${input.eventId}`,
    status: 'queued',
    attempts: 1,
  }).select('id').single();
  if (claim.error?.code === '23505') return 'duplicate';
  if (claim.error || !claim.data?.id) return 'unavailable';
  const text = [
    '🔔 Nestly · Human assistance requested',
    `Channel: ${input.channel === 'telegram' ? 'Telegram' : 'Website chat'}`,
    'Nia has paused this conversation for staff assistance.',
    `Open conversation: ${new URL(`/staff/inbox/${input.conversationId}`, origin.origin)}`,
    'Sign in, then choose Assign to me to reply.',
  ].join('\n\n');
  const sent = await sendTelegramText(settings.token, chatId, text, options.fetcher);
  const record = await client.from('notifications').update({
    status: sent.outcome === 'accepted' ? 'sent' : sent.outcome === 'rejected' ? 'failed' : 'queued',
    ...(sent.outcome === 'accepted' ? { provider_message_id: `telegram-staff:${chatId}:${sent.telegramMessageId}` } : {}),
    last_error: sent.outcome === 'accepted' ? null : sent.errorCode,
    updated_at: new Date().toISOString(),
  }).eq('id', claim.data.id);
  if (record.error) console.warn('Telegram handoff alert status persistence unavailable');
  // An unknown network outcome is never automatically retried: that could duplicate a delivered alert.
  return sent.outcome;
}

/** Staff notification work must not extend the customer's response time. */
export function scheduleTelegramHandoffAlert(input: HandoffAlert) {
  if (!process.env.TELEGRAM_HANDOFF_CHAT_ID) return;
  after(async () => {
    try {
      const outcome = await notifyTelegramHandoff(input);
      console.info('Telegram staff handoff alert', { outcome });
    } catch {
      console.warn('Telegram staff handoff alert unavailable');
    }
  });
}
