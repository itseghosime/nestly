import { computeTotal, formatPrice, type Currency, type FeeRow } from '@/lib/price';

export interface NiaPublicFee extends FeeRow {
  label: string;
}

export interface NiaFeeProperty {
  title: string;
  priceLabel: string;
  rentAnnual: number | null;
  currency: string | null;
}

function asCurrency(value: string | null): Currency {
  return value === 'USD' || value === 'GBP' ? value : 'NGN';
}

export function buildNiaFeeAnswer(property: NiaFeeProperty, fees: NiaPublicFee[]): string {
  const confirmed = fees.filter((fee) => fee.confirmed_at !== null);
  const unconfirmedRequired = fees.filter((fee) => fee.required && fee.confirmed_at === null);
  const parts = [`For ${property.title}, the listed rent is ${property.priceLabel}.`];
  if (confirmed.length) {
    parts.push(`Confirmed fee records: ${confirmed.map((fee) => {
      const amount = Number(fee.amount);
      const value = fee.kind === 'percent'
        ? `${amount}% of ${fee.base}`
        : formatPrice(amount, asCurrency(property.currency));
      return `${fee.label}: ${value}`;
    }).join('; ')}.`);
  } else {
    parts.push('There are no confirmed fee records available for this listing.');
  }

  if (unconfirmedRequired.length) {
    parts.push(`Required fees still unconfirmed: ${unconfirmedRequired.map((fee) => fee.label).join(', ')}. I cannot provide a final move-in total.`);
  } else {
    const total = property.rentAnnual !== null && Number.isFinite(property.rentAnnual) && property.rentAnnual >= 0
      ? computeTotal(property.rentAnnual, fees)
      : null;
    if (total === null) {
      parts.push('A final move-in total is not available from the confirmed listing data.');
    } else {
      parts.push(`The current recorded rent-plus-fees total is ${formatPrice(total, asCurrency(property.currency))}; this is not a payment or booking confirmation.`);
    }
  }
  return parts.join(' ');
}
