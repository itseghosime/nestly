import {
  formatNiaListingPrice,
  sanitizeNiaFilterPhrase,
  type NiaPropertySearchCriteria,
  type NiaSearchProperty,
} from '@/lib/backend/nia-property-search';
import { createClient } from '@/lib/supabase/server';

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface NiaPublicPropertyRow extends NiaSearchProperty {
  price_ngn: number | string;
  price_period: string | null;
  currency: string | null;
  state: string | null;
  city: string | null;
  neighborhood: string | null;
  rent_annual: number | string | null;
}

const SEARCHABLE_TEXT_FIELDS = [
  'title',
  'tagline',
  'description',
  'location',
  'neighborhood',
  'power_rating',
  'water_supply',
  'security_rating',
];

const PUBLIC_PROPERTY_FIELDS = [
  'id',
  'title',
  'price_ngn',
  'price_period',
  'currency',
  'state',
  'city',
  'location',
  'neighborhood',
  'bedrooms',
  'rent_annual',
  'property_type',
  'tagline',
  'description',
  'power_rating',
  'water_supply',
  'security_rating',
].join(',');

function isPublicPropertyRow(value: unknown): value is Omit<NiaPublicPropertyRow, 'priceLabel'> & {
  price_ngn: number | string;
} {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const nullableTextFields = ['price_period', 'currency', 'state', 'city', 'location', 'neighborhood'];
  return typeof row.id === 'string'
    && typeof row.title === 'string'
    && (typeof row.price_ngn === 'number' || typeof row.price_ngn === 'string')
    && nullableTextFields.every((field) => row[field] === null || typeof row[field] === 'string')
    && (row.rent_annual === null || typeof row.rent_annual === 'number' || typeof row.rent_annual === 'string');
}

export async function searchNiaPublicProperties(
  supabase: ServerSupabase,
  criteria: NiaPropertySearchCriteria,
): Promise<{ count: number; properties: NiaPublicPropertyRow[] }> {
  let query = supabase
    .from('public_properties')
    .select(PUBLIC_PROPERTY_FIELDS, { count: 'exact' })
    .eq('publication_state', 'published')
    .eq('rental_availability', 'available')
    .in('verification_state', ['vetted', 'verified']);

  if (criteria.location) {
    const locationWords = sanitizeNiaFilterPhrase(criteria.location).split(' ').filter(Boolean);
    for (const word of locationWords) {
      const pattern = `%${word}%`;
      query = query.or(
        `state.ilike.${pattern},city.ilike.${pattern},location.ilike.${pattern},neighborhood.ilike.${pattern}`,
      );
    }
  }
  if (criteria.bedrooms) query = query.eq('bedrooms', criteria.bedrooms);
  if (criteria.propertyType) query = query.eq('property_type', criteria.propertyType);
  if (criteria.maxAnnualRent) {
    query = query.not('rent_annual', 'is', null).lte('rent_annual', criteria.maxAnnualRent);
  }
  if (criteria.powerRequirement === '24h_solar') {
    // A generic solar mention does not establish round-the-clock power.
    query = query.ilike('power_rating', '%solar%').ilike('power_rating', '%24%');
  }
  for (const keyword of criteria.keywords) {
    const safeKeyword = sanitizeNiaFilterPhrase(keyword);
    if (!safeKeyword) continue;
    const pattern = `%${safeKeyword}%`;
    query = query.or(
      SEARCHABLE_TEXT_FIELDS.map((field) => `${field}.ilike.${pattern}`).join(','),
    );
  }

  const { data, error, count } = await query
    .order('rent_annual', { ascending: true, nullsFirst: false })
    .limit(3);
  if (error) {
    console.error('Nia public property search failed', error.code || 'unknown');
    throw new Error('NIA_SEARCH_UNAVAILABLE');
  }

  const rows: unknown = data;
  if (!Array.isArray(rows) || !rows.every(isPublicPropertyRow)) {
    console.error('Nia public property search returned an invalid row shape');
    throw new Error('NIA_SEARCH_UNAVAILABLE');
  }

  const properties: NiaPublicPropertyRow[] = rows.flatMap((row) => {
    const amount = Number(row.price_ngn);
    if (!Number.isFinite(amount) || amount < 0) return [];
    const location = [row.neighborhood, row.city, row.state, row.location]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? '';
    return [{
      id: row.id,
      title: row.title,
      location,
      price_ngn: row.price_ngn,
      price_period: row.price_period,
      currency: row.currency,
      state: row.state,
      city: row.city,
      neighborhood: row.neighborhood,
      rent_annual: row.rent_annual,
      priceLabel: formatNiaListingPrice(amount, row.currency ?? 'NGN', row.price_period ?? 'unspecified'),
    }];
  });

  return { count: count ?? properties.length, properties };
}
