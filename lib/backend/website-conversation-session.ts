import { createHash, randomBytes } from 'node:crypto';

export const WEBSITE_CONVERSATION_COOKIE = 'nestly_website_conversation';
export const WEBSITE_CONVERSATION_COOKIE_PATH = '/api/nia/conversations';
export const WEBSITE_CONVERSATION_MAX_AGE = 60 * 60 * 24 * 30;

export function createWebsiteConversationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashWebsiteConversationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWebsiteConversationToken(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{40,48}$/.test(value));
}
