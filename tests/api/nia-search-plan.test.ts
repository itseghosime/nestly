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
  it.each(['Show me nice two-bedroom apartments in GRA', 'I need my first two-bedroom apartment in GRA with a total budget of two million'])('shows first-request listings without a fee/reference detour: %s', async (query) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal('fetch', mockPlan({ intent: 'search', criteria: { location: 'GRA', bedrooms: 2, propertyType: 'apartment', keywords: [] } }));
    const row = { id: '11111111-1111-4111-8111-111111111111', title: 'Synthetic apartment', price_ngn: 2500000, price_period: 'yearly', currency: 'NGN', state: 'Edo', city: 'Benin City', location: 'GRA', neighborhood: 'GRA', rent_annual: 2500000 };
    const dbFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([row]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }));
    const client = createClient('https://synthetic.supabase.co', 'synthetic-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dbFetch } });
    const result = await answerNiaConversationMessage(client, query, null);
    expect(result.properties).toHaveLength(1);
    expect(result.searchResultCount).toBe(1);
    expect(result.message).toContain('I found 1 available home');
    expect(result.context.preferences?.maxAnnualRent).toBeUndefined();
  });

  it('performs an initial broad search without requiring missing filters', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const fetcher = mockPlan({ intent: 'search', criteria: { keywords: [] } });
    vi.stubGlobal('fetch', fetcher);
    const dbFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } }));
    const client = createClient('https://synthetic.supabase.co', 'synthetic-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dbFetch } });
    const result = await answerNiaConversationMessage(client, 'Show me available homes', null);
    expect(result.searchResultCount).toBe(0);
    expect(result.searchPlanSource).toBe('n8n');
    expect(dbFetch).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

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
