import { describe, expect, it, vi } from 'vitest';
import {
  getPendingFormSubmission,
  isLeadSubmissionReceipt,
  parseExpectedAnnualRent,
} from '@/lib/public-form-submission';

describe('public form submission helpers', () => {
  it('reuses an idempotency key for the same retry payload and renews it when payload changes', () => {
    const createKey = vi.fn()
      .mockReturnValueOnce('key-one')
      .mockReturnValueOnce('key-two');
    const originalPayload = { name: 'Ada', amount: 2_500_000.5 };
    const first = getPendingFormSubmission(null, originalPayload, createKey);
    const retry = getPendingFormSubmission(first, { ...originalPayload }, createKey);
    const changed = getPendingFormSubmission(retry, { ...originalPayload, amount: 3_000_000 }, createKey);

    expect(retry).toBe(first);
    expect(changed.key).toBe('key-two');
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it('accepts only the API receipt response contract', () => {
    expect(isLeadSubmissionReceipt(202, { requestReceived: true, confirmed: false })).toBe(true);
    expect(isLeadSubmissionReceipt(200, { requestReceived: true, confirmed: false })).toBe(false);
    expect(isLeadSubmissionReceipt(202, { requestReceived: true })).toBe(false);
    expect(isLeadSubmissionReceipt(202, '<html>ok</html>')).toBe(false);
  });

  it.each([
    ['2,500,000.50', 2_500_000.5],
    ['₦ 2,500,000.75', 2_500_000.75],
    ['2500000.25', 2_500_000.25],
    ['2 500 000.50', 2_500_000.5],
  ])('parses annual rent %s without dropping its decimal fraction', (input, expected) => {
    expect(parseExpectedAnnualRent(input)).toBe(expected);
  });

  it.each(['', '₦', '2,50,000.50', '2500000.123', '-2500000.50', 'not a rent'])(
    'rejects invalid annual rent %s',
    (input) => {
      expect(parseExpectedAnnualRent(input)).toBeNull();
    },
  );
});
