import { describe, expect, it, vi } from 'vitest';
import { generateNiaAiReply, sanitizeNiaHistory, getReturningNiaGreeting, hasPriorTelegramMessages } from '@/lib/backend/nia-n8n-response';
import { formatTelegramPropertySearchReply } from '@/lib/backend/telegram';

const env = {
  NIA_N8N_ENABLED: 'true',
  NIA_N8N_WEBHOOK_URL: 'https://synthetic.example.test/webhook/nia',
  NESTLY_WF01_RELAY_SECRET: 'synthetic-server-only-secret',
};
const input = {
  requestId: 'telegram:synthetic:1', query: 'Hey',
  history: [],
  answer: { message: 'Hello', properties: [], context: { preferences: null, recentPropertyIds: [], selectedPropertyId: null } },
};
const result = (message: string, requestId = input.requestId) => new Response(JSON.stringify({ version: 1, requestId, message }));

describe('n8n Nia response bridge', () => {
  it('sends authenticated bounded context and accepts a matching AI response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result('Hey! How can I help with your home search?'));
    expect(await generateNiaAiReply(input, { env, fetcher })).toEqual({
      status: 'generated', kind: 'conversation', message: 'Hey! How can I help with your home search?',
    });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe(env.NIA_N8N_WEBHOOK_URL);
    expect(request?.headers).toMatchObject({ 'X-Nestly-Relay-Secret': env.NESTLY_WF01_RELAY_SECRET });
    expect(request?.redirect).toBe('error');
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({ version: 1, requestId: input.requestId, answerKind: 'conversation', query: 'Hey' });
    expect(String(request?.body)).not.toContain(env.NESTLY_WF01_RELAY_SECRET);
  });
  it('performs no external call when disabled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await generateNiaAiReply(input, { env: {}, fetcher })).toEqual({ status: 'fallback', reason: 'DISABLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['http://example.test/nia', 'https://user:password@example.test/nia', 'https://example.test/nia?token=value'])(
    'rejects unsafe endpoint configuration %s', async (url) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(await generateNiaAiReply(input, { env: { ...env, NIA_N8N_WEBHOOK_URL: url }, fetcher }))
        .toEqual({ status: 'fallback', reason: 'INVALID_CONFIG' });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each(['That costs ₦900000', 'Pay five million now', 'https://invented.example.test/home', '<script>alert(1)</script>'])(
    'rejects model-supplied financial facts, links, or HTML: %s', async (text) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result(text));
      expect(await generateNiaAiReply(input, { env, fetcher }))
        .toEqual({ status: 'fallback', reason: 'UNSAFE_RESPONSE' });
    },
  );
  it('rejects mismatched request IDs', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result('Hello', 'another-request'));
    expect(await generateNiaAiReply(input, { env, fetcher })).toEqual({ status: 'fallback', reason: 'INVALID_RESPONSE' });
  });
  it('bounds responses and fails back on provider errors without retrying', async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(17000)));
    expect(await generateNiaAiReply(input, { env, fetcher: oversized }))
      .toEqual({ status: 'fallback', reason: 'RESPONSE_TOO_LARGE' });
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic network failure'));
    expect(await generateNiaAiReply(input, { env, fetcher: unavailable }))
      .toEqual({ status: 'fallback', reason: 'AGENT_UNAVAILABLE' });
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
  it('excludes the current inbound and strips identity fields from oldest-first bounded history', () => {
    const rows = [
      { id: 'current', direction: 'inbound', content: 'Hey', phone: 'private' },
      { id: 'previous-2', direction: 'outbound', sender_type: 'staff', content: 'Can I help?', phone: 'private' },
      { id: 'previous-1', direction: 'inbound', content: 'Hello', email: 'private' },
    ];
    expect(sanitizeNiaHistory(rows, 'current')).toEqual([
      { role: 'user', content: 'Hello' }, { role: 'staff', content: 'Can I help?' },
    ]);
  });
  it('keeps grounded financial facts and links in the canonical formatter, separate from the AI intro', () => {
    const reply = formatTelegramPropertySearchReply(1, [{
      id: 'synthetic-1', title: 'Synthetic home', location: 'GRA', priceLabel: '₦2000000/year',
    }], 'https://example.test', 'Happy to help you explore these options.');
    expect(reply).toContain('Happy to help');
    expect(reply).toContain('₦2000000/year');
    expect(reply).toContain('https://example.test/property/synthetic-1');
    expect(reply.length).toBeLessThanOrEqual(4096);
  });
});

describe('returning Telegram visitors', () => {
  it('welcomes a prior visitor on greeting-only turns, including after a closed conversation', async () => {
    const identityQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'same-verified-identity' }, error: null }) };
    const messageQuery = { eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ id: 'prior-message' }], error: null }) };
    const selectIdentity = vi.fn().mockReturnValue(identityQuery);
    const selectMessage = vi.fn().mockReturnValue(messageQuery);
    const client = { from: vi.fn().mockImplementation((table) => ({ select: table === 'telegram_identities' ? selectIdentity : selectMessage })) };
    expect(await hasPriorTelegramMessages(client as never, { botId: 123, userId: 456, currentMessageId: 'current' })).toBe(true);
    expect(identityQuery.eq).toHaveBeenCalledWith('bot_id', 123);
    expect(identityQuery.eq).toHaveBeenCalledWith('telegram_user_id', 456);
    expect(messageQuery.eq).toHaveBeenCalledWith('conversation.telegram_identity_id', 'same-verified-identity');
    expect(messageQuery.neq).toHaveBeenCalledWith('id', 'current');
    expect(getReturningNiaGreeting('Hey', true)).toContain('Welcome back!');
    expect(getReturningNiaGreeting('Hey', false)).toBeNull();
    expect(getReturningNiaGreeting('Hey, find homes in GRA', true)).toBeNull();
    expect(getReturningNiaGreeting('Thanks', true)).toBeNull();
  });
  it('does not claim a returning identity when lookup fails', async () => {
    const query = { eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: 'unavailable' } }) };
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) };
    expect(await hasPriorTelegramMessages(client as never, { botId: 123, userId: 456, currentMessageId: 'current' })).toBe(false);
  });
  it('sends the trusted returning flag and enforces a welcome for a returning greeting', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result('Hey, how can I help?'));
    const reply = await generateNiaAiReply({ ...input, returningUser: true }, { env, fetcher });
    expect(reply).toMatchObject({ status: 'generated', message: 'Welcome back! 👋 How can I help you today?' });
    const [, request] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(request?.body)).visitor).toEqual({ returningUser: true });
  });
});
