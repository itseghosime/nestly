import { describe, expect, it } from 'vitest';
import { isNiaWebsiteConversationSnapshot, isNiaWebsiteReply } from '@/lib/backend/nia-conversation-contract';
import { SYNTHETIC_CONVERSATION_SNAPSHOT, SYNTHETIC_MESSAGE_RESPONSE } from '@/scripts/ui-release-fixtures.mjs';

describe('UI browser fixtures match Nia runtime contracts', () => {
  it('loads a valid saved conversation rather than exercising the recovery state', () => {
    expect(isNiaWebsiteConversationSnapshot(SYNTHETIC_CONVERSATION_SNAPSHOT.data)).toBe(true);
  });
  it('uses the actual website reply envelope', () => {
    expect(isNiaWebsiteReply(SYNTHETIC_MESSAGE_RESPONSE.data)).toBe(true);
  });
  it('rejects the old snapshot and reply shapes', () => {
    expect(isNiaWebsiteConversationSnapshot({ id: 'conv-synthetic-001', mode: null, messages: [], currentProperties: [] })).toBe(false);
    expect(isNiaWebsiteReply({ conversationId: 'conv-synthetic-001', reply: 'text', properties: [] })).toBe(false);
  });
});

