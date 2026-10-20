import { getTelegramServerSettings, TELEGRAM_WEBHOOK_DESTINATION } from '@/lib/backend/telegram';

export type IntegrationStatus = {
  id: string; name: string; category: string; iconType: string;
  state: 'verified' | 'configured' | 'disabled' | 'unavailable' | 'deferred';
  label: string; detail: string;
};

export async function inspectStaffIntegrations(databaseReachable: boolean, env = process.env): Promise<IntegrationStatus[]> {
  const telegram = getTelegramServerSettings(env);
  const entries: IntegrationStatus[] = [{
    id: 'database', name: 'Supabase Database', category: 'Core data', iconType: 'database',
    state: databaseReachable ? 'verified' : 'unavailable',
    label: databaseReachable ? 'Database query passed' : 'Database query failed',
    detail: 'Read-only query using your staff session. This does not verify every database operation.',
  }];
  let telegramState: IntegrationStatus['state'] = telegram.configured ? 'configured' : 'unavailable';
  let telegramLabel = telegram.configured ? 'Configured; check unavailable' : 'Configuration incomplete';
  let telegramDetail = 'No message was sent. No delivery or read status is inferred.';
  if (telegram.configured && telegram.token) {
    try {
      const responses = await Promise.all(['getMe', 'getWebhookInfo'].map(method => fetch(
        `https://api.telegram.org/bot${telegram.token}/${method}`,
        { cache: 'no-store', signal: AbortSignal.timeout(4000), redirect: 'error' },
      )));
      if (responses.some(response => !response.ok)) throw new Error('Provider check failed');
      const [identity, webhook] = await Promise.all(responses.map(response => response.json()));
      if (identity.ok !== true || identity.result?.id !== telegram.botId || webhook.ok !== true) throw new Error('Provider check failed');
      const expected = env.NEXT_PUBLIC_SITE_URL
        ? new URL('/api/telegram/webhook', env.NEXT_PUBLIC_SITE_URL).toString()
        : TELEGRAM_WEBHOOK_DESTINATION;
      const matches = webhook.result?.url === expected;
      const hasError = typeof webhook.result?.last_error_date === 'number';
      telegramState = matches && !hasError ? 'verified' : 'configured';
      telegramLabel = !matches ? 'Webhook destination mismatch' : hasError ? 'Webhook has a recorded error' : 'Bot and webhook verified';
      telegramDetail = `Read-only bot identity and webhook check. Outbound sending is ${telegram.outboundEnabled ? 'enabled' : 'disabled'}. No test message was sent. A matching webhook does not prove message delivery.`;
    } catch {
      // Never log a provider error: request URLs contain the bot token.
    }
  }
  entries.push({ id: 'telegram', name: 'Telegram', category: 'Active customer channel', iconType: 'chat', state: telegramState, label: telegramLabel, detail: telegramDetail });
  let niaConfigured = false;
  try {
    const url = new URL(env.NIA_N8N_WEBHOOK_URL || '');
    niaConfigured = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && Boolean(env.NESTLY_WF01_RELAY_SECRET?.trim());
  } catch { /* No endpoint is exposed to the browser. */ }
  const niaEnabled = env.NIA_N8N_ENABLED === 'true';
  entries.push({ id: 'nia', name: 'Nia · n8n AI', category: 'Conversation intelligence', iconType: 'bot',
    state: !niaEnabled ? 'disabled' : niaConfigured ? 'configured' : 'unavailable',
    label: !niaEnabled ? 'Disabled' : niaConfigured ? 'Enabled and configured' : 'Configuration incomplete',
    detail: 'Configuration only. The AI webhook is not invoked by this page; model availability and reply quality are not verified by this check.',
  });
  entries.push({ id: 'whatsapp', name: 'WhatsApp', category: 'Historical channel', iconType: 'chat', state: 'deferred', label: 'Deferred',
    detail: `Website channel is deferred. New staff outbound is ${env.TWILIO_OUTBOUND_ENABLED === 'true' ? 'ENABLED — review the release configuration' : 'disabled'}. Historical callbacks and n8n workflows are preserved. External inbound webhook activity is not checked here.`,
  });
  return entries;
}
