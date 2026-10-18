import { describe, expect, it } from 'vitest';
import {
  formatInspectionDate,
  formatInspectionTimeRange,
  inspectionDateKey,
} from '@/lib/backend/inspection-time';

describe('inspection Africa/Lagos time formatting', () => {
  it('uses the Lagos calendar date when UTC crosses midnight', () => {
    expect(inspectionDateKey('2026-10-19T23:30:00.000Z')).toBe('2026-10-20');
  });

  it('formats inspection ranges as WAT', () => {
    expect(formatInspectionTimeRange(
      '2026-10-20T09:00:00.000Z',
      '2026-10-20T10:30:00.000Z',
    )).toBe('10:00–11:30 WAT');
  });

  it('formats the receipt date in Africa/Lagos', () => {
    expect(formatInspectionDate('2026-10-19T23:30:00.000Z', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })).toBe('Tuesday, 20 October 2026');
  });
});
