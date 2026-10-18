import {
  parseNiaPropertySearch,
  type NiaPropertyType,
  type NiaPropertySearchCriteria,
} from '@/lib/backend/nia-property-search';

export interface NiaConversationContext {
  preferences: NiaPropertySearchCriteria | null;
  recentPropertyIds: string[];
  selectedPropertyId: string | null;
}

export const EMPTY_NIA_CONTEXT: NiaConversationContext = {
  preferences: null,
  recentPropertyIds: [],
  selectedPropertyId: null,
};

const PREFERENCE_CHANGE = /\b(actually|instead|rather|what about|how about|maybe|change|switch|same area|but|only)\b/i;
const PROPERTY_TYPES = new Set<NiaPropertyType>([
  'apartment',
  'house',
  'duplex',
  'studio',
  'land',
  'commercial',
]);

export function normalizeNiaContext(value: unknown): NiaConversationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_NIA_CONTEXT;
  const context = value as Record<string, unknown>;
  const recentPropertyIds = Array.isArray(context.recentPropertyIds)
    ? context.recentPropertyIds
      .filter((id): id is string => typeof id === 'string' && id.length <= 64)
      .slice(0, 3)
    : [];
  const rawPreferences = context.preferences;
  let preferences: NiaPropertySearchCriteria | null = null;
  if (rawPreferences && typeof rawPreferences === 'object' && !Array.isArray(rawPreferences)) {
    const value = rawPreferences as Record<string, unknown>;
    const type = typeof value.propertyType === 'string' && PROPERTY_TYPES.has(value.propertyType as NiaPropertyType)
      ? value.propertyType as NiaPropertyType
      : undefined;
    const normalized: NiaPropertySearchCriteria = {
      ...(typeof value.location === 'string' && value.location.length <= 64 ? { location: value.location } : {}),
      ...(typeof value.bedrooms === 'number' && Number.isInteger(value.bedrooms) && value.bedrooms > 0 && value.bedrooms <= 30
        ? { bedrooms: value.bedrooms }
        : {}),
      ...(typeof value.maxAnnualRent === 'number' && Number.isFinite(value.maxAnnualRent) && value.maxAnnualRent > 0
        ? { maxAnnualRent: value.maxAnnualRent }
        : {}),
      ...(type ? { propertyType: type } : {}),
      keywords: Array.isArray(value.keywords)
        ? value.keywords.filter((word): word is string => typeof word === 'string' && word.length <= 64).slice(0, 4)
        : [],
    };
    if (
      normalized.location
      || normalized.bedrooms
      || normalized.maxAnnualRent
      || normalized.propertyType
      || normalized.keywords.length
    ) preferences = normalized;
  }
  return {
    preferences,
    recentPropertyIds,
    selectedPropertyId: typeof context.selectedPropertyId === 'string'
      ? context.selectedPropertyId
      : null,
  };
}

export function getNiaReferenceIndex(query: string): number | null {
  const match = query.toLowerCase().match(/\b(first|1st|second|2nd|third|3rd|option\s*[123]|number\s*[123])\b/);
  if (!match) return null;
  if (match[0].includes('second') || match[0] === '2nd' || match[0].endsWith('2')) return 1;
  if (match[0].includes('third') || match[0] === '3rd' || match[0].endsWith('3')) return 2;
  return 0;
}

export function isNiaFeeQuestion(query: string): boolean {
  return /\b(fee|fees|deposit|charges?|move[\s-]?in|total|quote|cost)\b/i.test(query);
}

export function isNiaHandoffRequest(query: string): boolean {
  return /\b(human|agent|officer|staff|person|team member|handoff|hand off|speak to someone|talk to someone)\b/i.test(query);
}

export function resolveNiaPreferences(
  query: string,
  previous: NiaPropertySearchCriteria | null,
): NiaPropertySearchCriteria {
  const parsed = parseNiaPropertySearch(query);
  if (!previous || !PREFERENCE_CHANGE.test(query)) return parsed;
  const location = parsed.location ?? previous.location;
  const bedrooms = parsed.bedrooms ?? previous.bedrooms;
  const maxAnnualRent = parsed.maxAnnualRent ?? previous.maxAnnualRent;
  const propertyType = parsed.propertyType ?? previous.propertyType;
  return {
    ...(location ? { location } : {}),
    ...(bedrooms ? { bedrooms } : {}),
    ...(maxAnnualRent ? { maxAnnualRent } : {}),
    ...(propertyType ? { propertyType } : {}),
    keywords: parsed.keywords.length ? parsed.keywords : previous.keywords,
  };
}

export function isNiaPropertyReference(query: string): boolean {
  return getNiaReferenceIndex(query) !== null
    && /\b(one|option|listing|property|home|house|it)\b/i.test(query);
}
