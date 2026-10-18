import { describe, expect, it } from 'vitest';
import { getStaffInvitationFailure } from '@/lib/backend/staff-invitation-error';

describe('getStaffInvitationFailure', () => {
  it('reports email send rate limits as retryable without exposing provider details', () => {
    const failure = getStaffInvitationFailure({
      message: 'email rate limit exceeded for person@example.com',
    });

    expect(failure.status).toBe(429);
    expect(failure.error).toContain('temporarily limiting invitation emails');
    expect(failure.error).not.toContain('person@example.com');
  });

  it('does not forward other Auth provider errors to staff', () => {
    const failure = getStaffInvitationFailure({
      code: 'unexpected_error',
      message: 'SMTP rejected person@example.com with secret diagnostic',
    });

    expect(failure.status).toBe(502);
    expect(failure.error).not.toContain('person@example.com');
    expect(failure.error).not.toContain('secret diagnostic');
  });
});
