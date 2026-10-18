import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from '@/app/api/cron/telegram-dispatch-recovery/route';

const CRON_SECRET = 'synthetic-telegram-cron-secret-0123456789abcdef';

function request(secret?: string) {
  return new Request('https://nestly.example.test/api/cron/telegram-dispatch-recovery', {
    method: 'GET',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  mocks.adminRpc.mockResolvedValue({ data: 4, error: null });
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.adminRpc });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Telegram dispatch recovery cron', () => {
  it('fails closed when the server secret is missing or invalid', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request(CRON_SECRET))).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'too-short');
    expect((await GET(request('too-short'))).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects unauthorized requests before accessing the database', async () => {
    const response = await GET(request('wrong-synthetic-secret-0123456789'));
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('calls the idempotent recovery RPC and returns only its count', async () => {
    const response = await GET(request(CRON_SECRET));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      expiredDispatchesMarkedUnknown: 4,
    });
    expect(mocks.adminRpc).toHaveBeenCalledOnce();
    expect(mocks.adminRpc).toHaveBeenCalledWith('mark_expired_telegram_dispatches_unknown');
  });

  it('surfaces database and malformed-result failures without a success-shaped fallback', async () => {
    mocks.adminRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } });
    expect((await GET(request(CRON_SECRET))).status).toBe(503);
    mocks.adminRpc.mockResolvedValueOnce({ data: '4', error: null });
    expect((await GET(request(CRON_SECRET))).status).toBe(503);
  });
});
