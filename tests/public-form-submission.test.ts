import { describe, expect, it, vi } from 'vitest';
import {
  clearPendingFormSubmission,
  getPendingFormSubmission,
  isLeadSubmissionReceipt,
  parseExpectedAnnualRent,
  type FormSubmissionStorage,
} from '@/lib/public-form-submission';

function createStorage(initial?: Map<string, string>): FormSubmissionStorage {
  const values = initial ?? new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('public form submission helpers', () => {
  it('persists only a payload digest and reuses the key after the form is recreated', async () => {
    const values = new Map<string, string>();
    const storage = createStorage(values);
    const createKey = vi.fn()
      .mockReturnValueOnce('key-one')
      .mockReturnValueOnce('key-two');
    const originalPayload = { name: 'Ada', amount: 2_500_000.5 };
    const first = await getPendingFormSubmission(storage, 'contact', originalPayload, createKey);
    const afterReload = await getPendingFormSubmission(createStorage(values), 'contact', { amount: 2_500_000.5, name: 'Ada' }, createKey);
    const changed = await getPendingFormSubmission(storage, 'contact', { ...originalPayload, amount: 3_000_000 }, createKey);

    expect(afterReload).toEqual(first);
    expect(values.get('contact')).not.toContain('Ada');
    expect(values.get('contact')).not.toContain('2500000');
    expect(changed.key).toBe('key-two');
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it('reuses the same idempotency key after an ambiguous network failure', async () => {
    const storage = createStorage();
    const createKey = vi.fn().mockReturnValue('network-retry-key-0001');
    const payload = { name: 'Synthetic Contact', amount: 1_000_000.5 };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('synthetic network failure'))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ requestReceived: true, confirmed: false }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      ));

    const firstSubmission = await getPendingFormSubmission(storage, 'contact', payload, createKey);
    await expect(fetchMock('/api/leads/contact', {
      headers: { 'Idempotency-Key': firstSubmission.key },
    })).rejects.toThrow('synthetic network failure');

    const retrySubmission = await getPendingFormSubmission(storage, 'contact', payload, createKey);
    const retryResponse = await fetchMock('/api/leads/contact', {
      headers: { 'Idempotency-Key': retrySubmission.key },
    });

    expect(retrySubmission.key).toBe(firstSubmission.key);
    expect(await retryResponse.json()).toEqual({ requestReceived: true, confirmed: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toEqual(fetchMock.mock.calls[1][1]);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed saved retry state instead of silently issuing another key', async () => {
    const storage = createStorage(new Map([['contact', '{broken']]));
    await expect(getPendingFormSubmission(storage, 'contact', { name: 'Ada' })).rejects.toThrow('saved retry key is invalid');
  });

  it('reports unavailable session storage and clears accepted retry state', async () => {
    const unavailableStorage: FormSubmissionStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    await expect(getPendingFormSubmission(unavailableStorage, 'contact', { name: 'Ada' }))
      .rejects.toThrow('Your form was not submitted');

    const storage = createStorage(new Map([['contact', 'saved']]));
    expect(clearPendingFormSubmission(storage, 'contact')).toBe(true);
    expect(storage.getItem('contact')).toBeNull();
    expect(clearPendingFormSubmission(unavailableStorage, 'contact')).toBe(false);
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
