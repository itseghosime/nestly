import { NextResponse } from 'next/server';
import {
  formatNiaListingPrice,
  hasNiaSearchCriteria,
  parseNiaPropertySearch,
  sanitizeNiaFilterPhrase,
  type NiaPropertySearchResponse,
  type NiaSearchProperty,
} from '@/lib/backend/nia-property-search';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { createClient } from '@/lib/supabase/server';

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

const CLARIFICATION_RESPONSE: NiaPropertySearchResponse = {
  status: 'clarification',
  message: 'I can search current published listings by area, bedrooms, property type, listing details, or annual rent. What should I use?',
};

interface PublicPropertyRow {
  id: string;
  title: string;
  price_ngn: number | string;
  price_period: string | null;
  currency: string | null;
  state: string | null;
  city: string | null;
  location: string | null;
  neighborhood: string | null;
}

function isPublicPropertyRow(value: unknown): value is PublicPropertyRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const nullableTextFields = [
    'price_period',
    'currency',
    'state',
    'city',
    'location',
    'neighborhood',
  ];
  return typeof row.id === 'string'
    && typeof row.title === 'string'
    && (typeof row.price_ngn === 'number' || typeof row.price_ngn === 'string')
    && nullableTextFields.every((field) => row[field] === null || typeof row[field] === 'string');
}

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;

  const body = await request.json().catch(() => null) as { query?: unknown } | null;
  if (typeof body?.query !== 'string' || body.query.trim().length < 1 || body.query.length > 500) {
    return NextResponse.json({ error: 'Enter a search of at most 500 characters' }, { status: 400 });
  }

  const criteria = parseNiaPropertySearch(body.query);
  if (!hasNiaSearchCriteria(criteria)) {
    return NextResponse.json(CLARIFICATION_RESPONSE);
  }

  const supabase = await createClient();
  let query = supabase
    .from('public_properties')
    .select(PUBLIC_PROPERTY_FIELDS, { count: 'exact' })
    .eq('publication_state', 'published')
    .eq('rental_availability', 'available')
    .in('verification_state', ['vetted', 'verified']);

  if (criteria.location) {
    const locationWords = sanitizeNiaFilterPhrase(criteria.location).split(' ');
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
    return NextResponse.json({ error: 'Current property search is temporarily unavailable' }, { status: 503 });
  }

  const rows: unknown = data ?? [];
  if (!Array.isArray(rows) || !rows.every(isPublicPropertyRow)) {
    console.error('Nia public property search returned an invalid row shape');
    return NextResponse.json({ error: 'Current property search is temporarily unavailable' }, { status: 503 });
  }

  const matches: NiaSearchProperty[] = rows.flatMap((row) => {
    const amount = Number(row.price_ngn);
    if (!Number.isFinite(amount) || amount < 0) return [];
    const location = [row.neighborhood, row.city, row.state, row.location]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? '';
    return [{
      id: row.id,
      title: row.title,
      location,
      priceLabel: formatNiaListingPrice(amount, row.currency ?? 'NGN', row.price_period ?? 'unspecified'),
    }];
  });

  if (count === 0 || (count === null && matches.length === 0)) {
    return NextResponse.json({
      status: 'no_match',
      count: 0,
      matches: [],
      message: 'I could not find a current published listing matching that search. Which detail could you change?',
    } satisfies NiaPropertySearchResponse);
  }
  if (!matches.length) {
    return NextResponse.json({ error: 'Current property search is temporarily unavailable' }, { status: 503 });
  }

  const matchCount = count ?? matches.length;
  return NextResponse.json({
    status: 'matches',
    count: matchCount,
    matches,
    message: `I found ${matchCount} current published listing${matchCount === 1 ? '' : 's'} matching those details${matchCount > matches.length ? `; showing the first ${matches.length}` : ''}. The displayed amount is the listed rent only; required fees are not included in a final quote.`,
  } satisfies NiaPropertySearchResponse);
}
