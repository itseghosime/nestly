import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { parseNiaPropertySearch } from '@/lib/backend/nia-property-search';
import { normalizeNiaContext, resolveNiaPreferences, classifyNiaMessageIntent } from '@/lib/backend/nia-conversation-context';
import { answerNiaConversationMessage } from '@/lib/backend/nia-conversation-response';

describe('reported Aruogba conversation', () => {
  const preferences = { location: 'Aruogba', powerRequirement: '24h_solar' as const, keywords: ['solar'] };
  it.each(['24 hours solar in aruobga', '24hr solar in Aruogba', 'solar for 24 hours in Aruogba'])('understands %s', (query) => {
    expect(parseNiaPropertySearch(query)).toEqual(preferences);
    expect(classifyNiaMessageIntent(query)).toBe('search');
  });
  it('keeps the requested area and solar when the user clarifies nearby landmarks', () => {
    expect(resolveNiaPreferences('Like aruogba off gra, close to Ugbor', preferences)).toEqual(preferences);
    expect(normalizeNiaContext({ preferences }).preferences).toEqual(preferences);
  });
  it('does not treat solar backup as a round-the-clock promise', () => {
    expect(parseNiaPropertySearch('Solar backup in Aruogba').powerRequirement).toBeUndefined();
  });
  it('applies the exact area and power constraints and respects refusal without another query', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', {
      status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' },
    }));
    const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchMock },
    });
    const initial = await answerNiaConversationMessage(client, '24 hours solar in aruobga', null);
    expect(initial.context.preferences).toEqual(preferences);
    expect(initial.searchResultCount).toBe(0);
    expect(initial.context.pendingQuestion).toBe('broaden_search');
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.getAll('power_rating')).toEqual(['ilike.%solar%', 'ilike.%24%']);
    expect(url.searchParams.getAll('or').join('|')).toContain('location.ilike.%Aruogba%');
    expect(url.searchParams.getAll('or').join('|')).not.toContain('%hours%');
    const refusal = await answerNiaConversationMessage(client, 'No', initial.context);
    expect(refusal.message).toContain("won't broaden");
    expect(refusal.context.preferences).toEqual(preferences);
    expect(refusal.context.pendingQuestion).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
