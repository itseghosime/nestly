import twilio from 'twilio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/twilio/whatsapp/inbound/route';

const AUTH_TOKEN = 'synthetic-only-auth-token-not-for-use';
const PUBLIC_URL = 'https://relay.example.test/api/twilio/whatsapp/inbound?test=synthetic';
const WF01_URL = 'https://n8n.example.test/webhook/synthetic';
const RELAY_SECRET = 'synthetic-only-relay-secret-0123456789abcdef';
const SYNTHETIC_MESSAGE = 'Synthetic relay test message';

function buildForm(overrides: Record<string, string | null> = {}): string {
  const values: Record<string, string> = {
    MessageSid: 'SM00000000000000000000000000000001',
    From: 'whatsapp:+15550000001',
    WaId: '15550000001',
    ProfileName: 'Synthetic Customer',
    Body: SYNTHETIC_MESSAGE,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete values[key];
    else values[key] = value;
  }
  return new URLSearchParams(values).toString();
}

function signForm(rawBody: string, url = PUBLIC_URL): string {
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  return twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, params);
}

function makeRequest(
  rawBody = buildForm(),
  signature: string | null = signForm(rawBody),
  contentType = 'application/x-www-form-urlencoded',
): Request {
  const headers = new Headers({ 'Content-Type': contentType });
  if (signature !== null) headers.set('X-Twilio-Signature', signature);
  return new Request(PUBLIC_URL, { method: 'POST', headers, body: rawBody });
}

function mockFetch(response = new Response('ok')) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
  vi.stubEnv('TWILIO_PUBLIC_WEBHOOK_URL', PUBLIC_URL);
  vi.stubEnv('NESTLY_WF01_WEBHOOK_URL', WF01_URL);
  vi.stubEnv('NESTLY_WF01_RELAY_SECRET', RELAY_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Twilio WhatsApp relay', () => {
  it('returns 403 for a missing signature without calling WF01', async () => {
    const fetchMock = mockFetch();

    const response = await POST(makeRequest(buildForm(), null));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 for an invalid signature without calling WF01', async () => {
    const fetchMock = mockFetch();

    const response = await POST(makeRequest(buildForm(), 'invalid-signature'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a signed request body is tampered with', async () => {
    const fetchMock = mockFetch();
    const signedBody = buildForm();
    const tamperedBody = buildForm({ Body: 'Changed after signing' });

    const response = await POST(makeRequest(tamperedBody, signForm(signedBody)));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-form content without calling WF01', async () => {
    const fetchMock = mockFetch();

    const response = await POST(makeRequest('{}', 'synthetic-signature', 'application/json'));

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a validly signed but incomplete Twilio payload', async () => {
    const fetchMock = mockFetch();
    const rawBody = buildForm({ WaId: null });

    const response = await POST(makeRequest(rawBody));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when relay credentials are missing without calling WF01', async () => {
    const fetchMock = mockFetch();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NESTLY_WF01_RELAY_SECRET', '');

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(AUTH_TOKEN);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(SYNTHETIC_MESSAGE);
  });

  it('forwards valid signed form data with relay authentication and preserves TwiML response', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Synthetic reply</Message></Response>';
    const upstreamContentType = 'text/xml; charset=utf-8';
    const fetchMock = mockFetch(new Response(xml, {
      status: 202,
      headers: { 'Content-Type': upstreamContentType },
    }));
    const rawBody = buildForm();
    const response = await POST(makeRequest(rawBody));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(WF01_URL);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(rawBody);
    expect(init?.redirect).toBe('manual');
    const forwardedHeaders = new Headers(init?.headers);
    expect(forwardedHeaders.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(forwardedHeaders.get('X-Nestly-Relay')).toBe(RELAY_SECRET);
    expect(forwardedHeaders.has('X-Twilio-Signature')).toBe(false);
    expect(response.status).toBe(202);
    expect(response.headers.get('Content-Type')).toBe(upstreamContentType);
    expect(await response.text()).toBe(xml);
  });

  it('fails closed when the forwarding request errors and does not log request data', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error(SYNTHETIC_MESSAGE));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(makeRequest());

    expect(response.status).toBe(502);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(AUTH_TOKEN);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(SYNTHETIC_MESSAGE);
  });
});
