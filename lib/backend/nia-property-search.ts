export type NiaPropertyType = 'apartment' | 'house' | 'duplex' | 'studio' | 'land' | 'commercial';

export interface NiaPropertySearchCriteria {
  location?: string;
  bedrooms?: number;
  maxAnnualRent?: number;
  propertyType?: NiaPropertyType;
  keywords: string[];
}

export interface NiaSearchProperty {
  id: string;
  title: string;
  location: string;
  priceLabel: string;
}

export type NiaPropertySearchResponse =
  | { status: 'clarification'; message: string }
  | { status: 'no_match'; count: 0; matches: []; message: string }
  | { status: 'matches'; count: number; matches: NiaSearchProperty[]; message: string };

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'any', 'are', 'at', 'bed', 'bedroom', 'bedrooms',
  'below', 'but', 'can', 'change', 'find', 'for', 'from', 'home', 'homes', 'house', 'houses',
  'hello', 'help', 'how', 'in', 'is', 'listing', 'listings', 'me', 'maybe', 'near', 'of', 'on', 'only', 'or', 'please',
  'actually', 'area', 'first', 'instead', 'number', 'option', 'rather', 'same', 'second', 'switch', 'third', 'what',
  'property', 'properties', 'rent', 'rental', 'rentals', 'search', 'show', 'some',
  'the', 'to', 'under', 'want', 'with',
]);

const LOCATION_HINTS = [
  ['benin city', 'Benin City'],
  ['clinic road', 'Clinic Road'],
  ['sapele', 'Sapele'],
  ['benin', 'Benin'],
  ['ugbor', 'Ugbor'],
  ['ihama', 'Ihama'],
  ['gra', 'GRA'],
] as const;

const PROPERTY_TYPE_HINTS: ReadonlyArray<readonly [RegExp, NiaPropertyType]> = [
  [/\b(apartment|apartments|flat|flats)\b/i, 'apartment'],
  [/\b(house|houses)\b/i, 'house'],
  [/\b(duplex|duplexes|terrace|terraces|townhouse|townhouses)\b/i, 'duplex'],
  [/\b(studio|studios)\b/i, 'studio'],
  [/\b(land|plots?)\b/i, 'land'],
  [/\b(commercial|shop|shops|office|offices)\b/i, 'commercial'],
];

export function parseNiaPropertySearch(query: string): NiaPropertySearchCriteria {
  const normalized = query.normalize('NFKC').toLowerCase();
  let remaining = normalized;

  let location: string | undefined;
  for (const [hint, canonical] of LOCATION_HINTS) {
    if (remaining.includes(hint)) {
      location = canonical;
      remaining = remaining.replace(hint, ' ');
      break;
    }
  }

  let propertyType: NiaPropertyType | undefined;
  for (const [pattern, type] of PROPERTY_TYPE_HINTS) {
    const match = remaining.match(pattern);
    if (match) {
      propertyType = type;
      remaining = remaining.replace(pattern, ' ');
      break;
    }
  }

  const bedroomMatch = remaining.match(/\b(\d{1,2})\s*-?\s*bed(?:room)?s?\b/i);
  const bedrooms = bedroomMatch ? Number(bedroomMatch[1]) : undefined;
  if (bedroomMatch) remaining = remaining.replace(bedroomMatch[0], ' ');

  const budgetPattern =
    /\b(?:under|below|up to|max(?:imum)?|budget(?: of)?)\s*[₦]?\s*(\d[\d,]*(?:\.\d+)?)\s*(million|thousand|m|k)?\s*(?:per\s+year|\/\s*year|annual|a\s+year)\b/i;
  const budgetMatch = remaining.match(budgetPattern);
  let maxAnnualRent: number | undefined;
  if (budgetMatch) {
    const amount = Number(budgetMatch[1].replace(/,/g, ''));
    const multiplier = budgetMatch[2]?.toLowerCase();
    const scale = multiplier === 'million' || multiplier === 'm'
      ? 1_000_000
      : multiplier === 'thousand' || multiplier === 'k'
        ? 1_000
        : 1;
    const total = amount * scale;
    if (Number.isFinite(total) && total > 0 && total <= 1_000_000_000_000) {
      maxAnnualRent = total;
    }
    remaining = remaining.replace(budgetPattern, ' ');
  }

  const keywords = [...new Set(
    remaining.match(/[a-z]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  )].slice(0, 4);

  return {
    ...(location ? { location } : {}),
    ...(bedrooms ? { bedrooms } : {}),
    ...(maxAnnualRent ? { maxAnnualRent } : {}),
    ...(propertyType ? { propertyType } : {}),
    keywords,
  };
}

export function hasNiaSearchCriteria(criteria: NiaPropertySearchCriteria): boolean {
  return Boolean(
    criteria.location
    || criteria.bedrooms
    || criteria.maxAnnualRent
    || criteria.propertyType
    || criteria.keywords.length,
  );
}

export function sanitizeNiaFilterPhrase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

export function formatNiaListingPrice(
  amount: number,
  currency: string,
  period: string,
): string {
  const supportedCurrencies = new Set(['NGN', 'USD', 'GBP', 'EUR']);
  const formattedAmount = supportedCurrencies.has(currency)
    ? new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
    : `${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(amount)} (currency unconfirmed)`;
  const periodLabel = period === 'yearly'
    ? '/year'
    : period === 'monthly'
      ? '/month'
      : period === 'one_time'
        ? ' one-time'
        : ' (period unconfirmed)';
  return `${formattedAmount}${periodLabel}`;
}

export function isNiaPropertySearchResponse(value: unknown): value is NiaPropertySearchResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  if (typeof response.message !== 'string' || typeof response.status !== 'string') return false;
  if (response.status === 'clarification') return true;
  if (response.status === 'no_match') {
    return response.count === 0 && Array.isArray(response.matches) && response.matches.length === 0;
  }
  if (
    response.status !== 'matches'
    || typeof response.count !== 'number'
    || !Number.isSafeInteger(response.count)
    || response.count < 1
  ) return false;
  return Array.isArray(response.matches)
    && response.matches.length > 0
    && response.count >= response.matches.length
    && response.matches.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const property = item as Record<string, unknown>;
      return typeof property.id === 'string'
        && typeof property.title === 'string'
        && typeof property.location === 'string'
        && typeof property.priceLabel === 'string';
    });
}
