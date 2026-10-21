import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyTelegramHandoff } from '@/lib/backend/telegram-handoff-alert';

const input = { conversationId: '11111111-1111-4111-8111-111111111111', eventId: 'website:synthetic-request', channel: 'website' as const };
const env = { TELEGRAM_OUTBOUND_ENABLED: 'true', TELEGRAM_BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwx', TELEGRAM_HANDOFF_CHAT_ID: '123456789', NEXT_PUBLIC_SITE_URL: 'https://nestly.example' };
function fixture(options: { duplicate?: boolean; mode?: string } = {}) {
  const insert = vi.fn(); const update = vi.fn();
  const client = { from: vi.fn((table: string) => table === 'conversations'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { mode: options.mode ?? 'HUMAN_ACTIVE' }, error: null }) }) }) }
    : { insert: (row: unknown) => { insert(row); return { select: () => ({ single: async () => options.duplicate ? { data: null, error: { code: '23505' } } : { data: { id: 'synthetic-alert' }, error: null } }) }; },
      update: (row: unknown) => { update(row); return { eq: async () => ({ error: null }) }; } }) };
  return { client: client as unknown as SupabaseClient, insert, update };
}
describe('private Telegram staff handoff alerts', () => {
  it('sends the owner an inbox link with no transcript and records API acceptance', async () => {
    const f = fixture(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 5 } }));
    expect(await notifyTelegramHandoff(input, { env, fetcher, client: f.client })).toBe('accepted');
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.chat_id).toBe(123456789);
    expect(body.text).toContain('https://nestly.example/staff/inbox/' + input.conversationId);
    expect(body.text).not.toContain(env.TELEGRAM_BOT_TOKEN);
    expect(body.text).not.toContain(input.eventId);
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', idempotency_key: 'telegram-staff-alert:' + input.conversationId + ':' + input.eventId }));
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', provider_message_id: 'telegram-staff:123456789:5' }));
  });
  it('does not send twice when the idempotent claim already exists', async () => {
    const f = fixture({ duplicate: true }); const fetcher = vi.fn<typeof fetch>();
    expect(await notifyTelegramHandoff(input, { env, fetcher, client: f.client })).toBe('duplicate');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ TELEGRAM_OUTBOUND_ENABLED: 'false' }, { TELEGRAM_HANDOFF_CHAT_ID: '' }, { TELEGRAM_HANDOFF_CHAT_ID: 'invalid' }, { TELEGRAM_BOT_TOKEN: 'invalid' }])('respects disabled or invalid configuration', async overrides => {
    const f = fixture(); const fetcher = vi.fn<typeof fetch>();
    expect(await notifyTelegramHandoff(input, { env: { ...env, ...overrides }, fetcher, client: f.client })).toBe('disabled');
    expect(f.insert).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not notify after ownership has returned to AI', async () => {
    const f = fixture({ mode: 'AI_ACTIVE' }); const fetcher = vi.fn<typeof fetch>();
    expect(await notifyTelegramHandoff(input, { env, fetcher, client: f.client })).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not retry an ambiguous network outcome', async () => {
    const f = fixture(); const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic network timeout'));
    expect(await notifyTelegramHandoff(input, { env, fetcher, client: f.client })).toBe('unknown');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', last_error: 'NETWORK_OUTCOME_UNKNOWN' }));
  });
  it('records provider rejection without marking it delivered', async () => {
    const f = fixture(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error_code: 403 }, { status: 403 }));
    expect(await notifyTelegramHandoff(input, { env, fetcher, client: f.client })).toBe('rejected');
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
