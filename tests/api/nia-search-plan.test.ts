import { describe, expect, it, vi, afterEach } from 'vitest';
import { planNiaSearch } from '@/lib/backend/nia-search-plan';
import { answerNiaConversationMessage } from '@/lib/backend/nia-conversation-response';
import { createClient } from '@supabase/supabase-js';

const env = { NIA_N8N_ENABLED: 'true', NIA_N8N_WEBHOOK_URL: 'https://synthetic.n8n.cloud/webhook/nestly-nia-response', NESTLY_WF01_RELAY_SECRET: 'synthetic-secret' };
function mockPlan(plan: object) {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const input = JSON.parse(String(init?.body));
    return Response.json({ version: 1, requestId: input.requestId, ...plan });
  });
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('n8n location planning', () => {
  it.each(['Independence Layout, Enugu', 'Wuse Abuja', 'Lekki Lagos', 'Akure', 'Jos', 'Kano', 'Ikorodu'])('accepts AI-extracted %s without a hardcoded local-area list', async (location) => {
    const fetcher = mockPlan({ intent: 'search', criteria: { location, keywords: [] } });
    expect(await planNiaSearch('Find a flat in ' + location, null, { env, fetcher }))
      .toEqual({ intent: 'search', criteria: { location, keywords: [] } });
    expect(String(fetcher.mock.calls[0][0])).toBe('https://synthetic.n8n.cloud/webhook/nestly-nia-plan');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'X-Nestly-Relay-Secret': 'synthetic-secret' });
  });
  it('asks for clarification of ambiguous geography', async () => {
    const fetcher = mockPlan({ intent: 'clarification', question: 'Which state is New Town in?' });
    expect(await planNiaSearch('New Town', null, { env, fetcher })).toEqual({ intent: 'clarification', question: 'Which state is New Town in?' });
  });
  it.each([
    { location: 'GRA),id.eq.private', keywords: [] },
    { location: 'Enugu', keywords: ['solar),or(private)'] },
    { location: 'Enugu', bedrooms: 99, keywords: [] },
  ])('rejects invalid or filter-like model criteria', async (criteria) => {
    expect(await planNiaSearch('search', null, { env, fetcher: mockPlan({ intent: 'search', criteria }) })).toBeNull();
  });
  it('strips unexpected model fields', async () => {
    const fetcher = mockPlan({ intent: 'search', criteria: { location: 'Enugu', keywords: [], table: 'profiles', select: '*' } });
    expect(await planNiaSearch('Enugu', null, { env, fetcher })).toEqual({ intent: 'search', criteria: { location: 'Enugu', keywords: [] } });
  });
  it('uses the database result to say no listings in the requested location', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal('fetch', mockPlan({ intent: 'search', criteria: { location: 'Enugu', keywords: [], propertyType: 'apartment' } }));
    const dbFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } }));
    const client = createClient('https://synthetic.supabase.co', 'synthetic-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dbFetch },
    });
    const result = await answerNiaConversationMessage(client, 'A flat in Enugu please', null);
    expect(result.searchResultCount).toBe(0);
    expect(result.message).toContain('in Enugu');
    expect(result.context.preferences?.location).toBe('Enugu');
    const url = new URL(String(dbFetch.mock.calls[0][0]));
    expect(url.searchParams.getAll('or').join('|')).toContain('location.ilike.%Enugu%');
  });
});
