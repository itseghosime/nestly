import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
}));

vi.mock('@/lib/backend/staff-context', () => ({
  requireStaff: mocks.requireStaff,
}));

import { POST } from '@/app/api/admin/telegram/webhook/route';
import { TELEGRAM_WEBHOOK_DESTINATION } from '@/lib/backend/telegram';

const BOT_TOKEN = `123456789:${'A'.repeat(35)}`;
const WEBHOOK_SECRET = 'synthetic-telegram-webhook-secret-0123456789abcdef';

function providerResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function request(
  body: unknown,
  options: { origin?: string; url?: string } = {},
) {
  return new Request(
    options.url ?? 'https://nestly.example.test/api/admin/telegram/webhook',
    {
      method: 'POST',
      headers: {
        Origin: options.origin ?? 'https://nestly.example.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}

function authorizedAdmin() {
  mocks.requireStaff.mockResolvedValue({
    context: {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'Platform Admin',
      client: {},
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://nestly.example.test');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', BOT_TOKEN);
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
  authorizedAdmin();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Platform Admin Telegram webhook setup', () => {
  it('checks same origin before staff authorization or provider access', async () => {
    const response = await POST(request(
      { action: 'register' },
      { origin: 'https://attacker.example' },
    ));

    expect(response.status).toBe(403);
    expect(mocks.requireStaff).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires the Platform Admin role before provider access', async () => {
    mocks.requireStaff.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    });

    const response = await POST(request({ action: 'register' }));

    expect(response.status).toBe(403);
    expect(mocks.requireStaff).toHaveBeenCalledWith(['Platform Admin']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied URLs, credentials, and query parameters', async () => {
    const bodyResponse = await POST(request({
      action: 'register',
      url: 'https://attacker.example/hook',
      token: 'caller-token',
      secret_token: 'caller-secret',
    }));
    const queryResponse = await POST(request(
      { action: 'register' },
      { url: 'https://nestly.example.test/api/admin/telegram/webhook?url=https%3A%2F%2Fevil.example' },
    ));

    expect(bodyResponse.status).toBe(400);
    expect(queryResponse.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call Telegram when server-side credentials are unavailable', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');

    const response = await POST(request({ action: 'register' }));

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('registers only the fixed destination and returns sanitized verified settings', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(providerResponse({
        ok: true,
        result: { url: '', pending_update_count: 3 },
      }))
      .mockResolvedValueOnce(providerResponse({ ok: true, result: true }))
      .mockResolvedValueOnce(providerResponse({
        ok: true,
        result: {
          url: TELEGRAM_WEBHOOK_DESTINATION,
          max_connections: 1,
          allowed_updates: ['message'],
          pending_update_count: 3,
        },
      }));

    const response = await POST(request({ action: 'register' }));

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      data: {
        status: 'registered',
        destination: TELEGRAM_WEBHOOK_DESTINATION,
        allowedUpdates: ['message'],
        maxConnections: 1,
        dropPendingUpdates: false,
        pendingUpdateCount: 3,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const setWebhookCall = fetchMock.mock.calls[1];
    expect(setWebhookCall[0]).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`);
    expect(JSON.parse(String(setWebhookCall[1]?.body))).toEqual({
      url: TELEGRAM_WEBHOOK_DESTINATION,
      allowed_updates: ['message'],
      max_connections: 1,
      drop_pending_updates: false,
      secret_token: WEBHOOK_SECRET,
    });
    expect(JSON.stringify(responseBody)).not.toContain(BOT_TOKEN);
    expect(JSON.stringify(responseBody)).not.toContain(WEBHOOK_SECRET);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports a different existing webhook safely and does not replace it', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(providerResponse({
      ok: true,
      result: {
        url: 'https://private-user:private-pass@existing.example.test/private/path?token=private-query',
        pending_update_count: 2,
      },
    }));

    const response = await POST(request({ action: 'register' }));
    const responseText = await response.clone().text();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'A different Telegram webhook is already registered; no change was made.',
      currentWebhookHost: 'existing.example.test',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(responseText).not.toContain('private-user');
    expect(responseText).not.toContain('private-pass');
    expect(responseText).not.toContain('private/path');
    expect(responseText).not.toContain('private-query');
    expect(responseText).not.toContain(BOT_TOKEN);
    expect(responseText).not.toContain(WEBHOOK_SECRET);
  });

  it('does not expose provider error details or credentials', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(providerResponse({
      ok: false,
      description: `Synthetic provider error ${BOT_TOKEN} ${WEBHOOK_SECRET}`,
    }, 401));

    const response = await POST(request({ action: 'register' }));
    const responseText = await response.clone().text();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Telegram webhook registration could not be verified',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(responseText).not.toContain(BOT_TOKEN);
    expect(responseText).not.toContain(WEBHOOK_SECRET);
    expect(responseText).not.toContain('Synthetic provider error');
  });
});
