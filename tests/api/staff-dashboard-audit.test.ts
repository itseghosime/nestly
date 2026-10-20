import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireStaff: vi.fn(), from: vi.fn(), rpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/backend/staff-context', () => ({ requireStaff: mocks.requireStaff }));
import { NextResponse } from 'next/server';
import { GET as properties } from '@/app/api/properties/route';
import { GET as activity } from '@/app/api/staff/activity/route';
import { GET as notificationFeed } from '@/app/api/staff/notifications/route';
import { GET as customers } from '@/app/api/staff/customers/route';
import { inspectStaffIntegrations } from '@/lib/backend/staff-integrations';

const userId = '11111111-1111-4111-8111-111111111111';
const notificationId = '22222222-2222-4222-8222-222222222222';
function query(result: unknown) {
  const chain = { select: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(), or: vi.fn(), upsert: vi.fn(), delete: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const [key, value] of Object.entries(chain)) if (key !== 'then') (value as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  mocks.requireStaff.mockResolvedValue({ context: { userId, role: 'Platform Admin', client: { from: mocks.from, rpc: mocks.rpc } } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Staff dashboard truthfulness and access', () => {
  it('does not expose counts to an unauthenticated caller', async () => {
    mocks.requireStaff.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    expect((await activity()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns measured zero and persisted unread count instead of placeholder badges', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ attention_count: '0', unread_notifications: '16' }], error: null });
    const response = await activity();
    expect((await response.json()).data).toMatchObject({ attentionCount: 0, unreadNotifications: 16 });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('does not turn an unavailable count into zero', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'unavailable' } });
    expect((await activity()).status).toBe(503);
  });
  it('does not describe a saved dashboard alert as a delivered notification', async () => {
    mocks.from.mockImplementation(table => table === 'notification_reads' ? query({data: [], error: null}) : query({ data: [{ id: notificationId, template_key: 'inspection.pending', channel: 'dashboard', status: 'queued', attempts: 0, created_at: '2026-10-20T10:00:00Z', reads: [] }], count: 1, error: null }));
    const response = await notificationFeed(new Request('http://localhost:3000/api/staff/notifications'));
    const body = await response.json();
    expect(body.data[0].readAt).toBeNull();
    expect(body.data[0].description).toContain('Saved workspace alert');
    expect(body.data[0].statusText).toBe('queued');
  });
  it('rejects invalid customer pagination instead of silently returning fixtures', async () => {
    expect((await customers(new Request('http://localhost:3000/api/staff/customers?page=-1'))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('Read-only integration evidence', () => {
  const env = { TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyz_ABCDEF', TELEGRAM_WEBHOOK_SECRET: 's'.repeat(40), TELEGRAM_OUTBOUND_ENABLED: 'true', NEXT_PUBLIC_SITE_URL: 'https://nestly.example', NIA_N8N_ENABLED: 'true', NIA_N8N_WEBHOOK_URL: 'https://workflow.example/webhook/nia', NESTLY_WF01_RELAY_SECRET: 'secret-never-returned', TWILIO_OUTBOUND_ENABLED: 'false' };
  it('verifies identity and webhook without invoking a send or an AI webhook', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith('getMe') ? { ok: true, result: { id: 123456 } } : { ok: true, result: { url: 'https://nestly.example/api/telegram/webhook' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await inspectStaffIntegrations(true, env);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.find(row => row.id === 'telegram')?.state).toBe('verified');
    expect(result.find(row => row.id === 'nia')?.state).toBe('configured');
    expect(result.find(row => row.id === 'whatsapp')?.state).toBe('deferred');
    expect(JSON.stringify(result)).not.toContain(env.TELEGRAM_BOT_TOKEN);
    expect(JSON.stringify(result)).not.toContain(env.NESTLY_WF01_RELAY_SECRET);
    expect(fetcher.mock.calls.every(([url]) => /\/(getMe|getWebhookInfo)$/.test(url))).toBe(true);
  });
  it('does not present configured credentials as a passed check after failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Provider unavailable')));
    const rows = await inspectStaffIntegrations(false, env);
    expect(rows.find(row => row.id === 'telegram')?.state).toBe('configured');
    expect(rows.find(row => row.id === 'database')?.state).toBe('unavailable');
  });
  it('reports webhook mismatch rather than a healthy channel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.endsWith('getMe') ? { ok: true, result: { id: 123456 } } : { ok: true, result: { url: 'https://other.example/webhook' } })));
    const rows = await inspectStaffIntegrations(true, env);
    expect(rows.find(row => row.id === 'telegram')?.label).toBe('Webhook destination mismatch');
  });
  it('does not call a provider when configuration is missing', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const rows = await inspectStaffIntegrations(true, {});
    expect(fetcher).not.toHaveBeenCalled();
    expect(rows.find(row => row.id === 'nia')?.state).toBe('disabled');
  });
});


describe('Staff property filters run before pagination', () => {
  it.each([
    ['available', 'published', 'available'], ['rented', 'published', 'rented'],
    ['draft', 'draft', null], ['in-review', 'review', null],
  ])('filters %s on the server with an accurate matching total', async (status, publication, availability) => {
    const inventory = query({ data: [], error: null, count: 0 });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
      from: (table: string) => table === 'profiles' ? query({ data: { role: 'Platform Admin' }, error: null }) : inventory,
    });
    const response = await properties(new Request(`http://localhost:3000/api/properties?staff_status=${status}&page=2&limit=20&keyword=GRA`));
    expect(response.status).toBe(200);
    expect(inventory.eq).toHaveBeenCalledWith('publication_state', publication);
    if (availability) expect(inventory.eq).toHaveBeenCalledWith('rental_availability', availability);
    expect(inventory.range).toHaveBeenCalledWith(20, 39);
    expect(inventory.eq.mock.invocationCallOrder[0]).toBeLessThan(inventory.range.mock.invocationCallOrder[0]);
    expect(inventory.or.mock.calls[0][0]).toContain('reference.ilike.%gra%');
    expect(inventory.or.mock.calls[0][0]).toContain('city.ilike.%gra%');
  });
  it('does not let an anonymous caller use staff-only status filters', async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } });
    const response = await properties(new Request('http://localhost:3000/api/properties?staff_status=draft'));
    expect(response.status).toBe(403);
  });
});
