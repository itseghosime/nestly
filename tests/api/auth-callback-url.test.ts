import { describe, expect, it, vi } from 'vitest';
import { completeAuthCallback, type AuthCallbackAuthClient } from '@/lib/backend/auth-callback';
import { buildAuthCallbackUrl, getAuthSiteOrigin } from '@/lib/backend/auth-callback-url';

describe('Auth callback URLs', () => {
  it('builds loopback invitation and recovery callback URLs', () => {
    expect(buildAuthCallbackUrl('http://127.0.0.1:3000/staff', 'invite'))
      .toBe('http://127.0.0.1:3000/auth/callback?next=%2Fstaff%2Faccept-invitation');
    expect(buildAuthCallbackUrl('http://localhost:3000', 'recovery'))
      .toBe('http://localhost:3000/auth/callback?next=%2Fstaff%2Freset-password');
  });

  it('accepts HTTPS production origins and strips path, query, and fragment', () => {
    expect(buildAuthCallbackUrl('https://staff.example.test/base?tracking=1#fragment', 'recovery'))
      .toBe('https://staff.example.test/auth/callback?next=%2Fstaff%2Freset-password');
  });

  it('rejects insecure non-loopback and credential-bearing origins', () => {
    expect(getAuthSiteOrigin('http://staff.example.test')).toBeNull();
    expect(getAuthSiteOrigin('https://user:password@staff.example.test')).toBeNull();
    expect(buildAuthCallbackUrl(undefined, 'invite')).toBeNull();
  });

  it('exchanges PKCE codes and rejects unsafe callback destinations', async () => {
    const auth: AuthCallbackAuthClient = {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      setSession: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'synthetic-user' } }, error: null }),
    };

    const destination = await completeAuthCallback(
      auth,
      new URLSearchParams('code=synthetic-code&next=%2Fstaff%2Freset-password'),
      '',
    );
    expect(destination).toBe('/staff/reset-password');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('synthetic-code');

    const unsafeDestination = await completeAuthCallback(
      auth,
      new URLSearchParams('code=synthetic-code&next=https%3A%2F%2Fevil.test'),
      '',
    );
    expect(unsafeDestination).toBeNull();
  });
});
