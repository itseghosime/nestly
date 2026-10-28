import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { answerNiaConversationMessage, type NiaConversationAnswer } from '@/lib/backend/nia-conversation-response';
import { generateNiaAiReply } from '@/lib/backend/nia-n8n-response';
import { parseNiaPropertySearch } from '@/lib/backend/nia-property-search';
import { inferNiaLocationReply, normalizeNiaContext } from '@/lib/backend/nia-conversation-context';

const publicRows = Array.from({length: 3}, (_, i) => ({
  id: `11111111-1111-4111-8111-11111111111${i}`, title: `Synthetic home ${i + 1}`,
  price_ngn: 2000000, price_period: 'yearly', currency: 'NGN', state: 'Edo', city: 'Benin City',
  location: 'GRA', neighborhood: 'GRA', rent_annual: 2000000,
}));
function database() {
  const requests: URL[] = [];
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
    const url = new URL(String(input)); requests.push(url);
    const filters = url.searchParams.getAll('or').join('|');
    const matches = filters.includes('%GRA%') && !url.searchParams.has('property_type');
    return new Response(JSON.stringify(matches ? publicRows : []), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': matches ? '0-2/3' : '*/0' } });
  });
  const client = createClient('https://synthetic.supabase.co', 'synthetic-anon', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
  return { client, requests, fetcher };
}
beforeEach(() => {
  vi.stubEnv('NIA_N8N_ENABLED', 'true'); vi.stubEnv('NIA_N8N_WEBHOOK_URL', 'https://synthetic.n8n.cloud/webhook/nestly-nia-response'); vi.stubEnv('NESTLY_WF01_RELAY_SECRET', 'synthetic-only');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('Execution limit reached', {status: 503})));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('location replies while the n8n planner is unavailable', () => {
  it('runs the exact screenshot sequence without repeated area prompts or hidden filters', async () => {
    const db = database(); let answer: NiaConversationAnswer = await answerNiaConversationMessage(db.client, '/start', null);
    expect(answer.context.pendingQuestion).toBe('awaiting_location');
    answer = await answerNiaConversationMessage(db.client, 'Okay', answer.context); expect(db.requests).toHaveLength(0);
    for (const [query, location] of [['Lagos','Lagos'],['Uselu','Uselu'],['I just said Uselu','Uselu'],["Don't you have available houses at Uselu?",'Uselu']] as const) {
      answer = await answerNiaConversationMessage(db.client, query, answer.context);
      expect(answer.context.preferences).toEqual({location,keywords:[]}); expect(answer.searchResultCount).toBe(0);
      expect(answer.message).toContain(`in ${location}`); expect(answer.message).not.toMatch(/which area|tell me the area/i);
      expect(answer.searchPlanSource).toBe('local');
      const url = db.requests.at(-1)!; const filters = url.searchParams.getAll('or').join('|');
      expect(filters).toContain(`location.ilike.%${location}%`); expect(url.searchParams.has('property_type')).toBe(false);
      expect(filters).not.toMatch(/title\.ilike|%said%|%don%/);
    }
    answer = await answerNiaConversationMessage(db.client, 'GRA', answer.context);
    expect(answer.properties).toHaveLength(3); expect(answer.searchResultCount).toBe(3); expect(answer.context.preferences).toEqual({location:'GRA',keywords:[]});
    const model = vi.fn<typeof fetch>();
    expect(await generateNiaAiReply({requestId:'synthetic-local-location',query:'GRA',answer,history:[]},{fetcher:model})).toEqual({status:'ready',reason:'SEARCH_ALREADY_PREPARED'});
    expect(model).not.toHaveBeenCalled();
  });
  it.each(['Abule Egba', 'I just said Abule Egba', 'what about Abule Egba'])('treats a contextual place reply as a location: %s', async query => {
    const db=database(), answer=await answerNiaConversationMessage(db.client,query,{pendingQuestion:'awaiting_location',preferences:null});
    expect(answer.context.preferences).toEqual({location:'Abule Egba',keywords:[]}); expect(answer.searchResultCount).toBe(0);
    const filters=db.requests[0].searchParams.getAll('or').join('|'); expect(filters).toContain('location.ilike.%Abule%');expect(filters).toContain('location.ilike.%Egba%');
  });
  it('preserves explicit requirements through an unfamiliar location change', async () => {
    const db=database();const answer=await answerNiaConversationMessage(db.client,'Abule Egba',{pendingQuestion:'broaden_search',preferences:{location:'Ugbor',bedrooms:2,powerRequirement:'24h_solar',keywords:['solar','parking']}});
    expect(answer.context.preferences).toEqual({location:'Abule Egba',bedrooms:2,powerRequirement:'24h_solar',keywords:['solar','parking']});
    expect(db.requests[0].searchParams.get('bedrooms')).toBe('eq.2'); expect(db.requests[0].searchParams.getAll('power_rating')).toEqual(['ilike.%solar%','ilike.%24%']);
  });
  it.each([['houses in GRA Lagos','GRA Lagos'],['apartment in Wuse Abuja','Wuse Abuja'],['Uselu Benin City','Uselu Benin City'],['houses in Lagos State','Lagos'],['homes in Benin City Edo State','Benin City Edo']])('retains compound geography: %s', (query, location) => { expect(parseNiaPropertySearch(query)).toMatchObject({location,keywords:[]}); });
  it('distinguishes generic available houses from a specific house request', () => {
    expect(parseNiaPropertySearch('available houses at Uselu')).toEqual({location:'Uselu',keywords:[]});
    expect(parseNiaPropertySearch('a three-bedroom house in GRA')).toMatchObject({location:'GRA',bedrooms:3,propertyType:'house'});
    expect(parseNiaPropertySearch('three-bedroom houses in GRA')).toMatchObject({location:'GRA',bedrooms:3,propertyType:'house'});
    expect(parseNiaPropertySearch('detached houses in GRA').propertyType).toBe('house');
  });
  it('does not turn social chat or questions into a location', () => {
    const context=normalizeNiaContext({pendingQuestion:'awaiting_location'});
    for(const query of ['Okay','Thanks','How much is the rent?','My name is John','The weather was lovely today','solar parking']) expect(inferNiaLocationReply(query,context)).toBeNull();
  });
  it('cleans old accidental Uselu/request filler filters without dropping genuine amenities', async () => {
    const db=database();const answer=await answerNiaConversationMessage(db.client,'GRA',{preferences:{location:'Uselu',keywords:['don','uselu','said','solar']}});
    expect(answer.context.preferences).toEqual({location:'GRA',keywords:['solar']});
  });
  it('does not fabricate no-match results if the database fails', async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({message:'synthetic database outage'}),{status:503,headers:{'Content-Type':'application/json'}}));
    const client=createClient('https://synthetic.supabase.co','synthetic',{auth:{persistSession:false},global:{fetch:fetcher}});
    await expect(answerNiaConversationMessage(client,'Uselu',null)).rejects.toThrow('NIA_SEARCH_UNAVAILABLE');
  });
});
