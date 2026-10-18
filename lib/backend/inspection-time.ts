const INSPECTION_TIME_ZONE = 'Africa/Lagos';

export function formatInspectionDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-NG', {
    ...options,
    timeZone: INSPECTION_TIME_ZONE,
  }).format(new Date(value));
}

export function inspectionDateKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: INSPECTION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatInspectionTimeRange(startsAt: string, endsAt: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: INSPECTION_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))} WAT`;
}
