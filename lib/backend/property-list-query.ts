export const DEFAULT_PUBLIC_MAX_ANNUAL_RENT = 6_000_000;

export function getEffectiveMaxAnnualRent(
  requestedMaxAnnualRent: number | null,
  isStaff: boolean,
): number | null {
  return requestedMaxAnnualRent ?? (isStaff ? null : DEFAULT_PUBLIC_MAX_ANNUAL_RENT);
}
