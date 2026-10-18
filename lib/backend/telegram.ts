import { timingSafeEqual } from 'node:crypto';

const TELEGRAM_TOKEN_PATTERN = /^([1-9]\d{4,19}):[A-Za-z0-9_-]{20,}$/;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export interface TelegramServerSettings {
  token: string | null;
  webhookSecret: string | null;
  botId: number | null;
  outboundEnabled: boolean;
  configured: boolean;
  webhookSecretConfigured: boolean;
}

export type ParsedTelegramUpdate =
  | {
    kind: 'private_message';
    updateId: number;
    userId: number;
    chatId: number;
    text: string;
    displayName: string;
    username: string | null;
  }
  | { kind: 'unsupported'; updateId: number }
  | { kind: 'invalid' };

export type TelegramSendResult =
  | { outcome: 'accepted'; telegramMessageId: number }
  | { outcome: 'rejected' | 'unknown'; errorCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeTelegramId(value: unknown, allowZero = false): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && (allowZero ? value >= 0 : value > 0);
}

export function getTelegramBotId(token: string | undefined): number | null {
  if (!token) return null;
  const match = TELEGRAM_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const botId = Number(match[1]);
  return safeTelegramId(botId) ? botId : null;
}

export function getTelegramServerSettings(
  env: NodeJS.ProcessEnv = process.env,
): TelegramServerSettings {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
  const botId = getTelegramBotId(token ?? undefined);
  const validWebhookSecret = Boolean(
    webhookSecret
    && /^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret),
  );
  const configured = Boolean(token && validWebhookSecret && botId);
  return {
    token,
    webhookSecret,
    botId,
    outboundEnabled: env.TELEGRAM_OUTBOUND_ENABLED === 'true',
    configured,
    webhookSecretConfigured: validWebhookSecret,
  };
}

export function isTelegramWebhookSecretValid(
  supplied: string | null,
  expected: string | null,
): boolean {
  if (!supplied || !expected) return false;
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function readBoundedWebhookBody(
  request: Request,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): Promise<string | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

export function parseTelegramUpdate(value: unknown): ParsedTelegramUpdate {
  if (!isRecord(value) || !safeTelegramId(value.update_id, true)) return { kind: 'invalid' };
  const updateId = value.update_id;
  if (!Object.prototype.hasOwnProperty.call(value, 'message')) {
    return { kind: 'unsupported', updateId };
  }
  const message = value.message;
  if (!isRecord(message) || !isRecord(message.chat)) return { kind: 'invalid' };
  if (message.chat.type !== 'private') return { kind: 'unsupported', updateId };
  if (!isRecord(message.from)) return { kind: 'invalid' };
  if (message.from.is_bot === true) return { kind: 'unsupported', updateId };
  if (!safeTelegramId(message.from.id) || !safeTelegramId(message.chat.id)) return { kind: 'invalid' };
  if (message.from.id !== message.chat.id) return { kind: 'invalid' };
  if (typeof message.text !== 'string') return { kind: 'unsupported', updateId };
  const text = message.text.trim();
  if (!text || text.length > 4000) return { kind: 'invalid' };
  const firstName = typeof message.from.first_name === 'string' ? message.from.first_name.trim() : '';
  const lastName = typeof message.from.last_name === 'string' ? message.from.last_name.trim() : '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ').slice(0, 120) || 'Telegram customer';
  const username = typeof message.from.username === 'string'
    ? message.from.username.trim().replace(/^@/, '').slice(0, 64) || null
    : null;
  return {
    kind: 'private_message',
    updateId,
    userId: message.from.id,
    chatId: message.chat.id,
    text,
    displayName,
    username,
  };
}

async function readProviderJson(response: Response): Promise<unknown | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32 * 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    return null;
  }
}

export async function sendTelegramText(
  token: string,
  chatId: number,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<TelegramSendResult> {
  let response: Response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { outcome: 'unknown', errorCode: 'NETWORK_OUTCOME_UNKNOWN' };
  }

  if (response.status >= 500 || response.status === 408) {
    return { outcome: 'unknown', errorCode: `TELEGRAM_HTTP_${response.status}` };
  }
  let providerResponse: unknown | null;
  try {
    providerResponse = await readProviderJson(response);
  } catch {
    return { outcome: 'unknown', errorCode: 'PROVIDER_RESPONSE_UNREADABLE' };
  }
  if (!providerResponse || !isRecord(providerResponse)) {
    return {
      outcome: response.status >= 400 && response.status < 500
        ? 'rejected'
        : 'unknown',
      errorCode: response.status >= 400 && response.status < 500
        ? `TELEGRAM_HTTP_${response.status}`
        : 'INVALID_PROVIDER_RESPONSE',
    };
  }
  if (
    response.ok
    && providerResponse.ok === true
    && isRecord(providerResponse.result)
    && safeTelegramId(providerResponse.result.message_id)
  ) {
    return { outcome: 'accepted', telegramMessageId: providerResponse.result.message_id };
  }
  if (providerResponse.ok === false || (response.status >= 400 && response.status < 500)) {
    const errorCode = safeTelegramId(providerResponse.error_code)
      ? `TELEGRAM_API_${providerResponse.error_code}`
      : `TELEGRAM_HTTP_${response.status}`;
    return { outcome: 'rejected', errorCode };
  }
  return { outcome: 'unknown', errorCode: 'INVALID_PROVIDER_RESPONSE' };
}
