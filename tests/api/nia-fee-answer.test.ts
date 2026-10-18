import { describe, expect, it } from 'vitest';
import { buildNiaFeeAnswer, type NiaPublicFee } from '@/lib/backend/nia-fee-answer';

const property = {
  title: 'Verified test home',
  priceLabel: '₦2,000,000/year',
  rentAnnual: 2_000_000,
  currency: 'NGN',
};

describe('grounded Nia fee answers', () => {
  it('does not expose amounts for unconfirmed required fees or quote a total', () => {
    const answer = buildNiaFeeAnswer(property, [{
      fee_key: 'legacy_agency_fee',
      label: 'Agency fee',
      kind: 'fixed',
      amount: 250_000,
      base: 'rent',
      required: true,
      confirmed_at: null,
      sort_order: 10,
    }]);

    expect(answer).toContain('Agency fee');
    expect(answer).toContain('still unconfirmed');
    expect(answer).toContain('I cannot provide a final move-in total');
    expect(answer).not.toContain('250,000');
  });

  it('calculates the recorded total only when every required fee is confirmed', () => {
    const fees: NiaPublicFee[] = [{
      fee_key: 'agency',
      label: 'Agency fee',
      kind: 'fixed',
      amount: 250_000,
      base: 'rent',
      required: true,
      confirmed_at: '2026-10-17T00:00:00Z',
      sort_order: 10,
    }];
    const answer = buildNiaFeeAnswer(property, fees);

    expect(answer).toContain('Agency fee: ₦250,000');
    expect(answer).toContain('₦2,250,000');
    expect(answer).toContain('not a payment or booking confirmation');
  });

  it('withholds a total when no confirmed fee schedule is recorded', () => {
    const answer = buildNiaFeeAnswer(property, []);

    expect(answer).toContain('no confirmed fee records');
    expect(answer).toContain('A final move-in total is not available');
  });
});
