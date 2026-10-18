import {
  formatNiaListingPrice,
  hasNiaSearchCriteria,
  type NiaPropertySearchCriteria,
  type NiaSearchProperty,
} from '@/lib/backend/nia-property-search';
import {
  getNiaReferenceIndex,
  isNiaFeeQuestion,
  isNiaPropertyReference,
  normalizeNiaContext,
  resolveNiaPreferences,
  type NiaConversationContext,
} from '@/lib/backend/nia-conversation-context';
import { buildNiaFeeAnswer, type NiaPublicFee } from '@/lib/backend/nia-fee-answer';
import { createClient } from '@/lib/supabase/server';
import { searchNiaPublicProperties, type NiaPublicPropertyRow } from '@/lib/backend/nia-public-search';

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface NiaConversationAnswer {
  message: string;
  properties: NiaSearchProperty[];
  context: NiaConversationContext;
}

const PROPERTY_FIELDS = 'id, title, price_ngn, price_period, currency, state, city, location, neighborhood, rent_annual';

function toSearchProperty(row: NiaPublicPropertyRow): NiaSearchProperty {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    priceLabel: row.priceLabel,
  };
}

export async function getNiaPublicPropertiesByIds(
  supabase: ServerSupabase,
  ids: string[],
): Promise<NiaPublicPropertyRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('public_properties')
    .select(PROPERTY_FIELDS)
    .in('id', ids)
    .eq('publication_state', 'published')
    .eq('rental_availability', 'available')
    .in('verification_state', ['vetted', 'verified']);
  if (error) {
    console.error('Nia conversation property lookup failed', error.code || 'unknown');
    throw new Error('NIA_SEARCH_UNAVAILABLE');
  }
  if (!Array.isArray(data)) throw new Error('NIA_SEARCH_UNAVAILABLE');
  const byId = new Map<string, NiaPublicPropertyRow>();
  for (const value of data) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string'
      || typeof row.title !== 'string'
      || (typeof row.price_ngn !== 'number' && typeof row.price_ngn !== 'string')
    ) continue;
    const amount = Number(row.price_ngn);
    const location = [row.neighborhood, row.city, row.state, row.location]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0) ?? '';
    if (!Number.isFinite(amount) || amount < 0) continue;
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      location,
      priceLabel: formatNiaListingPrice(amount, typeof row.currency === 'string' ? row.currency : 'NGN',
        typeof row.price_period === 'string' ? row.price_period : 'unspecified'),
      price_ngn: row.price_ngn,
      price_period: typeof row.price_period === 'string' ? row.price_period : null,
      currency: typeof row.currency === 'string' ? row.currency : null,
      state: typeof row.state === 'string' ? row.state : null,
      city: typeof row.city === 'string' ? row.city : null,
      neighborhood: typeof row.neighborhood === 'string' ? row.neighborhood : null,
      rent_annual: typeof row.rent_annual === 'number' || typeof row.rent_annual === 'string' ? row.rent_annual : null,
    });
  }
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

function isFeeRow(value: unknown): value is NiaPublicFee {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.fee_key === 'string'
    && typeof row.label === 'string'
    && (row.kind === 'fixed' || row.kind === 'percent')
    && (typeof row.amount === 'number' || typeof row.amount === 'string')
    && (row.base === 'rent' || row.base === 'subtotal')
    && typeof row.required === 'boolean'
    && (row.confirmed_at === null || typeof row.confirmed_at === 'string')
    && typeof row.sort_order === 'number';
}

async function answerPropertyFees(
  supabase: ServerSupabase,
  property: NiaPublicPropertyRow,
): Promise<string> {
  const { data, error } = await supabase
    .from('property_fees')
    .select('fee_key, label, kind, amount, base, required, confirmed_at, sort_order')
    .eq('property_id', property.id)
    .order('sort_order');
  if (error) {
    console.error('Nia fee lookup failed', error.code || 'unknown');
    throw new Error('NIA_FEES_UNAVAILABLE');
  }
  if (!Array.isArray(data) || !data.every(isFeeRow)) throw new Error('NIA_FEES_UNAVAILABLE');

  const rent = property.rent_annual === null ? null : Number(property.rent_annual);
  return buildNiaFeeAnswer({
    title: property.title,
    priceLabel: property.priceLabel,
    rentAnnual: rent !== null && Number.isFinite(rent) ? rent : null,
    currency: property.currency,
  }, data as NiaPublicFee[]);
}

