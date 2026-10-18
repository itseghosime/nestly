import type { NiaSearchProperty } from '@/lib/backend/nia-property-search';

export type NiaWebsiteSender = 'customer' | 'nia' | 'agent' | 'system';
export type NiaWebsiteMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED';

export interface NiaWebsiteMessage {
  id: string;
  senderType: NiaWebsiteSender;
  content: string | null;
  deliveryStatus: string;
  createdAt: string;
}

export interface NiaWebsiteConversationSnapshot {
  conversationId: string;
  mode: NiaWebsiteMode;
  messages: NiaWebsiteMessage[];
  currentProperties: NiaSearchProperty[];
}

export interface NiaWebsiteReply {
  mode: NiaWebsiteMode;
  message: string;
  properties: NiaSearchProperty[];
}

const SENDERS = new Set<NiaWebsiteSender>(['customer', 'nia', 'agent', 'system']);
const MODES = new Set<NiaWebsiteMode>(['AI_ACTIVE', 'HUMAN_ACTIVE', 'CLOSED']);

function isProperty(value: unknown): value is NiaSearchProperty {
  if (!value || typeof value !== 'object') return false;
  const property = value as Record<string, unknown>;
  return typeof property.id === 'string'
    && typeof property.title === 'string'
    && typeof property.location === 'string'
    && typeof property.priceLabel === 'string';
}

function isMessage(value: unknown): value is NiaWebsiteMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === 'string'
    && typeof message.senderType === 'string'
    && SENDERS.has(message.senderType as NiaWebsiteSender)
    && (message.content === null || typeof message.content === 'string')
    && typeof message.deliveryStatus === 'string'
    && typeof message.createdAt === 'string';
}

export function isNiaWebsiteConversationSnapshot(value: unknown): value is NiaWebsiteConversationSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.conversationId === 'string'
    && typeof snapshot.mode === 'string'
    && MODES.has(snapshot.mode as NiaWebsiteMode)
    && Array.isArray(snapshot.messages)
    && snapshot.messages.every(isMessage)
    && Array.isArray(snapshot.currentProperties)
    && snapshot.currentProperties.every(isProperty);
}

export function isNiaWebsiteReply(value: unknown): value is NiaWebsiteReply {
  if (!value || typeof value !== 'object') return false;
  const reply = value as Record<string, unknown>;
  return typeof reply.mode === 'string'
    && MODES.has(reply.mode as NiaWebsiteMode)
    && typeof reply.message === 'string'
    && Array.isArray(reply.properties)
    && reply.properties.every(isProperty);
}
