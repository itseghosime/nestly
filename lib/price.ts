export type Currency = 'NGN' | 'USD' | 'GBP';

export function formatPrice(amount: number | string, currency: Currency = 'NGN'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  const symbol = currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : '£';
  return `${symbol}${n.toLocaleString('en-NG')}`;
}

export function parseFormattedPrice(formatted: string): number | null {
  const cleaned = formatted.replace(/[₦$£,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type FeeRow = {
  fee_key: string;
  kind: 'fixed' | 'percent';
  amount: number | string;
  base: 'rent' | 'subtotal';
  required: boolean;
  confirmed_at: string | null;
  sort_order: number;
};

/**
 * Compute total move-in: rent + fees in sort_order.
 * Fixed: adds amount. Percent with base rent: rent*amount/100. Percent with base subtotal: running subtotal*amount/100.
 * Amounts are numeric; percent amounts are 0..100. Rounding: half-up to 2 decimals per step, final total as integer naira if all inputs are integers.
 * If any required fee has confirmed_at==null, returns null (unconfirmed total).
 */
export function computeTotal(rentAnnual: number, fees: FeeRow[]): number | null {
  if (!Number.isFinite(rentAnnual) || rentAnnual < 0 || fees.length === 0) return null;
  const sorted = [...fees].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.some((f) => f.required && !f.confirmed_at)) return null;
  if (sorted.some((f) => !Number.isFinite(Number(f.amount)) || Number(f.amount) < 0)) return null;
  let subtotal = Number(rentAnnual);
  // subtotal includes rent + prior fixed/percent-rent fees; percent-subtotal applies to current subtotal
  let total = subtotal;
  for (const f of sorted) {
    const amt = Number(f.amount);
    if (f.kind === 'fixed') {
      total += amt;
      subtotal = total;
    } else if (f.kind === 'percent' && f.base === 'rent') {
      const add = (Number(rentAnnual) * amt) / 100;
      total += add;
      subtotal = total;
    } else if (f.kind === 'percent' && f.base === 'subtotal') {
      const add = (subtotal * amt) / 100;
      total += add;
      subtotal = total;
    }
  }
  // Round half-up to 2 decimals, but naira totals are integers in practice
  return Math.round(total * 100) / 100;
}

export function formatMoveInTotal(rentAnnual: number, fees: FeeRow[], currency: Currency = 'NGN'): string | null {
  const total = computeTotal(rentAnnual, fees);
  if (total == null) return null;
  return formatPrice(total, currency);
}

export type FeeBreakdownItem = FeeRow & {
  calculatedAmount: number;
  runningSubtotal: number;
};

/**
 * Computes individual fee breakdown amounts in sort_order consistent with computeTotal.
 * For base=rent: calculates (rentAnnual * amount) / 100.
 * For base=subtotal: calculates (runningSubtotal * amount) / 100 where runningSubtotal accumulates rent + prior fees.
 */
export function computeFeeBreakdown(rentAnnual: number, fees: FeeRow[]): FeeBreakdownItem[] {
  if (!Number.isFinite(rentAnnual) || rentAnnual < 0 || !Array.isArray(fees)) return [];
  const sorted = [...fees].sort((a, b) => a.sort_order - b.sort_order);
  let subtotal = Number(rentAnnual);

  return sorted.map((f) => {
    const amt = Number(f.amount);
    let calculatedAmount = 0;
    if (f.kind === 'fixed') {
      calculatedAmount = amt;
    } else if (f.kind === 'percent' && f.base === 'rent') {
      calculatedAmount = (Number(rentAnnual) * amt) / 100;
    } else if (f.kind === 'percent' && f.base === 'subtotal') {
      calculatedAmount = (subtotal * amt) / 100;
    }
    calculatedAmount = Math.round(calculatedAmount * 100) / 100;
    subtotal = Math.round((subtotal + calculatedAmount) * 100) / 100;

    return {
      ...f,
      calculatedAmount,
      runningSubtotal: subtotal,
    };
  });
}