function mergeContext(
  context: NiaConversationContext,
  values: Partial<NiaConversationContext>,
): NiaConversationContext {
  return {
    preferences: values.preferences === undefined ? context.preferences : values.preferences,
    recentPropertyIds: values.recentPropertyIds ?? context.recentPropertyIds,
    selectedPropertyId: values.selectedPropertyId === undefined
      ? context.selectedPropertyId
      : values.selectedPropertyId,
  };
}

export async function answerNiaConversationMessage(
  supabase: ServerSupabase,
  query: string,
  storedContext: unknown,
): Promise<NiaConversationAnswer> {
  const context = normalizeNiaContext(storedContext);
  const referenceIndex = getNiaReferenceIndex(query);
  const isReference = isNiaPropertyReference(query);

  if (isNiaFeeQuestion(query)) {
    const selectedId = referenceIndex !== null && isReference
      ? context.recentPropertyIds[referenceIndex]
      : context.selectedPropertyId
        ?? (context.recentPropertyIds.length === 1 ? context.recentPropertyIds[0] : null);
    if (!selectedId) {
      const message = context.recentPropertyIds.length > 1
        ? 'Which current option do you mean? Say first, second, or third from your latest results.'
        : 'Tell me which current listing you mean, or search for listings first, and I will check its confirmed fees.';
      return { message, properties: [], context };
    }
    const [property] = await getNiaPublicPropertiesByIds(supabase, [selectedId]);
    if (!property) {
      return {
        message: 'That listing is no longer publicly available, so I cannot provide its fee details. Would you like me to search current listings again?',
        properties: [],
        context: mergeContext(context, { selectedPropertyId: null, recentPropertyIds: [] }),
      };
    }
    return {
      message: await answerPropertyFees(supabase, property),
      properties: [toSearchProperty(property)],
      context: mergeContext(context, { selectedPropertyId: property.id }),
    };
  }

  if (isReference) {
    const id = referenceIndex === null ? null : context.recentPropertyIds[referenceIndex];
    if (!id) {
      return {
        message: 'I do not have a recent result to identify that option. Please search for current listings first.',
        properties: [],
        context,
      };
    }
    const [property] = await getNiaPublicPropertiesByIds(supabase, [id]);
    if (!property) {
      return {
        message: 'That listing is no longer publicly available. I can search the current listings again.',
        properties: [],
        context: mergeContext(context, { selectedPropertyId: null, recentPropertyIds: [] }),
      };
    }
    const ordinal = ['first', 'second', 'third'][referenceIndex ?? 0];
    return {
      message: `The ${ordinal} listing from your latest results is ${property.title} in ${property.location}, listed at ${property.priceLabel}.`,
      properties: [toSearchProperty(property)],
      context: mergeContext(context, { selectedPropertyId: property.id }),
    };
  }

  const criteria = resolveNiaPreferences(query, context.preferences);
  if (!hasNiaSearchCriteria(criteria)) {
    if (/\b(inspect|inspection|visit|viewing|book)\b/i.test(query)) {
      return {
        message: 'You can request an inspection from a listing page. A request is not a confirmed booking; an authorized team member must approve the time.',
        properties: [],
        context,
      };
    }
    return {
      message: 'I can search current published listings by area, bedrooms, property type, listing details, or annual rent. What should I use?',
      properties: [],
      context,
    };
  }

  const result = await searchNiaPublicProperties(supabase, criteria);
  if (!result.properties.length) {
    return {
      message: 'I could not find a current published listing matching those details. Which preference would you like to change?',
      properties: [],
      context: mergeContext(context, {
        preferences: criteria,
        recentPropertyIds: [],
        selectedPropertyId: null,
      }),
    };
  }

  return {
    message: `I found ${result.count} current published listing${result.count === 1 ? '' : 's'} matching those details${result.count > result.properties.length ? `; showing the first ${result.properties.length}` : ''}. These match the preferences you gave me.`,
    properties: result.properties.map(toSearchProperty),
    context: {
      preferences: criteria,
      recentPropertyIds: result.properties.map((property) => property.id),
      selectedPropertyId: null,
    },
  };
}

export function isPreferenceCriteria(value: unknown): value is NiaPropertySearchCriteria {
  const context = normalizeNiaContext({ preferences: value });
  return context.preferences !== null;
}
