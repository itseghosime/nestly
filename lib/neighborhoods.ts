import { NEIGHBORHOODS as FIXTURES } from './fixtures/neighborhoods';
import type { NeighborhoodGuide } from './types';

const ALLOW_FIXTURE_FALLBACK = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export async function fetchNeighborhoods(state?: string): Promise<NeighborhoodGuide[]> {
  const qs = state && state !== 'all' ? `?state=${encodeURIComponent(state)}` : '';
  try {
    const res = await fetch(`/api/neighborhoods${qs}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    const rows = body.data || [];
    return rows;
  } catch (e) {
    if (ALLOW_FIXTURE_FALLBACK) return FIXTURES;
    throw e;
  }
}

export async function fetchNeighborhoodBySlug(slug: string): Promise<NeighborhoodGuide | null> {
  try {
    const res = await fetch(`/api/neighborhoods/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    return body.data || null;
  } catch (e) {
    if (ALLOW_FIXTURE_FALLBACK) return FIXTURES.find((n) => n.slug === slug) || null;
    throw e;
  }
}

export { FIXTURES as FIXTURE_NEIGHBORHOODS };
