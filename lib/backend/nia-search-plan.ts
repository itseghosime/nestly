import { randomUUID } from 'node:crypto';
import type { NiaPropertySearchCriteria } from '@/lib/backend/nia-property-search';

export type NiaSearchPlan =
  | { intent: 'search'; criteria: NiaPropertySearchCriteria }
  | { intent: 'clarification'; question: string }
  | { intent: 'conversation' };

/** The model extracts geography and criteria; only the public database decides availability. */
export async function planNiaSearch(
  query: string,
  preferences: NiaPropertySearchCriteria | null,
  options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {},
): Promise<NiaSearchPlan | null> {
  const env = options.env ?? process.env;
  if (env.NIA_N8N_ENABLED !== 'true') return null;
  const secret = env.NESTLY_WF01_RELAY_SECRET?.trim();
  if (!secret) return null;
  let url: URL;
  try {
    url = new URL(env.NIA_N8N_WEBHOOK_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith('/nestly-nia-response')) return null;
    url.pathname = url.pathname.replace(/nestly-nia-response$/, 'nestly-nia-plan');
  } catch { return null; }
  try {
    const requestId = randomUUID();
    const response = await (options.fetcher ?? fetch)(url.toString(), {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Nestly-Relay-Secret': secret },
      body: JSON.stringify({ version: 1, requestId, query: query.slice(0, 4000), preferences }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 8192) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || body.version !== 1 || body.requestId !== requestId) return null;
    if (body.intent === 'conversation') return { intent: 'conversation' };
    if (body.intent === 'clarification' && typeof body.question === 'string'
      && body.question.trim().length > 0 && body.question.length <= 240
      && !/https?:|[<>\x00]/i.test(body.question)) {
      return { intent: 'clarification', question: body.question.trim() };
    }
    if (body.intent !== 'search' || !body.criteria || typeof body.criteria !== 'object'
      || Array.isArray(body.criteria)) return null;
    const c = body.criteria;
    const types = ['apartment', 'house', 'duplex', 'studio', 'land', 'commercial'];
    if ((c.location !== undefined && (typeof c.location !== 'string' || !/^[\p{L}\p{N} .,'-]{2,64}$/u.test(c.location)))
      || (c.bedrooms !== undefined && (!Number.isInteger(c.bedrooms) || c.bedrooms < 1 || c.bedrooms > 30))
      || (c.maxAnnualRent !== undefined && (typeof c.maxAnnualRent !== 'number' || !Number.isFinite(c.maxAnnualRent) || c.maxAnnualRent <= 0 || c.maxAnnualRent > 1e12))
      || (c.propertyType !== undefined && !types.includes(c.propertyType))
      || (c.powerRequirement !== undefined && c.powerRequirement !== '24h_solar')
      || !Array.isArray(c.keywords) || c.keywords.length > 4
      || !c.keywords.every((word: unknown) => typeof word === 'string' && /^[a-zA-Z -]{2,40}$/.test(word))) return null;
    // Copy only allowlisted fields; model output is never a query expression.
    const criteria: NiaPropertySearchCriteria = {
      ...(c.location ? { location: c.location.trim() } : {}),
      ...(c.bedrooms ? { bedrooms: c.bedrooms } : {}),
      ...(c.maxAnnualRent ? { maxAnnualRent: c.maxAnnualRent } : {}),
      ...(c.propertyType ? { propertyType: c.propertyType } : {}),
      ...(c.powerRequirement ? { powerRequirement: c.powerRequirement } : {}),
      keywords: c.keywords,
    };
    return { intent: 'search', criteria };
  } catch { return null; }
}
