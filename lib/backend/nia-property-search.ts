export type NiaPropertyType = 'apartment' | 'house' | 'duplex' | 'studio' | 'land' | 'commercial';

export interface NiaPropertySearchCriteria {
  location?: string;
  bedrooms?: number;
  maxAnnualRent?: number;
  propertyType?: NiaPropertyType;
  powerRequirement?: '24h_solar';
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
  'a', 'about', 'add', 'an', 'and', 'any', 'are', 'at', 'bed', 'bedroom', 'bedrooms',
  'below', 'browse', 'browsing', 'but', 'can', 'change', 'check', 'could', 'consider', 'dear', 'find', 'give',
  'for', 'from', 'get', 'good', 'have', 'hello', 'help', 'hey', 'hi', 'home', 'homes', 'house', 'houses',
  'include', 'including',
  'how', 'im', 'in', 'is', 'let', 'like', 'listing', 'listings', 'look', 'looking',
  'me', 'maybe', 'morning', 'near', 'need', 'nia', 'of', 'on', 'only', 'or', 'please', 'prefer',
  'searching', 'seeking', 'send',
  'actually', 'area', 'first', 'instead', 'number', 'option', 'rather', 'same', 'second', 'switch', 'third', 'what',
  'property', 'properties', 'rent', 'rental', 'rentals', 'search', 'show', 'some',
  'take', 'thank', 'thanks', 'the', 'to', 'try', 'trying', 'under', 'want', 'wanted', 'we', 'with',
  'tell', 'would', 'you',
  'off', 'close', 'hours', 'hour', 'hrs', 'aruogba', 'aruobga', 'ugbor', 'gra',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

const BEDROOM_NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function normalizeNiaSearchKeywords(keywords: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const keyword of keywords) {
    const words = keyword.normalize('NFKC').toLowerCase().match(/[a-z]{3,}/g) ?? [];
    for (const word of words) {
      if (!STOP_WORDS.has(word)) normalized.add(word);
      if (normalized.size === 4) return [...normalized];
    }
  }
  return [...normalized];
}

const LOCATION_HINTS = [
  ['aruogba', 'Aruogba'],
  ['aruobga', 'Aruogba'],
  ['irhirhi', 'Irhirhi'],
  ['ekenhuan', 'Ekenhuan'],
  ['ugbowo', 'Ugbowo'],
  ['asaba', 'Asaba'],
  ['warri', 'Warri'],
  ['effurun', 'Effurun'],
  ['osubi', 'Osubi'],
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
    const pattern = new RegExp('\\b' + hint + '\\b', 'gi');
    if (pattern.test(remaining)) {
      location ??= canonical;
      remaining = remaining.replace(pattern, ' ');
    }
  }

  const powerRequirement = /\b24\s*(?:hours?|hrs?|h|\/7)[\s-]*solar\b|\bsolar[\s-]*(?:for\s+)?24\s*(?:hours?|hrs?|h|\/7)\b/i.test(normalized)
    ? '24h_solar' as const : undefined;
  remaining = remaining.replace(/\b24\s*(?:hours?|hrs?|h|\/7)\b/g, ' ');

  let propertyType: NiaPropertyType | undefined;
  for (const [pattern, type] of PROPERTY_TYPE_HINTS) {
    const match = remaining.match(pattern);
    if (match) {
      propertyType = type;
      remaining = remaining.replace(pattern, ' ');
      break;
    }
  }

  const bedroomMatch = remaining.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*-?\s*bed(?:room)?s?\b/i);
  const bedroomToken = bedroomMatch?.[1].toLowerCase();
  const bedrooms = bedroomToken
    ? BEDROOM_NUMBER_WORDS[bedroomToken] ?? Number(bedroomToken)
    : undefined;
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

  const keywords = normalizeNiaSearchKeywords(
    remaining.match(/[a-z]{3,}/g) ?? [],
  );

  return {
    ...(location ? { location } : {}),
    ...(bedrooms ? { bedrooms } : {}),
    ...(maxAnnualRent ? { maxAnnualRent } : {}),
    ...(propertyType ? { propertyType } : {}),
    ...(powerRequirement ? { powerRequirement } : {}),
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
