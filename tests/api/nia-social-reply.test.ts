import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNiaSocialReply } from '@/lib/backend/nia-social-reply';
import { answerNiaConversationMessage } from '@/lib/backend/nia-conversation-response';
import { searchNiaPublicProperties } from '@/lib/backend/nia-public-search';

vi.mock('@/lib/backend/nia-public-search', () => ({ searchNiaPublicProperties: vi.fn() }));

const savedContext = {
  preferences: { location: 'GRA', bedrooms: 2, keywords: ['solar'] },
  recentPropertyIds: ['property-1', 'property-2'],
  selectedPropertyId: 'property-2',
};
const from = vi.fn();
const client = { from } as unknown as SupabaseClient;

beforeEach(() => { vi.clearAllMocks(); });

describe('Nia conversational replies', () => {
  it.each(['Hey', 'HEY!!!', 'Hi Nia 👋', 'Hello', 'Good evening Nia', '/start', '/help@nestly_nia_bot'])(
    'welcomes %s without searching or changing saved context',
    async (query) => {
      const before = JSON.stringify(savedContext);
      const answer = await answerNiaConversationMessage(client, query, savedContext);
      expect(answer.message).toMatch(/Hey|Hello|Hi/);
      expect(answer.message).not.toMatch(/not sure|recall or change|preferences are unchanged/i);
      expect(answer.context).toEqual(savedContext);
      expect(JSON.stringify(savedContext)).toBe(before);
      expect(answer.properties).toEqual([]);
      expect(from).not.toHaveBeenCalled();
      expect(searchNiaPublicProperties).not.toHaveBeenCalled();
    },
  );
  it('asks a new visitor one welcoming question', async () => {
    const answer = await answerNiaConversationMessage(client, 'Hey', null);
    expect(answer.message).toContain("I'm Nia");
    expect(answer.message).toContain('Which area');
    expect(answer.context.preferences).toBeNull();
  });
  it.each(['How are you?', "What's up?", 'How you dey?', 'Thanks Nia', 'Thank you so much!', 'Bye', 'Okay', "I'm frustrated", 'Who are you?', 'Are you human?'])(
    'responds to social-only %s while preserving the search',
    async (query) => {
      const answer = await answerNiaConversationMessage(client, query, savedContext);
      expect(answer.message).toBe(getNiaSocialReply(query, true));
      expect(answer.context).toEqual(savedContext);
      expect(from).not.toHaveBeenCalled();
      expect(searchNiaPublicProperties).not.toHaveBeenCalled();
    },
  );
  it('identifies Nia as a virtual assistant rather than impersonating staff', () => {
    expect(getNiaSocialReply('Are you human?', false)).toContain('virtual property assistant');
  });
  it.each(['Hey, find a two-bedroom apartment in GRA', 'Thanks, try Ugbor instead', 'Hi, what are the fees for the second one?', 'Hello, connect me to a human', 'Clear my preferences', 'Good morning, show me homes in Benin'])(
    'does not swallow an actionable request: %s',
    (query) => expect(getNiaSocialReply(query, true)).toBeNull(),
  );
  it('runs a mixed greeting and search through the grounded search', async () => {
    vi.mocked(searchNiaPublicProperties).mockResolvedValue({ count: 0, properties: [] });
    const answer = await answerNiaConversationMessage(client, 'Hi, find a two-bedroom apartment in GRA', null);
    expect(searchNiaPublicProperties).toHaveBeenCalledWith(client, expect.objectContaining({ bedrooms: 2, location: 'GRA', propertyType: 'apartment' }));
    expect(answer.message).toContain("couldn't find");
    expect(answer.context.preferences).toMatchObject({ bedrooms: 2, location: 'GRA' });
  });
  it('keeps unfamiliar messages friendly without clearing preferences', async () => {
    const answer = await answerNiaConversationMessage(client, 'The weather was lovely today', savedContext);
    expect(answer.message).toContain("I'm not quite sure");
    expect(answer.context).toEqual(savedContext);
    expect(searchNiaPublicProperties).not.toHaveBeenCalled();
  });
});
