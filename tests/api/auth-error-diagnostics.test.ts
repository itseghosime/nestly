import { describe, expect, it } from 'vitest';
import { safeAuthErrorDiagnostic } from '@/lib/backend/auth-errors';

describe('safeAuthErrorDiagnostic', () => {
  it('records the provider cause while redacting email, password, tokens, and URLs', () => {
    expect(safeAuthErrorDiagnostic({
      code: 'invalid_credentials',
      status: 400,
      message: 'Invalid login for admin@example.com password=private token=secret https://auth.example.test/callback?token=abc',
    })).toEqual({
      code: 'invalid_credentials',
      status: 400,
      message: 'Invalid login for [email] password=[redacted] token=[redacted] [url]',
    });
  });

  it('bounds and normalizes provider diagnostics', () => {
    const diagnostic = safeAuthErrorDiagnostic({
      code: 'bad code with spaces',
      status: 401.5,
      message: `x${'a'.repeat(300)}\nline`,
    });

    expect(diagnostic.code).toBe('badcodewithspaces');
    expect(diagnostic.status).toBeNull();
    expect(diagnostic.message).toHaveLength(180);
    expect(diagnostic.message).not.toContain('\n');
  });
});
