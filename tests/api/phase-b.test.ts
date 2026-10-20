import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSameOrigin,
  deriveReceiptToken,
  getIdempotencyKey,
  hashReceiptToken,
} from '@/lib/backend/public-request';

const previousSecret = process.env.PUBLIC_RECEIPT_HMAC_SECRET;
const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.PUBLIC_RECEIPT_HMAC_SECRET;
  else process.env.PUBLIC_RECEIPT_HMAC_SECRET = previousSecret;
  if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
});

describe('same-origin write protection', () => {
  it('accepts only the configured site origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nestly.example';
    expect(assertSameOrigin(new Request('https://nestly.example/api/write', {
      method: 'POST',
      headers: { Origin: 'https://nestly.example' },
    }))).toBeNull();
    expect(assertSameOrigin(new Request('https://nestly.example/api/write', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    }))?.status).toBe(403);
  });

  it('uses the request origin as a same-origin fallback when no canonical site URL is set', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(assertSameOrigin(new Request('http://localhost:3000/api/write', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    }))).toBeNull();
  });

  it('allows same-origin browser requests when GET omits Origin but Fetch Metadata is present', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nestly.example';
    expect(assertSameOrigin(new Request('https://nestly.example/api/conversations', {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    }))).toBeNull();
    expect(assertSameOrigin(new Request('https://nestly.example/api/conversations', {
      headers: {
        'Sec-Fetch-Site': 'cross-site',
        Referer: 'https://attacker.example/page',
      },
    }))?.status).toBe(403);
  });

  it('uses a same-origin Referer only when Origin and Fetch Metadata are absent', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nestly.example';
    expect(assertSameOrigin(new Request('https://nestly.example/api/conversations', {
      headers: { Referer: 'https://nestly.example/browse' },
    }))).toBeNull();
  });
});

describe('public receipt tokens', () => {
  it('derives stable secret tokens per workflow and idempotency key', () => {
    process.env.PUBLIC_RECEIPT_HMAC_SECRET = 'test-only-secret-with-at-least-32-bytes';
    const key = 'f3ac949b-4a9c-4a8a-a639-6421a460aa01';
    const offerToken = deriveReceiptToken('offer', key);
    expect(offerToken).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveReceiptToken('offer', key)).toBe(offerToken);
    expect(deriveReceiptToken('inspection', key)).not.toBe(offerToken);
    const contactToken = deriveReceiptToken('contact-enquiry', key);
    const landlordToken = deriveReceiptToken('landlord-submission', key);
    expect(contactToken).toMatch(/^[a-f0-9]{64}$/);
    expect(landlordToken).toMatch(/^[a-f0-9]{64}$/);
    expect(contactToken).not.toBe(landlordToken);
    expect(contactToken).not.toBe(offerToken);
    expect(hashReceiptToken(offerToken!)).not.toBe(offerToken);
  });

  it('does not issue receipt tokens without a strong server secret', () => {
    process.env.PUBLIC_RECEIPT_HMAC_SECRET = 'too-short';
    expect(deriveReceiptToken('offer', 'some-idempotency-key')).toBeNull();
  });
});

describe('public request idempotency keys', () => {
  it('accepts an opaque idempotency header and rejects missing or unsafe values', () => {
    expect(getIdempotencyKey(new Request('https://example.test', {
      headers: { 'Idempotency-Key': 'f3ac949b-4a9c-4a8a-a639-6421a460aa01' },
    }))).toBe('f3ac949b-4a9c-4a8a-a639-6421a460aa01');
    expect(getIdempotencyKey(new Request('https://example.test'))).toBeNull();
    expect(getIdempotencyKey(new Request('https://example.test', {
      headers: { 'Idempotency-Key': 'bad key with spaces' },
    }))).toBeNull();
  });
});
