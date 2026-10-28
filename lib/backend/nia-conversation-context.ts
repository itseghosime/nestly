import { getNiaSocialReply } from '@/lib/backend/nia-social-reply';
import {
  normalizeNiaSearchKeywords,
  parseNiaPropertySearch,
  type NiaPropertyType,
  type NiaPropertySearchCriteria,
} from '@/lib/backend/nia-property-search';

export interface NiaConversationContext {
  preferences: NiaPropertySearchCriteria | null;
  recentPropertyIds: string[];
  selectedPropertyId: string | null;
  pendingQuestion?: 'broaden_search' | 'awaiting_location';
}

export const EMPTY_NIA_CONTEXT: NiaConversationContext = {
  preferences: null,
  recentPropertyIds: [],
  selectedPropertyId: null,
};

const PREFERENCE_RECALL = /\b(?:what|which|remind|repeat|recall|remember|show|tell)\b[\s\S]{0,70}\b(?:my|saved|current|previous)\b[\s\S]{0,32}\bpreferences?\b/i;
const PREFERENCE_RESET = /\b(?:start\s+over|start\s+fresh|begin\s+again)\b|\b(?:reset|clear|forget)\b[\s\S]{0,40}\b(?:preferences?|filters?|criteria|search)\b/i;
const SEARCH_REQUEST = /\b(?:find|search|look(?:ing)?\s+for|show(?:\s+me)?|browse|list|do\s+you\s+have|any|need|want|try|instead|rather|what\s+about|how\s+about|add|include|change|switch|prefer)\b/i;
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
      ...(value.powerRequirement === '24h_solar' ? { powerRequirement: '24h_solar' as const } : {}),
      keywords: normalizeNiaSearchKeywords(
        Array.isArray(value.keywords)
          ? value.keywords.filter((word): word is string => typeof word === 'string' && word.length <= 64)
          : [],
      ),
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
    ...(['broaden_search', 'awaiting_location'].includes(String(context.pendingQuestion)) ? { pendingQuestion: context.pendingQuestion as 'broaden_search' | 'awaiting_location' } : {}),
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
  if (getNiaSocialReply(query, false) !== null) return false;
  return /\b(human|agent|officer|staff|person|team member|handoff|hand off|speak to someone|talk to someone)\b/i.test(query);
}

export function resolveNiaPreferences(
  query: string,
  previous: NiaPropertySearchCriteria | null,
): NiaPropertySearchCriteria {
  const parsed = parseNiaPropertySearch(query);
  if (!previous) return parsed;
  const location = parsed.location ?? previous.location;
  const bedrooms = parsed.bedrooms ?? previous.bedrooms;
  const maxAnnualRent = parsed.maxAnnualRent ?? previous.maxAnnualRent;
  const propertyType = parsed.propertyType ?? previous.propertyType;
  const powerRequirement = parsed.powerRequirement ?? previous.powerRequirement;
  const keywords = normalizeNiaSearchKeywords([
    ...previous.keywords,
    ...parsed.keywords,
  ]);
  return {
    ...(location ? { location } : {}),
    ...(bedrooms ? { bedrooms } : {}),
    ...(maxAnnualRent ? { maxAnnualRent } : {}),
    ...(propertyType ? { propertyType } : {}),
    ...(powerRequirement ? { powerRequirement } : {}),
    keywords,
  };
}

export function isNiaPropertyReference(query: string): boolean {
  return getNiaReferenceIndex(query) !== null
    && /\b(one|option|listing|property|home|house|it)\b/i.test(query);
}

export type NiaMessageIntent = 'preference_recall' | 'reset_preferences' | 'search' | 'unsupported';

export function classifyNiaMessageIntent(query: string): NiaMessageIntent {
  if (PREFERENCE_RESET.test(query)) return 'reset_preferences';
  if (PREFERENCE_RECALL.test(query)) return 'preference_recall';

  const parsed = parseNiaPropertySearch(query);
  if (parsed.location || parsed.bedrooms || parsed.maxAnnualRent || parsed.propertyType || parsed.powerRequirement) {
    return 'search';
  }
  if (SEARCH_REQUEST.test(query) && /\b(?:homes?|properties|property|listings?|apartments?|flats?)\b/i.test(query)) return 'search';
  return parsed.keywords.length > 0 && (SEARCH_REQUEST.test(query) || parsed.keywords.some((word) => ['solar', 'parking', 'inverter', 'furnished'].includes(word)))
    ? 'search'
    : 'unsupported';
}

/** Accept a direct place answer only when Nia has a search/location context. No geography is invented. */
export function inferNiaLocationReply(query: string, context: NiaConversationContext): string | null {
  if (!context.pendingQuestion && !context.preferences) return null;
  if (getNiaSocialReply(query, Boolean(context.preferences)) !== null) return null;
  const parsed = parseNiaPropertySearch(query);
  if (parsed.location || parsed.bedrooms || parsed.propertyType || parsed.maxAnnualRent || parsed.powerRequirement) return null;
  if (!parsed.keywords.length || parsed.keywords.every(word => ['solar', 'parking', 'inverter', 'furnished', 'security', 'water', 'pool', 'gated'].includes(word))) return null;
  const value = query.normalize('NFKC').trim().replace(/[.!?]+$/, '')
    .replace(/^(?:i\s+(?:just\s+|already\s+)?(?:said|mean|meant)|what\s+about|how\s+about|actually|instead|try|in|at|around|near)\s+/i, '').trim();
  if (value.length < 2 || value.length > 64 || !/^[\p{L}][\p{L} .,'-]*$/u.test(value) || value.split(/\s+/).length > 6) return null;
  // Do not turn questions, personal chat, corrections without a place, or amenities into areas.
  if (/\b(?:i|you|my|your|me|what|which|how|why|who|when|where|can|could|would|should|is|are|was|were|have|has|said|mean|sorry|fine|okay|great|good|bad|yes|no|thanks|thank|want|need|tell|understand|weather|price|rent|fee|fees|help|please|solar|parking|bedrooms?|location|area|another|other|more|options?|types?|propert(?:y|ies)|homes?|anywhere|else)\b/i.test(value)) return null;
  return value;
}
