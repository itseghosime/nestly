import { timingSafeEqual } from 'node:crypto';
import type { NiaSearchProperty } from '@/lib/backend/nia-property-search';

const TELEGRAM_TOKEN_PATTERN = /^([1-9]\d{4,19}):[A-Za-z0-9_-]{20,}$/;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const MAX_TELEGRAM_TEXT_LENGTH = 4096;

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

function cleanTelegramListingField(value: string, maxLength: number): string {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(normalized);
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join('')}…`
    : normalized;
}

export function formatTelegramPropertySearchReply(
  count: number,
  properties: readonly NiaSearchProperty[],
  siteUrl: string,
  introduction?: string,
): string {
  if (!Number.isSafeInteger(count) || count < 1 || count < properties.length || !properties.length) {
    throw new Error('Invalid Telegram property search results');
  }

  let siteOrigin: string;
  try {
    const site = new URL(siteUrl);
    if (site.protocol !== 'http:' && site.protocol !== 'https:') {
      throw new Error('Unsupported site URL protocol');
    }
    siteOrigin = site.origin;
  } catch {
    throw new Error('Invalid public site URL for Telegram listing links');
  }

  const summary = `I found ${count} available home${count === 1 ? '' : 's'} matching your preferences.`;
  const sections = introduction ? [cleanTelegramListingField(introduction, 240), summary] : [summary];
  let includedCount = 0;

  for (const [index, property] of properties.entries()) {
    const propertyId = property.id.trim();
    if (!propertyId || propertyId.length > 128) {
      throw new Error('Invalid public property ID for Telegram listing link');
    }
    const link = new URL(`/property/${encodeURIComponent(propertyId)}`, siteOrigin).toString();
    const section = [
      `${index + 1}. ${cleanTelegramListingField(property.title, 180) || 'Title not listed publicly'}`,
      `   Location: ${cleanTelegramListingField(property.location, 120) || 'Not listed publicly'}`,
      `   Rent: ${cleanTelegramListingField(property.priceLabel, 120) || 'Not listed publicly'}`,
      `   Link: ${link}`,
    ].join('\n');
    const candidate = [...sections, section].join('\n\n');
    if (candidate.length > MAX_TELEGRAM_TEXT_LENGTH) break;
    sections.push(section);
    includedCount += 1;
  }

  if (includedCount < properties.length) {
    const moreLink = new URL('/browse', siteOrigin).toString();
    const note = `More matching listings are available at ${moreLink}.`;
    if ([...sections, note].join('\n\n').length <= MAX_TELEGRAM_TEXT_LENGTH) {
      sections.push(note);
    }
  }

  const followUp = "Which one catches your eye? Say \"the first one\" or ask about a listing's fees.";
  if ([...sections, followUp].join('\n\n').length <= MAX_TELEGRAM_TEXT_LENGTH) {
    sections.push(followUp);
  }
  return sections.join('\n\n');
}

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

export const TELEGRAM_WEBHOOK_DESTINATION =
  'https://nestly-sigma.vercel.app/api/telegram/webhook';

type TelegramWebhookInfo = {
  url: string;
  maxConnections: number | null;
  allowedUpdates: string[] | null;
  pendingUpdateCount: number | null;
};

export type TelegramWebhookSetupResult =
  | {
    status: 'registered';
    pendingUpdateCount: number;
  }
  | {
    status: 'different_webhook';
    currentHost: string | null;
  }
  | {
    status: 'provider_unavailable' | 'verification_failed';
  };

function parseTelegramWebhookInfo(value: unknown): TelegramWebhookInfo | null {
  if (!isRecord(value) || typeof value.url !== 'string') return null;
  const maxConnections = value.max_connections;
  const allowedUpdates = value.allowed_updates;
  const pendingUpdateCount = value.pending_update_count;
  return {
    url: value.url,
    maxConnections: typeof maxConnections === 'number' && Number.isSafeInteger(maxConnections)
      ? maxConnections
      : null,
    allowedUpdates: Array.isArray(allowedUpdates)
      && allowedUpdates.every((item): item is string => typeof item === 'string')
      ? allowedUpdates
      : null,
    pendingUpdateCount: typeof pendingUpdateCount === 'number'
      && Number.isSafeInteger(pendingUpdateCount)
      && pendingUpdateCount >= 0
      ? pendingUpdateCount
      : null,
  };
}

async function callTelegramAdminApi(
  token: string,
  method: 'getWebhookInfo' | 'setWebhook',
  body: Record<string, unknown> | undefined,
  fetcher: typeof fetch,
): Promise<unknown | null> {
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await readProviderJson(response);
    if (!response.ok || !isRecord(payload) || payload.ok !== true) return null;
    return payload.result;
  } catch {
    return null;
  }
}

function safeWebhookHost(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export async function setupTelegramWebhook(
  token: string,
  webhookSecret: string,
  fetcher: typeof fetch = fetch,
): Promise<TelegramWebhookSetupResult> {
  const beforeValue = await callTelegramAdminApi(token, 'getWebhookInfo', undefined, fetcher);
  const before = parseTelegramWebhookInfo(beforeValue);
  if (!before) return { status: 'provider_unavailable' };
  if (before.url && before.url !== TELEGRAM_WEBHOOK_DESTINATION) {
    return {
      status: 'different_webhook',
      currentHost: safeWebhookHost(before.url),
    };
  }

  const setResult = await callTelegramAdminApi(token, 'setWebhook', {
    url: TELEGRAM_WEBHOOK_DESTINATION,
    allowed_updates: ['message'],
    max_connections: 1,
    drop_pending_updates: false,
    secret_token: webhookSecret,
  }, fetcher);
  if (setResult !== true) return { status: 'provider_unavailable' };

  const afterValue = await callTelegramAdminApi(token, 'getWebhookInfo', undefined, fetcher);
  const after = parseTelegramWebhookInfo(afterValue);
  if (
    !after
    || after.url !== TELEGRAM_WEBHOOK_DESTINATION
    || after.maxConnections !== 1
    || after.allowedUpdates?.length !== 1
    || after.allowedUpdates[0] !== 'message'
    || after.pendingUpdateCount === null
  ) {
    return { status: 'verification_failed' };
  }

  return {
    status: 'registered',
    pendingUpdateCount: after.pendingUpdateCount,
  };
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
